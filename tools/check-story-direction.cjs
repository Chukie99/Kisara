const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { build } = require('esbuild')

;(async () => {
  const dir = path.resolve('tmp/bugcheck/story-direction-' + Date.now())
  fs.mkdirSync(dir, { recursive: true })
  const output = path.join(dir, 'direction.cjs')
  await build({ entryPoints: ['src/shared/storyDirection.ts'], bundle: true, platform: 'node', outfile: output })
  const { storyBeatSlots, ENGAGEMENT_DIRECTION, SCENE_DIRECTION, NARRATION_VOICE_DIRECTION } = require(output)
  for (let count = 3; count <= 160; count++) {
    for (let beats = 3; beats <= Math.min(12, count); beats++) {
      const slots = storyBeatSlots(count, beats)
      assert.equal(slots.length, count)
      assert.equal(slots.filter(s => s.beat === 0).length, 1)
      assert.equal(slots.filter(s => s.beat === beats - 1).length, 1)
      assert.deepEqual([...new Set(slots.map(s => s.beat))], Array.from({ length: beats }, (_, i) => i))
      slots.forEach((s, i) => assert.equal(s.id, i + 1))
    }
  }
  assert.throws(() => storyBeatSlots(2, 3))
  const counts = Array.from({ length: 10 }, (_, i) => storyBeatSlots(73, 10).filter(s => s.beat === i).length)
  fs.writeFileSync(path.join(dir, 'allocation.json'), JSON.stringify({ scenes: 73, beats: counts }, null, 2))

  // Exercise actual drafting and editorial request construction with isolated storage.
  let calls = [], saved = [], reviews = 0, failReview = false, generation = 0
  const project = { id: 'fixture', title: 'Kopi dan rumah', synopsis: 'Simulasi: Kenzo mengurangi kopi untuk menabung uang muka. Jangan mengarang harga atau pertumbuhan rumah.', durationSec: 60, language: 'id', ttsProvider: 'f5-local', editor: { storyBrief: { fictional: false, idea: 'Menguji penghematan kopi' } } }
  const scenes = [
    { title: 'Pilihan di kasir', story: 'Kenzo menahan tangan sebelum membayar kopi di warung.', narration: 'Kopi ini bisa ia batalkan. Tapi berapa jarak yang benar-benar terpotong menuju uang muka?', dialogue: [] },
    { title: 'Penghematan', story: 'Di rumah, Kenzo memasukkan uang yang tidak jadi dipakai ke toples tabungan.', narration: 'Dalam simulasi ini, uang yang tidak dibelanjakan menambah tabungan. Harga rumah belum ikut dihitung.', dialogue: [] },
    { title: 'Batas contoh', story: 'Kenzo membandingkan toples tabungan dengan rencana rumah yang sama.', narration: 'Jadi penghematannya nyata di dalam contoh, tetapi cukup atau tidaknya perlu dibandingkan dengan target dan waktunya.', dialogue: [] }
  ]
  global.storyDirectionFixture = {
    project: () => structuredClone(project),
    bundle: () => ({ project: structuredClone(project), clips: [], assets: [], characters: [], jobs: [] }),
    save: (_id, _title, value) => { saved = value },
    ask: async r => {
      calls.push(r)
      if (r.name === 'script-facts') { assert(r.prompt.includes('NO browsing')); return { issues: [] } }
      assert(r.system.includes(ENGAGEMENT_DIRECTION), r.name + ' lost engagement direction')
      assert(r.system.includes(NARRATION_VOICE_DIRECTION), r.name + ' lost the approved conversational voice')
      assert(r.system.includes('Use a FRONTAL, specific hook'))
      assert(r.system.includes('EXACTLY ONE brief, spoken, topic-specific comment invitation'))
      if (r.name === 'script') { generation++; return { title: project.title, scenes } }
      if (r.name === 'script-comprehension') {
        assert(r.prompt.includes('Pilihan di kasir'))
        assert(r.prompt.includes('menahan tangan'))
        assert(r.system.includes('multiple closing summaries'))
        if (failReview) return { issues: [{ scene: 1, quote: 'Invented quote', reason: 'Not grounded' }] }
        return reviews++ === 0 ? { issues: [{ scene: 2, quote: scenes[1].narration, reason: 'Perjelas hubungan penghematan dengan adegan sebelumnya.' }] } : { issues: [] }
      }
      if (r.name === 'script-comprehension-repair') {
        const ids = r.schema.properties.scenes.items.properties.scene.enum
        return { scenes: ids.map(scene => ({ scene, ...scenes[scene - 1] })) }
      }
      throw Error('Unexpected ' + r.name)
    }
  }
  const storyOut = path.join(dir, 'story.cjs')
  await build({ entryPoints: ['src/main/story.ts'], bundle: true, platform: 'node', format: 'cjs', alias: { '@shared': path.resolve('src/shared') }, outfile: storyOut,
    plugins: [{ name: 'isolated-story', setup(b) {
      b.onResolve({ filter: /^\.\/(repo|settings|services\/llm|services\/youtube|paths)$/ }, ({ path }) => ({ path, namespace: 'fixture' }))
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path: p }) => ({ loader: 'js', contents:
        p === './paths' ? 'export const projectDir=()=>'+JSON.stringify(dir) :
        p === './settings' ? 'export const getSettings=()=>({channelCharacterEnabled:false,channelStyleEnabled:false})' :
        p.includes('youtube') ? 'export const normalizeYoutubeUrl=()=>null,fetchInfo=()=>{},fetchTranscript=()=>{}' :
        p.includes('llm') ? 'export const generateJson=r=>globalThis.storyDirectionFixture.ask(r)' :
        'export const getProject=()=>globalThis.storyDirectionFixture.project(),getBundle=()=>globalThis.storyDirectionFixture.bundle(),clipsOf=()=>globalThis.storyDirectionFixture.clips?.()??[],replaceScript=(...a)=>globalThis.storyDirectionFixture.save(...a);export const patchEditor=()=>{},applyScriptRefinement=(...a)=>globalThis.storyDirectionFixture.refine?.(...a),divideUnproducedShots=()=>0,repairCharacterLinks=()=>globalThis.storyDirectionFixture.clips?.()??[],charactersOf=()=>[],applyVisuals=(...a)=>globalThis.storyDirectionFixture.visuals?.(...a);' }))
    } }]
  })
  const { generateScript, generateVisuals, refineScript } = require(storyOut)
  await generateScript('fixture')
  assert.equal(saved.length, 3)
  assert.equal(calls.filter(r => r.name === 'script-comprehension-repair').length, 1)
  project.editor.storyBrief.fictional = true
  saved = []; calls = []; reviews = 1
  await generateScript('fixture')
  assert.equal(saved.length, 3)
  assert(!calls[0].system.includes('You write a continuous FACTUAL'))
  failReview = true; saved = []; calls = []
  await assert.rejects(generateScript('fixture'), /belum memberikan pemeriksaan/)
  assert.equal(saved.length, 0, 'Invalid editorial quotations must not overwrite the project')
  assert.equal(calls.filter(r => r.name === 'script-comprehension').length, 2)
  assert(SCENE_DIRECTION.includes('BEFORE the intended action'))
  assert(SCENE_DIRECTION.includes('ONE primary visible subject'))
  assert(SCENE_DIRECTION.includes('never reset a completed action'))
  assert(SCENE_DIRECTION.includes('Prefer a locked camera'))
  assert(SCENE_DIRECTION.includes('do not loop or stretch'))
  let visualUpdates = []
  const clips = scenes.map((s, i) => ({ ...s, id: 'clip-'+i, durationMs: 6000, characterIds: [], visualPrompt: '', videoPrompt: '', cameraPreset: 'static', motionStrength: 'halus', transition: 'cut' }))
  project.styleId = 'cartoon-flat'; project.aspectRatio = '16:9'; project.editor.flowMode = 'video'
  global.storyDirectionFixture.clips = () => structuredClone(clips)
  global.storyDirectionFixture.bundle = () => ({ project: structuredClone(project), clips: structuredClone(clips), characters: [], assets: [], jobs: [] })
  global.storyDirectionFixture.visuals = (_id, _characters, updates) => { visualUpdates = updates }
  global.storyDirectionFixture.ask = async r => {
    if (r.name === 'visual-sequence-review') return { issues: [] }
    assert.equal(r.name, 'visuals')
    assert(r.system.includes(SCENE_DIRECTION))
    assert(r.prompt.includes('Spoken context:'))
    assert(r.prompt.includes(scenes[0].narration))
    return { world: 'Indonesia, present day', characters: [], scenes: clips.map((c, i) => ({ scene: i+1, setting: 'A small Indonesian coffee stall, daytime', action: 'An adult customer holds a coin near the counter before payment.', wardrobe: [{ name: 'customer', source: 'custom', outfit: 'Blue short sleeve shirt' }], framing: 'Close-up on hand, coin and counter', avoid: 'text, logos, duplicate limbs', characters: [], role: i%2?'detail':'situation', focus:'Fokus koin dan keputusan sebelum membayar', emphasis:{text:'',quote:''}, camera: 'static', strength: 'halus', motion: 'The hand withdraws the coin from the counter and pauses above the open wallet.', transition: 'cut' })) }
  }
  await generateVisuals('fixture', 'all')
  assert.equal(visualUpdates.length, 3)
  assert(visualUpdates.every(v=>v.presentation?.focus==='Fokus koin dan keputusan sebelum membayar'));assert(visualUpdates.some(v=>v.presentation.role==='detail'));
  assert(visualUpdates.every(s => s.videoPrompt.includes('withdraws the coin')))
  // An estimated long video may need only twelve distinct passages.
  project.durationSec = 273; project.editor.storyBrief.fictional = false
  calls = []; saved = []; let visualReads = 0, visualRequests = 0
  global.storyDirectionFixture.ask = async r => {
    calls.push(r)
    if (r.name === 'script-outline') return { title: project.title, beats: ['Ouverture', 'Development', 'Payoff'], sceneCount: 12 }
    if (r.name === 'script-part') {
      const m = r.prompt.match(/Write ONLY global scenes (\d+)–(\d+)/)
      return { scenes: Array.from({length: +m[2] - +m[1] + 1}, (_, i) => ({ sourceScene: +m[1] + i, title: 'Stage', story: 'A new step', narration: 'Necessary step ' + (+m[1] + i), dialogue: [] })) }
    }
    if (r.name === 'script-facts' || r.name === 'script-comprehension') return { issues: [] }
    if (r.name === 'visual-sequence-review') {
      visualReads++
      return { issues: visualReads === 1 ? [{scene: 2, quote: 'Repeated action', reason: 'Use the supported new step rather than repeating the previous pose.'}] : [] }
    }
    if (r.name === 'visuals') {
      visualRequests++
      const ids = r.schema.properties.scenes.items.properties.scene.enum
      assert(r.prompt.includes('Accepted visual continuity'))
      if (visualRequests > 1) assert(r.prompt.includes('Sequence defects to repair'))
      return { world: 'Indonesia, present day', characters: [], scenes: ids.map(scene => ({scene, setting: 'A coffee stall', action: visualRequests > 1 ? 'A hand withdraws the coin' : 'Repeated action', wardrobe: [], framing: 'Close detail', avoid: 'text', characters: [], camera: 'static', strength: 'halus', motion: 'The hand moves back', transition: 'cut'})) }
    }
    throw Error('Unexpected '+r.name)
  }
  await generateScript('fixture')
  assert.equal(saved.length, 12)
  assert.equal(calls.filter(r => r.name === 'script-part').length, 3)
  assert(calls.some(r => r.name === 'script-facts'))
  visualUpdates = []
  await generateVisuals('fixture', 'all')
  assert.equal(visualReads, 2)
  assert.equal(visualRequests, 2)
  assert(visualUpdates[1].visualPrompt.includes('withdraws the coin'))
  const validAsk = global.storyDirectionFixture.ask
  global.storyDirectionFixture.ask = async r => r.name === 'visual-sequence-review' ? {issues: [{scene: 2,quote:'Not present',reason:'Invalid quote'}]} : validAsk(r)
  visualUpdates = []; visualRequests = 0
  await assert.rejects(generateVisuals('fixture', 'all'), /kutipan adegan/)
  assert.equal(visualUpdates.length, 0)
  const beforeScriptReview = visualRequests
  let reportedIssues
  global.storyDirectionFixture.ask = async r => r.name === 'visual-sequence-review' ? {issues:[{scene:2,quote:'Repeated action',reason:'Narasi mengulang adegan 1 tanpa perkembangan; perbaiki isi naskah.',kind:'script'}]} : validAsk(r)
  await assert.rejects(generateVisuals('fixture','all',{review: issues=>{reportedIssues=issues}}), /Naskah perlu ditinjau/)
  assert.equal(visualRequests,beforeScriptReview,'A script problem must not trigger more visual generations')
  assert.equal(reportedIssues[0].kind,'script')
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'visual-draft.json'),'utf8')).reviewIssues[0].scene,2)
  project.durationSec = 600
  const revisionClips = [1,2,3].map((n)=>({id:'revision-'+n,title:'Bagian '+n,story:'Contoh utang dan batasannya.',narration:n===3?'Setelah membandingkan biaya, kamu pilih melunasi yang mana dulu?':'Utang konsumsi menambah pembayaran tanpa pendapatan tambahan pada contoh ini.',durationMs:5000,visualPrompt:'',videoPrompt:''}))
  const assessmentKey = JSON.stringify(['comprehension-v2',project.id,project.language,project.synopsis,project.durationSec,project.editor.storyBrief,revisionClips.map(c=>[c.id,c.title,c.story,c.narration])])
  project.editor.scriptAssessment={fingerprint:assessmentKey,findings:[{clipIds:[revisionClips[1].id],kind:'repeat',quote:revisionClips[1].narration,detail:'SENTINEL_REPEAT_FIX: merge with scene 1.'}]}
  global.storyDirectionFixture.bundle=()=>({project:structuredClone(project),clips:structuredClone(revisionClips),characters:[],assets:[],jobs:[]})
  let revisionRequest, revised
  global.storyDirectionFixture.refine=(_id,updates)=>{revised=updates}
  global.storyDirectionFixture.ask=async r=>{
    if(r.name!=='script-facts')assert(r.system.includes(NARRATION_VOICE_DIRECTION), r.name + ' lost conversational voice during refinement or review')
    if(r.name==='script-facts'||r.name==='script-comprehension')return {issues:[]}
    if(r.name!=='refine-script')throw Error('Unexpected revision request '+r.name)
    revisionRequest=r
    return {scenes:[1,3].map(n=>({sourceScene:n,title:'Bagian '+n,story:revisionClips[n-1].story,narration:revisionClips[n-1].narration,dialogue:[]}))}
  }
  await refineScript('fixture')
  assert(revisionRequest.prompt.includes('SENTINEL_REPEAT_FIX'))
  assert(revisionRequest.prompt.includes('about 10 words per scene'),'Revision follows the actual draft, not the 600-second target')
  assert(revisionRequest.system.includes('do not delete half a sentence'))
  assert.deepEqual(revised.map(c=>c.id),['revision-1','revision-3'])
  project.editor.scriptAssessment.fingerprint='stale'
  await refineScript('fixture')
  assert(!revisionRequest.prompt.includes('SENTINEL_REPEAT_FIX'),'Stale assessment cannot drive a rewrite')
  console.log('REFINE FINDINGS PASS: current findings drive repair, stale findings ignored, short draft is not padded to a ten-minute target, original source IDs preserved.')
  console.log('ADAPTIVE AND SEQUENCE PASS: long script uses 12 of 39 budgeted slots; separate claim audit; full storyboard review repairs only scene 2; invalid review preserves existing prompts.')
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ status: 'passed', allocation: counts, generationRequests: generation, mode: 'synthetic AI; isolated repository and disk' }, null, 2))
  console.log('PASS: 3–160 scenes; hook/ending each one slot; complete ordered beats; factual and fiction drafting; grounded editorial repair; invalid quotes rejected without project overwrite; storyboard and I2V action preserved. Synthetic AI. ' + dir)
})().catch(e => { console.error(e); process.exitCode = 1 })
