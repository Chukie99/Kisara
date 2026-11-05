/** Local HTTP simulation: no Google requests, real Kisara job queue and failure gate. */
const { build } = require('esbuild');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AccountRouter } = require('./flow-account-router-prototype.cjs');

(async () => {
  await fs.mkdir('tmp/bugcheck', { recursive: true });
  global.routerFixture = { rows: new Map() };
  await build({
    stdin: { contents: "export {runJob,waitForJob,cancelJob} from './src/main/jobs'; export {StopOnFailureBatch} from './src/main/serialBatch'", resolveDir: process.cwd() },
    platform: 'node', bundle: true, outfile: 'tmp/bugcheck/flow-router-queue.cjs',
    plugins: [{ name: 'isolated-fixtures', setup(b) {
      b.onResolve({ filter: /^\.\/repo$/ }, () => ({ path: 'repo', namespace: 'fixture' }));
      b.onResolve({ filter: /^\.\/events$/ }, () => ({ path: 'events', namespace: 'fixture' }));
      b.onResolve({ filter: /services\/higgsfield$/ }, () => ({ path: 'hf', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ loader: 'js', contents: a.path === 'repo'
        ? 'export const getJobRaw=id=>global.routerFixture.rows.get(id);export const updateJob=(id,patch)=>{const j={...global.routerFixture.rows.get(id),...patch};global.routerFixture.rows.set(id,j);return j}'
        : a.path === 'events' ? 'export const emit={job:()=>{}}' : 'export const cancelRequest=async()=>{}' }));
    } }]
  });
  const queue = require(path.resolve('tmp/bugcheck/flow-router-queue.cjs'));
  const reports = [];
  // These capacities are injected test data, never Google limits or application caps.
  const scenarios = [
    { name: '73 images; quota failover', capacities: [2, 3, 100], expected: { done: 73, failed: 0, canceled: 0 }, switches: 2 },
    { name: 'all quotas exhausted', capacities: [1, 1, 1], expected: { done: 3, failed: 1, canceled: 69 }, switches: 3 },
    ...['google_blocked', 'auth_expired', 'approval_required', 'result_uncertain'].map(code => ({
      name: 'stop on ' + code, capacities: [100, 100, 100], rejectAt: 3, code,
      expected: { done: 2, failed: 1, canceled: 70 }, switches: 0
    })),
    { name: 'ambiguous quota; generation may be accepted', capacities: [100, 100, 100], rejectAt: 3,
      code: 'quota_exhausted', accepted: true, expected: { done: 2, failed: 1, canceled: 70 }, switches: 0 },
    { name: 'network disconnect after request', capacities: [100, 100, 100], disconnectAt: 3,
      expected: { done: 2, failed: 1, canceled: 70 }, switches: 0 }
  ];
  const originalError = console.error;
  for (const [index, scenario] of scenarios.entries()) {
    let inFlight = 0, peak = 0;
    const calls = [], completed = new Map(), used = [0, 0, 0];
    const server = http.createServer(async (req, res) => {
      inFlight++; peak = Math.max(peak, inFlight);
      try {
        let body = ''; for await (const part of req) body += part;
        const { accountId, clipId } = JSON.parse(body);
        assert([1, 2, 3].includes(accountId));
        calls.push({ accountId, clipId });
        await new Promise(resolve => setTimeout(resolve, 1));
        if (calls.length === scenario.disconnectAt) { req.socket.destroy(); return; }
        let result;
        if (calls.length === scenario.rejectAt) result = { status: 'rejected', code: scenario.code, accepted: scenario.accepted ?? false };
        else if (used[accountId - 1] >= scenario.capacities[accountId - 1]) result = { status: 'rejected', code: 'quota_exhausted', accepted: false };
        else {
          assert(!completed.has(clipId), 'A clip must not be generated twice');
          used[accountId - 1]++;
          result = { status: 'completed', assetId: 'synthetic-asset-' + clipId };
          completed.set(clipId, result.assetId);
        }
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result));
      } finally { inFlight--; }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const router = new AccountRouter([
      { id: 99, connected: false, imageEnabled: true },
      { id: 98, connected: true, imageEnabled: false },
      ...[1, 2, 3].map(id => ({ id, connected: true, imageEnabled: true }))
    ], async (accountId, clipId, signal) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, clipId }), signal
      });
      return response.json();
    });
    const gate = new queue.StopOnFailureBatch();
    const jobs = Array.from({ length: 73 }, (_, i) => ({ id: `${index}-${i + 1}`, clipId: String(i + 1), projectId: 'isolated-simulation', kind: 'image', provider: 'flow2api', status: 'queued' }));
    try {
      console.error = () => {};
      for (const job of jobs) {
        global.routerFixture.rows.set(job.id, job);
        queue.runJob(job, 'flow2api', ctx => gate.run(ctx.signal, () => queue.cancelJob(job.id), () => router.generate(job.clipId, ctx.signal)));
      }
      await Promise.all(jobs.map(job => queue.waitForJob(job.id)));
    } finally {
      console.error = originalError;
      await new Promise(resolve => server.close(resolve));
    }
    const states = jobs.map(job => global.routerFixture.rows.get(job.id));
    const actual = Object.fromEntries(['done', 'failed', 'canceled'].map(status => [status, states.filter(j => j.status === status).length]));
    assert.deepEqual(actual, scenario.expected);
    assert.equal(peak, 1);
    assert.equal(router.transitions.length, scenario.switches);
    assert.equal(completed.size, actual.done);
    for (const job of states.filter(j => j.status === 'done')) assert.equal(job.resultAssetId, completed.get(job.clipId));
    assert.deepEqual([...completed.keys()], Array.from({ length: actual.done }, (_, i) => String(i + 1)));
    if (!scenario.switches) assert(calls.every(call => call.accountId === 1));
    if (index === 0) {
      assert.deepEqual(used, [2, 3, 68]);
      assert.deepEqual(router.transitions, [{ from: 1, to: 2, clipId: '3' }, { from: 2, to: 3, clipId: '6' }]);
      assert.equal(calls.length, 75); // 73 completed plus two confirmed quota rejections.
    }
    const report = { scenario: scenario.name, ...actual, imagesPerAccount: used, transitions: router.transitions, requests: calls.length, peakConcurrency: peak };
    reports.push(report);
    console.log('PASS ' + JSON.stringify(report));
  }
  await fs.writeFile('tmp/bugcheck/flow-account-router-results.json', JSON.stringify({ mode: 'synthetic local HTTP; production router not installed', scenarios: reports }, null, 2));
  console.log('ALL 8 SCENARIOS PASS. No Google requests. No user database access. Production unchanged.');
})().catch(error => { console.error(error); process.exitCode = 1; });
