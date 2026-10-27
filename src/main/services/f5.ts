import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { stripVoiceTags } from '@shared/speech'
import type { KeyTestResult } from '@shared/types'
import { binPath, dataDir } from '../paths'
import { getSettings, setSettings } from '../settings'
import { getSecret } from '../secrets'
import { probeDurationMs } from './audio'
import { spaceHost } from './huggingface'

type Parameter = { parameter_name: string; parameter_has_default?: boolean; parameter_default?: unknown }
type Endpoint = { parameters: Parameter[] }
const referenceRoot = () => join(dataDir(), 'f5-reference')

function referencePath(): string {
  const name = getSettings().f5Reference
  if (!/^[a-f0-9-]{36}\.wav$/.test(name)) throw new Error('Pilih sampel suara F5 di Pengaturan terlebih dulu.')
  const path = join(referenceRoot(), name)
  if (!existsSync(path)) throw new Error('Sampel suara F5 tidak ditemukan. Pilih ulang di Pengaturan.')
  return path
}

export function setupReady(): boolean {
  const s = getSettings()
  try { return !!s.f5Space && !!s.f5Endpoint && !!s.f5VoiceId && !!s.f5RefText.trim() && !!referencePath() } catch { return false }
}

function ffmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => execFile(binPath(ffmpegStatic!), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, timeout: 60000, signal }, (error) => {
    if (error) reject(new Error(signal?.aborted ? 'Dibatalkan' : 'Audio F5 tidak bisa dibaca. Gunakan WAV, MP3, M4A, FLAC atau OGG yang valid.'))
    else resolve()
  }))
}

/** Copy and normalize, so later changes to the original recording cannot change the selected voice. */
export async function prepareReference(source: string): Promise<ReturnType<typeof getSettings>> {
  if (statSync(source).size > 20 * 1024 * 1024) throw new Error('Sampel terlalu besar. Maksimal 20 MB dan durasi 3–15 detik.')
  mkdirSync(referenceRoot(), { recursive: true })
  const name = `${randomUUID()}.wav`
  const target = join(referenceRoot(), name)
  try {
    // Voice-note containers may lack duration metadata. Measure decoded PCM instead;
    // one extra second bounds decoding while still rejecting oversized samples.
    await ffmpeg(['-i', source, '-t', '16', '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', target])
    const duration = await probeDurationMs(target)
    if (duration < 3000 || duration > 15000) throw new Error('Sampel harus 3–15 detik. Potong rekaman terlebih dulu, lalu pilih ulang dan sesuaikan transkripnya.')
    return setSettings({ f5Reference: name, f5ReferenceName: basename(source) })
  } catch (error) { rmSync(target, { force: true }); throw error }
}

function friendly(status: number): Error {
  if (status === 401 || status === 403) return new Error('Space F5 menolak akses. Periksa token Hugging Face atau izin Space.')
  if (status === 429) return new Error('Kuota atau antrean Space F5 sedang dibatasi. Tunggu lalu coba lagi.')
  if (status === 503) return new Error('Space F5 sedang tidur atau dibangun. Buka halaman Space sampai Running.')
  if (status === 404) return new Error('Space atau endpoint F5 tidak ditemukan. Periksa nama Space dan endpoint API.')
  return new Error(`Space F5 gagal merespons (HTTP ${status}). Periksa layanan Space lalu coba lagi.`)
}

async function request(url: string, origin: string, signal: AbortSignal, init: RequestInit = {}): Promise<Response> {
  const key = getSecret('huggingface')
  // No implicit redirects carrying the user's token to a different service.
  const res = await fetch(url, { ...init, signal, redirect: 'manual', headers: { ...(new URL(url).origin === origin && key ? { Authorization: `Bearer ${key}` } : {}), ...init.headers } })
  if (!res.ok) throw friendly(res.status)
  return res
}

async function bytes(res: Response, max: number): Promise<Buffer> {
  if (!res.body) throw new Error('Space F5 mengirim hasil kosong.')
  const reader = res.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > max) throw new Error('Hasil Space F5 terlalu besar. Gunakan bagian narasi yang lebih pendek.')
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  } finally { await reader.cancel().catch(() => {}) }
}

function base(): { origin: string; endpoint: string } {
  const s = getSettings(), endpoint = s.f5Endpoint.trim().replace(/^\//, '')
  if (!/^[a-z0-9_-]{1,80}$/i.test(endpoint)) throw new Error('Nama endpoint F5 tidak valid, contoh: infer atau predict.')
  return { origin: `https://${spaceHost(s.f5Space)}`, endpoint }
}

/** Gradio can keep its connection alive after completion; do not wait for EOF. */
async function completedAudio(res: Response, onProgress: () => void): Promise<unknown> {
  if (!res.body) throw new Error('Space F5 mengirim hasil kosong.')
  const reader = res.body.getReader(), decoder = new TextDecoder()
  let pending = '', size = 0
  const parse = (block: string): { value: unknown } | undefined => {
    const event = block.match(/^event:\s*(\w+)/m)?.[1]
    if (event === 'error') throw new Error(/quota|ZeroGPU|limit/i.test(block) ? 'Kuota GPU Space F5 habis atau sedang dibatasi. Coba lagi nanti.' : 'Space F5 gagal membuat audio. Periksa log Space; sampel atau model mungkin bermasalah.')
    if (event === 'generating') onProgress()
    if (event === 'complete') {
      try { return { value: JSON.parse(block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n')) } }
      catch { throw new Error('Hasil selesai dari Space F5 tidak bisa dibaca.') }
    }
    return undefined
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (value) {
        size += value.length
        if (size > 4 * 1024 * 1024) throw new Error('Status Space F5 terlalu besar. Coba lagi atau pilih Space lain.')
        pending += decoder.decode(value, { stream: true })
      }
      if (done) pending += decoder.decode()
      let boundary: RegExpExecArray | null
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        const block = pending.slice(0, boundary.index)
        pending = pending.slice(boundary.index + boundary[0].length)
        const result = parse(block)
        if (result) return result.value
      }
      if (done) {
        const result = parse(pending)
        if (result) return result.value
        throw new Error('Koneksi Space F5 terputus sebelum audio selesai. Coba lagi atau pilih Space lain.')
      }
    }
  } finally { await reader.cancel().catch(() => {}) }
}

async function contract(origin: string, endpoint: string, signal: AbortSignal): Promise<Endpoint> {
  const res = await request(`${origin}/gradio_api/info`, origin, signal)
  const info = JSON.parse((await bytes(res, 2 * 1024 * 1024)).toString()) as { named_endpoints?: Record<string, Endpoint> }
  const api = info.named_endpoints?.[`/${endpoint}`]
  if (!api || !Array.isArray(api.parameters)) throw new Error('Endpoint F5 tidak cocok dengan Space. Periksa menu Use via API di halaman Space.')
  const names = api.parameters.map((p) => p.parameter_name)
  if (!names.some((n) => ['ref_audio', 'ref_audio_orig', 'ref_file'].includes(n)) || !names.includes('ref_text') || !names.some((n) => ['gen_text', 'text'].includes(n)))
    throw new Error('API Space ini tidak cocok dengan F5 referensi audio + teks. Gunakan Space F5 yang kompatibel.')
  // Validate all inputs before uploading the reference recording.
  inputs(api, {}, 'reference', 'generation')
  return api
}

function inputs(api: Endpoint, audio: object, reference: string, text: string): unknown[] {
  return api.parameters.map((p) => {
    if (['ref_audio', 'ref_audio_orig', 'ref_file'].includes(p.parameter_name)) return audio
    if (p.parameter_name === 'ref_text') return reference
    if (['gen_text', 'text'].includes(p.parameter_name)) return text
    if (p.parameter_name === 'speed') return 1
    if (p.parameter_name === 'remove_silence') return false
    if (p.parameter_has_default) return p.parameter_default
    throw new Error('Ada masukan wajib API F5 yang belum didukung. Pilih Space F5 yang kompatibel.')
  })
}

export async function testSpace(): Promise<KeyTestResult> {
  try {
    const { origin, endpoint } = base()
    await contract(origin, endpoint, AbortSignal.timeout(30000))
    return { ok: true, message: 'API Space F5 cocok. Tes ini belum membuat suara atau mengirim sampel rekaman.' }
  } catch (error) { return { ok: false, message: error instanceof Error && error.name === 'TimeoutError' ? 'Space F5 belum menjawab dalam 30 detik.' : error instanceof Error ? error.message : 'Space F5 gagal diperiksa.' } }
}

/** Short serial requests avoid overloading public CPU/ZeroGPU Spaces; no sentence or word is dropped. */
export function textParts(text: string): string[] {
  let rest = stripVoiceTags(text).replace(/\s+/g, ' ').trim()
  const out: string[] = []
  while (rest.length > 600) {
    // Prefer a sentence boundary, then a whole word; never truncate the remaining narration.
    const matches = [...rest.slice(0, 601).matchAll(/[.!?](?=\s)/g)]
    const sentence = matches.at(-1)?.index
    const end = sentence != null && sentence >= 200 ? sentence + 1 : rest.lastIndexOf(' ', 600)
    if (end <= 0) throw new Error('Ada kata terlalu panjang dalam narasi F5. Periksa teks naskah.')
    out.push(rest.slice(0, end).trim())
    rest = rest.slice(end).trim()
  }
  if (rest) out.push(rest)
  return out
}

async function audioDownload(raw: string, origin: string, signal: AbortSignal): Promise<Buffer> {
  let url = new URL(raw, origin)
  for (let n = 0; n < 5; n++) {
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !(url.origin === origin || /(^|\.)(huggingface\.co|hf\.co)$/.test(url.hostname))) throw new Error('Alamat hasil audio F5 tidak diizinkan.')
    const key = getSecret('huggingface')
    const res = await fetch(url, { signal, redirect: 'manual', headers: url.origin === origin && key ? { Authorization: `Bearer ${key}` } : {} })
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location')
      if (!location) throw new Error('Alamat unduhan F5 tidak lengkap.')
      url = new URL(location, url); continue
    }
    if (!res.ok) throw friendly(res.status)
    return bytes(res, 64 * 1024 * 1024)
  }
  throw new Error('Terlalu banyak pengalihan unduhan F5.')
}

export async function speak(text: string, voice: string, output: string, signal: AbortSignal, progress?: (message: string) => void): Promise<void> {
  const s = getSettings()
  if (!setupReady()) throw new Error('Lengkapi Space, sampel suara dan transkrip F5 di Pengaturan terlebih dulu.')
  if (voice !== s.f5VoiceId) throw new Error('Referensi F5 berubah. Pilih referensi terbaru di langkah Ide cerita sebelum membuat suara.')
  const { origin, endpoint } = base(), ref = referencePath(), parts = textParts(text)
  if (!parts.length) throw new Error('Narasi F5 masih kosong.')
  signal.throwIfAborted()
  const bound = AbortSignal.any([signal, AbortSignal.timeout(8 * 60 * 1000)])
  progress?.('Memeriksa API Space F5')
  const api = await contract(origin, endpoint, bound)
  const form = new FormData()
  form.append('files', new Blob([new Uint8Array(readFileSync(ref))], { type: 'audio/wav' }), 'reference.wav')
  progress?.('Mengunggah sampel suara ke Space F5')
  const upload = JSON.parse((await bytes(await request(`${origin}/gradio_api/upload`, origin, bound, { method: 'POST', body: form }), 65536)).toString()) as unknown
  if (!Array.isArray(upload) || typeof upload[0] !== 'string' || !upload[0].startsWith('/')) throw new Error('Space F5 gagal menerima sampel suara.')
  const audio = { path: upload[0], orig_name: 'reference.wav', meta: { _type: 'gradio.FileData' } }
  mkdirSync(dirname(output), { recursive: true })
  const files: string[] = []
  try {
    for (const part of parts) {
      bound.throwIfAborted()
      if (getSettings().f5VoiceId !== s.f5VoiceId) throw new Error('Pengaturan referensi F5 berubah saat suara dibuat. Coba lagi dengan referensi terbaru.')
      const submitted = await request(`${origin}/gradio_api/call/${endpoint}`, origin, bound, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: inputs(api, audio, s.f5RefText, part) }) })
      const id = JSON.parse((await bytes(submitted, 65536)).toString()).event_id as unknown
      if (typeof id !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(id)) throw new Error('Space F5 tidak mengirim ID antrean.')
      const started = Date.now()
      const waiting = (): void => progress?.(`Menunggu hasil Space F5 · ${Math.floor((Date.now() - started) / 1000)} detik · batas 8 menit`)
      waiting()
      const timer = setInterval(waiting, 15000)
      let result: unknown
      try {
        result = await completedAudio(await request(`${origin}/gradio_api/call/${endpoint}/${id}`, origin, bound), () => progress?.('Space F5 mengirim progres generasi suara'))
      } finally { clearInterval(timer) }
      const first = Array.isArray(result) ? result[0] as { url?: string; path?: string } | null : null
      const url = first?.url ?? (first?.path?.startsWith('/') ? `${origin}/gradio_api/file=${first.path}` : null)
      if (!url) throw new Error('Space F5 selesai tanpa audio. Hasil progres bukan hasil suara.')
      const raw = join(dirname(output), `${randomUUID()}.bin`), wav = join(dirname(output), `${randomUUID()}.wav`)
      files.push(raw, wav)
      progress?.('Mengunduh hasil suara F5')
      writeFileSync(raw, await audioDownload(url, origin, bound))
      await ffmpeg(['-i', raw, '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', wav], bound)
      const duration = await probeDurationMs(wav)
      if (duration < 200 || duration > 180000) throw new Error('Durasi hasil F5 tidak wajar. Gunakan teks lebih pendek atau periksa Space.')
    }
    const waves = files.filter((f) => f.endsWith('.wav'))
    await ffmpeg([...waves.flatMap((file) => ['-i', file]), '-filter_complex', `${waves.map((_, i) => `[${i}:a]`).join('')}concat=n=${waves.length}:v=0:a=1[out]`, '-map', '[out]', '-c:a', 'pcm_s16le', output], bound)
    bound.throwIfAborted()
    if (getSettings().f5VoiceId !== s.f5VoiceId) throw new Error('Referensi F5 berubah sebelum hasil disimpan. Coba lagi.')
  } catch (error) {
    rmSync(output, { force: true })
    if (bound.aborted && !signal.aborted) throw new Error('Antrean atau generasi F5 belum selesai dalam 8 menit. Coba bagian lebih pendek atau Space lain.')
    throw error
  } finally { for (const file of files) rmSync(file, { force: true }) }
}
