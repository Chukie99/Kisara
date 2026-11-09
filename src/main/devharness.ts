import { visualStatus } from './visualRuns'
import { visualDraftFingerprint, writeVisualDraft } from './visualDrafts'
import { randomUUID } from 'node:crypto'
import { publicationSource } from '@shared/publication'
import { createServer } from 'node:http'
import { flowVideoPrompt } from '@shared/flow'
import { channelCharacterBytes, channelCharacterKey, importChannelCharacter, channelStyleBytes, channelStyleKey, channelStylePrompt, sameReferenceImage } from './channelCharacter'
import { divideUnproducedShots, insertClipAfter, insertJob, updateJob } from './repo'
import { prepareMediaImport, applyMediaImport, discardMediaImport } from './mediaImport'
import { isolatedHarnessProfile, runFixtureTool } from './devHarnessTools'
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { app, dialog, ipcMain, nativeImage, type BrowserWindow } from 'electron'
import ffmpegStatic from 'ffmpeg-static'
import { estimateWordTimings } from '@shared/captions'
import { anchorPoint } from '@shared/overlays'
import { startExport } from './exporter'
import { assetAbsPath, binPath } from './paths'
import { probeDurationMs } from './services/audio'
import { applyScriptRefinement, applyVisuals, createProject, getBundle, getJob, insertAsset, patchEditor, patchClip, patchClipText, repairCharacterLinks, replaceScript, replaceStory, saveSnapshot, touchProject } from './repo'
import { validateImageBytes, validateImageFile } from './imageQuality'
import { waitForJob } from './jobs'
import { composeSceneSpeech, stripSpeakerLabels } from '@shared/speech'
import { emit } from './events'
import { recordCheck, setSecret } from './secrets'
import { getSettings, setSettings } from './settings'
import type { ApiProvider, ScriptProgress } from '@shared/types'

/**
 * Real speech for the demo clips (Windows' built-in English voice) with estimated caption timings, so
 * Whisper caption syncing can be tested without a TTS key.
 */
async function addDemoSpeech(projectId: string, dialogue: boolean | 'labels' = false): Promise<void> {
  const lines = dialogue === 'labels' ? [
    'Narrator: Kenzo opens the notebook.',
    'Kenzo, “I will save a little today.”',
    'Kenzo writes down the number. Narrator, “Small steps matter.”',
    '“Kenzo, keep going.”'
  ] : dialogue ? [
    composeSceneSpeech('Someone knocked at the door.', [{ speaker: 'Gajah whispered', text: 'Who is outside?', emotion: 'whispers' }], false),
    composeSceneSpeech('His father answered quietly.', [{ speaker: 'Father said', text: 'Keep the door closed.', emotion: 'neutral' }], false),
    composeSceneSpeech('They heard the footsteps stop.', [{ speaker: 'Gajah asked', text: 'Did you hear that?', emotion: 'neutral' }], false),
    composeSceneSpeech('At last his father smiled.', [{ speaker: 'Father replied', text: 'We are safe now.', emotion: 'neutral' }], false)
  ] : [
    'In the year thirteen thirty six, the sun set over the capital of Majapahit.',
    'Before Queen Tribhuwana, Gajah Mada was named the prime minister.',
    'He swore he would not rest until the whole archipelago was united.',
    'The ministers laughed at him, but history proved him right.'
  ]
  const b = getBundle(projectId)
  for (const [i, c] of b.clips.entries()) {
    const sourceText = lines[i % lines.length]
    const text = dialogue === 'labels' ? stripSpeakerLabels(sourceText, ['Kenzo']) : sourceText
    const rel = `audio/speech-${i}.wav`
    const abs = assetAbsPath(projectId, rel)
    mkdirSync(dirname(abs), { recursive: true })
    const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${abs.replace(/'/g, "''")}'); $s.Speak('${text}'); $s.Dispose()`
    // stdin must be closed, or PowerShell waits on it and blocks the main process.
    runFixtureTool('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    const ms = await probeDurationMs(abs)
    const asset = insertAsset({
      projectId,
      clipId: c.id,
      kind: 'audio',
      provider: 'demo',
      prompt: sourceText,
      localPath: rel,
      durationMs: ms,
      meta: { spokenText: text, words: estimateWordTimings(text, ms / 1000), estimatedTimings: true }
    })
    patchClip(c.id, { audioAssetId: asset.id, durationMs: ms + 400 })
  }
  const fresh = getBundle(projectId)
  saveSnapshot({ project: fresh.project, characters: fresh.characters, clips: fresh.clips.map((c, i) => ({ ...c, narration: lines[i % lines.length] })) })
}

/** A flat test logo and a two-line caption, to check overlay placement in the preview and in the export. */
function addDemoOverlays(projectId: string): void {
  const rel = 'overlays/demo-logo.png'
  const abs = assetAbsPath(projectId, rel)
  mkdirSync(dirname(abs), { recursive: true })
  runFixtureTool(binPath(ffmpegStatic!), ['-y', '-f', 'lavfi', '-i', 'color=c=0xE4572E:s=360x120', '-frames:v', '1', abs], { windowsHide: true })
  const logo = insertAsset({ projectId, kind: 'overlay', provider: 'demo', prompt: 'logo-demo.png', localPath: rel, width: 360, height: 120 })
  const b = getBundle(projectId)
  saveSnapshot({
    project: {
      ...b.project,
      editor: {
        ...b.project.editor,
        overlays: [
          { id: 'ov-logo', kind: 'image', assetId: logo.id, anchor: 9, ...anchorPoint(9, 16 / 9), width: 0.16, opacity: 0.85, start: 0, end: null },
          {
            id: 'ov-text',
            kind: 'text',
            text: 'Kisara\nStudio cerita & video',
            anchor: 5,
            x: 0.5,
            y: 0.42,
            size: 0.065,
            color: '#FFFFFF',
            style: 'box',
            bold: true,
            start: 0.5,
            end: 12
          }
        ]
      }
    },
    characters: b.characters,
    clips: b.clips
  })
}

/** Moving test videos on every clip (the first with a strong zoom on top), to test camera over AI video. */
function addDemoVideos(projectId: string): void {
  const ff = binPath(ffmpegStatic!)
  for (const [i, c] of getBundle(projectId).clips.entries()) {
    const rel = `videos/demo-${i}.mp4`
    const abs = assetAbsPath(projectId, rel)
    mkdirSync(dirname(abs), { recursive: true })
    runFixtureTool(ff, ['-y', '-f', 'lavfi', '-i', `testsrc2=s=1280x720:r=24:d=6`, '-vf', `hue=h=${i * 50}`, '-pix_fmt', 'yuv420p', abs], { windowsHide: true })
    const v = insertAsset({ projectId, clipId: c.id, kind: 'video', provider: 'demo', localPath: rel, durationMs: 6000, width: 1280, height: 720 })
    patchClip(c.id, { videoAssetId: v.id, motionType: 'video', ...(i === 0 ? { videoCamera: 'zoomin', videoStrength: 'kuat' } : {}) })
  }
}

/** Builds a small project from synthetic media so storyboard, editor and export can be tested without API keys. */
function seedDemo(): string {
  const ff = binPath(ffmpegStatic!)
  const p = createProject({ synopsis: 'Demo: Gajah Mada dan Sumpah Palapa', durationSec: 30, styleId: 'stickman', language: 'id' })
  const lines = [
    { t: 'Senja di Majapahit', n: 'Tahun 1336. Senja turun di ibu kota Majapahit, dan istana bersiap untuk upacara penting.', cam: 'zoomin' },
    { t: 'Gajah Mada maju', n: 'Di tengah balairung, patih yang baru dilantik melangkah maju. Namanya Gajah Mada.', cam: 'panright' },
    { t: 'Sumpah Palapa', n: 'Aku tidak akan menikmati palapa, sebelum Nusantara bersatu.', cam: 'kenburns' },
    { t: 'Para menteri tertawa', n: 'Seisi ruangan tertawa, tapi sejarah membuktikan dia benar.', cam: 'shake' }
  ] as const
  replaceStory(
    p.id,
    'Demo Sumpah Palapa',
    [{ name: 'Gajah Mada', description: 'stickman patih with golden warrior headdress and red sash' }],
    lines.map((l) => ({
      title: l.t,
      story: l.t,
      narration: l.n,
      visualPrompt: l.t,
      durationMs: 5000,
      motionType: 'camera',
      cameraPreset: l.cam,
      motionStrength: 'sedang',
      videoPrompt: '',
      transition: 'fade',
      characterNames: ['Gajah Mada']
    }))
  )
  const b = getBundle(p.id)
  b.clips.forEach((clip, i) => {
    const img = `images/demo-${i}.png`
    const wav = `audio/demo-${i}.wav`
    mkdirSync(dirname(assetAbsPath(p.id, img)), { recursive: true })
    mkdirSync(dirname(assetAbsPath(p.id, wav)), { recursive: true })
    runFixtureTool(ff, ['-y', '-f', 'lavfi', '-i', 'testsrc2=s=1920x1080', '-vf', `hue=h=${i * 70}`, '-frames:v', '1', assetAbsPath(p.id, img)], { windowsHide: true })
    const sec = 3.2 + i * 0.4
    runFixtureTool(ff, ['-y', '-f', 'lavfi', '-i', `sine=frequency=${220 + i * 60}:duration=${sec}`, '-ar', '24000', '-ac', '1', assetAbsPath(p.id, wav)], {
      windowsHide: true
    })
    const image = insertAsset({ projectId: p.id, clipId: clip.id, kind: 'image', provider: 'demo', localPath: img, width: 1920, height: 1080 })
    const audio = insertAsset({
      projectId: p.id,
      clipId: clip.id,
      kind: 'audio',
      provider: 'demo',
      prompt: clip.narration,
      localPath: wav,
      durationMs: Math.round(sec * 1000),
      meta: { words: estimateWordTimings(clip.narration, sec), estimatedTimings: true }
    })
    patchClip(clip.id, { imageAssetId: image.id, audioAssetId: audio.id, durationMs: Math.round(sec * 1000) + 400 })
    if (i === 0) touchProject(p.id, { coverAssetId: image.id })
  })
  const music = 'music/demo.wav'
  mkdirSync(dirname(assetAbsPath(p.id, music)), { recursive: true })
  runFixtureTool(ff, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=110:duration=30', '-ar', '44100', assetAbsPath(p.id, music)], { windowsHide: true })
  const m = insertAsset({ projectId: p.id, kind: 'music', provider: 'demo', prompt: 'demo-musik.wav', localPath: music, durationMs: 30000 })
  const fresh = getBundle(p.id)
  saveSnapshot({
    project: { ...fresh.project, step: 4, status: 'editing', editor: { ...fresh.project.editor, musicAssetId: m.id } },
    characters: fresh.characters,
    clips: fresh.clips
  })
  return p.id
}

/**
 * For harness runs: keep painting and timers going while the test window sits behind other windows, so
 * screenshots show the current state. Must run before the app is ready.
 */
function harnessEnabled(): boolean {
  return !app.isPackaged && Boolean(process.env.STUDIO_CAPTURE_PLAN) && isolatedHarnessProfile(
    process.env.STUDIO_USER_DATA,
    app.getPath('userData'),
    ['F:\\storybot', 'F:\\Kisara', join(app.getPath('appData'), 'Kisara'), join(app.getPath('appData'), 'Bang Story'), join(app.getPath('appData'), 'Studio Cerita')]
  )
}

export function prepareHarness(): void {
  if (!harnessEnabled()) return
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-background-timer-throttling')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
}

/**
 * Development-only test harness. Set STUDIO_CAPTURE_PLAN to a JSON file of steps
 * ([{ "js": "...", "wait": 800, "shot": "C:/tmp/home.png" }, ...], optionally with "quit": true
 * on the last step) to drive the UI and capture screenshots. STUDIO_LOG collects renderer console output.
 * Never active in a packaged build.
 */
export function attachDevHarness(win: BrowserWindow): void {
  if (!harnessEnabled()) return
  const log = process.env.STUDIO_LOG
  if (log) {
    win.webContents.on('console-message', (e) => {
      appendFileSync(log, `[${e.level}] ${e.message}\n`)
    })
    win.webContents.on('render-process-gone', (_e, d) => appendFileSync(log, `[gone] ${d.reason}\n`))
  }
  const planPath = process.env.STUDIO_CAPTURE_PLAN
  if (!planPath) return
  let plan: {
    main?: 'visualReviewChecks' | 'shotChecks' | 'mockBrainstorm' | 'mockFlowReadiness' | 'mockFlowTenBatch' | 'mockPublication' | 'publicationChecks' | 'mockFlowCanvasBatch' | 'recoverFlowVideo' | 'videoToolbar' | 'mockStyleUpload' | 'channelCharacter' | 'speakerLabels' | 'mockFlowBatch' | 'mockFlowProfiles' | 'mockNarrationAudit' | 'seed' | 'export' | 'key' | 'overlays' | 'speech' | 'videos' | 'sounds' | 'mockSounds' | 'quality' | 'dialogue' | 'mockImagePicker' | 'flow' | 'mockFlowSave' | 'mockPodcast' | 'mockScript' | 'mockVisuals' | 'mockWriter' | 'mockF5' | 'mockF5Local' | 'mockProductionTools' | 'mediaImportChecks' | 'mockComprehension'
    size?: [number, number]
    exportTo?: string
    /** For main "export": an existing project instead of the seeded demo. */
    projectId?: string
    /** For main "key": store a fake key for this provider and mark its last check as passed or failed. */
    provider?: ApiProvider
    ok?: boolean
    namedExports?: boolean
    captureCopy?: boolean
    js?: string
    /** Real mouse input: press on the element (or its edge handle), move by dx pixels, release. */
    drag?: { selector: string; at?: 'left' | 'right' | 'center'; dx: number; dy?: number; fy?: number }
    /** Real mouse click on an element, or at a point inside it (fraction of its width). */
    click?: { selector: string; fx?: number; pointJs?: string }
    /** A real key press, e.g. "s" or "Delete". */
    key?: string
    wait?: number
    shot?: string
    quit?: boolean
  }[]
  try {
    plan = JSON.parse(readFileSync(planPath, 'utf8').replace(/^﻿/, ''))
  } catch (e) {
    console.error('[harness] plan tidak valid:', (e as Error).message)
    return
  }
  let demoId: string | null = null
  win.webContents.once('did-finish-load', async () => {
    const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    await sleep(2000)
    for (const step of plan) {
      try {
        if (step.size) { win.unmaximize(); win.setSize(...step.size) }
        if (step.main === 'seed') demoId = seedDemo()
        if (step.main === 'visualReviewChecks' && demoId) {
          const b = getBundle(demoId)
          saveSnapshot({ ...b, clips: b.clips.map((clip, index) => ({ ...clip, visualPrompt: '', videoPrompt: '', visualSource: null, narration: index === 1 ? b.clips[0].narration : clip.narration })) })
          const bundle = getBundle(demoId)
          const issue = { scene: 2, kind: 'script' as const, quote: 'The same explanatory action', reason: 'Narasi adegan 2 mengulang adegan 1 tanpa perkembangan. Perbaiki naskah sebelum mengganti gambarnya.' }
          writeVisualDraft(demoId, { fingerprint: visualDraftFingerprint('missing', bundle.project, bundle.characters, bundle.clips), groupSize: 6, plan: { world: 'Indonesia', characters: [], scenes: bundle.clips.map((_, i) => ({ scene: i+1, setting: 'Indonesia', action: 'The same explanatory action', characters: [], wardrobe: [] })) }, reviewIssues: [issue] })
          const status = visualStatus(demoId)
          assert.equal(status?.status, 'failed'); assert.equal(status.completed, 4); assert.equal(status.total, 4); assert.deepEqual(status.visualIssues, [issue])
          saveSnapshot({ ...bundle, project: { ...bundle.project, title: 'Uji review storyboard', step: 2 } })
          console.log('NATIVE VISUAL REVIEW RECOVERY PASS: real checkpoint, source fingerprint and numbered script reason. No model or generation calls.')
          if (step.ok === true) {
            setSettings({ llmProvider: 'custom', customBaseUrl: 'http://writer.invalid/v1', llmModels: { ...getSettings().llmModels, custom: 'refine-findings-fixture' } })
            setSecret('custom', 'synthetic-refine-key'); recordCheck('custom', true, 'Fixture lokal')
            globalThis.fetch = async (input, init) => {
              const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
              if (url.hostname !== 'writer.invalid') throw new Error('Network disabled in refine fixture')
              if (url.pathname.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'refine-findings-fixture' }] }))
              const body = JSON.parse(String(init?.body)), system = String(body.messages[0].content), prompt = String(body.messages[1].content)
              let result: unknown
              if (system.includes('You are a critical editor') || system.includes('You are a claim auditor')) result = { issues: [] }
              else {
                assert(system.includes('Several adjacent short shots'))
                assert(prompt.includes('Current storyboard findings:') && prompt.includes(issue.reason))
                assert(prompt.includes('The configured duration is only a ceiling'))
                const source = getBundle(demoId!).clips
                result = { scenes: [0, 2, 3].map(i => ({ sourceScene: i+1, title: source[i].title, story: source[i].story, narration: source[i].narration, dialogue: [] })) }
                console.log('NATIVE REFINE FINDINGS REQUEST PASS: exact review reason, actual word budget and source IDs')
              }
              return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }))
            }
          }

        }
        if (step.main === 'shotChecks' && demoId) {
          const original = getBundle(demoId)
          const narration = 'Kenzo menyiram tanaman di depan rumahnya. Tetangganya melirik sambil berjalan menuju tempat kerja. Kenzo kemudian membuka ponsel untuk memeriksa pembayaran dividen bulan ini.'
          const clean = { ...original.clips.at(-1)!, id: randomUUID(), title: 'Pagi Kenzo', story: 'Ilustrasi Kenzo menyiram tanaman, dilihat tetangga, lalu membuka ponsel.', narration, durationMs: 15000, imageAssetId: null, audioAssetId: null, videoAssetId: null, visualPrompt: '', visualSource: null, videoPrompt: '', motionType: 'camera' as const, voiceInMs: 0, voiceOutMs: null, voiceStartMs: 0, mediaInMs: 0 }
          insertClipAfter(original.clips.at(-1)!.id, clean)
          const job = insertJob({ projectId: demoId, kind: 'image', clipId: clean.id, provider: 'demo' })
          assert.equal(divideUnproducedShots(demoId), 0, 'An in-flight media queue must prevent subdivision')
          updateJob(job.id, { status: 'canceled' })
          const added = divideUnproducedShots(demoId)
          assert(added >= 2)
          const result = getBundle(demoId)
          assert.deepEqual(result.clips.slice(0, original.clips.length), original.clips, 'Produced clips and their asset links must survive')
          const shots = result.clips.slice(original.clips.length)
          assert.equal(shots.map(c => c.narration).join(''), narration)
          assert.equal(shots.reduce((n, c) => n + c.durationMs, 0), 15000)
          assert(shots.every(c => c.durationMs <= 7000 && c.story.includes(c.narration.trim()) && !c.imageAssetId && !c.audioAssetId))
          assert.equal(divideUnproducedShots(demoId), 0, 'Retry must not keep adding shots')
          saveSnapshot({ ...result, project: { ...result.project, title: 'Uji pembagian shot visual', step: 2, editor: { ...result.project.editor, flowMode: 'image' } } })
          console.log('NATIVE VISUAL SHOTS PASS: real SQLite, asset preservation, queue guard, lossless narration, total duration, shot focus and retry stability. ' + shots.length + ' shots / 15 seconds.')
        }
        if (step.main === 'mockFlowBatch' && demoId) {
          for (const clip of getBundle(demoId).clips.slice(1)) patchClip(clip.id, {imageAssetId:null})
        }
        if(step.main==='mockFlowReadiness'){
          setSettings({imageProvider:'flow2api',flowImageTransport:'browser',flowBrowserAccountId:0});setSecret('flow2api','synthetic-readiness-key');recordCheck('flow2api',true,'Server fixture tersambung')
          for(const channel of ['settings:flowSetup','settings:flowStatus','settings:flowProfiles','settings:inspectFlowBrowser'])ipcMain.removeHandler(channel)
          const accounts=[1,2,3,4].map(id=>({id,email:['judi','acek','dwiki','affiliate'][id-1]+'@example.test',routeKey:'acct-'+id,workerConnected:true,active:true,imageEnabled:true,quotaExhausted:step.ok===false&&id===1}))
          ipcMain.handle('settings:flowSetup',()=>({accounts,workers:accounts.map(a=>({routeKey:a.routeKey,label:a.email})),extensionMode:true,generationPause:step.ok===false?{code:'uncertain_result',pausedAt:Date.now()}:undefined}))
          ipcMain.handle('settings:flowStatus',()=>({ok:true,message:'Server tersambung; kesiapan proyek diperiksa terpisah.',models:[],activeAccounts:4,failover:true}))
          ipcMain.handle('settings:flowProfiles',()=>[])
          ipcMain.handle('settings:inspectFlowBrowser',(_e,id:number)=>{
            assert(accounts.some(a=>a.id===id))
            if(id===1)throw new Error('Worker tersambung, tetapi satu proyek Flow belum dapat dibaca. Sisakan tepat satu tab proyek pada profil akun ini.')
            return {host:'flow.google.com',projectOpen:true,blocked:false,composer:{editors:1,draftLength:id===4?100:0,submitCount:1,submitDisabled:true,busy:id===3,online:true},fields:[],buttons:[],options:[]}
          })
        }
        if (step.main === 'mockFlowProfiles') {
          setSettings({imageProvider:'flow2api'});setSecret('flow2api','synthetic-profile-key');recordCheck('flow2api',true,'Fixture lokal')
          const profiles: {id:string;email:string;routeKey:string;status:string;message:string}[]=[]
          for (const channel of ['settings:flowSetup','settings:flowStatus','settings:flowProfiles','settings:openFlowProfile']) ipcMain.removeHandler(channel)
          ipcMain.handle('settings:flowSetup',()=>({accounts:[],workers:[],extensionMode:true}))
          ipcMain.handle('settings:flowStatus',()=>({ok:true,message:'Fixture lokal',models:['gemini-3.1-flash-image-landscape'],activeAccounts:0,failover:true}))
          ipcMain.handle('settings:flowProfiles',()=>profiles)
          ipcMain.handle('settings:openFlowProfile',(_e,email:string)=>{assert.equal(email,'person@example.test');const p={id:'test',email,routeKey:'kisara-test',status:'login',message:'Browser siap. Login Google dengan email person@example.test. Kunci koneksi sudah diisi otomatis.'};profiles.push(p);return p})
        }
        if (step.main === 'mockNarrationAudit' && demoId) {
          const clips = getBundle(demoId).clips
          for (const clip of clips) patchClip(clip.id, {audioAssetId:null,imageAssetId:null})
          const voice = insertJob({projectId:demoId,kind:'narration',provider:'gemini'})
          updateJob(voice.id,{status:'running',progress:0.2,message:'Menyelaraskan rekaman bagian 1/4 dengan Whisper; suara dipasang setelah dipotong per adegan'})
          const image = insertJob({projectId:demoId,clipId:clips[0].id,kind:'image',provider:'flow2api'})
          updateJob(image.id,{status:'failed',error:'Worker Flow belum tersambung. Periksa pasangan akun dan profil Chrome.'})
        }
        if (step.main === 'mockComprehension') {
          setSettings({ llmProvider: 'custom', customBaseUrl: 'http://writer.invalid/v1', llmModels: { ...getSettings().llmModels, custom: 'comprehension-fixture' } })
          setSecret('custom','comprehension-test-key'); recordCheck('custom',true,'Fixture lokal')
          globalThis.fetch = async (input, init) => {
            const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
            if (url.hostname !== 'writer.invalid') throw new Error('Network is disabled in this harness fixture')
            const body = JSON.parse(String(init?.body)), system = body.messages[0].content as string, prompt = body.messages[1].content as string
            let result: object
            if ((system.includes('You are a critical editor') || system.includes('You are a claim auditor'))) {
              await sleep(300)
              const draft = JSON.parse(prompt.split('Read the complete spoken draft:\n')[1]) as {scene:number;narration:string}[]
              const issue = step.ok === false || draft[0].narration.includes('langsung')
              result = { issues: issue ? [{scene:1,quote:draft[0].narration,reason:'Jelaskan bahwa hubungan ini bersyarat, bukan akibat otomatis.'}] : [] }
            } else if (system.includes('Repair only the requested numbered passages')) {
              const draft = JSON.parse(prompt.split('Current complete draft:\n')[1].split('\n\nReturn ONLY')[0]) as {scene:number;title:string;story:string;narration:string;dialogue:unknown[]}[]
              const ids = prompt.split('Return ONLY scene numbers: ')[1].split(', ').map(Number)
              result = { scenes: draft.filter(s=>ids.includes(s.scene)).map(s=>({...s,narration:s.scene===1?'Saham turun tidak otomatis membuat makanan naik. Salah satu jalurnya melalui nilai tukar rupiah.':s.narration})) }
            } else {
              result = { title:'Memahami Harga Makan', scenes: [
                'Modal asing langsung kabur dan membuat makanan naik.',
                'Jika rupiah melemah, bahan impor bisa membutuhkan lebih banyak rupiah untuk dibeli.',
                'Biaya bahan dapat memengaruhi harga jual, tetapi bukan satu-satunya faktor.',
                'Jadi, periksa kurs dan biaya bahan sebelum menyimpulkan penyebab kenaikan harga.'
              ].map((n,i)=>({sourceScene:i+1,title:'Penjelasan '+(i+1),story:'Ilustrasi bahan dan transaksi yang dibahas.',narration:n,dialogue:[]})) }
            }
            return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200})
          }
        }
        if (step.main === 'mockProductionTools' && demoId) {
          setSettings({ llmProvider: 'custom', customBaseUrl: 'http://writer.invalid/v1', llmModels: { ...getSettings().llmModels, custom: 'production-fixture' } })
          setSecret('custom','production-test-key'); recordCheck('custom',true,'Fixture lokal')
          globalThis.fetch = async (input, init) => {
            const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
            if (url.hostname !== 'writer.invalid') throw new Error('Network is disabled in this harness fixture')
            if (step.ok === false) return new Response('Unavailable', { status: 503 })
            if (url.pathname.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id:'production-fixture' }] }), {status:200})
            const body = JSON.parse(String(init?.body)), material = JSON.parse(body.messages[1].content)
            const scene = material.scenes[0]
            const content = JSON.stringify({ findings: [{ clipId: scene.clipId, quote: scene.narration.slice(0,40), title:'Perjelas kalimat pembuka', detail:'Pastikan pembuka terhubung dengan penjelasan pada adegan berikutnya.', kind:'clarity' }] })
            return new Response(JSON.stringify({ choices:[{message:{content}}] }), {status:200})
          }
          const bundle = getBundle(demoId), fixtureDir = join(app.getPath('userData'),'flow-fixtures'); mkdirSync(fixtureDir,{recursive:true})
          const source = assetAbsPath(demoId,bundle.assets.find(a=>a.id===bundle.clips[0].imageAssetId)!.localPath)
          const files = ['001 - Utama.png','001 - Cadangan.png','tanpa-nomor.png'].map(name=>{const path=join(fixtureDir,name);writeFileSync(path,readFileSync(source));return path})
          const video = join(fixtureDir,'002 - Gerak.mp4')
          runFixtureTool(binPath(ffmpegStatic!),['-y','-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=24','-t','3','-c:v','libx264','-pix_fmt','yuv420p',video],{windowsHide:true,timeout:30000})
          dialog.showOpenDialog = async () => ({ canceled:false,filePaths:[...files,video] })
        }
        if (step.main === 'mediaImportChecks' && demoId) {
          const before = getBundle(demoId), dir = join(app.getPath('userData'),'media-rollback-fixtures');mkdirSync(dir,{recursive:true})
          const source = assetAbsPath(demoId,before.assets.find(a=>a.id===before.clips[0].imageAssetId)!.localPath)
          const good = join(dir,'001 - Valid.png'), bad = join(dir,'002 - Broken.png');writeFileSync(good,readFileSync(source));writeFileSync(bad,'not an image')
          const plan = await prepareMediaImport(demoId,[good,bad])
          await assert.rejects(applyMediaImport(demoId,plan.token,plan.rows.map((r,i)=>({fileId:r.id,clipId:before.clips[i].id})),true))
          let latest=getBundle(demoId);assert.equal(latest.assets.length,before.assets.length);assert.deepEqual(latest.clips,before.clips)
          const duplicate = await prepareMediaImport(demoId,[good,bad])
          await assert.rejects(applyMediaImport(demoId,duplicate.token,duplicate.rows.map(r=>({fileId:r.id,clipId:before.clips[0].id})),true),/dua/)
          discardMediaImport(duplicate.token)
          const stale=await prepareMediaImport(demoId,[good]);patchClipText(before.clips[0].id,{title:'changed during review'})
          await assert.rejects(applyMediaImport(demoId,stale.token,[{fileId:stale.rows[0].id,clipId:before.clips[0].id}],true),/berubah/)
          patchClipText(before.clips[0].id,{title:before.clips[0].title});discardMediaImport(stale.token)
          const canceled=await prepareMediaImport(demoId,[good]);const pending=applyMediaImport(demoId,canceled.token,[{fileId:canceled.rows[0].id,clipId:before.clips[0].id}],true);discardMediaImport(canceled.token);await assert.rejects(pending,/dibatalkan/);discardMediaImport(canceled.token)
          const expired=await prepareMediaImport(demoId,[good]);discardMediaImport(expired.token)
          await assert.rejects(applyMediaImport(demoId,expired.token,[{fileId:expired.rows[0].id,clipId:before.clips[0].id}],true),/kedaluwarsa/)
          const foreign=await prepareMediaImport(demoId,[good]);await assert.rejects(applyMediaImport(demoId,foreign.token,[{fileId:foreign.rows[0].id,clipId:'not-in-project'}],true),/tidak cocok/)
          discardMediaImport(foreign.token);discardMediaImport(plan.token)
          latest=getBundle(demoId);assert.deepEqual(latest.clips,before.clips);assert.equal(latest.assets.length,before.assets.length)
          console.log('MEDIA IMPORT GUARDS PASS: corrupt batch atomic, duplicates, stale mapping, discarded ticket, foreign clip, old assets and timings preserved.')
        }
        if (step.main === 'mockF5Local') {
          setSettings({ defaultTtsProvider: 'f5-local', f5LocalUrl: 'http://127.0.0.1:17861', whisperAuto: false })
          const original = globalThis.fetch.bind(globalThis), generated = new Map<string, string>()
          globalThis.fetch = async (input, init) => {
            const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
            if (url.origin !== 'http://127.0.0.1:17861') return original(input, init)
            init?.signal?.throwIfAborted()
            const json = (value: unknown) => new Response(JSON.stringify(value))
            if (url.pathname === '/api/state') return json({ status: 'ready', max_chars: 1200, nfe: 6, voices: ['aku', 'acek'].map((name) => ({ id: name, name, transcript: 'Ini sampel suara uji.', duration: 5, created: 'fixture' })) })
            if (url.pathname === '/api/generate') {
              const body = JSON.parse(String(init?.body)) as { text: string; voice_id: string; speed: number; format: string }
              assert.ok(['aku', 'acek'].includes(body.voice_id)); assert.equal(body.format, 'wav'); assert.equal(body.speed, 0.9)
              const id = `local${generated.size}`, file = join(app.getPath('userData'), `f5-${id}.wav`)
              const text = Buffer.from(body.text).toString('base64')
              const ps = `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${file.replace(/'/g, "''")}'); $s.Speak([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${text}'))); $s.Dispose()`
              runFixtureTool('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 45000, stdio: ['ignore', 'ignore', 'pipe'] })
              generated.set(id, file)
              return json({ job_id: id })
            }
            if (url.pathname.startsWith('/api/job/')) return json({ status: 'done', progress: 1, result: { file: url.pathname.split('/').at(-1)! + '.wav' } })
            if (url.pathname.startsWith('/files/out/')) {
              const file = generated.get(url.pathname.split('/').at(-1)!.replace(/\.wav$/, ''))
              assert.ok(file)
              return new Response(new Uint8Array(readFileSync(file)))
            }
            throw new Error('Unexpected mock local F5 route')
          }
        }
        if (step.main === 'mockF5') {
          setSettings({ defaultTtsProvider: 'f5-hf', f5Space: 'fixture/f5', f5Endpoint: 'infer', f5RefText: 'This is a sample voice recording.', whisperAuto: false })
          const reference = join(app.getPath('userData'), 'f5-reference-fixture.ogg')
          runFixtureTool(binPath(ffmpegStatic!), ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=4', '-c:a', 'libopus', '-y', reference], { windowsHide: true })
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [reference] })
          const original = globalThis.fetch.bind(globalThis)
          const generated = new Map<string, string>()
          globalThis.fetch = async (input, init) => {
            const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
            if (url.host !== 'fixture-f5.hf.space') return original(input, init)
            init?.signal?.throwIfAborted()
            const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
            if (url.pathname.endsWith('/info')) return json({ named_endpoints: { '/infer': { parameters: ['ref_audio_orig', 'ref_text', 'gen_text', 'speed'].map((parameter_name) => ({ parameter_name })) } } })
            if (url.pathname.endsWith('/upload')) return json(['/tmp/reference.wav'])
            if (url.pathname === '/gradio_api/call/infer') {
              if (step.ok === false) return json({ event_id: 'failed-fixture' })
              const body = JSON.parse(String(init?.body)) as { data: unknown[] }
              assert.equal(typeof body.data[2], 'string')
              const id = `take${generated.size}`
              const file = join(app.getPath('userData'), `f5-${id}.wav`)
              const text = Buffer.from(String(body.data[2]), 'utf8').toString('base64')
              const ps = `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${file.replace(/'/g, "''")}'); $s.Speak([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${text}'))); $s.Dispose()`
              runFixtureTool('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 45000, stdio: ['ignore', 'ignore', 'pipe'] })
              generated.set(id, file)
              return json({ event_id: id })
            }
            const id = url.pathname.split('/').at(-1)!
            if (url.pathname.startsWith('/gradio_api/call/infer/')) {
              if (step.ok === false) return new Response('event: error\ndata: "quota exceeded"\n\n')
              return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(`event: complete\ndata: ${JSON.stringify([{ url: `https://fixture-f5.hf.space/gradio_api/file=${id}` }])}\n\n`)) } }))
            }
            if (url.pathname.startsWith('/gradio_api/file=')) {
              const file = generated.get(url.pathname.split('=').at(-1)!)
              assert.ok(file)
              return new Response(new Uint8Array(readFileSync(file)), { headers: { 'Content-Type': 'audio/wav' } })
            }
            throw new Error('Unexpected mock F5 route')
          }
        }
        if (step.main === 'mockBrainstorm') {
          const ideas = JSON.parse(readFileSync(join(dirname(planPath), 'brainstorm-fixture.json'), 'utf8'))
          if (step.ok != null) {
            setSettings({ llmProvider: 'custom', customBaseUrl: 'http://writer.invalid/v1', llmModels: { ...getSettings().llmModels, custom: 'brainstorm-language-fixture' } })
            setSecret('custom', 'synthetic-brainstorm-language-key')
            recordCheck('custom', true, 'Fixture lokal')
            let requests = 0
            globalThis.fetch = async (input, init) => {
              const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
              if (url.hostname !== 'writer.invalid') throw new Error('Network disabled in brainstorm fixture')
              if (url.pathname.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'brainstorm-language-fixture' }] }))
              const body = JSON.parse(String(init?.body))
              const system = String(body.messages[0].content)
              assert(system.includes('Seluruh isi ide wajib berbahasa Indonesia'))
              if (step.ok === false) {
                requests++
                console.log('NATIVE BRAINSTORM JSON ATTEMPT ' + requests)
                if (requests === 1) return new Response(JSON.stringify({ choices: [{ message: { content: 'Berikut beberapa ide dalam bentuk prosa, bukan JSON.' }, finish_reason: 'stop' }] }))
                if (requests === 2) {
                  assert.equal(body.response_format.type, 'json_object')
                  return new Response(JSON.stringify({ error: { message: 'response_format is unsupported' } }), { status: 400 })
                }
                assert.equal(requests, 3)
                assert(!body.response_format && system.includes('Regenerate the COMPLETE answer'))
                console.log('NATIVE BRAINSTORM JSON RECOVERY PASS')
                return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ideas }) }, finish_reason: 'stop' }] }))
              }
              const repair = system.includes('You correct the language of existing editorial candidates')
              assert.equal(++requests, repair ? 2 : 1, 'One initial request and one language correction')
              const output = repair ? ideas : ideas.map((idea: Record<string, unknown>, i: number) => ({ ...idea, title: `Your Paycheck Is Smaller Than You Think ${i}`, hook: 'You get paid, but why are you already running out of money?' }))
              console.log('NATIVE BRAINSTORM LANGUAGE ' + (repair ? 'REPAIR' : 'ENGLISH FIXTURE') + ' PASS')
              return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ideas: output }) } }] }), { headers: { 'Content-Type': 'application/json' } })
            }
          } else {
          ipcMain.removeHandler('story:brainstorm')
          ipcMain.handle('story:brainstorm', (_event, category: string, language: string, _direction: string, _previous: string[], format: string) => {
            assert.equal(category, 'finance'); assert.equal(language, 'id'); assert.equal(format, 'long')
            return ideas
          })
          }
        }
        if (step.main === 'mockWriter') {
          setSettings({ llmProvider: 'custom', customBaseUrl: 'http://writer.invalid/v1', llmModels: { ...getSettings().llmModels, custom: 'beam-free' } })
          setSecret('custom', 'mock-writer-key')
          recordCheck('custom', true, 'Terhubung · 2 model tersedia · kemampuan menulis belum diuji')
          ipcMain.removeHandler('models:list')
          ipcMain.handle('models:list', () => ({ models: [{ id: 'beam-free', name: 'beam-free', tags: [] }, { id: 'big-pickle', name: 'big-pickle', tags: [] }], fetchedAt: Date.now() }))
          let attempts = 0
          ipcMain.removeHandler('settings:testWriter')
          ipcMain.handle('settings:testWriter', async () => {
            attempts++
            await sleep(1100)
            return attempts === 1 ? { ok: false, message: 'Tes menulis beam-free gagal. Server endpoint custom sedang bermasalah (502).' } : { ok: true, message: 'Model beam-free berhasil menulis narasi JSON pendek. Ini belum menjamin permintaan naskah panjang berhasil.' }
          })
        }
        if (step.main === 'mockScript') {
          let state: ScriptProgress | null = null
          let controller: AbortController | null = null
          let attempts = 0
          for (const channel of ['story:script', 'story:scriptStatus', 'story:cancelScript']) ipcMain.removeHandler(channel)
          ipcMain.handle('story:scriptStatus', () => state)
          ipcMain.handle('story:cancelScript', () => { controller?.abort() })
          ipcMain.handle('story:script', async (_e, projectId: string) => {
            const ctrl = new AbortController()
            controller = ctrl
            attempts++
            const update = (patch: Partial<ScriptProgress>) => {
              state = { projectId, status: 'running', completed: 0, total: 86, message: 'Menyusun kerangka cerita…', ...state, ...patch }
              emit.scriptProgress(state)
            }
            const delay = (ms: number) => new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, ms)
              ctrl.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Penyusunan dibatalkan.')) }, { once: true })
            })
            try {
              update({ status: 'running', completed: 0, message: 'Menyusun kerangka cerita…' })
              await delay(700)
              update({ completed: 8, message: 'Menulis adegan 9–16 dari 86 lewat AI penulis.' })
              await delay(1500)
              if (step.ok === false && attempts === 1) throw new Error('Model uji belum melengkapi adegan. Pesan ini harus tetap terlihat.')
              replaceScript(projectId, 'Naskah panjang siap', Array.from({ length: 86 }, (_, i) => ({ title: `Adegan ${i + 1}`, story: 'Raka menelusuri sebuah rumah.', narration: 'Raka mengikuti ketukan menuju sebuah pintu yang belum pernah ia lihat.', durationMs: 7000 })))
              update({ status: 'done', completed: 86, message: '86 adegan tersimpan.' })
              return getBundle(projectId)
            } catch (error) {
              update({ status: ctrl.signal.aborted ? 'canceled' : 'failed', message: (error as Error).message })
              throw error
            }
          })
        }
        if (step.main === 'mockVisuals') {
          let state: ScriptProgress | null = null
          let controller: AbortController | null = null
          let attempts = 0
          for (const channel of ['story:visuals', 'story:visualStatus', 'story:cancelVisuals']) ipcMain.removeHandler(channel)
          ipcMain.handle('story:visualStatus', () => state)
          ipcMain.handle('story:cancelVisuals', () => { controller?.abort() })
          ipcMain.handle('story:visuals', async (_e, projectId: string) => {
            const ctrl = new AbortController()
            controller = ctrl
            attempts++
            const update = (patch: Partial<ScriptProgress>) => {
              state = { projectId, status: 'running', completed: 0, total: 86, message: 'Menghubungi AI penulis untuk prompt visual…', ...state, ...patch }
              emit.visualProgress(state)
            }
            const delay = (ms: number) => new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, ms)
              ctrl.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Penyusunan dibatalkan.')) }, { once: true })
            })
            try {
              update({ status: 'running', completed: 0, message: 'Menghubungi AI penulis untuk prompt visual…' })
              await delay(700)
              update({ completed: 8, message: 'Menyusun prompt adegan 7–12 dari 86 lewat AI penulis.' })
              await delay(1500)
              if (step.ok === false && attempts === 1) throw new Error('Model uji belum melengkapi prompt. Pesan ini harus tetap terlihat.')
              const b = getBundle(projectId)
              applyVisuals(projectId, [], b.clips.map((clip) => ({ clipId: clip.id, characterNames: [], visualPrompt: 'World: Indonesia, present day.\nSetting: a hallway.\nAction: a door swings open.\nFraming: medium shot.\nAvoid: text.', cameraPreset: clip.cameraPreset, motionStrength: clip.motionStrength, transition: clip.transition, videoPrompt: clip.videoPrompt })))
              update({ status: 'done', completed: 86, message: '86 adegan tersimpan.' })
              return getBundle(projectId)
            } catch (error) {
              update({ status: ctrl.signal.aborted ? 'canceled' : 'failed', message: (error as Error).message })
              throw error
            }
          })
        }
        if (step.main === 'mockPodcast') {
          ipcMain.removeHandler('story:fromVideo')
          ipcMain.handle('story:fromVideo', (_event, _url, _language, options?: import('@shared/types').SourceOptions) => options?.mode === 'factual' ? {
              title: 'Memahami Inflasi dengan Bahasa Sederhana', idea: 'Mengapa nilai belanja uang bisa berubah?', synopsis: 'Inflasi menggambarkan kenaikan harga secara umum. Pembahasan menjelaskan perbedaan harga satu barang dan tingkat harga umum. Contoh keranjang belanja digunakan sebagai ilustrasi. Data perlu diperiksa sesuai periode dan wilayahnya. Kesimpulan mengingatkan bahwa pengalaman tiap rumah tangga bisa berbeda.', fictional: false, sourceOptions: options, sourceNotes: ['Sumber membedakan kenaikan satu harga dari kenaikan harga secara umum.'], reviewNotes: ['Periksa periode dan sumber data sebelum menyebut angka.'], renamedCharacters: [],
              pacing: { synopsis: 'Inflasi menggambarkan kenaikan harga secara umum. Pembahasan menjelaskan perbedaan harga satu barang dan tingkat harga umum. Contoh keranjang belanja digunakan sebagai ilustrasi. Data perlu diperiksa sesuai periode dan wilayahnya. Kesimpulan mengingatkan bahwa pengalaman tiap rumah tangga bisa berbeda.', idea: 'Mengapa nilai belanja uang bisa berubah?', partial: false, reason: 'Definisi dan batasan perlu dijelaskan sebelum kesimpulan.', beats: ['Pertanyaan nilai belanja.', 'Definisi inflasi.', 'Harga satu barang dan harga umum.', 'Ilustrasi keranjang belanja.', 'Batasan data dan kesimpulan.'].map(event => ({ event, seconds: 62 })) }, videoTitle: 'Materi finance uji', uploader: 'Dev harness', durationSec: 3600, transcriptChars: 1500, chunks: 1, transcriptSource: 'text', partial: false
            } : ({ title: 'Ketukan di Rumah Senja', idea: 'Seorang penjaga menemukan pesan keluarganya di rumah kosong.', synopsis: 'Raka menjaga sebuah rumah di kota Arunika. Setiap malam ia mendengar ketukan dari kamar terkunci. Ia mengikuti petunjuk dalam foto lama dan menemukan bahwa adiknya meninggalkan pesan sebelum pindah. Ketukan ternyata berasal dari jendela rusak yang menunjukkan tempat pesan itu disimpan. Raka akhirnya bisa menghubungi kembali keluarganya.', pacing: { synopsis: 'Raka menjaga sebuah rumah di kota Arunika. Setiap malam ia mendengar ketukan dari kamar terkunci. Ia mengikuti petunjuk dalam foto lama dan menemukan bahwa adiknya meninggalkan pesan sebelum pindah. Ketukan ternyata berasal dari jendela rusak yang menunjukkan tempat pesan itu disimpan. Raka akhirnya bisa menghubungi kembali keluarganya.', idea: 'Seorang penjaga menemukan pesan keluarganya di rumah kosong.', partial: false, reason: 'Petunjuk foto dan reaksi Raka perlu dibangun sebelum sumber ketukan terungkap.', beats: ['Raka mulai menjaga rumah.', 'Ketukan membuatnya memeriksa kamar.', 'Foto mengarahkan pencarian ke jendela.', 'Jendela rusak menunjukkan letak pesan.', 'Pesan membuat Raka menghubungi keluarga.'].map(event => ({ event, seconds: 62 })) }, renamedCharacters: [{ original: 'Ari', replacement: 'Raka' }], videoTitle: 'Podcast uji', uploader: 'Dev harness', durationSec: 600, transcriptChars: 1200, chunks: 1, transcriptSource: 'text', partial: false }))
        }
        if (step.main === 'mockPodcast' && step.ok === false) {
          ipcMain.removeHandler('story:fromVideo')
          ipcMain.handle('story:fromVideo', async () => {
            await sleep(1200)
            throw new Error('Caption YouTube gagal diambil: HTTP Error 429. Tempel transkrip atau coba lagi nanti.')
          })
        }
        if (step.main === 'mockFlowSave') {
          if (step.captureCopy) {
            let copyIndex = 0
            ipcMain.removeHandler('app:copyText')
            ipcMain.handle('app:copyText', (_event, text: string) => {
              writeFileSync(join(app.getPath('userData'), 'copied-text.txt'), text, 'utf8')
              writeFileSync(join(app.getPath('userData'), `copy-${++copyIndex}.txt`), text, 'utf8')
            })
          }
          dialog.showSaveDialog = async (windowOrOptions: Electron.BaseWindow | Electron.SaveDialogOptions, maybeOptions?: Electron.SaveDialogOptions) => {
            const options = maybeOptions ?? windowOrOptions as Electron.SaveDialogOptions
            return { canceled: false, filePath: join(app.getPath('userData'), step.namedExports ? (options.defaultPath ?? 'flow-export.txt').split(/[\\/]/).at(-1)! : `flow-export${extname(options.defaultPath ?? '.txt')}`) }
          }
        }
        if (step.main === 'flow' && demoId) {
          const b = getBundle(demoId)
          saveSnapshot({ ...b, project: { ...b.project, synopsis: 'Raka menjaga rumah kosong dan mengikuti petunjuk menuju pesan keluarganya.' }, characters: b.characters.map((c, i) => i === 0 ? { ...c, name: 'Raka', description: 'Indonesian man, 28 years old, short black hair. Default outfit: navy shirt, dark trousers.' } : c) })
          b.clips.forEach((clip, i) => {
            patchClip(clip.id, { durationMs: [5000, 4000, 6000][i] ?? 5000, audioAssetId: null })
            patchClipText(clip.id, { title: ['Ketukan malam', 'Pintu terkunci', 'Pesan keluarga'][i] ?? 'Petunjuk', story: 'Raka mengikuti ketukan di sebuah rumah kosong.', narration: i === 0 ? 'Raka berbisik, “Siapa di luar?”' : 'Ia mengikuti ketukan menuju pintu.' })
          })
          const fresh = getBundle(demoId)
          applyVisuals(demoId, [], fresh.clips.map((clip) => ({ clipId: clip.id, characterNames: [fresh.characters[0].name], visualPrompt: `World: Indonesia, present day.\nSetting: Indonesian house, warm hallway light.\nAction: ${fresh.characters[0].name} holds a door handle.\nWardrobe: ${fresh.characters[0].name} - default outfit.\nFraming: medium shot, eye level.\nAvoid: text, speech bubbles.`, cameraPreset: clip.cameraPreset, motionStrength: clip.motionStrength, transition: clip.transition, videoPrompt: clip.videoPrompt })))
          const planned = getBundle(demoId)
          saveSnapshot({ ...planned, project: { ...planned.project, title: 'Ketukan di Rumah Senja', step: 2, editor: { ...planned.project.editor, storyBrief: { idea: 'Penjaga rumah menemukan pesan keluarganya.', fictional: true } } } })
        }
        if (step.main === 'mockImagePicker' && demoId) {
          const b = getBundle(demoId)
          const image = b.assets.find((a) => a.id === b.clips[0].imageAssetId)!
          const file = join(app.getPath('userData'), 'import-fixture.webp')
          runFixtureTool(binPath(ffmpegStatic!), ['-y', '-v', 'error', '-i', assetAbsPath(demoId, image.localPath), '-frames:v', '1', file], { windowsHide: true })
          // The actual IPC importer and preload bridge run; only the OS file dialog is substituted.
          dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
        }
        if (step.main === 'quality' && demoId) {
          const b = getBundle(demoId)
          const c = b.clips[0]
          const reference = b.characters[0]
          applyVisuals(demoId, [{ name: `Ustaz ${reference.name}`, description: reference.description }], [{ clipId: c.id, characterNames: [`Ustaz ${reference.name}`], visualPrompt: `Setting: Indonesian hall.\nAction: Ustaz ${reference.name} opens a wooden door.\nWardrobe: Ustaz ${reference.name} - default outfit.`, cameraPreset: c.cameraPreset, motionStrength: c.motionStrength, videoPrompt: c.videoPrompt, transition: c.transition }])
          assert.equal(getBundle(demoId).characters.length, b.characters.length)
          const linked = getBundle(demoId)
          assert.ok(linked.clips[0].characterIds.includes(reference.id))
          saveSnapshot({ ...linked, clips: linked.clips.map((clip, i) => i === 0 ? { ...clip, characterIds: [] } : clip) })
          assert.ok(repairCharacterLinks(demoId)[0].characterIds.includes(reference.id))
          const pixels = Buffer.alloc(32 * 32 * 4)
          for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255
          const black = nativeImage.createFromBitmap(pixels, { width: 32, height: 32 }).toPNG()
          assert.throws(() => validateImageBytes(black), /hitam/)
          validateImageFile(assetAbsPath(demoId, b.assets.find((a) => a.id === c.imageAssetId)!.localPath))
          const rel = 'images/qa-black.png'
          writeFileSync(assetAbsPath(demoId, rel), black)
          const asset = insertAsset({ projectId: demoId, clipId: c.id, kind: 'image', provider: 'demo', localPath: rel, width: 32, height: 32 })
          patchClip(c.id, { imageAssetId: asset.id })
          const job = startExport(demoId, { fileName: 'must-not-export', resolution: 720, fps: 30, burnCaptions: true, writeSrt: false, normalizeAudio: true, duckMusic: true, folder: join(app.getPath('userData'), 'blocked-export') })
          await waitForJob(job.id)
          assert.equal(getJob(job.id)?.status, 'failed')
          assert.match(getJob(job.id)?.error ?? '', /adegan 1/)
          patchClip(c.id, { imageAssetId: c.imageAssetId })
          const fresh = getBundle(demoId)
          const retained = fresh.clips.slice(0, 3)
          applyScriptRefinement(demoId, retained.map((clip) => ({ id: clip.id, title: clip.title, story: clip.story, narration: clip.narration })))
          const pruned = getBundle(demoId)
          assert.deepEqual(pruned.clips.map((clip) => clip.id), retained.map((clip) => clip.id))
          assert.equal(pruned.assets.length, fresh.assets.length)
          assert.deepEqual(pruned.clips.map((clip) => clip.sort), [0, 1, 2])
          saveSnapshot({ ...pruned, project: { ...pruned.project, step: 4 } })
          if (log) appendFileSync(log, '[qa] Canonical aliases, legacy links, blank image rejection, export blocking and pruning with retained assets passed\n')
        }
        if (step.main === 'sounds' && demoId) {
          const rel = 'sfx/demo-tone.wav'
          const abs = assetAbsPath(demoId, rel)
          mkdirSync(dirname(abs), { recursive: true })
          runFixtureTool(binPath(ffmpegStatic!), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.6', abs], { windowsHide: true })
          const asset = insertAsset({ projectId: demoId, kind: 'sfx', provider: 'demo', localPath: rel, prompt: 'Efek uji sintetis', durationMs: 600, meta: { author: 'Dev harness', license: 'Audio sintetis untuk pengujian' } })
          const b = getBundle(demoId)
          saveSnapshot({ ...b, project: { ...b.project, editor: { ...b.project.editor, sfx: [{ id: 'demo-fx', assetId: asset.id, start: 1.2, volumeDb: -12, label: 'Efek uji sintetis' }] } } })
        }
        if (step.main === 'mockSounds') {
          // IPC mocks exercise the actual preload bridge without spending API quota or exposing a token.
          ipcMain.removeHandler('sfx:search')
          ipcMain.removeHandler('sfx:add')
          ipcMain.removeHandler('story:soundPlan')
          ipcMain.handle('sfx:search', () => [{ id: 'fixture', name: 'Ketukan pintu uji', duration: 0.6, author: 'Dev harness', license: 'CC0 · tanpa atribusi', url: demoId ? getBundle(demoId).assets.find((a) => a.kind === 'sfx')?.url : '', pageUrl: 'https://freesound.org/' }])
          ipcMain.handle('sfx:add', (_e, projectId: string) => {
            const asset = getBundle(projectId).assets.find((a) => a.kind === 'sfx')
            if (!asset) throw new Error('Jalankan fixture sounds lebih dulu.')
            return asset
          })
          ipcMain.handle('story:soundPlan', (_e, projectId: string) => [{ clipId: getBundle(projectId).clips[0].id, label: 'Ketukan pintu', query: 'door knock', reason: 'Petunjuk awal adegan uji.' }])
        }
        if (step.main === 'overlays' && demoId) addDemoOverlays(demoId)
        if (step.main === 'videos' && demoId) addDemoVideos(demoId)
        if (step.main === 'speech' && demoId) await addDemoSpeech(demoId)
        if (step.main === 'dialogue' && demoId) await addDemoSpeech(demoId, true)
        if (step.main === 'videoToolbar' && demoId) {
          for (const clip of getBundle(demoId).clips) patchClip(clip.id, { audioAssetId: null, videoAssetId: null, motionType: 'camera' })
          setSettings({ imageProvider: 'flow2api' })
          touchProject(demoId, { step: 3 })
        }
        if (step.main === 'mockPublication' && demoId) {
          const server=createServer(async(req,res)=>{
            let raw='';for await(const chunk of req)raw+=chunk
            const body=JSON.parse(raw)
            assert(body.messages.some((m:{content:string})=>m.content.includes('publication metadata')))
            res.setHeader('Content-Type','application/json')
            res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({title:'Kenapa Sumpah Palapa Jadi Titik Balik Majapahit?',description:'Gajah Mada mengucapkan Sumpah Palapa di Majapahit. Video ini merangkai peristiwa dan konsekuensinya lewat adegan ilustrasi.',hashtags:['#Majapahit','#SumpahPalapa','#SejarahIndonesia'],thumbnail:{headline:'SUMPAH BESAR',concept:'Gajah Mada mengangkat tangan di depan balairung Majapahit.',prompt:'Landscape 16:9 thumbnail, Gajah Mada mengangkat tangan dengan ekspresi tegas, balairung sederhana di belakang, warna emas dan merah. Teks besar tepat: SUMPAH BESAR. Ikuti gaya visual dan referensi karakter proyek, tanpa watermark.'}})}}]}))
          })
          await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));server.unref()
          const address=server.address();assert(address&&typeof address==='object')
          setSettings({llmProvider:'custom',customBaseUrl:`http://127.0.0.1:${address.port}/v1`,llmModels:{...getSettings().llmModels,custom:'publication-fixture'}})
          patchEditor(demoId,{publication:undefined});touchProject(demoId,{step:3})
          dialog.showSaveDialog=async()=>({canceled:false,filePath:join(app.getPath('userData'),'publication-fixture.txt')})
        }
        if (step.main === 'publicationChecks' && demoId) {
          const b=getBundle(demoId),p=b.project.editor.publication
          assert(p&&p.origin==='ai')
          assert.equal(p.source,publicationSource(b.project,b.clips))
          assert.equal(p.hashtags.length,3)
          assert.equal(p.thumbnail?.headline,'SUMPAH BESAR')
          const text=readFileSync(join(app.getPath('userData'),'publication-fixture.txt'),'utf8')
          assert(text.includes(p.title)&&text.includes(p.description)&&text.includes('#SumpahPalapa'))
          console.log('PUBLICATION NATIVE PASS: actual model client, generation IPC, metadata persisted with project, TXT export, three relevant hashtags')
        }
        if (step.main === 'mockFlowTenBatch' && demoId) {
          const initial=getBundle(demoId), sample=initial.clips[0]
          const bytes=readFileSync(assetAbsPath(demoId,initial.assets.find(a=>a.id===sample.imageAssetId)!.localPath))
          for(let i=0;i<8;i++){
            const tail=getBundle(demoId).clips.at(-1)!
            insertClipAfter(tail.id,{...sample,id:randomUUID(),title:`Adegan batch ${i+5}`,visualPrompt:`Kenzo counts coins for scene ${i+5}`,imageAssetId:null,videoAssetId:null})
          }
          for(const clip of getBundle(demoId).clips)patchClip(clip.id,{imageAssetId:null,videoAssetId:null})
          touchProject(demoId,{coverAssetId:null,step:3})
          const groups:{account:number;ids:string[]}[]=[]
          const server=createServer(async(req,res)=>{
            if(req.url?.startsWith('/api/kisara/browser/media/')){res.setHeader('Content-Type','image/png');res.end(bytes);return}
            res.setHeader('Content-Type','application/json')
            if(req.url==='/api/kisara/status'){res.end(JSON.stringify({browserBatchVersion:1,browserMediaVersion:2,extensionMode:true,workers:[],accounts:[1,2].map(id=>({id,email:`fixture${id}@example.test`,routeKey:`fixture${id}`,workerConnected:true,active:true,imageEnabled:true}))}));return}
            if(req.url==='/api/kisara/browser/inspect'){res.end(JSON.stringify({host:'flow.google.com',projectOpen:true,blocked:false,composer:{editors:1,draftLength:0,submitCount:1,submitDisabled:true,busy:false,online:true},fields:[],buttons:[],options:[]}));return}
            if(req.url!=='/api/kisara/browser/image-batch'){res.statusCode=404;res.end('{}');return}
            try{
              let raw='';for await(const chunk of req)raw+=chunk
              const body=JSON.parse(raw);assert(body.tasks.length<=10)
              groups.push({account:body.account_id,ids:body.tasks.map((t:{id:string})=>t.id)})
              const address=server.address();assert(address&&typeof address==='object')
              res.end(JSON.stringify({results:body.tasks.toReversed().map((t:{id:string})=>({id:t.id,mediaUrl:`http://127.0.0.1:${address.port}/api/kisara/browser/media/${t.id}`,submitted:true}))}))
            }catch(e){console.log('TEN FIXTURE ERROR',String(e));res.statusCode=500;res.end('{}')}
          })
          await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
          try{
            const address=server.address();assert(address&&typeof address==='object')
            setSecret('flow2api','synthetic-ten-key')
            setSettings({imageProvider:'flow2api',flowImageTransport:'browser',flowBaseUrl:`http://127.0.0.1:${address.port}`,flowBrowserAccountId:0})
            const jobs=await win.webContents.executeJavaScript(`window.api.generate.missingImages(${JSON.stringify(demoId)})`,true)
            await Promise.all(jobs.map((job:{id:string})=>waitForJob(job.id)))
            for(const job of jobs){const result=getJob(job.id);assert.equal(result?.status,'done',result?.error||'Batch image failed')}
            const result=getBundle(demoId)
            assert.equal(result.clips.length,12);assert(result.clips.every(c=>c.imageAssetId))
            assert.deepEqual(groups.map(g=>g.ids.length),[10,2]);assert.notEqual(groups[0].account,groups[1].account)
            for(const clip of result.clips){const asset=result.assets.find(a=>a.id===clip.imageAssetId);assert.equal(asset?.clipId,clip.id);assert(asset?.prompt?.includes(clip.visualPrompt))}
            console.log('TEN NATIVE PASS: real IPC, twelve image jobs, 10+2 in two accounts, reversed results attached to correct clips, assets normalized and saved. Local fixture only.')
          }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
        }
        if (step.main === 'mockFlowCanvasBatch' && demoId) {
          const downloads=join(app.getPath('userData'),'fixture-downloads'),previousDownloads=app.getPath('downloads')
          mkdirSync(downloads,{recursive:true});app.setPath('downloads',downloads)
          const input=readFileSync(join(app.getAppPath(),'tmp','bugcheck','canvas-input.mp4')),clips=getBundle(demoId).clips
          let calls=0
          const server=createServer(async(req,res)=>{
            res.setHeader('Content-Type','application/json')
            if(req.url==='/api/kisara/status'){res.end(JSON.stringify({browserMediaVersion:2,extensionMode:true,workers:[],accounts:[{id:1,email:'canvas@example.test',routeKey:'fixture',workerConnected:true,active:true,imageEnabled:true}]}));return}
            if(req.url==='/api/kisara/browser/inspect'){res.end(JSON.stringify({host:'flow.google.com',projectOpen:true,blocked:false,composer:{editors:1,draftLength:0,submitCount:1,submitDisabled:true,busy:false,online:true},fields:[],buttons:[],options:[]}));return}
            if(req.url!=='/api/kisara/browser/image'){res.statusCode=404;res.end('{}');return}
            try{
              let raw='';for await(const chunk of req)raw+=chunk
              const body=JSON.parse(raw),clip=clips[calls]
              assert.equal(body.kind,'video');assert.equal(body.recover,undefined);assert.equal(body.references.length,1)
              assert.equal(body.prompt,flowVideoPrompt(clip))
              const path=join(downloads,`canvas-${++calls}.mp4`);writeFileSync(path,input)
              res.end(JSON.stringify({downloadFile:{path,size:input.length}}))
            }catch{res.statusCode=500;res.end('{}')}
          })
          await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
          try{
            const address=server.address();assert(address&&typeof address==='object')
            setSecret('flow2api','synthetic-canvas-key')
            setSettings({imageProvider:'flow2api',flowImageTransport:'browser',flowBaseUrl:`http://127.0.0.1:${address.port}`,flowBrowserAccountId:1})
            const jobs=await win.webContents.executeJavaScript(`window.api.generate.missingVideos(${JSON.stringify(demoId)})`,true)
            await Promise.all(jobs.map((job:{id:string})=>waitForJob(job.id)))
            for(const job of jobs){const result=getJob(job.id);assert.equal(result?.status,'done',result?.error || 'Canvas batch failed')}
            const result=getBundle(demoId)
            assert.equal(calls,clips.length)
            assert(result.clips.every(c=>c.videoAssetId&&c.motionType==='video'))
            assert(result.assets.filter(a=>a.kind==='video').every(a=>a.durationMs&&a.durationMs>100))
            console.log('CANVAS BATCH NATIVE PASS: four ordered I2V jobs, shared prompt, one reference each, downloaded files normalized and attached; no TTS or Google requests')
          }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));app.setPath('downloads',previousDownloads)}
        }
        if (step.main === 'recoverFlowVideo' && demoId) {
          const key=process.env.STUDIO_RECOVER_FLOW_KEY
          if(!key)throw new Error('Missing isolated recovery fixture key')
          setSecret('flow2api',key)
          setSettings({imageProvider:'flow2api',flowBaseUrl:'http://127.0.0.1:8765',flowImageTransport:'browser',flowBrowserAccountId:1})
          const clipId=getBundle(demoId).clips[0].id
          const job=await win.webContents.executeJavaScript(`window.api.generate.recoverFlowVideo(${JSON.stringify(clipId)})`,true)
          await waitForJob(job.id)
          const done=getJob(job.id),bundle=getBundle(demoId),clip=bundle.clips[0],asset=bundle.assets.find(a=>a.id===clip.videoAssetId)
          assert.ok(done)
          assert.equal(done.status,'done',done.error || 'Recovery did not finish')
          assert.equal(clip.motionType,'video')
          assert.equal(asset?.kind,'video')
          assert.ok(asset?.durationMs && asset.durationMs>100)
          console.log('RECOVERY NATIVE PASS: actual IPC, existing Flow MP4, normalization, asset saved, video attached to isolated clip')
        }
        if (step.main === 'mockStyleUpload') {
          const file = join(app.getAppPath(), 'resources', 'kenzo.png')
          let calls = 0
          dialog.showOpenDialog = async () => (++calls === 1 ? { canceled: false, filePaths: [file] } : { canceled: true, filePaths: [] })
        }
        if (step.main === 'channelCharacter') {
          const before = channelCharacterBytes()!
          assert(before.length > 1000)
          const oldKey = channelCharacterKey()
          await importChannelCharacter(join(app.getAppPath(), 'resources', 'kenzo.png'))
          assert.notEqual(channelCharacterKey(), oldKey)
          assert(channelCharacterBytes()!.length > 1000)
          assert(sameReferenceImage(before, channelCharacterBytes()!))
          assert(!before.equals(channelCharacterBytes()!), 'Fixture must exercise different encodings')
          assert(!getSettings().channelCharacterReference.includes('Downloads'))
          const ref = getSettings().channelCharacterReference
          const invalid = join(app.getPath('userData'), 'invalid-image.txt')
          writeFileSync(invalid, 'Not an image')
          await assert.rejects(importChannelCharacter(invalid))
          assert.equal(getSettings().channelCharacterReference, ref)
          const styleBefore = channelStyleKey()
          await importChannelCharacter(join(app.getAppPath(), 'resources', 'kenzo.png'), 'style')
          assert.notEqual(channelStyleKey(), styleBefore)
          assert(channelStyleBytes()!.equals(channelCharacterBytes()!))
          assert(channelStylePrompt(2).includes('image number 2'))
          assert(channelStylePrompt(2).includes('NPCs'))
          const styleRef = getSettings().channelStyleReference
          await assert.rejects(importChannelCharacter(invalid, 'style'))
          assert.equal(getSettings().channelStyleReference, styleRef)
          setSettings({ channelStyleEnabled: false })
          assert.equal(channelStyleBytes(), null)
          assert.equal(channelStylePrompt(1), '')
          setSettings({ channelStyleEnabled: true })
          const differentStyle = join(app.getPath('userData'), 'style-fixture.png')
          writeFileSync(differentStyle, nativeImage.createFromBuffer(before).resize({ width: 512 }).toPNG())
          await importChannelCharacter(differentStyle, 'style')
          assert(!channelStyleBytes()!.equals(channelCharacterBytes()!))
          assert(!sameReferenceImage(channelStyleBytes()!, channelCharacterBytes()!))
          if (log) appendFileSync(log, '[qa] REFERENCE PIXEL DEDUP PASS: reencoded PNG matches original; different size/style remains separate\n')
          if (log) appendFileSync(log, '[qa] CHANNEL STYLE PASS: owned reference, NPC/environment prompt, invalid upload preserved, disabled style omitted\n')
          if (log) appendFileSync(log, '[qa] CHANNEL CHARACTER PASS: built-in Kenzo, owned uploaded copy, invalid upload preserves selected reference\n')
        }
        if (step.main === 'speakerLabels'  && demoId) await addDemoSpeech(demoId, 'labels')
        if (step.main === 'key' && step.provider) {
          setSecret(step.provider, 'dev-harness-fake-key')
          recordCheck(step.provider, step.ok !== false, step.ok === false ? 'Kunci ditolak (uji)' : 'Terhubung (uji)')
        }
        if (step.main === 'export' && (step.projectId ?? demoId)) {
          startExport((step.projectId ?? demoId)!, {
            fileName: 'demo-export',
            resolution: 1080,
            fps: 30,
            burnCaptions: true,
            writeSrt: true,
            normalizeAudio: true,
            duckMusic: true,
            folder: step.exportTo ?? app.getPath('temp')
          })
        }
        if (step.js) await win.webContents.executeJavaScript(step.js, true)
        if (step.drag || step.click) {
          const target = step.drag ?? step.click!
          const rect = (await win.webContents.executeJavaScript(
            `(() => { const el = document.querySelector(${JSON.stringify(target.selector)}); if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })()`,
            true
          )) as { x: number; y: number; w: number; h: number } | null
          if (!rect) throw new Error(`element tidak ada: ${target.selector}`)
          const at = step.drag?.at ?? 'center'
          const fx = step.click?.fx ?? (at === 'left' ? 0 : at === 'right' ? 1 : 0.5)
          let x0 = Math.round(rect.x + Math.min(rect.w - 2, Math.max(2, rect.w * fx + (at === 'left' ? 3 : at === 'right' ? -3 : 0))))
          let y0 = Math.round(rect.y + rect.h * (step.drag?.fy ?? 0.5))
          if (step.click?.pointJs) {
            const pt = (await win.webContents.executeJavaScript(step.click.pointJs, true)) as { x: number; y: number }
            x0 = Math.round(pt.x)
            y0 = Math.round(pt.y)
          }
          const send = (type: 'mouseDown' | 'mouseUp' | 'mouseMove', x: number, y: number): void =>
            win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 })
          send('mouseMove', x0, y0)
          send('mouseDown', x0, y0)
          if (step.drag) {
            const steps = 12
            for (let i = 1; i <= steps; i++) {
              await sleep(16)
              send('mouseMove', x0 + Math.round((step.drag.dx * i) / steps), y0 + Math.round(((step.drag.dy ?? 0) * i) / steps))
            }
          }
          await sleep(30)
          send('mouseUp', x0 + (step.drag?.dx ?? 0), y0 + (step.drag?.dy ?? 0))
        }
        if (step.key) {
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: step.key })
          win.webContents.sendInputEvent({ type: 'char', keyCode: step.key })
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: step.key })
        }
      } catch (e) {
        if (log) appendFileSync(log, `[harness] step failed: ${(e as Error).message}\n`)
      }
      await sleep(step.wait ?? 800)
      if (step.shot) {
        try {
          const img = await win.webContents.capturePage()
          writeFileSync(step.shot, img.toPNG())
        } catch (e) {
          if (log) appendFileSync(log, `[harness] screenshot failed: ${(e as Error).message}\n`)
        }
      }
      if (step.quit) app.quit()
    }
  })
}
