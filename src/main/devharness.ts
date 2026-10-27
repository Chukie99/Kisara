import { prepareMediaImport, applyMediaImport, discardMediaImport } from './mediaImport'
import { execFileSync } from 'node:child_process'
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
import { applyScriptRefinement, applyVisuals, createProject, getBundle, getJob, insertAsset, patchClip, patchClipText, repairCharacterLinks, replaceScript, replaceStory, saveSnapshot, touchProject } from './repo'
import { validateImageBytes, validateImageFile } from './imageQuality'
import { waitForJob } from './jobs'
import { composeSceneSpeech } from '@shared/speech'
import { emit } from './events'
import { recordCheck, setSecret } from './secrets'
import { getSettings, setSettings } from './settings'
import type { ApiProvider, ScriptProgress } from '@shared/types'

/**
 * Real speech for the demo clips (Windows' built-in English voice) with estimated caption timings, so
 * Whisper caption syncing can be tested without a TTS key.
 */
async function addDemoSpeech(projectId: string, dialogue = false): Promise<void> {
  const lines = dialogue ? [
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
    const text = lines[i % lines.length]
    const rel = `audio/speech-${i}.wav`
    const abs = assetAbsPath(projectId, rel)
    mkdirSync(dirname(abs), { recursive: true })
    const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${abs.replace(/'/g, "''")}'); $s.Speak('${text}'); $s.Dispose()`
    // stdin must be closed, or PowerShell waits on it and blocks the main process.
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    const ms = await probeDurationMs(abs)
    const asset = insertAsset({
      projectId,
      clipId: c.id,
      kind: 'audio',
      provider: 'demo',
      prompt: text,
      localPath: rel,
      durationMs: ms,
      meta: { words: estimateWordTimings(text, ms / 1000), estimatedTimings: true }
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
  execFileSync(binPath(ffmpegStatic!), ['-y', '-f', 'lavfi', '-i', 'color=c=0xE4572E:s=360x120', '-frames:v', '1', abs], { windowsHide: true })
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
    execFileSync(ff, ['-y', '-f', 'lavfi', '-i', `testsrc2=s=1280x720:r=24:d=6`, '-vf', `hue=h=${i * 50}`, '-pix_fmt', 'yuv420p', abs], { windowsHide: true })
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
    execFileSync(ff, ['-y', '-f', 'lavfi', '-i', 'testsrc2=s=1920x1080', '-vf', `hue=h=${i * 70}`, '-frames:v', '1', assetAbsPath(p.id, img)], { windowsHide: true })
    const sec = 3.2 + i * 0.4
    execFileSync(ff, ['-y', '-f', 'lavfi', '-i', `sine=frequency=${220 + i * 60}:duration=${sec}`, '-ar', '24000', '-ac', '1', assetAbsPath(p.id, wav)], {
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
  execFileSync(ff, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=110:duration=30', '-ar', '44100', assetAbsPath(p.id, music)], { windowsHide: true })
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
export function prepareHarness(): void {
  if (app.isPackaged || !process.env.STUDIO_CAPTURE_PLAN) return
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
  if (app.isPackaged) return
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
    main?: 'seed' | 'export' | 'key' | 'overlays' | 'speech' | 'videos' | 'sounds' | 'mockSounds' | 'quality' | 'dialogue' | 'mockImagePicker' | 'flow' | 'mockFlowSave' | 'mockPodcast' | 'mockScript' | 'mockVisuals' | 'mockWriter' | 'mockF5' | 'mockF5Local' | 'mockProductionTools' | 'mediaImportChecks'
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
          execFileSync(binPath(ffmpegStatic!),['-y','-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=24','-t','3','-c:v','libx264','-pix_fmt','yuv420p',video],{windowsHide:true,timeout:30000})
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
              execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 45000, stdio: ['ignore', 'ignore', 'pipe'] })
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
          execFileSync(binPath(ffmpegStatic!), ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=4', '-c:a', 'libopus', '-y', reference], { windowsHide: true })
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
              execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 45000, stdio: ['ignore', 'ignore', 'pipe'] })
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
          execFileSync(binPath(ffmpegStatic!), ['-y', '-v', 'error', '-i', assetAbsPath(demoId, image.localPath), '-frames:v', '1', file], { windowsHide: true })
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
          execFileSync(binPath(ffmpegStatic!), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.6', abs], { windowsHide: true })
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
