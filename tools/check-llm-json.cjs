const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { build } = require('esbuild')

;(async () => {
  const dir = path.resolve('tmp/bugcheck/llm-json-' + Date.now())
  fs.mkdirSync(dir, { recursive: true })
  await build({ entryPoints: ['src/main/services/json.ts'], bundle: true, platform: 'node', outfile: path.join(dir, 'json.cjs') })
  const { extractJson } = require(path.join(dir, 'json.cjs'))
  const exact = { narration: 'Uangnya Rp1.250.000,50; tanda , } ] tetap di dalam teks. Ia berkata "{ini}".', amount: 1250000.5 }
  assert.deepEqual(extractJson(JSON.stringify(exact)), exact)
  assert.deepEqual(extractJson('<think>{"reasoning":true}</think>\nIni hasilnya:\n```json\n' + JSON.stringify(exact) + '\n```\nSelesai.'), exact)
  assert.deepEqual(extractJson('```json\n{"narration":"Rp1.250.000,50 dan , } tetap", "rows":[1,2,],}\n```'), { narration: 'Rp1.250.000,50 dan , } tetap', rows: [1, 2] })
  assert.deepEqual(extractJson('Hasil {bukan JSON}.\n{"ok":true}'), { ok: true })
  for (const broken of ['{"ideas":[{"title":"satu"}', '{"a":{"b":1}', '{"text":"belum selesai', '{"a":1}\n{"b":2}', 'Tidak ada JSON.', '{"amount":1.250.000}', '{"x":[1}']) assert.throws(() => extractJson(broken), undefined, broken)
  await build({ entryPoints: ['src/main/services/llm.ts'], bundle: true, platform: 'node', outfile: path.join(dir, 'llm.cjs'), alias: { '@shared': path.resolve('src/shared') }, plugins: [{ name: 'isolated-llm', setup(b) {
    b.onResolve({ filter: /^(?:\.\/|\.\.\/)(settings|secrets|gemini|elevenlabs)$/ }, ({ path }) => ({ path, namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: p }) => ({ loader: 'js', contents: p.endsWith('settings') ? 'export const getSettings=()=>({llmProvider:"custom",customBaseUrl:"http://writer.invalid/v1",llmModels:{custom:"all-free-models"}}),readCache=()=>null,writeCache=()=>{};' : p.endsWith('secrets') ? 'export const getSecret=()=>null,PROVIDER_NAMES={custom:"endpoint custom"};' : 'export const generateJson=()=>{},listModels=()=>[],testKey=()=>{};' }))
  } }] })
  const { generateJson } = require(path.join(dir, 'llm.cjs'))
  const request = { system: 'Write Indonesian. Do not invent facts.', prompt: 'Return an Indonesian narration.', schema: { type: 'object', properties: { narration: { type: 'string' } }, required: ['narration'] }, name: 'fixture' }
  let replies, bodies
  const message = (content, finish_reason = 'stop') => ({ choices: [{ message: { content }, finish_reason }] })
  global.fetch = async (url, init) => {
    assert.equal(url, 'http://writer.invalid/v1/chat/completions')
    bodies.push(JSON.parse(init.body))
    const reply = replies.shift()
    assert(reply, 'Unexpected retry')
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { 'Content-Type': 'application/json' } })
  }
  const set = list => { replies = list; bodies = [] }
  set([{ body: message('```json\n{"narration":"Gaji masuk, tagihan menunggu.",}\n```') }])
  assert.equal((await generateJson(request)).narration, 'Gaji masuk, tagihan menunggu.')
  assert.equal(bodies.length, 1)
  set([{ body: message('Jawaban berupa prosa.') }, { status: 400, body: { error: { message: 'response_format is unsupported' } } }, { body: message('{"narration":"Jawaban Indonesia."}') }])
  assert.equal((await generateJson(request)).narration, 'Jawaban Indonesia.')
  assert.equal(bodies.length, 3)
  assert(!bodies[0].response_format && bodies[1].response_format.type === 'json_object' && !bodies[2].response_format)
  assert(bodies[2].messages[0].content.includes('requested output language'))
  set(Array.from({ length: 3 }, () => ({ body: message('') })))
  await assert.rejects(generateJson(request), /jawaban kosong/)
  assert.equal(bodies.length, 3)
  set(Array.from({ length: 3 }, () => ({ body: message('{"narration":"Valid-looking but cut off"}', 'length') })))
  await assert.rejects(generateJson(request), /terpotong/)
  set(Array.from({ length: 3 }, () => ({ body: message('Bukan JSON.') })))
  await assert.rejects(generateJson(request), /JSON setelah dicoba ulang/)
  for (const status of [401, 402, 403, 429, 500]) {
    set([{ status, body: { error: { message: 'Access unavailable' } } }])
    await assert.rejects(generateJson(request))
    assert.equal(bodies.length, 1, 'Do not retry access, credits, rate limits or server failures')
  }
  for (const body of [message('', 'content_filter'), { choices: [{ message: { refusal: 'Refused' }, finish_reason: 'stop' }] }]) {
    set([{ body }]); await assert.rejects(generateJson(request), /menolak/); assert.equal(bodies.length, 1)
  }
  const controller = new AbortController(); controller.abort()
  set([]); await assert.rejects(generateJson({ ...request, signal: controller.signal })); assert.equal(bodies.length, 0)
  console.log('LLM JSON PASS: safe wrappers/trailing commas, exact strings and amounts, incomplete/ambiguous JSON rejected, bounded custom fallback, empty vs truncated, refusal/auth/credit/rate/server/cancel do not retry. '+dir)
})().catch(error => { console.error(error); process.exitCode = 1 })
