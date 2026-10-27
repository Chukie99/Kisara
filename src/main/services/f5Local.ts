import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { rmSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import ffmpegStatic from 'ffmpeg-static'
import type { KeyTestResult, VoiceOption } from '@shared/types'
import { narrationSpeed } from '@shared/speech'
import { getSettings } from '../settings'
import { binPath } from '../paths'
import { probeDurationMs } from './audio'
import { textParts } from './f5'

type LocalVoice = { id: string; name: string; transcript: string; duration: number; created?: string }
type State = { status: string; max_chars: number; voices: LocalVoice[]; nfe?: number }

/** Only the user's loopback studio may receive narration; no token or reference upload is needed. */
export function localBase(value = getSettings().f5LocalUrl): string {
  if (typeof value !== 'string') throw new Error('Alamat F5 lokal tidak valid.')
  let u: URL
  try { u = new URL(value.trim()) } catch { throw new Error('Alamat F5 lokal tidak valid.') }
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) || u.username || u.password || u.search || u.hash || u.pathname !== '/')
    throw new Error('F5 lokal harus memakai http://127.0.0.1:port di komputer ini, tanpa path atau kunci.')
  if (u.hostname === 'localhost') u.hostname = '127.0.0.1'
  return u.origin
}

async function body(res: Response, max: number): Promise<Buffer> {
  if (!res.body) throw new Error('F5 lokal mengirim hasil kosong.')
  const reader = res.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > max) throw new Error('Hasil F5 lokal terlalu besar.')
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  } finally { await reader.cancel().catch(() => {}) }
}

async function request(base: string, path: string, signal: AbortSignal, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(base + path, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]), redirect: 'manual' })
    if (!res.ok) throw new Error(`F5 lokal menolak permintaan (HTTP ${res.status}). Periksa studio lokal.`)
    return res
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof Error && error.message.startsWith('F5 lokal')) throw error
    throw new Error('F5 lokal belum menjawab. Jalankan launch.bat di folder F5-TTS-Project dan tunggu model siap.')
  }
}

async function json(base: string, path: string, signal: AbortSignal, init?: RequestInit): Promise<Record<string, unknown>> {
  try {
    const value: unknown = JSON.parse((await body(await request(base, path, signal, init), 4 * 1024 * 1024)).toString())
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Jawaban API F5 lokal tidak cocok.')
    return value as Record<string, unknown>
  }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('Jawaban API F5 lokal tidak bisa dibaca.')
    throw error
  }
}

async function state(base: string, signal: AbortSignal): Promise<State> {
  const s = await json(base, '/api/state', signal)
  if (s.status !== 'ready') throw new Error(s.status === 'loading' ? 'F5 lokal masih memuat model. Tunggu sampai Siap lalu tes lagi.' : 'Model F5 lokal belum siap. Periksa halaman studio lokal.')
  if (!Array.isArray(s.voices) || typeof s.max_chars !== 'number' || s.max_chars < 1) throw new Error('API studio F5 lokal tidak cocok.')
  return s as unknown as State
}

function version(base: string, voice: LocalVoice, nfe?: number): string {
  return `${voice.id}:${createHash('sha256').update(JSON.stringify([base, voice.transcript, voice.duration, voice.created, nfe])).digest('hex').slice(0, 16)}`
}

function catalog(base: string, s: State): VoiceOption[] {
  return s.voices.filter((v) => v && typeof v.id === 'string' && /^[a-z0-9_-]{1,100}$/i.test(v.id) && typeof v.name === 'string' && typeof v.transcript === 'string' && v.transcript.trim()).map((v) => ({ id: version(base, v, s.nfe), name: v.name, description: `Referensi F5 lokal · ${Number.isFinite(v.duration) ? v.duration : '?'} detik` }))
}

export async function voices(): Promise<VoiceOption[]> {
  const base = localBase()
  return catalog(base, await state(base, AbortSignal.timeout(20000)))
}

export async function test(value?: string): Promise<KeyTestResult> {
  try {
    const base = localBase(value), s = await state(base, AbortSignal.timeout(20000)), list = catalog(base, s)
    if (!list.length) throw new Error('F5 lokal siap, tetapi belum ada suara dengan transkrip. Tambahkan suara di studio F5 dulu.')
    return { ok: true, message: `F5 lokal siap · ${list.length} suara tersedia. Tes ini belum membuat audio.` }
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'F5 lokal gagal diperiksa.' } }
}

async function ffmpeg(args: string[], signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => execFile(binPath(ffmpegStatic!), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, timeout: 120000, signal }, (error) => error ? reject(new Error(signal.aborted ? 'Dibatalkan' : 'Audio F5 lokal tidak bisa dibaca.')) : resolve()))
}

export async function speak(text: string, voiceId: string, speed: number | undefined, output: string, signal: AbortSignal, progress?: (message: string) => void): Promise<void> {
  const base = localBase(), bound = AbortSignal.any([signal, AbortSignal.timeout(2 * 60 * 60 * 1000)])
  const s = await state(base, bound)
  const voice = s.voices.find((v) => v && typeof v.id === 'string' && version(base, v, s.nfe) === voiceId)
  if (!voice || !catalog(base, s).some((v) => v.id === voiceId)) throw new Error('Pilih suara F5 lokal terbaru di langkah Ide cerita.')
  const parts = textParts(text)
  if (!parts.length) throw new Error('Narasi masih kosong.')
  if (parts.some((p) => p.length > s.max_chars)) throw new Error('Teks melebihi batas studio F5 lokal.')
  const files: string[] = []
  try {
    for (const [index, part] of parts.entries()) {
      bound.throwIfAborted()
      // Submit once: retrying this POST would duplicate a long-running CPU generation.
      const submitted = await json(base, '/api/generate', bound, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: part, voice_id: voice.id, speed: narrationSpeed(speed), format: 'wav', title: 'Kisara-' + randomUUID() }) })
      const id = submitted.job_id
      if (typeof id !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(id)) throw new Error('F5 lokal tidak mengirim ID tugas.')
      let file = ''
      for (;;) {
        const job = await json(base, '/api/job/' + encodeURIComponent(id), bound)
        if (job.status === 'error') throw new Error('Generasi F5 lokal gagal. Periksa detail tugas di studio F5 lokal.')
        if (job.status === 'done') {
          const result = job.result as { file?: unknown } | undefined
          if (typeof result?.file !== 'string' || !/^[^/\\\x00-\x1f]+\.wav$/i.test(result.file) || result.file.includes('..')) throw new Error('Nama hasil audio F5 lokal tidak valid.')
          file = result.file
          break
        }
        if (job.status !== 'queued' && job.status !== 'running') throw new Error('Status tugas F5 lokal tidak dikenali.')
        const percent = typeof job.progress === 'number' && Number.isFinite(job.progress) ? Math.round(Math.max(0, Math.min(1, job.progress)) * 100) : 0
        const elapsed = typeof job.elapsed === 'number' && Number.isFinite(job.elapsed) ? Math.max(0, Math.round(job.elapsed)) : 0
        progress?.(`${job.status === 'queued' ? 'Antrean' : 'Membuat suara'} F5 lokal · ${index + 1}/${parts.length} · ${percent}% · ${elapsed} detik. CPU bisa memerlukan beberapa menit.`)
        await delay(1500, undefined, { signal: bound })
      }
      const raw = join(dirname(output), `f5-local-${randomUUID()}.bin`), wav = join(dirname(output), `f5-local-${randomUUID()}.wav`)
      files.push(raw, wav)
      writeFileSync(raw, await body(await request(base, '/files/out/' + encodeURIComponent(file), bound), 64 * 1024 * 1024))
      await ffmpeg(['-i', raw, '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', wav], bound)
      const ms = await probeDurationMs(wav)
      if (ms < 200 || ms > 600000) throw new Error('Durasi audio F5 lokal tidak wajar.')
    }
    const waves = files.filter((f) => f.endsWith('.wav'))
    await ffmpeg([...waves.flatMap((f) => ['-i', f]), '-filter_complex', `${waves.map((_, i) => `[${i}:a]`).join('')}concat=n=${waves.length}:v=0:a=1[out]`, '-map', '[out]', '-c:a', 'pcm_s16le', output], bound)
    if (localBase() !== base || !catalog(base, await state(base, bound)).some((v) => v.id === voiceId)) throw new Error('Server atau referensi F5 lokal berubah. Pilih suara terbaru lalu coba lagi.')
    bound.throwIfAborted()
  } catch (error) {
    rmSync(output, { force: true })
    if (signal.aborted) throw new Error('Dibatalkan di Kisara. Tugas yang sudah dikirim bisa tetap berjalan di studio F5 lokal.')
    if (bound.aborted) throw new Error('F5 lokal belum selesai dalam dua jam. Periksa tugas di studio lokal sebelum mencoba lagi.')
    throw error
  } finally { for (const f of files) rmSync(f, { force: true }) }
}
