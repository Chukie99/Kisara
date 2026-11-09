const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { build } = require('esbuild')

;(async () => {
  const dir = path.resolve('tmp/bugcheck/visual-review-' + Date.now())
  fs.mkdirSync(dir, { recursive: true })
  const bundle = { project: { id: 'fixture', synopsis: 'Contoh utang', language: 'id', styleId: 'flat', aspectRatio: '16:9', editor: {} }, characters: [], clips: Array.from({ length: 20 }, (_, i) => ({ id: 'c'+i, title: 'Adegan '+(i+1), story: 'Situasi', narration: 'Penjelasan '+i, visualPrompt: '', videoPrompt: '' })) }
  const issue = { scene: 12, kind: 'script', quote: 'Same explanatory action', reason: 'Narasi mengulang adegan 9 tanpa perkembangan. Perbaiki naskah sebelum mengganti gambarnya.' }
  const scenes = bundle.clips.map((_, i) => ({ scene: i+1, setting: 'Indonesia', action: 'Same explanatory action', wardrobe: [], characters: [] }))
  global.visualReviewFixture = { bundle, run: async (_id, _mode, options) => { options.progress(20,20,'Memeriksa storyboard'); options.review([issue]); throw Error(issue.reason) } }
  const out = path.join(dir, 'review.cjs')
  await build({ stdin: { contents: "export * from './src/main/visualRuns';export * from './src/main/visualDrafts'", resolveDir: process.cwd() }, bundle: true, platform: 'node', outfile: out, alias: { '@shared': path.resolve('src/shared') }, plugins: [{ name: 'isolated-review', setup(b) {
    b.onResolve({ filter: /^\.\/(repo|events|story|paths)$/ }, ({ path }) => ({ path, namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: p }) => ({ loader: 'js', contents: p === './repo' ? 'export const getProject=()=>globalThis.visualReviewFixture.bundle.project,getBundle=()=>globalThis.visualReviewFixture.bundle,clipsOf=()=>globalThis.visualReviewFixture.bundle.clips;' : p === './story' ? 'export const generateVisuals=(...args)=>globalThis.visualReviewFixture.run(...args);' : p === './events' ? 'export const emit={visualProgress:()=>{}};' : 'export const projectDir=()=>'+JSON.stringify(dir) }))
  } }] })
  let api = require(out)
  const fingerprint = api.visualDraftFingerprint('missing', bundle.project, bundle.characters, bundle.clips)
  const draft = { fingerprint, groupSize: 6, plan: { world: 'Indonesia', scenes, characters: [] }, reviewIssues: [issue] }
  api.writeVisualDraft('fixture', draft)
  await assert.rejects(api.runVisuals('fixture', 'missing'), error => error.message.includes('20/20 prompt sudah tersusun') && error.message.includes(issue.reason) && !error.message.includes('belum lengkap'))
  delete require.cache[require.resolve(out)]; api = require(out)
  const recovered = api.visualStatus('fixture')
  assert.equal(recovered.status, 'failed')
  assert.equal(recovered.completed, 20)
  assert.deepEqual(recovered.visualIssues, [issue], 'Findings survive module restart')
  bundle.clips[0].narration += ' diedit'
  assert.equal(api.visualStatus('fixture'), null, 'Edited source cannot inherit a stale review')
  bundle.clips[0].narration = 'Penjelasan 0'
  api.writeVisualDraft('fixture', { ...draft, reviewIssues: [{ ...issue, quote: 'Fabricated quote' }] })
  assert.equal(api.readVisualDraft('fixture', fingerprint).plan.scenes.length, 20, 'Invalid diagnostics must not discard valid prompts')
  assert.equal(api.readVisualDraft('fixture', fingerprint).reviewIssues, undefined)
  assert.equal(api.visualStatus('fixture').status, 'canceled', 'A complete unreviewed draft is resumable, not approved')
  console.log('VISUAL REVIEW PASS: 20/20 means composed, detailed findings survive restart, stale findings invalidated, corrupt diagnostics preserve prompts, no review bypass. '+dir)
})().catch(error => { console.error(error); process.exitCode = 1 })
