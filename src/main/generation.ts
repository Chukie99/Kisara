import { FlowVideoBatch } from './flowVideoBatch'
import { FlowImageBatch, type BatchImageRequest } from './flowImageBatch'
import { flowVideoPrompt } from '@shared/flow'
import { normalizeFlowVideo } from './services/generatedVideo'
import { channelCharacterBytes, channelCharacterKey, channelCharacterPrompt, channelStyleBytes, channelStyleKey, channelStylePrompt, sameReferenceImage } from './channelCharacter'
import { StopOnFailureBatch } from './serialBatch'
import { ensureLocalFlow } from './services/flowLocal'
import * as flow2api from './services/flow2api'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { estimateWordTimings } from '@shared/captions'
import { sceneCharacters } from '@shared/characters'
import { compactImagePrompt, imageFingerprint, imageNeedsRefresh } from '@shared/imagePrompts'
import { sceneSpans } from '@shared/flow'
import { defaultVoiceFor } from '@shared/models'
import { effectiveDelivery, pronunciationText, narrationSpeed, speechFingerprint, stripSpeakerLabels, stripVoiceTags } from '@shared/speech'
import { getImageModel, getVideoModel, imageBody, maxRefs, promptLimit, videoBody, type HfModel } from '@shared/higgsfield'
import { getStyle } from '@shared/styles'
import type { AspectRatio, Asset, Character, Clip, CreditEstimate, Job, Project, WordTiming } from '@shared/types'
import { getDb } from './db'
import { emit } from './events'
import { cancelJob, runJob, type TaskCtx } from './jobs'
import { assetAbsPath, dataDir } from './paths'
import {
  activeJobFor,
  charactersOf,
  clipsOf,
  getAsset,
  getCharacter,
  getClip,
  getJob,
  getProject,
  insertAsset,
  insertJob,
  patchClip,
  repairCharacterLinks,
  setCharacterSheet,
  touchProject,
  unfinishedJobs,
  updateAssetMeta,
  updateJob
} from './repo'
import { dropCache, getSettings, readCache, writeCache } from './settings'
import { probeDurationMs, probeSize } from './services/audio'
import * as cloudflare from './services/cloudflare'
import * as eleven from './services/elevenlabs'
import * as gemini from './services/gemini'
import * as hf from './services/higgsfield'
import * as huggingface from './services/huggingface'
import * as supertonic from './services/supertonic'
import * as f5 from './services/f5'
import * as f5Local from './services/f5Local'
import { downloadTo, sleep } from './services/http'
import { normalizeGeneratedImage, validateImageFile } from './imageQuality'

const DAY = 24 * 60 * 60 * 1000

function extFromType(contentType: string, url: string, fallback: string): string {
  if (/png/.test(contentType)) return '.png'
  if (/jpe?g/.test(contentType)) return '.jpg'
  if (/webp/.test(contentType)) return '.webp'
  if (/mp4/.test(contentType)) return '.mp4'
  const m = /\.(png|jpe?g|webp|mp4|mov)(\?|$)/i.exec(url)
  return m ? `.${m[1].toLowerCase()}` : fallback
}

function saveFile(projectId: string, folder: string, ext: string, bytes: Buffer): string {
  const rel = `${folder}/${randomUUID()}${ext}`
  const abs = assetAbsPath(projectId, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, bytes)
  return rel
}

/** A URL Higgsfield can fetch for a stored asset: its own recent result URL, or a fresh upload. */
async function publicUrlFor(asset: Asset, signal: AbortSignal): Promise<string> {
  if (asset.remoteUrl && asset.provider === 'higgsfield' && Date.now() - asset.createdAt < 6 * DAY) return asset.remoteUrl
  const up = asset.meta.uploadedUrl as string | undefined
  const at = asset.meta.uploadedAt as number | undefined
  if (up && at && Date.now() - at < 0.5 * DAY) return up
  const url = await hf.uploadFile(assetAbsPath(asset.projectId, asset.localPath), signal)
  updateAssetMeta(asset.id, { ...asset.meta, uploadedUrl: url, uploadedAt: Date.now() })
  return url
}

function imageProgress(ctx: TaskCtx, what: string) {
  return (status: hf.HfStatus, elapsed: number): void => {
    if (status === 'queued') ctx.progress(0.12, 'Mengantre di Higgsfield')
    else ctx.progress(0.15 + 0.75 * (1 - Math.exp(-elapsed / 45_000)), what)
  }
}

// ---------- prompts ----------

function characterLine(c: Character): string {
  return `${c.name}: ${c.description}`
}

/** Splits the storyboard's "Avoid:" line off the scene, so it can be phrased as a clear instruction. */
function splitAvoid(visual: string): { scene: string; avoid: string } {
  const lines = visual.split('\n')
  const i = lines.findIndex((l) => /^\s*avoid\s*:/i.test(l))
  if (i < 0) return { scene: visual.trim(), avoid: '' }
  const avoid = lines[i].replace(/^\s*avoid\s*:\s*/i, '').replace(/\.$/, '').trim()
  lines.splice(i, 1)
  return { scene: lines.join('\n').trim(), avoid }
}

/**
 * How long an image prompt may be. An SDXL-class model starts tiling the picture into a grid of panels as
 * soon as the prompt grows, so it gets a tight budget; a modern model (FLUX, Lumina, Sana) follows a much
 * longer, more detailed prompt and draws a scene that actually matches the story.
 */
const SDXL_PROMPT_LIMIT = 480
const MODERN_PROMPT_LIMIT = 1800

/** Model families that answer a long prompt by tiling the frame into panels. */
const SDXL_FAMILY = /playground|sdxl|turbo|realvis|juggernaut|dreamshaper|stable-diffusion/i

/**
 * Prompt budget for the configured free service, sized to the model that will actually draw the picture.
 * Cloudflare can run either SDXL or FLUX, and the Space walks a fallback chain, so the model is looked up
 * rather than assumed: a modern model follows a far longer, more detailed prompt than an SDXL one.
 */
async function freePromptLimit(provider: 'cloudflare' | 'huggingface'): Promise<number> {
  if (provider === 'cloudflare') return SDXL_FAMILY.test(getSettings().cloudflareModel) ? SDXL_PROMPT_LIMIT : MODERN_PROMPT_LIMIT
  const model = await huggingface.activeModelName()
  return !model || SDXL_FAMILY.test(model) ? SDXL_PROMPT_LIMIT : MODERN_PROMPT_LIMIT
}

/** Reference-capable models get the full plan; short prompts reserve identity, wardrobe and framing. */
function clipPrompt(project: Project, clip: Clip, chars: Character[], refNames: string[], limit: number, styleFirst = false, styleOverride = false): string {
  const style = getStyle(project.styleId)
  const { scene, avoid } = splitAvoid(clip.visualPrompt)
  // A text-only service gets the short version; the full plan makes it draw a collage of panels.
  if (styleFirst) return compactImagePrompt(project, clip, chars, limit)
  const wardrobe = /^\s*wardrobe\s*:/im.test(scene)
  const stylePart = styleOverride ? null : `Art style: ${style.prompt}`
  const scenePart = `Scene:\n${scene}`
  const charPart = chars.length
    ? `Recurring characters in this scene. Keep each one's body, face, hair and skin exactly as described${refNames.length ? ' and as on their reference sheet' : ''}.` +
      (wardrobe
        ? ' Their clothing follows the Wardrobe line of the scene: the default outfit only where it says so, otherwise the custom outfit.'
        : ' They wear their default outfit.') +
      `\n${chars.map(characterLine).join('\n')}`
    : null
  const refPart = refNames.length
    ? `Reference images are character sheets, in this order: ${refNames.join(', ')}. Use them for each character's identity, proportions and colors. ` +
      (wardrobe ? 'Copy the costume from a sheet only for characters whose Wardrobe line says "default outfit". ' : 'Match the costume to the sheet. ') +
      'Do not copy the sheet layout, poses or plain background.'
    : null
  const avoidPart = avoid ? `Must not appear in the image: ${avoid}.` : null
  const framePart = `Frame format ${project.aspectRatio}, full-bleed composition.`

  // SDXL and friends weight the start of a prompt far more than the end, so a text-only service is given the
  // style before the scene. Otherwise a long, detailed scene wins and the requested style is quietly ignored.
  const order = styleFirst
    ? [stylePart, scenePart, charPart, refPart, avoidPart, framePart]
    : [scenePart, charPart, refPart, stylePart, avoidPart, framePart]
  const full = order.filter(Boolean).join('\n\n')
  if (full.length <= limit) return full
  return styleOverride ? framePart + '\n\n' + full.slice(0, Math.max(0, limit - framePart.length - 2)) : compactImagePrompt(project, clip, chars, limit)
}

function sheetPrompt(project: Project, c: Character): string {
  const style = getStyle(project.styleId)
  return [
    style.prompt,
    `Character reference sheet for "${c.name}": ${c.description}. The character is ${style.characterHint}.`,
    'Show the SAME character three times side by side: front view, three-quarter view and side view, full body, neutral standing pose, evenly spaced, on a plain light neutral background (this overrides any background instruction above). Consistent proportions, costume and colors in all three views.'
  ].join('\n\n')
}

/**
 * One full-body portrait on a plain background. This is what a text-only service can actually draw, and it
 * is what the Colab notebook uses as an identity reference so the character keeps the same face in every
 * scene. The style goes first because those models weight the start of a prompt most.
 */
function portraitPrompt(project: Project, c: Character): string {
  const style = getStyle(project.styleId)
  return [
    `Art style: ${style.prompt}`,
    `Full-body portrait of "${c.name}": ${c.description}. The character is ${style.characterHint}.`,
    'The whole body is visible, standing straight and facing the camera, arms relaxed at the sides, alone in the frame.',
    'Plain flat light neutral background. No scenery, no props, no other people, even lighting, nothing cropped.'
  ].join('\n\n')
}

// ---------- waiting for character sheets ----------

async function waitForSheets(characterIds: string[], signal: AbortSignal): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < 15 * 60 * 1000) {
    const pending = characterIds.some((id) => activeJobFor({ characterId: id }, 'sheet'))
    if (!pending) return
    await sleep(2000, signal)
  }
}

async function referenceUrls(model: HfModel, chars: Character[], signal: AbortSignal): Promise<{ urls: string[]; names: string[] }> {
  const limit = maxRefs(model)
  if (limit === 0) return { urls: [], names: [] }
  await waitForSheets(
    chars.map((c) => c.id),
    signal
  )
  const urls: string[] = []
  const names: string[] = []
  for (const c of chars) {
    const fresh = getCharacter(c.id)
    const sheet = getAsset(fresh.sheetAssetId)
    if (!sheet || urls.length >= limit) continue
    urls.push(await publicUrlFor(sheet, signal))
    names.push(fresh.name)
  }
  return { urls, names }
}

// ---------- finishing a Higgsfield request (also used to resume after a restart) ----------

interface HfPayload {
  target: 'clip-image' | 'sheet' | 'clip-video'
  model: string
  prompt: string
  imageFingerprint?: string
  videoSource?: string
}

function videoSource(project: Project, clip: Clip): string {
  return JSON.stringify([clip.imageAssetId, clip.videoPrompt, project.aspectRatio, project.videoModel, project.videoResolution])
}

async function finishHiggsfield(ctx: TaskCtx, job: Job, requestId: string, payload: HfPayload): Promise<string> {
  const isVideo = payload.target === 'clip-video'
  const result = await hf.waitForResult(
    requestId,
    imageProgress(ctx, isVideo ? 'Membuat video' : payload.target === 'sheet' ? 'Membuat lembar karakter' : 'Membuat gambar'),
    ctx.signal,
    isVideo ? 30 * 60 * 1000 : 15 * 60 * 1000
  )
  const url = isVideo ? result.video?.url : result.images?.[0]?.url
  if (!url) throw new Error('Higgsfield selesai tanpa file hasil')
  ctx.progress(0.93, 'Mengunduh hasil')
  const downloaded = await downloadTo(url, ctx.signal)
  const bytes = isVideo ? downloaded.bytes : await normalizeGeneratedImage(downloaded.bytes)
  ctx.signal.throwIfAborted()
  const ext = isVideo ? extFromType(downloaded.contentType, url, '.mp4') : bytes[0] === 0xff && bytes[1] === 0xd8 ? '.jpg' : '.png'
  const rel = saveFile(job.projectId, isVideo ? 'videos' : 'images', ext, bytes)
  const abs = assetAbsPath(job.projectId, rel)
  const size = await probeSize(abs)
  const durationMs = isVideo ? await probeDurationMs(abs).catch(() => null) : null
  const asset = insertAsset({
    projectId: job.projectId,
    clipId: job.clipId,
    characterId: job.characterId,
    kind: isVideo ? 'video' : 'image',
    provider: 'higgsfield',
    model: payload.model,
    prompt: payload.prompt,
    remoteId: requestId,
    remoteUrl: url,
    localPath: rel,
    durationMs,
    width: size?.width ?? null,
    height: size?.height ?? null,
    meta: payload.imageFingerprint ? { imageFingerprint: payload.imageFingerprint } : {}
  })
  emit.asset(asset)
  if (job.clipId && (payload.imageFingerprint || payload.videoSource)) {
    const current = getClip(job.clipId), project = getProject(job.projectId)
    if ((payload.imageFingerprint && payload.imageFingerprint !== imageFingerprint(project, current, sceneCharacters(current, charactersOf(job.projectId)))) || (payload.videoSource && payload.videoSource !== videoSource(project, current)))
      throw new Error('Adegan berubah saat Higgsfield bekerja. Hasil disimpan di riwayat dan belum dipasang.')
  }
  if (payload.target === 'sheet' && job.characterId) {
    setCharacterSheet(job.characterId, asset.id)
    emit.character({ characterId: job.characterId, patch: { sheetAssetId: asset.id } })
  } else if (payload.target === 'clip-image' && job.clipId) {
    patchClip(job.clipId, { imageAssetId: asset.id })
    emit.clip({ clipId: job.clipId, patch: { imageAssetId: asset.id } })
    const project = getProject(job.projectId)
    const first = clipsOf(job.projectId)[0]
    if (!project.coverAssetId || first?.id === job.clipId) touchProject(job.projectId, { coverAssetId: asset.id })
  } else if (payload.target === 'clip-video' && job.clipId) {
    const patch = { videoAssetId: asset.id, motionType: 'video' as const, mediaInMs: 0 }
    patchClip(job.clipId, patch)
    emit.clip({ clipId: job.clipId, patch })
  }
  touchProject(job.projectId)
  return asset.id
}

function startHiggsfield(job: Job, build: (ctx: TaskCtx) => Promise<{ endpoint: string; body: Record<string, unknown>; payload: HfPayload }>): Job {
  emit.job(job)
  return runJob(job, 'higgsfield', async (ctx) => {
    ctx.progress(0.04, 'Menyiapkan prompt')
    const { endpoint, body, payload } = await build(ctx)
    ctx.progress(0.08, 'Mengirim ke Higgsfield')
    const requestId = await hf.submit(endpoint, body, ctx.signal)
    ctx.setRemote(requestId)
    updateJobPayload(job.id, payload)
    return finishHiggsfield(ctx, job, requestId, payload)
  })
}

function updateJobPayload(jobId: string, payload: HfPayload): void {
  getDb().prepare('UPDATE jobs SET payload_json = ? WHERE id = ?').run(JSON.stringify(payload), jobId)
}

// ---------- public entry points ----------

export function generateClipImage(clipId: string): Job {
  if (getSettings().imageProvider === 'flow2api') return generateFlowMedia(clipId, 'image')
  const existing = activeJobFor({ clipId }, 'image')
  if (existing) return existing
  const remote = freeImageDraw()
  if (remote) return generateClipImageRemote(clipId, remote.provider, remote.model, remote.draw)
  const clip = getClip(clipId)
  const job = insertJob({ projectId: clip.projectId, clipId, kind: 'image', provider: 'higgsfield' })
  return startHiggsfield(job, async (ctx) => {
    const fresh = getClip(clipId)
    const project = getProject(fresh.projectId)
    const model = getImageModel(project.imageModel)
    const chars = sceneCharacters(fresh, charactersOf(project.id))
    const refs = await referenceUrls(model, chars, ctx.signal)
    const prompt = clipPrompt(project, fresh, chars, refs.names, promptLimit(model))
    return {
      endpoint: model.id,
      body: imageBody(model, prompt, project.aspectRatio, refs.urls),
      payload: { target: 'clip-image', model: model.id, prompt, imageFingerprint: imageFingerprint(project, fresh, chars) }
    }
  })
}

type Draw = (prompt: string, aspect: AspectRatio, signal: AbortSignal) => Promise<Buffer>

/**
 * The Cloudflare draw, with the fallback the Flux content filter needs: those models misfire on plainly
 * innocent prompts, so a refusal is retried on the model whose filter does not.
 */
function cloudflareDraw(): { model: string; draw: Draw } {
  const model = getSettings().cloudflareModel
  return {
    model,
    draw: async (prompt, aspect, signal) => {
      try {
        return await cloudflare.generateImage(prompt, aspect, model, signal)
      } catch (e) {
        if (!cloudflare.isNsfwError(e) || model === cloudflare.NSFW_SAFE_MODEL) throw e
        return await cloudflare.generateImage(prompt, aspect, cloudflare.NSFW_SAFE_MODEL, signal)
      }
    }
  }
}

/** The draw used by a free, text-only image service, or null while Higgsfield is the configured provider. */
function freeImageDraw(): { provider: 'cloudflare' | 'huggingface'; model: string | null; draw: Draw } | null {
  const provider = getSettings().imageProvider
  if (provider === 'cloudflare') {
    const { model, draw } = cloudflareDraw()
    return { provider, model, draw }
  }
  if (provider === 'huggingface')
    return {
      provider,
      model: getSettings().hfSpace || null,
      draw: (prompt, aspect, signal) => huggingface.generateImage(prompt, aspect, signal)
    }
  return null
}

/**
 * Draws one character's portrait with a free, text-only service. The portrait is what the Colab notebook uses
 * as an identity reference, which is how the same character keeps their face in every scene.
 */
function generateCharacterPortrait(characterId: string, provider: 'cloudflare' | 'huggingface', model: string | null, draw: Draw): Job {
  const c = getCharacter(characterId)
  const job = insertJob({ projectId: c.projectId, characterId, kind: 'sheet', provider })
  emit.job(job)
  return runJob(job, provider === 'huggingface' ? 'huggingface' : 'higgsfield', async (ctx) => {
    const fresh = getCharacter(characterId)
    const project = getProject(fresh.projectId)
    ctx.progress(0.15, 'Menyiapkan prompt potret')
    const prompt = portraitPrompt(project, fresh)
    ctx.progress(0.3, 'Meminta potret')
    const bytes = await normalizeGeneratedImage(await draw(prompt, '9:16', ctx.signal))
    ctx.signal.throwIfAborted()
    ctx.progress(0.88, 'Menyimpan potret')
    const ext = bytes[0] === 0xff && bytes[1] === 0xd8 ? '.jpg' : '.png'
    const rel = saveFile(project.id, 'images', ext, bytes)
    const size = await probeSize(assetAbsPath(project.id, rel)).catch(() => null)
    const asset = insertAsset({
      projectId: project.id,
      characterId,
      kind: 'image',
      provider,
      model,
      prompt,
      localPath: rel,
      width: size?.width ?? null,
      height: size?.height ?? null
    })
    emit.asset(asset)
    setCharacterSheet(characterId, asset.id)
    emit.character({ characterId, patch: { sheetAssetId: asset.id } })
    touchProject(project.id)
    return asset.id
  })
}

/**
 * Draws one clip image with a text-only service (Cloudflare or a Hugging Face Space): a single request that
 * returns the picture, so it skips the submit-and-poll path Higgsfield needs. Neither service accepts
 * reference images, so no character sheets are sent.
 */
function generateClipImageRemote(clipId: string, provider: 'cloudflare' | 'huggingface', model: string | null, draw: Draw): Job {
  const clip = getClip(clipId)
  const job = insertJob({ projectId: clip.projectId, clipId, kind: 'image', provider })
  emit.job(job)
  return runJob(job, provider === 'huggingface' ? 'huggingface' : 'higgsfield', async (ctx) => {
    const fresh = getClip(clipId)
    const project = getProject(fresh.projectId)
    const chars = sceneCharacters(fresh, charactersOf(project.id))
    ctx.progress(0.12, 'Menyiapkan prompt')
    // The service may be running anything from SDXL to FLUX; the prompt budget follows the real model.
    const limit = await freePromptLimit(provider)
    const prompt = clipPrompt(project, fresh, chars, [], limit, true)
    const fingerprint = imageFingerprint(project, fresh, chars)
    ctx.progress(0.3, 'Meminta gambar')
    const bytes = await normalizeGeneratedImage(await draw(prompt, project.aspectRatio, ctx.signal))
    ctx.signal.throwIfAborted()
    ctx.progress(0.88, 'Menyimpan gambar')
    const ext = bytes[0] === 0xff && bytes[1] === 0xd8 ? '.jpg' : '.png'
    const rel = saveFile(project.id, 'images', ext, bytes)
    const size = await probeSize(assetAbsPath(project.id, rel)).catch(() => null)
    const asset = insertAsset({
      projectId: project.id,
      clipId,
      kind: 'image',
      provider,
      model,
      prompt,
      meta: { imageFingerprint: fingerprint },
      localPath: rel,
      width: size?.width ?? null,
      height: size?.height ?? null
    })
    emit.asset(asset)
    patchClip(clipId, { imageAssetId: asset.id })
    emit.clip({ clipId, patch: { imageAssetId: asset.id } })
    const first = clipsOf(project.id)[0]
    if (!project.coverAssetId || first?.id === clipId) touchProject(project.id, { coverAssetId: asset.id })
    touchProject(project.id)
    return asset.id
  })
}

function prepareFlowBatchImage(id:string):BatchImageRequest {
  const clip=getClip(id),project=getProject(clip.projectId),chars=sceneCharacters(clip,charactersOf(project.id))
  const identity=channelCharacterBytes(),style=channelStyleBytes(project.styleId),primary:Buffer[]=identity?[identity]:[]
  let styleNumber=0
  if(style){if(identity&&sameReferenceImage(identity,style))styleNumber=1;else{primary.push(style);styleNumber=primary.length}}
  const assets=chars.map(c=>getAsset(c.sheetAssetId)).filter((a):a is Asset=>!!a).slice(0,3-primary.length)
  const references:Buffer[]=[]
  for(const bytes of [...primary,...assets.map(a=>readFileSync(assetAbsPath(project.id,a.localPath)))]){
    if(!references.some(existing=>sameReferenceImage(existing,bytes))) references.push(bytes)
  }
  if(references.some(b=>b.length>20*1024*1024))throw new Error('Gambar referensi Flow terlalu besar (maksimal 20 MB).')
  return {id,aspect:project.aspectRatio,references,prompt:channelCharacterPrompt()+channelStylePrompt(styleNumber, project.styleId)+clipPrompt(project,clip,chars,chars.filter(c=>assets.some(a=>a.id===c.sheetAssetId)).map(c=>c.name),4000,false,!!style),fingerprint:imageFingerprint(project,clip,chars),identityKey:JSON.stringify([channelCharacterKey(),channelStyleKey(project.styleId)])}
}

/** Images remain serial; bulk browser video leases independent accounts without sharing references. */
function generateFlowMedia(id: string, kind: 'image'|'sheet'|'video', batch?: { gate: StopOnFailureBatch; settingsKey: string; parallel?: FlowImageBatch; videos?: FlowVideoBatch }, recover = false): Job {
  const target = kind === 'sheet' ? {characterId:id} : {clipId:id}
  const active = activeJobFor(target, kind)
  if (active) return active
  const projectId = kind === 'sheet' ? getCharacter(id).projectId : getClip(id).projectId
  const job = insertJob({projectId,...target,kind,provider:'flow2api'})
  emit.job(job)
  return runJob(job,batch?.videos?'flow-video':'flow2api',async ctx=>{
    const execute = async (account?: number): Promise<string> => {
    const project = getProject(projectId), settings = getSettings()
    if (batch && batch.settingsKey !== flowBatchSettings(project)) throw new Error('Pengaturan akun atau rasio berubah saat antrean berjalan. Antrean dihentikan; mulai lagi untuk gambar yang belum siap.')
    const clip = kind === 'sheet' ? null : getClip(id)
    const character = kind === 'sheet' ? getCharacter(id) : null
    const chars = clip ? sceneCharacters(clip, charactersOf(projectId)) : []
    const refs = kind === 'video' ? [getAsset(clip!.imageAssetId)] : chars.map(c=>getAsset(c.sheetAssetId)).filter(Boolean).slice(0,3)
    if (kind === 'video' && !refs[0]) throw new Error('Buat gambar adegan dulu sebelum membuat video Flow.')
    let identityKey = kind === 'image' ? JSON.stringify([channelCharacterKey(), channelStyleKey(project.styleId)]) : ''
    const identity = kind === 'image' ? channelCharacterBytes() : null
    const style = kind === 'image' || kind === 'sheet' && project.styleId.startsWith('custom:') ? channelStyleBytes(project.styleId) : null
    const primary: Buffer[] = identity ? [identity] : []
    let styleNumber = 0
    if (style) {
      if (identity && sameReferenceImage(identity, style)) styleNumber = 1
      else { primary.push(style); styleNumber = primary.length }
    }
    refs.splice(3 - primary.length)
    let images: Buffer[] = [...primary, ...refs.filter((a):a is Asset=>!!a).map(a=>readFileSync(assetAbsPath(projectId,a.localPath)))]
    if (images.some(b=>b.length>20*1024*1024)) throw new Error('Gambar referensi Flow terlalu besar (maksimal 20 MB).')
    let prompt = kind === 'sheet' ? (project.styleId.startsWith('custom:') ? channelStylePrompt(styleNumber, project.styleId) : '') + sheetPrompt(project,character!) : kind === 'image' ? channelCharacterPrompt() + channelStylePrompt(styleNumber, project.styleId) + clipPrompt(project,clip!,chars,chars.filter(c=>refs.some(a=>a?.id===c.sheetAssetId)).map(c=>c.name),4000,false,!!style) : flowVideoPrompt(clip!)
    let fingerprint = clip ? imageFingerprint(project,clip,chars) : ''
    if(batch?.parallel&&kind==='image'){const request=batch.parallel.request(id);images=request.references;prompt=request.prompt;fingerprint=request.fingerprint;identityKey=request.identityKey}
    ctx.progress(.2,recover?'Mengambil video yang sudah jadi di Flow…':settings.flowImageTransport==='browser'?(kind==='video'?'Menganimasikan gambar melalui Flow di Chrome…':'Membuat gambar melalui halaman Flow di Chrome…'):kind==='video'?'Flow sedang membuat gerak dari gambar awal…':'Flow sedang membuat gambar. Akun dipilih oleh backend lokal…')
    await ensureLocalFlow(settings.flowBaseUrl)
    ctx.signal.throwIfAborted()
    const raw = account ? await flow2api.generateAccountVideo(account,prompt,project.aspectRatio,images,ctx.signal) : batch?.parallel&&kind==='image' ? await batch.parallel.image(id,ctx.signal) : recover ? await flow2api.recoverVideo(ctx.signal) : await flow2api.generate(kind==='video'?'video':'image',prompt,project.aspectRatio,images,ctx.signal)
    const bytes = kind==='video'?await normalizeFlowVideo(raw,ctx.signal):await normalizeGeneratedImage(raw)
    ctx.signal.throwIfAborted()
    ctx.progress(.88,'Memeriksa dan menyimpan hasil Flow…')
    const rel = saveFile(projectId,kind==='video'?'video':'images',kind==='video'?'.mp4':bytes[0]===0xff?'.jpg':'.png',bytes)
    const abs = assetAbsPath(projectId,rel), size=await probeSize(abs)
    const durationMs=kind==='video'?await probeDurationMs(abs):null
    if(kind==='video' && (!durationMs || durationMs<100))throw new Error('Video Flow tidak berisi durasi yang valid.')
    const asset=insertAsset({projectId,...target,kind:kind==='video'?'video':'image',provider:'flow2api',model:settings.flowImageTransport==='browser'?(kind==='video'?(settings.flowVideoInputMode==='frames'?'flow-browser-start-frame':'flow-browser-image-to-video'):'flow-browser-nano-banana-2.1'):flow2api.modelForAspect(kind==='video'?settings.flowVideoModel:settings.flowImageModel,project.aspectRatio),prompt,localPath:rel,width:size?.width??null,height:size?.height??null,durationMs,meta:clip?{imageFingerprint:fingerprint,channelCharacterKey:identityKey}:{}})
    emit.asset(asset)
    if (kind==='sheet') {
      if (sheetPrompt(getProject(projectId),getCharacter(id))!==prompt) throw new Error('Pemeran atau gaya berubah saat Flow bekerja. Hasil disimpan di riwayat.')
      setCharacterSheet(id,asset.id);emit.character({characterId:id,patch:{sheetAssetId:asset.id}})
    } else {
      const current=getClip(id)
      if (kind === 'image' && JSON.stringify([channelCharacterKey(), channelStyleKey(project.styleId)]) !== identityKey) throw new Error('Karakter atau gaya visual berubah saat Flow bekerja. Hasil disimpan di riwayat dan belum dipasang.')
      if (imageFingerprint(getProject(projectId),current,sceneCharacters(current,charactersOf(projectId)))!==fingerprint || (kind==='video'&&(current.imageAssetId!==clip!.imageAssetId||current.videoPrompt!==clip!.videoPrompt)))throw new Error('Adegan berubah saat Flow bekerja. Hasil disimpan di riwayat dan belum dipasang.')
      const patch=kind==='image'?{imageAssetId:asset.id}:{videoAssetId:asset.id,motionType:'video' as const,mediaInMs:0}
      patchClip(id,patch);emit.clip({clipId:id,patch})
      if(kind==='image'&&(!project.coverAssetId||clipsOf(projectId)[0]?.id===id))touchProject(projectId,{coverAssetId:asset.id})
    }
    touchProject(projectId)
    return asset.id
    }
    if(batch?.videos)return batch.videos.run(ctx.signal,()=>cancelJob(ctx.jobId),execute)
    if(batch?.parallel){if(!batch.parallel.canDrain(id)){await cancelJob(ctx.jobId);ctx.signal.throwIfAborted()}try{return await execute()}catch(error){batch.parallel.stop();throw error}}
    return batch ? batch.gate.run(ctx.signal, () => cancelJob(ctx.jobId), execute) : execute()
  })
}

export function recoverFlowVideo(clipId: string): Job { return generateFlowMedia(clipId, 'video', undefined, true) }

export function generateCharacterSheet(characterId: string): Job {
  if (getSettings().imageProvider === 'flow2api') return generateFlowMedia(characterId, 'sheet')
  const existing = activeJobFor({ characterId }, 'sheet')
  if (existing) return existing
  // A free service cannot take reference images, so it draws a plain portrait instead. That portrait is the
  // identity reference the Colab notebook uses, which is how the same face survives across scenes.
  const remote = freeImageDraw()
  if (remote) return generateCharacterPortrait(characterId, remote.provider, remote.model, remote.draw)
  const c = getCharacter(characterId)
  const job = insertJob({ projectId: c.projectId, characterId, kind: 'sheet', provider: 'higgsfield' })
  return startHiggsfield(job, async () => {
    const project = getProject(c.projectId)
    const model = getImageModel(project.imageModel)
    const prompt = sheetPrompt(project, getCharacter(characterId))
    return {
      endpoint: model.id,
      body: imageBody(model, prompt, '16:9', []),
      payload: { target: 'sheet', model: model.id, prompt }
    }
  })
}

export function generateClipVideo(clipId: string): Job {
  if (getSettings().imageProvider === 'flow2api') return generateFlowMedia(clipId, 'video')
  const existing = activeJobFor({ clipId }, 'video')
  if (existing) return existing
  const clip = getClip(clipId)
  if (!clip.imageAssetId) throw new Error('Buat gambar klip ini dulu sebelum membuat video AI.')
  const job = insertJob({ projectId: clip.projectId, clipId, kind: 'video', provider: 'higgsfield' })
  return startHiggsfield(job, async (ctx) => {
    const fresh = getClip(clipId)
    const image = getAsset(fresh.imageAssetId)
    if (!image) throw new Error('Gambar klip tidak ditemukan')
    const project = getProject(fresh.projectId)
    const model = getVideoModel(project.videoModel)
    ctx.progress(0.05, 'Menyiapkan gambar awal')
    const url = await publicUrlFor(image, ctx.signal)
    let prompt = flowVideoPrompt(fresh)
    if (model.input.mode === 'reference')
      prompt = `Open on the exact scene of the reference image and keep its art style, characters and composition. ${prompt}`
    return {
      endpoint: model.id,
      body: videoBody(model, prompt, url, fresh.durationMs / 1000, project.aspectRatio, project.videoResolution),
      payload: { target: 'clip-video', model: model.id, prompt, videoSource: videoSource(project, fresh) }
    }
  })
}

export function generateClipTts(clipId: string): Job {
  const existing = activeJobFor({ clipId }, 'tts')
  if (existing) return existing
  const clip = getClip(clipId)
  const project = getProject(clip.projectId)
  const job = insertJob({ projectId: clip.projectId, clipId, kind: 'tts', provider: project.ttsProvider })
  emit.job(job)
  return runJob(job, project.ttsProvider === 'f5-local' ? 'f5-local' : project.ttsProvider === 'f5-hf' ? 'huggingface' : 'tts', async (ctx) => {
    const fresh = getClip(clipId)
    const p = getProject(fresh.projectId)
    if (p.ttsProvider !== project.ttsProvider || p.ttsVoice !== project.ttsVoice) throw new Error('Pilihan suara berubah saat menunggu antrean. Coba lagi dengan pilihan terbaru.')
    const sourceText = fresh.narration.trim()
    const text = pronunciationText(stripSpeakerLabels(sourceText, charactersOf(p.id).map(c => c.name)), p.language)
    if (!text) throw new Error('Naskah klip ini masih kosong')
    ctx.progress(0.2, 'Membuat suara')
    let rel: string
    let words: WordTiming[] | undefined
    let estimated = false
    const voice = p.ttsVoice || defaultVoiceFor(p.ttsProvider)
    if (p.ttsProvider === 'elevenlabs') {
      if (!voice) throw new Error('Pilih suara ElevenLabs dulu di langkah Ide cerita.')
      const out = await eleven.speak(text, voice, p.language, ctx.signal, undefined, effectiveDelivery(p))
      rel = saveFile(p.id, 'audio', '.mp3', out.audio)
      words = out.words
    } else if (p.ttsProvider === 'supertonic' || p.ttsProvider === 'f5-hf' || p.ttsProvider === 'f5-local') {
      const take = join(dataDir(), 'tmp', `tts-${randomUUID()}.wav`)
      mkdirSync(dirname(take), { recursive: true })
      try {
        if (p.ttsProvider === 'f5-local') await f5Local.speak(text, voice, p.editor.narrationSpeed, take, ctx.signal, (message) => ctx.progress(0.2, message))
        else if (p.ttsProvider === 'f5-hf') await f5.speak(text, voice, take, ctx.signal)
        else await supertonic.speak(text, voice, getSettings().supertonicPreset, take, ctx.signal, narrationSpeed(p.editor.narrationSpeed))
        rel = saveFile(p.id, 'audio', '.wav', readFileSync(take))
      } finally {
        rmSync(take, { force: true })
      }
    } else {
      const wav = await gemini.speak(text, voice, p.language, ctx.signal, effectiveDelivery(p))
      rel = saveFile(p.id, 'audio', '.wav', wav)
    }
    ctx.progress(0.85, 'Mengukur durasi')
    const audioMs = await probeDurationMs(assetAbsPath(p.id, rel))
    if (!words?.length) {
      words = estimateWordTimings(stripVoiceTags(text), audioMs / 1000)
      estimated = true
    }
    if (p.ttsProvider === 'f5-hf' && (getProject(p.id).ttsVoice !== voice || getProject(p.id).ttsProvider !== 'f5-hf' || getSettings().f5VoiceId !== voice || getClip(clipId).narration.trim() !== sourceText))
      throw new Error('Naskah atau referensi F5 berubah saat suara dibuat. Hasil belum diterapkan; coba lagi.')
    ctx.signal.throwIfAborted()
    if (speechFingerprint(getProject(p.id)) !== speechFingerprint(p) || getClip(clipId).narration.trim() !== sourceText)
      throw new Error('Naskah, suara atau tempo berubah saat narasi dibuat. Hasil belum diterapkan; coba lagi.')
    const asset = insertAsset({
      projectId: p.id,
      clipId,
      kind: 'audio',
      provider: p.ttsProvider,
      model: p.ttsProvider === 'gemini' ? getSettings().geminiTtsModel : p.ttsProvider === 'supertonic' ? 'supertonic-3' : p.ttsProvider === 'f5-local' ? 'F5 Indonesia lokal' : p.ttsProvider === 'f5-hf' ? `F5-TTS · ${getSettings().f5Space}` : getSettings().elevenModel,
      prompt: sourceText,
      localPath: rel,
      durationMs: audioMs,
      meta: { spokenText: text, words, estimatedTimings: estimated, voice, speechFingerprint: speechFingerprint(p) }
    })
    emit.asset(asset)
    const durationMs = Math.max(1500, audioMs + 400)
    const patch = { audioAssetId: asset.id, durationMs, voiceInMs: 0, voiceOutMs: null, voiceStartMs: 0 }
    patchClip(clipId, patch)
    emit.clip({ clipId, patch })
    touchProject(p.id)
    return asset.id
  })
}

/**
 * The exact prompt the app would send for every clip, so the pictures can be made somewhere else (a Colab
 * notebook, another image service) and imported back with "Impor gambar".
 */
export function clipPrompts(projectId: string) {
  const project = getProject(projectId)
  const chars = charactersOf(projectId)
  const clips = clipsOf(projectId)
  const spans = sceneSpans(clips)
  return clips.map((clip, i) => {
    const inScene = sceneCharacters(clip, chars)
    // No reference sheets are sent: whoever draws these has only the text and the portraits to go on.
    return { ...spans[i], narration: stripVoiceTags(clip.narration), characters: inScene.map((c) => c.name), prompt: clipPrompt(project, clip, inScene, [], 2000, true) }
  })
}

/** A character's portrait as a data URI, so a single JSON file carries everything a notebook needs. */
function portraitDataUrl(projectId: string, assetId: string | null): string | null {
  if (!assetId) return null
  const asset = getAsset(assetId)
  if (!asset) return null
  try {
    const bytes = readFileSync(assetAbsPath(projectId, asset.localPath))
    return `data:${asset.localPath.toLowerCase().endsWith('.jpg') ? 'image/jpeg' : 'image/png'};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

export interface StoryExport {
  project: string
  aspect: AspectRatio
  /** Every character seen on screen, with the portrait a notebook uses to keep their face consistent. */
  characters: { name: string; description: string; portrait: string | null }[]
  images: ReturnType<typeof clipPrompts>
}

/** Everything a Colab notebook needs in one file: the prompts, plus a portrait for each character. */
export function storyExport(projectId: string): StoryExport {
  repairCharacterLinks(projectId)
  const project = getProject(projectId)
  const used = new Set(clipsOf(projectId).flatMap((c) => c.characterIds))
  return {
    project: project.title,
    aspect: project.aspectRatio,
    characters: charactersOf(projectId)
      .filter((c) => used.has(c.id))
      .map((c) => ({ name: c.name, description: c.description, portrait: portraitDataUrl(projectId, c.sheetAssetId) })),
    images: clipPrompts(projectId)
  }
}

/**
 * Draws the pictures the project still needs. With `mode: 'all'` every picture is drawn again, which is what
 * the user wants after changing the art style.
 */
function flowBatchSettings(project: Project): string {
  const settings = getSettings()
  return JSON.stringify([settings.imageProvider, settings.flowImageTransport, settings.flowBaseUrl, settings.flowBrowserAccountId, project.aspectRatio, channelCharacterKey(), channelStyleKey(project.styleId)])
}

export function generateMissingImages(projectId: string, mode: 'missing' | 'all' = 'missing'): Job[] {
  repairCharacterLinks(projectId)
  const jobs: Job[] = []
  const project = getProject(projectId)
  const settings = getSettings()
  if (settings.imageProvider === 'flow2api' && settings.flowImageTransport === 'browser') {
    if (!['16:9','9:16'].includes(project.aspectRatio)) throw new Error('Pilih rasio proyek 16:9 atau 9:16 sebelum membuat gambar Flow.')
    if (unfinishedJobs().some(j => j.project_id === projectId && j.provider === 'flow2api')) throw new Error('Tunggu atau hentikan antrean Flow yang masih berjalan sebelum memulai lagi.')
    const characters = charactersOf(projectId)
    const pending = clipsOf(projectId).filter(clip => {
      const asset = getAsset(clip.imageAssetId)
      if (mode === 'all' || imageNeedsRefresh(asset, project, clip, sceneCharacters(clip, characters))) return true
      try { if (asset) validateImageFile(assetAbsPath(projectId, asset.localPath)); return false } catch { return true }
    })
    const usedAccounts:number[]=[]
    const parallel=new FlowImageBatch(pending.map(c=>c.id),prepareFlowBatchImage,(requests,signal)=>flow2api.generateImageBatch(requests,signal,usedAccounts))
    const batch = { gate: new StopOnFailureBatch(), settingsKey: flowBatchSettings(project), parallel }
    return pending.map(clip => generateFlowMedia(clip.id, 'image', batch))
  }
  const model = getImageModel(project.imageModel)
  // Higgsfield needs a 3-view sheet for its reference images; a free service draws a plain portrait, which is
  // the identity reference the Colab notebook uses. Either way every character seen on screen gets one.
  if (getSettings().imageProvider !== 'higgsfield' || maxRefs(model) > 0) {
    const needed = new Set(clipsOf(projectId).flatMap((c) => c.characterIds))
    for (const c of charactersOf(projectId)) {
      if (needed.has(c.id) && (mode === 'all' || !c.sheetAssetId)) jobs.push(generateCharacterSheet(c.id))
    }
  }
  for (const clip of clipsOf(projectId)) {
    const asset = getAsset(clip.imageAssetId)
    let invalid = imageNeedsRefresh(asset, project, clip, sceneCharacters(clip, charactersOf(projectId)))
    if (asset) {
      try { validateImageFile(assetAbsPath(projectId, asset.localPath)) } catch { invalid = true }
    }
    if (mode === 'all' || invalid) jobs.push(generateClipImage(clip.id))
  }
  return jobs
}

/** Turns every clip that has an image but no AI video yet into a video. */
export async function generateMissingVideos(projectId: string): Promise<Job[]> {
  const clips = clipsOf(projectId)
  if (clips.some((c) => !c.imageAssetId)) throw new Error('Buat gambar semua klip dulu sebelum menjadikannya video.')
  if (getSettings().imageProvider === 'flow2api') {
    const settingsKey = flowBatchSettings(getProject(projectId))
    const accounts = await flow2api.parallelVideoAccounts()
    if (settingsKey !== flowBatchSettings(getProject(projectId))) throw new Error('Pengaturan Flow berubah saat memeriksa akun. Mulai lagi; video belum dikirim.')
    const batch = { gate: new StopOnFailureBatch(), settingsKey, videos: accounts.length ? new FlowVideoBatch(accounts) : undefined }
    return clips.filter(c => !c.videoAssetId).map(c => generateFlowMedia(c.id, 'video', batch))
  }
  return clips.filter((c) => !c.videoAssetId).map((c) => generateClipVideo(c.id))
}

export function generateMissingTts(projectId: string): Job[] {
  return clipsOf(projectId)
    .filter((c) => !c.audioAssetId && c.narration.trim())
    .map((c) => generateClipTts(c.id))
}

/** After a restart, keep polling Higgsfield requests that were already submitted; fail the rest. */
export function resumeJobs(): void {
  for (const row of unfinishedJobs()) {
    const payload = JSON.parse(row.payload_json || '{}') as Partial<HfPayload>
    if (row.provider === 'higgsfield' && row.remote_id && payload.target) {
      const job = getJob(row.id)!
      runJob(job, 'higgsfield', (ctx) => finishHiggsfield(ctx, job, row.remote_id, payload as HfPayload))
    } else {
      emit.job(updateJob(row.id, { status: 'failed', error: 'Terhenti karena aplikasi ditutup. Coba lagi.', message: null }))
    }
  }
}

export async function setActiveAsset(clipId: string, assetId: string): Promise<void> {
  const asset = getAsset(assetId)
  if (!asset || asset.clipId !== clipId) throw new Error('Aset tidak cocok dengan klip ini')
  if (asset.kind === 'image') validateImageFile(assetAbsPath(asset.projectId, asset.localPath))
  const patch: Partial<Clip> =
    asset.kind === 'image'
      ? { imageAssetId: asset.id }
      : asset.kind === 'video'
        ? { videoAssetId: asset.id, mediaInMs: 0 }
        : asset.kind === 'audio'
          ? { audioAssetId: asset.id, durationMs: Math.max(1500, (asset.durationMs ?? 0) + 400), voiceInMs: 0, voiceOutMs: null, voiceStartMs: 0 }
          : {}
  patchClip(clipId, patch)
  emit.clip({ clipId, patch })
}

/** Estimates that failed recently (no key, or a model the account cannot use), so pickers do not keep asking. */
const failedEstimates = new Map<string, number>()

/**
 * Credits for one image, or one clip video of about `seconds`. The model pickers ask for every model,
 * so answers are kept for a day and failures for ten minutes.
 */
export async function estimateCredits(
  kind: 'image' | 'video',
  modelId: string,
  aspect: AspectRatio,
  seconds = 5,
  resolution?: string | null
): Promise<CreditEstimate | null> {
  // Only Higgsfield bills in credits; the other image services are free.
  if (getSettings().imageProvider === 'flow2api' || (kind === 'image' && getSettings().imageProvider !== 'higgsfield')) return null
  const model = kind === 'image' ? getImageModel(modelId) : getVideoModel(modelId)
  const body =
    kind === 'image'
      ? imageBody(model, 'estimate', aspect, [])
      : videoBody(model, 'estimate', 'https://example.com/frame.png', seconds, aspect, resolution)
  const key = `estimate:${model.id}:${JSON.stringify(body)}`
  const hit = readCache<CreditEstimate>(key)
  if (hit && Date.now() - hit.updatedAt < DAY) return hit.value
  const failedAt = failedEstimates.get(key)
  if (failedAt && Date.now() - failedAt < 10 * 60 * 1000) return null
  const value = await hf.estimate(model.id, body)
  if (value) writeCache(key, value)
  else failedEstimates.set(key, Date.now())
  return value
}

/** Prices can differ per account, so a new Higgsfield key starts from fresh estimates. */
export function forgetEstimates(): void {
  failedEstimates.clear()
  dropCache('estimate:')
}
