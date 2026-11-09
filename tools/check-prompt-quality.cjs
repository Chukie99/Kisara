const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { build } = require('esbuild')

;(async () => {
  const dir = path.resolve('tmp/bugcheck/prompt-quality-' + Date.now())
  fs.mkdirSync(dir, { recursive: true })
  for (const entry of ['src/shared/speech.ts', 'src/main/editorial.ts']) {
    await build({ entryPoints: [entry], bundle: true, platform: 'node', alias: { '@shared': path.resolve('src/shared') }, outfile: path.join(dir, path.basename(entry, '.ts') + '.cjs') })
  }
  const speech = require(path.join(dir, 'speech.cjs'))
  const factual = { ttsProvider: 'gemini', ttsVoice: 'fixture', editor: { storyBrief: { fictional: false } } }
  assert.equal(speech.effectiveDelivery(factual), 'natural')
  assert.equal(speech.effectiveDelivery({ editor: { storyBrief: { fictional: true } } }), 'dramatic')
  assert.equal(speech.effectiveDelivery({ editor: { voiceDelivery: 'warm', storyBrief: { fictional: false } } }), 'warm')
  assert.notEqual(speech.speechFingerprint(factual), speech.speechFingerprint({ ...factual, editor: { voiceDelivery: 'dramatic' } }))
  for (const [input, expected] of [
    ['Rp500 juta.', 'lima ratus juta rupiah.'],
    ['Rp18,25 juta dan Rp50.000', 'delapan belas koma dua lima juta rupiah dan lima puluh ribu rupiah'],
    ['Rp1.250.000,50', 'satu juta dua ratus lima puluh ribu koma lima nol rupiah'],
    ['5% dan 0,5%', 'lima persen dan nol koma lima persen'],
    ['KPR FLPP, DP dan BPJS.', 'ka pe er ef el pe pe, de pe dan be pe je es.'],
    ['<short pause> Rp100.', '<short pause> seratus rupiah.'],
    ['2026-11-08, versi 1.2.3, https://contoh.test/DP/5%', '2026-11-08, versi 1.2.3, https://contoh.test/DP/5%']
  ]) assert.equal(speech.pronunciationText(input, 'id'), expected, input)
  assert.equal(speech.pronunciationText('Rp500 juta 5% KPR', 'en'), 'Rp500 juta 5% KPR')
  await build({ entryPoints: ['src/main/scriptDrafts.ts'], bundle: true, platform: 'node', outfile: path.join(dir, 'drafts.cjs'), plugins: [{ name: 'isolated-paths', setup(b) {
    b.onResolve({ filter: /^\.\/paths$/ }, () => ({ path: 'paths', namespace: 'fixture' }))
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ loader: 'js', contents: 'export const projectDir=()=>'+JSON.stringify(dir) }))
  } }] })
  const drafts = require(path.join(dir, 'drafts.cjs'))
  const row = sourceScene => ({ sourceScene, title: 'Stap', story: 'Illustration', narration: 'A necessary passage.', dialogue: [] })
  const compact = { fingerprint: 'fixture', beats: ['Hook', 'Development', 'Ending'], targetCount: 12, complete: true, scenes: [1, 3, 4, 12].map(row) }
  drafts.writeScriptDraft('fixture', compact)
  assert.equal(drafts.readScriptDraft('fixture', 'fixture', 39).scenes.length, 4)
  assert.equal(drafts.savedScriptDraftCount('fixture'), 4)
  drafts.writeScriptDraft('fixture', { ...compact, complete: false })
  assert.equal(drafts.readScriptDraft('fixture', 'fixture', 39), null, 'Incomplete checkpoints still require a contiguous prefix')
  drafts.writeScriptDraft('fixture', { ...compact, scenes: [1, 3, 2].map(row) })
  assert.equal(drafts.readScriptDraft('fixture', 'fixture', 39), null, 'Compaction must preserve source order')
  assert.equal(drafts.savedScriptDraftCount('fixture'), 0, 'Recovery metadata also rejects corrupt compact IDs')
  const { improveComprehension } = require(path.join(dir, 'editorial.cjs'))
  const scenes = [1, 2, 3, 4].map(sourceScene => ({ sourceScene, title: 'Bagian ' + sourceScene, story: 'Ilustrasi ' + sourceScene, narration: sourceScene === 2 ? 'Pengulangan penuh.' : 'Langkah ' + sourceScene + '.', dialogue: [] }))
  let reads = 0, checkpoint
  const reduced = await improveComprehension(scenes, 'Approved brief', '', async request => {
    assert.equal(request.name, 'script-comprehension')
    assert(request.prompt.includes('remove=true'))
    return { issues: reads++ ? [] : [{ scene: 2, quote: scenes[1].narration, reason: 'Duplikat penuh, tanpa fakta atau jembatan baru.', remove: true }] }
  }, () => {}, draft => { checkpoint = draft })
  assert.deepEqual(reduced.map(s => s.sourceScene), [1, 3, 4])
  assert.deepEqual(checkpoint, reduced)
  let factReads = 0
  const audited = await improveComprehension(scenes.slice(0, 1), 'Unverified creator claim', '', async request => {
    if (request.name === 'script-facts') {
      assert(request.system.includes('NO browsing'))
      assert(!request.system.includes('concrete engagement defects'))
      return { issues: factReads++ ? [] : [{ scene: 1, quote: 'Langkah 1.', reason: 'Klaim belum punya dukungan; tulis sebagai kondisi.', remove: false }] }
    }
    assert.equal(request.name, 'script-facts-repair')
    assert(request.system.includes('never invent sources'))
    return { scenes: [{ scene: 1, title: 'Kondisi', story: 'Ilustrasi bersyarat', narration: 'Jika kondisi itu berlaku, hasilnya dapat berbeda.', dialogue: [] }] }
  }, () => {}, () => {}, 'facts')
  assert.equal(audited[0].sourceScene, 1)
  assert(audited[0].narration.startsWith('Jika'))
  await assert.rejects(improveComprehension(scenes, '', '', async () => ({ issues: [{ scene: 2, quote: 'Kutipan palsu.', reason: 'Tidak cocok.' }] }), () => {}, () => {}, 'facts'), /pemeriksaan alur yang valid/)
  console.log('PROMPT QUALITY PASS: Indonesian pronunciation, language/tag/URL boundaries, factual vs fiction delivery, explicit override, separate grounded claim audit, redundant-scene removal and checkpoint IDs. Synthetic AI.')
})().catch(error => { console.error(error); process.exitCode = 1 })
