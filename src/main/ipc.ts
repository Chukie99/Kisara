import { prepareMediaImport, applyMediaImport, discardMediaImport } from './mediaImport'
import type { MediaImportChoice } from '@shared/production'
import { reviewScript } from './scriptReview'
import { randomUUID } from 'node:crypto'
import { soundLicense } from '@shared/licenses'
import { captionNeedsSync } from '@shared/captions'
import { narrationNeedsRefresh } from '@shared/speech'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import type {
  ApiProvider,
  AppSettings,
  Asset,
  AspectRatio,
  ExportOptions,
  FlowExportOptions,
  KeyTestResult,
  ModelSource,
  NewProjectInput,
  ProjectSnapshot,
  SourceOptions,
  SfxHit,
  TtsProvider,
  VoiceOption,
  WordTiming
} from '@shared/types'
import { startExport } from './exporter'
import {
  estimateCredits,
  forgetEstimates,
  generateCharacterSheet,
  generateClipImage,
  generateClipTts,
  generateClipVideo,
  generateMissingImages,
  generateMissingVideos,
  generateMissingTts,
  setActiveAsset,
  storyExport
} from './generation'
import { cancelJob, waitForJob } from './jobs'
import { generateNarration, syncCaptions } from './narration'
import { cancelDownload, downloadModel, openModelFolder, removeModel, whisperReady, whisperStatus } from './whisper'
import { assetAbsPath } from './paths'
import { detachVoice, splitClip } from './editing'
import { emit } from './events'
import {
  clipsOf,
  createProject,
  duplicateProject,
  getAsset,
  getBundle,
  getClip,
  getJob,
  getProject,
  insertAsset,
  listProjects,
  patchClip,
  removeProject,
  saveSnapshot,
  touchProject,
  updateAssetMeta
} from './repo'
import { clearSecret, keyStatuses, recordCheck, revealSecret, setSecret } from './secrets'
import { dropCache, getSettings, setSettings } from './settings'
import { probeDurationMs, probeSize } from './services/audio'
import * as cloudflare from './services/cloudflare'
import * as eleven from './services/elevenlabs'
import * as freesound from './services/freesound'
import * as huggingface from './services/huggingface'
import * as gemini from './services/gemini'
import * as hf from './services/higgsfield'
import * as llm from './services/llm'
import * as supertonic from './services/supertonic'
import * as f5 from './services/f5'
import * as f5Local from './services/f5Local'
import * as youtube from './services/youtube'
import { generateMusicPrompt, generateIdea, ideaFromVideo, generateSoundPlan, refineScript } from './story'
import { generateSoundEffects } from './soundEffects'
import { normalizeGeneratedImage } from './imageQuality'
import { flowExportBytes } from './flowExport'
import { cancelScript, runScript, scriptStatus } from './scriptRuns'
import { cancelVisuals, runVisuals, visualStatus } from './visualRuns'


type Handler = (...args: any[]) => unknown

function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return await fn(...args)
    } catch (e) {
      // Only the message crosses the IPC boundary; keep it readable for the user.
      throw new Error((e as Error)?.message ?? String(e))
    }
  })
}

async function testProvider(provider: ApiProvider, key?: string): Promise<KeyTestResult> {
  if (provider === 'higgsfield') return hf.testCredentials(key)
  if (provider === 'elevenlabs') return eleven.testKey(key)
  if (provider === 'cloudflare') return cloudflare.testKey(key)
  if (provider === 'huggingface') return huggingface.testKey(key)
  if (provider === 'freesound') return freesound.testKey(key)
  return llm.testLlm(provider, key)
}

function defaultExportFolder(): string {
  return getSettings().exportFolder ?? join(app.getPath('videos'), 'Kisara')
}

/**
 * Runs the whole chain for a project in one go: script, visual plans, pictures, voice, captions. Each step
 * waits for the one before it, so the user can press one button and walk away. Steps that have nothing to do
 * (a script that already exists, a project with no Whisper model) are skipped rather than failing the run.
 */
async function runPipeline(projectId: string): Promise<void> {
  const bundle = getBundle(projectId)
  if (!bundle.clips.some((c) => c.narration.trim())) await runScript(projectId)
  const planned = await runVisuals(projectId, 'missing')
  emit.production(planned)
  // The Hugging Face queue serializes requests even when jobs are submitted together.
  const imageJobs = generateMissingImages(projectId)
  await Promise.all(imageJobs.map((j) => completedJob(j.id)))
  // A project with nothing left to voice, or nothing to time, is not an error here.
  const fresh = getBundle(projectId)
  if (fresh.clips.some((c) => narrationNeedsRefresh(getAsset(c.audioAssetId), c, fresh.project)))
    await completedJob(generateNarration(projectId, 'missing').id)
  if (getProject(projectId).editor.autoSound !== false) await completedJob(generateSoundEffects(projectId).id)
  if (whisperReady() && clipsOf(projectId).some((clip) => {
    const asset = getAsset(clip.audioAssetId)
    return asset && captionNeedsSync(asset)
  })) await completedJob(syncCaptions(projectId, 'stale').id)
}

async function completedJob(id: string): Promise<void> {
  await waitForJob(id)
  const job = getJob(id)
  if (!job || job.status !== 'done') throw new Error(job?.error || 'Proses belum selesai atau dibatalkan. Periksa status pekerjaan sebelum lanjut.')
}

export function registerIpc(): void {
  handle('projects:list', () => listProjects())
  handle('projects:create', (input: NewProjectInput) => getBundle(createProject(input).id))
  handle('projects:get', (id: string) => getBundle(id))
  handle('projects:save', (snap: ProjectSnapshot) => ({ updatedAt: saveSnapshot(snap) }))
  handle('projects:remove', (id: string) => removeProject(id))
  handle('projects:duplicate', (id: string) => duplicateProject(id))

  handle('story:script', (projectId: string) => runScript(projectId))
  handle('story:scriptStatus', (projectId: string) => scriptStatus(projectId))
  handle('story:cancelScript', (projectId: string) => cancelScript(projectId))
  handle('story:reviewScript', (projectId: string) => reviewScript(projectId))
  handle('story:refineScript', (projectId: string) => refineScript(projectId))
  // One fresh topic for a category, for the idea box on the home screen.
  handle('story:idea', (category: string, language: string) => generateIdea(category, language))
  // A YouTube link is read (captions first, local Whisper as a fallback) and distilled into a fresh idea.
  handle('story:fromVideo', (url: string, language: string, options?: SourceOptions) => ideaFromVideo(url, language, options))
  handle('story:youtubeStatus', () => youtube.ytdlpStatus())
  handle('story:exportFlow', async (projectId: string, format: 'txt' | 'docx', options: FlowExportOptions = {}) => {
    if (format !== 'txt' && format !== 'docx') throw new Error('Pilih format TXT atau DOCX.')
    if (!options || typeof options !== 'object' || Array.isArray(options) || !['guide', 'narration', 'agent', 'mapping'].includes(options.kind ?? 'guide') || (options.batchIndex != null && (!Number.isInteger(options.batchIndex) || options.batchIndex < 0))) throw new Error('Pilihan ekspor Flow tidak valid.')
    const bundle = getBundle(projectId)
    const bytes = await flowExportBytes(bundle, format, options)
    const safe = bundle.project.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'kisara'
    const win = BrowserWindow.getFocusedWindow()
    const suffix = options.kind === 'narration' ? 'narasi' : options.kind === 'agent' ? `flow-${bundle.project.editor.flowMode === 'video' ? 'video-' : ''}paket-${(options.batchIndex ?? 0) + 1}` : options.kind === 'mapping' ? 'urutan-gambar' : bundle.project.editor.flowMode === 'video' ? 'flow-image-to-video' : 'flow'
    const result = await dialog.showSaveDialog(win!, { title: 'Simpan naskah & prompt Google Flow', defaultPath: join(app.getPath('downloads'), `${safe}-${suffix}.${format}`), filters: [{ name: format.toUpperCase(), extensions: [format] }] })
    if (result.canceled || !result.filePath) return null
    const file = result.filePath.toLowerCase().endsWith(`.${format}`) ? result.filePath : `${result.filePath}.${format}`
    writeFileSync(file, bytes)
    return file
  })
  handle('story:musicPrompt', (projectId: string) => generateMusicPrompt(projectId))
  handle('story:visualStatus', (projectId: string) => visualStatus(projectId))
  handle('story:cancelVisuals', (projectId: string) => cancelVisuals(projectId))
  handle('story:visuals', (projectId: string, mode: 'missing' | 'all') => runVisuals(projectId, mode === 'all' ? 'all' : 'missing'))
  // Writes every clip's image prompt to a JSON file, so the pictures can be made elsewhere (e.g. a free
  // Colab notebook with a real FLUX model) and imported back with "Impor gambar".
  handle('story:exportPrompts', async (projectId: string): Promise<string | null> => {
    const project = getProject(projectId)
    const data = storyExport(projectId)
    if (!data.images.length) throw new Error('Belum ada klip. Susun naskahnya dulu di langkah Ide cerita.')
    const win = BrowserWindow.getFocusedWindow()
    const safe = project.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'kisara'
    const res = await dialog.showSaveDialog(win!, {
      title: 'Simpan prompt untuk Colab',
      defaultPath: join(app.getPath('downloads'), `${safe}-prompts.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (res.canceled || !res.filePath) return null
    // Portraits ride along as data URIs, so one file is everything the notebook needs.
    writeFileSync(res.filePath, JSON.stringify(data), 'utf-8')
    return res.filePath
  })

  handle('generate:clipImage', (clipId: string) => generateClipImage(clipId))
  handle('generate:pipeline', async (projectId: string) => {
    await runPipeline(projectId)
    return getBundle(projectId)
  })
  handle('generate:clipVideo', (clipId: string) => generateClipVideo(clipId))
  handle('generate:clipTts', (clipId: string) => generateClipTts(clipId))
  handle('generate:characterSheet', (characterId: string) => generateCharacterSheet(characterId))
  handle('generate:missingImages', (projectId: string, mode?: 'missing' | 'all') => generateMissingImages(projectId, mode === 'all' ? 'all' : 'missing'))
  handle('generate:missingVideos', (projectId: string) => generateMissingVideos(projectId))
  handle('generate:missingTts', (projectId: string) => generateMissingTts(projectId))
  handle('generate:narration', (projectId: string, mode: 'missing' | 'all') => generateNarration(projectId, mode === 'all' ? 'all' : 'missing'))
  handle('generate:syncCaptions', (projectId: string, mode?: 'stale' | 'all') => syncCaptions(projectId, mode === 'all' ? 'all' : 'stale'))

  handle('whisper:status', () => whisperStatus())
  // The download runs in the background and reports through whisper events.
  handle('whisper:download', () => {
    void downloadModel().catch(() => {})
  })
  handle('whisper:cancel', () => cancelDownload())
  handle('whisper:remove', () => removeModel())
  handle('whisper:openFolder', () => openModelFolder())
  handle('generate:cancel', (jobId: string) => cancelJob(jobId))
  handle('generate:estimate', (kind: 'image' | 'video', modelId: string, aspect: AspectRatio, seconds?: number, resolution?: string | null) =>
    estimateCredits(kind, modelId, aspect, seconds, resolution)
  )

  handle('assets:prepareMediaImport', async (projectId: string) => {
    getProject(projectId)
    const res = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow()!, { title: 'Pilih hasil Flow untuk beberapa adegan', properties: ['openFile','multiSelections'], filters: [{ name: 'Gambar dan video', extensions: ['png','jpg','jpeg','webp','mp4','mov','webm','mkv','m4v'] }] })
    return res.canceled || !res.filePaths.length ? null : prepareMediaImport(projectId, res.filePaths)
  })
  handle('assets:applyMediaImport', (projectId: string, token: string, choices: MediaImportChoice[], replaceExisting: boolean) => applyMediaImport(projectId, token, choices, replaceExisting))
  handle('assets:discardMediaImport', (token: string) => discardMediaImport(token))
  handle('assets:setActive', (clipId: string, assetId: string) => setActiveAsset(clipId, assetId))
  handle('clips:split', (clipId: string, atMs: number) => splitClip(clipId, Number(atMs)))
  handle('clips:detachVoice', (clipId: string) => detachVoice(clipId))
  // Caption text fixed by hand in the editor; the words keep their times.
  handle('assets:setWords', (assetId: string, words: WordTiming[]) => {
    const a = getAsset(assetId)
    if (!a || a.kind !== 'audio') throw new Error('Suara klip tidak ditemukan')
    const clean = (Array.isArray(words) ? words : [])
      .filter((w) => w && typeof w.text === 'string' && w.text.trim() && Number.isFinite(w.start) && Number.isFinite(w.end))
      .map((w) => ({ text: w.text.trim(), start: Math.max(0, w.start), end: Math.max(w.start, w.end) }))
    updateAssetMeta(a.id, { ...a.meta, words: clean, editedWords: true })
    const fresh = getAsset(a.id)!
    emit.asset(fresh)
    return fresh
  })
  handle('assets:pickMusic', async (projectId: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Pilih musik latar',
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'ogg'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return null
    getProject(projectId)
    const src = res.filePaths[0]
    const rel = `music/${randomUUID()}${extname(src).toLowerCase()}`
    const abs = assetAbsPath(projectId, rel)
    mkdirSync(dirname(abs), { recursive: true })
    copyFileSync(src, abs)
    const durationMs = await probeDurationMs(abs).catch(() => null)
    return insertAsset({
      projectId,
      kind: 'music',
      provider: 'local',
      prompt: src.split(/[\\/]/).pop() ?? 'musik',
      localPath: rel,
      durationMs
    })
  })

  // Sound effects: search Freesound, then pull the chosen one into the project as an asset the timeline can
  // place at its own moment. The licence and author ride along in the asset metadata so the user can credit
  // a sound when its licence asks for that.
  handle('sfx:search', (query: string, limit?: number) => freesound.search(query, limit ?? 12))
  handle('sfx:auto', (projectId: string) => generateSoundEffects(projectId))
  handle('story:soundPlan', (projectId: string) => generateSoundPlan(projectId))
  handle('sfx:add', async (projectId: string, hit: SfxHit) => {
    getProject(projectId)
    if (!hit?.url) throw new Error('Efek suara ini tidak punya berkas untuk diunduh.')
    if (soundLicense(hit.license ?? '') !== 'CC0') throw new Error('Pilih efek berlisensi CC0 dari hasil pencarian. Untuk lisensi lain, periksa hak pakainya dahulu.')
    const bytes = await freesound.download(hit.url)
    const rel = `sfx/${randomUUID()}.mp3`
    const abs = assetAbsPath(projectId, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, bytes)
    const durationMs = await probeDurationMs(abs).catch(() => Math.round(hit.duration * 1000))
    const asset = insertAsset({
      projectId,
      kind: 'sfx',
      provider: 'freesound',
      prompt: hit.name,
      localPath: rel,
      durationMs,
      meta: { author: hit.author, license: hit.license, pageUrl: hit.pageUrl, sourceId: hit.id }
    })
    emit.asset(asset)
    touchProject(projectId)
    return asset
  })

  handle('assets:pickImage', async (projectId: string) => {    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Pilih gambar logo atau watermark',
      filters: [{ name: 'Gambar', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return null
    getProject(projectId)
    const src = res.filePaths[0]
    const rel = `overlays/${randomUUID()}${extname(src).toLowerCase()}`
    const abs = assetAbsPath(projectId, rel)
    mkdirSync(dirname(abs), { recursive: true })
    copyFileSync(src, abs)
    const size = await probeSize(abs).catch(() => null)
    if (!size) throw new Error('Gambar tidak bisa dibaca. Pakai file PNG, JPG, atau WebP.')
    return insertAsset({
      projectId,
      kind: 'overlay',
      provider: 'local',
      prompt: basename(src),
      localPath: rel,
      width: size.width,
      height: size.height
    })
  })

  // A video made elsewhere (a free Colab notebook, Kling, Hailuo, …) becomes a clip's picture, so the app
  // never has to pay for a video model.
  handle('assets:pickVideo', async (projectId: string, clipId: string | null): Promise<Asset | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Pilih video',
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'mkv', 'm4v'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return null
    getProject(projectId)
    const src = res.filePaths[0]
    const rel = `videos/${randomUUID()}${extname(src).toLowerCase()}`
    const abs = assetAbsPath(projectId, rel)
    mkdirSync(dirname(abs), { recursive: true })
    copyFileSync(src, abs)
    const size = await probeSize(abs).catch(() => null)
    if (!size) throw new Error('Video tidak bisa dibaca. Pakai MP4, MOV, atau WebM.')
    const durationMs = await probeDurationMs(abs).catch(() => null)
    const asset = insertAsset({
      projectId,
      clipId,
      kind: 'video',
      provider: 'local',
      prompt: basename(src),
      localPath: rel,
      durationMs,
      width: size.width,
      height: size.height
    })
    emit.asset(asset)
    if (clipId) {
      const patch = { videoAssetId: asset.id, motionType: 'video' as const, mediaInMs: 0 }
      patchClip(clipId, patch)
      emit.clip({ clipId, patch })
    }
    touchProject(projectId)
    return asset
  })

  // A picture made elsewhere (a free web generator, a stock photo, a drawing) becomes a clip's picture.
  handle('assets:pickClipImage', async (projectId: string, clipId: string | null): Promise<Asset | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Pilih gambar',
      filters: [{ name: 'Gambar', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return null
    getProject(projectId)
    if (clipId && getClip(clipId).projectId !== projectId) throw new Error('Klip tidak cocok dengan proyek ini.')
    const src = res.filePaths[0]
    const bytes = await normalizeGeneratedImage(readFileSync(src))
    const ext = bytes[0] === 0xff && bytes[1] === 0xd8 ? '.jpg' : '.png'
    const rel = `images/${randomUUID()}${ext}`
    const abs = assetAbsPath(projectId, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, bytes)
    const size = await probeSize(abs).catch(() => null)
    if (!size) throw new Error('Gambar tidak bisa dibaca. Pakai PNG, JPG, atau WebP.')
    const asset = insertAsset({
      projectId,
      clipId,
      kind: 'image',
      provider: 'local',
      prompt: basename(src),
      localPath: rel,
      width: size.width,
      height: size.height
    })
    emit.asset(asset)
    if (clipId) {
      patchClip(clipId, { imageAssetId: asset.id })
      emit.clip({ clipId, patch: { imageAssetId: asset.id } })
      const project = getProject(projectId)
      const first = clipsOf(projectId)[0]
      if (!project.coverAssetId || first?.id === clipId) touchProject(projectId, { coverAssetId: asset.id })
    }
    touchProject(projectId)
    return asset
  })

  handle('settings:get', () => getSettings())
  handle('settings:set', (patch: Partial<AppSettings>) => setSettings(patch))
  handle('settings:keys', () => keyStatuses())
  handle('settings:setKey', async (provider: ApiProvider, key: string) => {
    const clean = key.trim()
    if (!clean) throw new Error('Kunci masih kosong')
    setSecret(provider, clean)
    dropCache(`models:${provider}`)
    if (provider === 'gemini') dropCache('models:gemini-tts')
    if (provider === 'higgsfield') forgetEstimates()
    const result = await testProvider(provider, clean)
    recordCheck(provider, result.ok, result.message)
    return result
  })
  handle('settings:setCustom', async (baseUrl: string, key: string) => {
    const url = baseUrl.trim().replace(/\/+$/, '')
    if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('Alamat endpoint harus diawali http:// atau https://')
    setSettings({ customBaseUrl: url })
    if (key.trim()) setSecret('custom', key.trim())
    dropCache('models:custom')
    const result = await llm.testLlm('custom', key.trim() || undefined, url)
    recordCheck('custom', result.ok, result.message)
    return result
  })
  handle('settings:clearKey', (provider: ApiProvider) => {
    clearSecret(provider)
    dropCache(`models:${provider}`)
    if (provider === 'higgsfield') forgetEstimates()
    if (provider === 'custom') setSettings({ customBaseUrl: '' })
  })
  handle('models:list', (source: ModelSource, refresh?: boolean) => llm.listModels(source, !!refresh))
  handle('settings:testKey', async (provider: ApiProvider) => {
    const result = await testProvider(provider).catch((e): KeyTestResult => ({ ok: false, message: (e as Error).message }))
    recordCheck(provider, result.ok, result.message)
    return result
  })
  handle('settings:revealKey', (provider: ApiProvider) => revealSecret(provider))
  handle('settings:testWriter', () => llm.testWriter())
  // Cloudflare needs an account id beside the token, so it is saved and checked in one step.
  handle('settings:setCloudflare', async (accountId: string, key: string) => {
    const account = accountId.trim()
    if (!account) throw new Error('Account ID Cloudflare masih kosong')
    setSettings({ cloudflareAccountId: account })
    const clean = key.trim()
    if (clean) setSecret('cloudflare', clean)
    const result = await cloudflare.testKey(clean || undefined, account).catch((e): KeyTestResult => ({ ok: false, message: (e as Error).message }))
    recordCheck('cloudflare', result.ok, result.message)
    return result
  })
  // A Space is named, not keyed, so the name is saved beside the optional token.
  handle('settings:setHuggingFace', async (space: string, key: string) => {
    const name = space.trim()
    if (!name) throw new Error('Nama Space Hugging Face masih kosong')
    setSettings({ hfSpace: name })
    // The Space may have been switched to another model, so ask it again next time a prompt is sized.
    huggingface.forgetActiveModel()
    const clean = key.trim()
    if (clean) setSecret('huggingface', clean)
    const result = await huggingface.testKey(clean || undefined, name).catch((e): KeyTestResult => ({ ok: false, message: (e as Error).message }))
    recordCheck('huggingface', result.ok, result.message)
    return result
  })
  handle('settings:voices', async (provider: TtsProvider): Promise<VoiceOption[]> => {
    if (provider === 'f5-local') return f5Local.voices()
    if (provider === 'f5-hf') {
      if (!f5.setupReady()) throw new Error('Lengkapi referensi F5 di Pengaturan terlebih dulu.')
      return [{ id: getSettings().f5VoiceId, name: getSettings().f5ReferenceName || 'Referensi F5', description: 'Suara mengikuti sampel yang kamu pilih.' }]
    }
    if (provider === 'gemini') return gemini.listVoices()
    if (provider === 'supertonic') return supertonic.voices()
    return eleven.listVoices()
  })
  // The local Supertonic studio has no key, so its "is it usable" check looks at the folder instead.
  handle('settings:supertonic', () => supertonic.setupStatus())
  handle('settings:setF5', (input: { space: string; endpoint: string; refText: string; token?: string }) => {
    if (!input || typeof input.space !== 'string' || typeof input.endpoint !== 'string' || typeof input.refText !== 'string' || input.token !== undefined && typeof input.token !== 'string') throw new Error('Pengaturan F5 tidak valid.')
    huggingface.spaceHost(input.space)
    const endpoint = input.endpoint.trim().replace(/^\//, '')
    if (!/^[a-z0-9_-]{1,80}$/i.test(endpoint) || input.refText.trim().length > 3000) throw new Error('Endpoint F5 atau transkrip sampel tidak valid (maksimal 3.000 karakter).')
    if (input.token?.trim()) setSecret('huggingface', input.token.trim())
    return setSettings({ f5Space: input.space.trim(), f5Endpoint: endpoint, f5RefText: input.refText.trim() })
  })
  handle('settings:pickF5Reference', async () => {
    const selected = await dialog.showOpenDialog({ title: 'Pilih sampel suara F5 (3–15 detik)', properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['wav', 'mp3', 'm4a', 'flac', 'ogg', 'oga', 'opus', 'webm'] }] })
    return selected.canceled || !selected.filePaths[0] ? null : f5.prepareReference(selected.filePaths[0])
  })
  handle('settings:testF5', () => f5.testSpace())
  handle('settings:testF5Local', (baseUrl?: string) => f5Local.test(baseUrl))
  handle('settings:pickSupertonic', async (): Promise<AppSettings | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Pilih folder Supertonic',
      defaultPath: getSettings().supertonicDir || undefined,
      properties: ['openDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    return setSettings({ supertonicDir: res.filePaths[0] })
  })

  handle('export:start', (projectId: string, opts: ExportOptions) => startExport(projectId, opts))
  handle('export:defaultFolder', () => defaultExportFolder())
  handle('export:pickFolder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Pilih folder ekspor',
      defaultPath: defaultExportFolder(),
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    setSettings({ exportFolder: res.filePaths[0] })
    return res.filePaths[0]
  })
  handle('export:reveal', (path: string) => shell.showItemInFolder(path))

  handle('app:version', () => app.getVersion())
  handle('app:copyText', (text: string) => clipboard.writeText(String(text)))
  handle('app:openExternal', (url: string) => {
    if (/^https:\/\//i.test(url)) return shell.openExternal(url)
    return undefined
  })
}
