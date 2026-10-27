import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { WHISPER_TIMING, captionNeedsSync, estimateWordTimings } from '@shared/captions'
import { TTS_WORDS_PER_SECOND, defaultVoiceFor } from '@shared/models'
import { estimateNarrationMs } from '@shared/script'
import { narrationNeedsRefresh, narrationSpeed, speechFingerprint, spokenWords, stripVoiceTags } from '@shared/speech'
import type { Clip, Job, Project, WordTiming } from '@shared/types'
import { emit } from './events'
import { runJob, type TaskCtx } from './jobs'
import { assetAbsPath, binPath, dataDir } from './paths'
import {
  activeProjectJob,
  clipsOf,
  getAsset,
  getClip,
  getProject,
  insertAsset,
  insertJob,
  patchClip,
  touchProject,
  updateAssetMeta
} from './repo'
import { getSettings } from './settings'
import { chooseCuts, cutsFromWords } from './cuts'
import { probeDurationMs } from './services/audio'
import * as eleven from './services/elevenlabs'
import * as gemini from './services/gemini'
import * as supertonic from './services/supertonic'
import * as f5Local from './services/f5Local'
import * as f5 from './services/f5'
import { timeScript, whisperReady } from './whisper'
import { ensureSoundEffects } from './soundEffects'

/**
 * Voices many scenes in one continuous take and cuts it per scene. A single take keeps the voice, pace and
 * intonation consistent, which separate requests per scene do not. Long scripts are voiced in parts of a
 * few minutes each.
 */

const GEMINI_PART_SEC = 240
const ELEVEN_PART_CHARS = 2400

/** Which model name to record on a voice asset, for the editor's history. */
function ttsModel(provider: Project['ttsProvider']): string {
  const s = getSettings()
  if (provider === 'gemini') return s.geminiTtsModel
  if (provider === 'supertonic') return 'supertonic-3'
  if (provider === 'f5-hf') return `F5-TTS · ${s.f5Space}/${s.f5Endpoint}`
  if (provider === 'f5-local') return `F5 Indonesia lokal · ${s.f5LocalUrl}`
  return s.elevenModel
}

interface Segment {
  clip: Clip
  file: string
  durationMs: number
  words: WordTiming[]
  estimated: boolean
  timedBy?: string
}

function ffmpeg(args: string[], signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = execFile(binPath(ffmpegStatic!), ['-hide_banner', '-nostats', ...args], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (err, _out, stderr) => {
      if (signal.aborted) return reject(new Error('Dibatalkan'))
      if (err) return reject(new Error(`FFmpeg gagal: ${String(stderr).split('\n').slice(-4).join(' ').trim()}`))
      resolve(String(stderr))
    })
    signal.addEventListener('abort', () => p.kill('SIGKILL'), { once: true })
  })
}

async function detectSilences(file: string, signal: AbortSignal): Promise<{ start: number; end: number }[]> {
  const log = await ffmpeg(['-i', file, '-af', 'silencedetect=noise=-38dB:d=0.25', '-f', 'null', '-'], signal)
  const out: { start: number; end: number }[] = []
  let start: number | null = null
  for (const line of log.split('\n')) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line)
    if (s) start = Math.max(0, Number(s[1]))
    const e = /silence_end:\s*([\d.]+)/.exec(line)
    if (e && start != null) {
      out.push({ start, end: Number(e[1]) })
      start = null
    }
  }
  return out
}

/** Groups scenes into takes that fit one request, keeping the script order. */
function parts(clips: Clip[], provider: Project['ttsProvider']): Clip[][] {
  const out: Clip[][] = []
  let cur: Clip[] = []
  let size = 0
  for (const c of clips) {
    const s = provider === 'elevenlabs' || provider === 'f5-hf' || provider === 'f5-local' ? c.narration.length : estimateNarrationMs(c.narration, TTS_WORDS_PER_SECOND[provider]) / 1000
    const limit = provider === 'elevenlabs' ? ELEVEN_PART_CHARS : provider === 'f5-hf' || provider === 'f5-local' ? 600 : GEMINI_PART_SEC
    if (cur.length && size + s > limit) {
      out.push(cur)
      cur = []
      size = 0
    }
    cur.push(c)
    size += s
  }
  if (cur.length) out.push(cur)
  return out
}

async function cut(src: string, start: number, end: number, dst: string, signal: AbortSignal): Promise<void> {
  await ffmpeg(['-y', '-i', src, '-ss', start.toFixed(3), '-to', end.toFixed(3), '-c:a', 'pcm_s16le', '-ac', '1', dst], signal)
}

/** Word timings for a take from the local Whisper model, or null when it is off, missing or fails. */
async function whisperTimes(take: string, words: string[], p: Project, total: number, tmp: string, ctx: TaskCtx, note: () => void): Promise<WordTiming[] | null> {
  if (!getSettings().whisperAuto || !whisperReady() || !words.length) return null
  note()
  try {
    return await timeScript(take, words, p.language, total, tmp, ctx.signal)
  } catch (e) {
    if (ctx.signal.aborted) throw e
    console.warn('[whisper]', (e as Error).message)
    return null
  }
}

async function geminiTake(p: Project, voice: string, group: Clip[], tmp: string, ctx: TaskCtx, note: () => void): Promise<Segment[]> {
  // A long pause between scenes gives the cutter a clear gap to find.
  const wav = await gemini.speak(group.map((c) => c.narration.trim()).join('\n<long pause>\n'), voice, p.language, ctx.signal, p.editor.voiceDelivery ?? 'dramatic')
  const take = join(tmp, `take-${randomUUID()}.wav`)
  writeFileSync(take, wav)
  return sliceTake(take, group, p, tmp, ctx, note)
}

/** Speaks the whole group as one take with the user's local Supertonic studio. */
async function supertonicTake(p: Project, voice: string, group: Clip[], tmp: string, ctx: TaskCtx, note: () => void): Promise<Segment[]> {
  // A blank line is a paragraph pause in the studio, which gives the cutter a gap between scenes.
  const take = join(tmp, `take-${randomUUID()}.wav`)
  await supertonic.speak(group.map((c) => c.narration.trim()).join('\n\n'), voice, getSettings().supertonicPreset, take, ctx.signal, narrationSpeed(p.editor.narrationSpeed))
  return sliceTake(take, group, p, tmp, ctx, note)
}

async function f5Take(p: Project, voice: string, group: Clip[], tmp: string, ctx: TaskCtx, note: () => void, progress: (message: string) => void): Promise<Segment[]> {
  const take = join(tmp, `take-${randomUUID()}.wav`)
  await f5.speak(group.map((c) => c.narration.trim()).join('\n\n'), voice, take, ctx.signal, progress)
  return sliceTake(take, group, p, tmp, ctx, note)
}

async function f5LocalTake(p: Project, voice: string, group: Clip[], tmp: string, ctx: TaskCtx, note: () => void, progress: (message: string) => void): Promise<Segment[]> {
  const take = join(tmp, `take-${randomUUID()}.wav`)
  await f5Local.speak(group.map((c) => c.narration.trim()).join('\n\n'), voice, p.editor.narrationSpeed, take, ctx.signal, progress)
  return sliceTake(take, group, p, tmp, ctx, note)
}

/** How much silence is kept before a scene's first word and after its last one. */
const EDGE_KEEP_SEC = 0.22

/**
 * Narrows a scene's slice of the take to the speech inside it plus a short breath. The cutter aims at the
 * middle of the pause between scenes, so each piece would otherwise carry about a second of silence on top of
 * a few seconds of speech — with eight scenes in a short that reads as stop-start. A take with no detected
 * silence at the edges is left as it is.
 */
function trimToSpeech(
  from: number,
  to: number,
  words: WordTiming[] | null,
  silences: { start: number; end: number }[]
): { start: number; end: number } {
  const first = words?.[0]?.start
  const last = words?.[words.length - 1]?.end
  if (first != null && last != null && last > first)
    return { start: Math.max(from, first - EDGE_KEEP_SEC), end: Math.min(to, last + EDGE_KEEP_SEC) }
  const head = silences.find((s) => s.start <= from + 0.01 && s.end > from)
  const tail = silences.find((s) => s.start < to && s.end >= to - 0.01)
  return {
    start: head ? Math.max(from, head.end - EDGE_KEEP_SEC) : from,
    end: tail ? Math.min(to, tail.start + EDGE_KEEP_SEC) : to
  }
}

/** Cuts one whole take into per-scene files and times each scene's caption words. */
async function sliceTake(take: string, group: Clip[], p: Project, tmp: string, ctx: TaskCtx, note: () => void): Promise<Segment[]> {
  const total = (await probeDurationMs(take)) / 1000
  const silences = await detectSilences(take, ctx.signal)

  // With Whisper, every script word gets its real time, and scene ends come from the words themselves.
  const perScene = group.map((c) => spokenWords(c.narration))
  const timed = await whisperTimes(take, perScene.flat(), p, total, tmp, ctx, note)
  const ranges: WordTiming[][] = []
  let gaps: { end: number; start: number }[] | null = null
  if (timed) {
    let at = 0
    for (const w of perScene) {
      ranges.push(timed.slice(at, at + w.length))
      at += w.length
    }
    gaps = []
    for (let k = 0; k < group.length - 1; k++) {
      const end = ranges[k][ranges[k].length - 1]?.end
      const start = ranges[k + 1][0]?.start
      if (end == null || start == null) {
        gaps = null
        break
      }
      gaps.push({ end, start })
    }
  }
  const cuts = gaps ? cutsFromWords(gaps, silences) : chooseCuts(total, group.map((c) => stripVoiceTags(c.narration).length), silences)
  const bounds = [0, ...cuts, total]
  const out: Segment[] = []
  for (let k = 0; k < group.length; k++) {
    const { start, end } = trimToSpeech(bounds[k], bounds[k + 1], timed ? ranges[k] : null, silences)
    const len = end - start
    const file = join(tmp, `seg-${randomUUID()}.wav`)
    await cut(take, start, end, file, ctx.signal)
    let words: WordTiming[]
    if (timed) {
      words = ranges[k].map((w) => ({ ...w, start: Math.min(len, Math.max(0, w.start - start)), end: Math.min(len, Math.max(0, w.end - start)) }))
    } else {
      // Spread the words over the spoken part, between the short breaths kept at each edge.
      words = estimateWordTimings(stripVoiceTags(group[k].narration), Math.max(0.3, len - EDGE_KEEP_SEC * 2)).map((w) => ({
        ...w,
        start: w.start + EDGE_KEEP_SEC,
        end: w.end + EDGE_KEEP_SEC
      }))
    }
    out.push({ clip: group[k], file, durationMs: Math.round(len * 1000), words, estimated: !timed, timedBy: timed ? WHISPER_TIMING : undefined })
  }
  return out
}

async function elevenTake(
  p: Project,
  voice: string,
  group: Clip[],
  context: { previous?: string; next?: string },
  tmp: string,
  ctx: TaskCtx
): Promise<Segment[]> {
  const r = await eleven.speak(group.map((c) => c.narration.trim()).join('\n\n'), voice, p.language, ctx.signal, context, p.editor.voiceDelivery ?? 'dramatic')
  const take = join(tmp, `take-${randomUUID()}.mp3`)
  writeFileSync(take, r.audio)
  const total = (await probeDurationMs(take)) / 1000
  // The alignment gives every spoken word; count them off per scene to find where each one starts and ends.
  const counts = group.map((c) => spokenWords(c.narration).length)
  const expected = counts.reduce((a, b) => a + b, 0)
  const scale = expected ? r.words.length / expected : 1
  const ranges: { first: WordTiming | undefined; last: WordTiming | undefined; words: WordTiming[] }[] = []
  let at = 0
  for (const n of counts) {
    const from = Math.round(at * scale)
    at += n
    const to = Math.max(from, Math.round(at * scale))
    const words = r.words.slice(from, to)
    ranges.push({ first: words[0], last: words[words.length - 1], words })
  }
  const bounds = [0]
  for (let k = 0; k < group.length - 1; k++) {
    const a = ranges[k].last?.end
    const b = ranges[k + 1].first?.start
    bounds.push(a != null && b != null ? (a + b) / 2 : (total * (k + 1)) / group.length)
  }
  bounds.push(total)
  const out: Segment[] = []
  for (let k = 0; k < group.length; k++) {
    const start = bounds[k]
    const end = Math.max(start + 0.3, bounds[k + 1])
    const file = join(tmp, `seg-${randomUUID()}.wav`)
    await cut(take, start, end, file, ctx.signal)
    const words = ranges[k].words.map((w) => ({ ...w, start: Math.max(0, w.start - start), end: Math.max(0, w.end - start) }))
    out.push({ clip: group[k], file, durationMs: Math.round((end - start) * 1000), words, estimated: false })
  }
  return out
}

function store(p: Project, s: Segment, voice: string, takeId: string, bytes: Buffer): void {
  if ((p.ttsProvider === 'supertonic' || p.ttsProvider === 'f5-local') && (speechFingerprint(getProject(p.id)) !== speechFingerprint(p) || getClip(s.clip.id).narration !== s.clip.narration))
    throw new Error('Naskah, suara atau tempo berubah saat narasi dibuat. Coba lagi dengan pengaturan terbaru.')
  if (p.ttsProvider === 'f5-hf') {
    const selected = getProject(p.id)
    if (selected.ttsProvider !== p.ttsProvider || selected.ttsVoice !== voice || getSettings().f5VoiceId !== voice || getClip(s.clip.id).narration !== s.clip.narration)
      throw new Error('Naskah atau referensi F5 berubah saat suara dibuat. Hasil lama tidak diterapkan; coba lagi.')
  }
  const rel = `audio/${randomUUID()}.wav`
  const abs = assetAbsPath(p.id, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, bytes)
  const asset = insertAsset({
    projectId: p.id,
    clipId: s.clip.id,
    kind: 'audio',
    provider: p.ttsProvider,
    model: ttsModel(p.ttsProvider),
    prompt: s.clip.narration,
    localPath: rel,
    durationMs: s.durationMs,
    meta: { words: s.words, estimatedTimings: s.estimated, voice, take: takeId, speechFingerprint: speechFingerprint(p), ...(p.ttsProvider === 'f5-hf' ? { f5Space: getSettings().f5Space, license: getSettings().f5Space === 'fdrm/masbro-voice' ? 'F5 Indo V2 · CC BY-NC 4.0 (model nonkomersial)' : 'Sesuai lisensi checkpoint di Space F5 pilihanmu' } : {}), ...(s.timedBy ? { timedBy: s.timedBy } : {}) }
  })
  emit.asset(asset)
  // Each piece already carries half of the pause on either side, so the pieces play back as the one take.
  const durationMs = Math.max(1500, s.durationMs)
  // A new take starts untrimmed at the clip's start.
  const patch = { audioAssetId: asset.id, durationMs, voiceInMs: 0, voiceOutMs: null, voiceStartMs: 0 }
  patchClip(s.clip.id, patch)
  emit.clip({ clipId: s.clip.id, patch })
}

/** Voices the scenes that need it ("missing") or every scene ("all") as one continuous take. */
export function generateNarration(projectId: string, mode: 'missing' | 'all'): Job {
  const running = activeProjectJob(projectId, 'narration')
  if (running) return running
  const project = getProject(projectId)
  const targets = clipsOf(projectId).filter((c) => {
    const asset = getAsset(c.audioAssetId)
    return c.narration.trim() && (mode === 'all' || narrationNeedsRefresh(asset, c, project))
  })
  if (!targets.length) throw new Error('Tidak ada naskah narasi yang perlu disuarakan.')
  const job = insertJob({ projectId, kind: 'narration', provider: project.ttsProvider, payload: { mode, clipIds: targets.map((c) => c.id) } })
  emit.job(job)
  return runJob(job, project.ttsProvider === 'f5-local' ? 'f5-local' : project.ttsProvider === 'f5-hf' ? 'huggingface' : 'tts', async (ctx) => {
    const p = getProject(projectId)
    if (p.ttsProvider !== project.ttsProvider || p.ttsVoice !== project.ttsVoice) throw new Error('Pilihan suara berubah saat menunggu antrean. Buat suara lagi dengan pilihan terbaru.')
    const voice = p.ttsVoice || defaultVoiceFor(p.ttsProvider)
    if (p.ttsProvider === 'elevenlabs' && !voice) throw new Error('Pilih suara ElevenLabs dulu di langkah Ide cerita.')
    const clips = targets.map((c) => getClip(c.id)).filter((c) => c.narration.trim())
    const groups = parts(clips, p.ttsProvider)
    const tmp = join(dataDir(), 'tmp', `narration-${ctx.jobId}`)
    mkdirSync(tmp, { recursive: true })
    const takeId = randomUUID()
    try {
      let done = 0
      for (let g = 0; g < groups.length; g++) {
        const group = groups[g]
        ctx.progress(0.05 + 0.85 * (done / clips.length), p.ttsProvider === 'f5-hf' ? `Menunggu antrean dan suara F5 di Hugging Face · bagian ${g + 1}/${groups.length}` : groups.length > 1 ? `Membuat suara bagian ${g + 1} dari ${groups.length}` : 'Membuat suara narasi')
        const note = (): void =>
          ctx.progress(0.05 + 0.85 * ((done + group.length * 0.6) / clips.length), 'Menyinkronkan caption dengan Whisper')
        const segments =
          p.ttsProvider === 'f5-local' ? await f5LocalTake(p, voice, group, tmp, ctx, note, (message) => ctx.progress(0.05 + 0.85 * (done / clips.length), `${message} · bagian ${g + 1}/${groups.length}`)) : p.ttsProvider === 'f5-hf' ? await f5Take(p, voice, group, tmp, ctx, note, (message) => ctx.progress(0.05 + 0.85 * (done / clips.length), `${message} · bagian ${g + 1}/${groups.length}`)) : p.ttsProvider === 'elevenlabs'
            ? await elevenTake(
                p,
                voice,
                group,
                { previous: groups[g - 1]?.map((c) => c.narration).join('\n\n'), next: groups[g + 1]?.map((c) => c.narration).join('\n\n') },
                tmp,
                ctx
              )
            : p.ttsProvider === 'supertonic'
              ? await supertonicTake(p, voice, group, tmp, ctx, note)
              : await geminiTake(p, voice, group, tmp, ctx, note)
        ctx.progress(0.05 + 0.85 * ((done + group.length * 0.9) / clips.length), 'Memotong suara per adegan')
        for (const s of segments) store(p, s, voice, takeId, readFileSync(s.file))
        done += group.length
      }
      touchProject(projectId)
      ctx.progress(0.94, 'Menambahkan efek suara cerita')
      await ensureSoundEffects(projectId, ctx.signal, (message) => ctx.progress(0.95, message))
      return { message: `${clips.length} adegan disuarakan dalam satu rekaman` }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
}

/**
 * Re-times caption words with the local Whisper model on each scene's audio: scenes whose timings are
 * estimates or came from an older Whisper method, or every Gemini-voiced scene with "all".
 */
export function syncCaptions(projectId: string, mode: 'stale' | 'all' = 'stale'): Job {
  const running = activeProjectJob(projectId, 'align')
  if (running) return running
  if (!whisperReady()) throw new Error('Model Whisper belum diunduh. Unduh dulu di Pengaturan, bagian Caption akurat.')
  const targets = clipsOf(projectId).filter((c) => {
    const a = getAsset(c.audioAssetId)
    return !!a && captionNeedsSync(a, mode)
  })
  if (!targets.length) throw new Error('Tidak ada caption yang perlu disinkronkan. Caption yang kamu edit manual tetap dipertahankan.')
  const job = insertJob({ projectId, kind: 'align', provider: 'whisper' })
  emit.job(job)
  return runJob(job, 'whisper', async (ctx) => {
    const project = getProject(projectId)
    const tmp = join(dataDir(), 'tmp', `align-${ctx.jobId}`)
    try {
      let synced = 0
      for (let i = 0; i < targets.length; i++) {
        ctx.progress(0.03 + 0.95 * (i / targets.length), `Menyinkronkan klip ${i + 1} dari ${targets.length}`)
        const asset = getAsset(getClip(targets[i].id).audioAssetId)
        if (!asset || !captionNeedsSync(asset, mode)) continue
        const words = spokenWords(asset.prompt ?? targets[i].narration)
        if (!words.length) continue
        const seconds = (asset.durationMs ?? targets[i].durationMs) / 1000
        const timed = await timeScript(assetAbsPath(projectId, asset.localPath), words, project.language, seconds, tmp, ctx.signal)
        // Manual edits can arrive while Whisper is running; re-read before committing its result.
        const latest = getAsset(asset.id)
        if (!latest || !captionNeedsSync(latest, mode)) continue
        updateAssetMeta(asset.id, { ...latest.meta, words: timed, estimatedTimings: false, timedBy: WHISPER_TIMING })
        emit.asset(getAsset(asset.id)!)
        synced++
      }
      return { message: `${synced} klip disinkronkan` }
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
}
