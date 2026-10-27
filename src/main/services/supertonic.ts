import { execFile } from 'node:child_process'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import ffmpegStatic from 'ffmpeg-static'
import { binPath } from '../paths'
import type { KeyTestResult, VoiceOption } from '@shared/types'
import { toSupertonicText } from '@shared/speech'
import { getSettings } from '../settings'

/**
 * The user's own offline TTS: the "Nightmare TTS Studio" in `settings.supertonicDir`, driven through
 * a compatible bridge script. It runs locally, needs no API key, and writes one whole take as a WAV; Kisara then
 * cuts that take per scene and times the captions with its own Whisper model, exactly like the cloud voices.
 */

const VOICES: VoiceOption[] = [
  ...[1, 2, 3, 4, 5].map((n): VoiceOption => ({ id: `M${n}`, name: `Pria ${n}`, description: 'Suara Supertonic lokal' })),
  ...[1, 2, 3, 4, 5].map((n): VoiceOption => ({ id: `F${n}`, name: `Wanita ${n}`, description: 'Suara Supertonic lokal' }))
]

/** One line of stdout carries the result, marked so stray library output cannot confuse the parser. */
const MARKERS = ['@@KISARA@@', '@@BANG@@']

/** The bridge lives beside the studio; the venv Python is what actually has `supertonic` installed. */
function paths(): { dir: string; python: string; bridge: string } {
  const dir = getSettings().supertonicDir.trim()
  // Existing installations keep their external bridge; new ones can use the current product name.
  const bridge = dir ? join(dir, 'kisara_bridge.py') : ''
  return { dir, python: dir ? join(dir, '.venv', 'Scripts', 'python.exe') : '', bridge: existsSync(bridge) ? bridge : dir ? join(dir, 'bang_bridge.py') : '' }
}

export function voices(): VoiceOption[] {
  return VOICES
}

/** Whether the local studio can actually run: no key, but the venv Python and the bridge script must exist. */
export function setupStatus(): KeyTestResult {
  const { dir, python, bridge } = paths()
  if (!dir) return { ok: false, message: 'Folder Supertonic belum diatur. Buka Pengaturan untuk memilihnya.' }
  if (!existsSync(python)) return { ok: false, message: `Python venv tidak ditemukan di ${python}. Periksa folder Supertonic.` }
  if (!existsSync(bridge)) return { ok: false, message: `Skrip penghubung TTS tidak ditemukan di ${dir}. Salin kisara_bridge.py ke folder Supertonic.` }
  return { ok: true, message: 'Supertonic siap dipakai (lokal, tanpa kunci API)' }
}

/** Renders `text` to a WAV at `outPath` with the local studio. Resolves when the file is written. */
export async function speak(text: string, voice: string, preset: string, outPath: string, signal?: AbortSignal, speed = 1): Promise<void> {
  signal?.throwIfAborted()
  const { dir, python, bridge } = paths()
  if (!dir) throw new Error('Folder Supertonic belum diatur. Buka Pengaturan untuk memilihnya.')
  if (!existsSync(python)) throw new Error(`Python venv Supertonic tidak ditemukan di ${python}. Periksa folder di Pengaturan.`)
  if (!existsSync(bridge)) throw new Error(`Skrip penghubung TTS tidak ditemukan di ${dir}. Salin kisara_bridge.py ke folder Supertonic.`)
  const payload = JSON.stringify({ text: toSupertonicText(text), voice: voice || 'M2', preset: preset || 'dark_documentary', out: outPath })
  await new Promise<void>((resolve, reject) => {
    const child = execFile(
      python,
      [bridge],
      { cwd: dir, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (signal?.aborted) return reject(new Error('Dibatalkan'))
        if (err) {
          const tail = String(stderr).split('\n').map((l) => l.trim()).filter(Boolean).slice(-4).join(' ')
          return reject(new Error(`Supertonic gagal: ${tail || err.message}`))
        }
        try {
          const line = String(stdout).split('\n').reverse().find((l) => MARKERS.some((marker) => l.trimStart().startsWith(marker)))
          if (!line) return reject(new Error('Supertonic tidak mengirim hasil yang bisa dibaca.'))
          const marker = MARKERS.find((prefix) => line.trimStart().startsWith(prefix))!
          const reply = JSON.parse(line.trimStart().slice(marker.length)) as { ok?: boolean; error?: string }
          if (!reply.ok) return reject(new Error(`Supertonic: ${reply.error ?? 'tidak menghasilkan audio'}`))
          resolve()
        } catch {
          reject(new Error('Supertonic mengirim jawaban yang tidak bisa dibaca.'))
        }
      }
    )
    signal?.addEventListener('abort', () => child.kill('SIGKILL'), { once: true })
    // The child may exit before it reads stdin (e.g. a broken venv); that EPIPE is not worth reporting.
    child.stdin?.on('error', () => undefined)
    child.stdin?.end(payload)
  })
  if (speed !== 1) {
    const adjusted = join(dirname(outPath), `tempo-${randomUUID()}.wav`)
    try {
      signal?.throwIfAborted()
      const rate = Math.max(0.8, Math.min(1.1, Number.isFinite(speed) ? speed : 0.9))
      // Align and cut the resulting waveform, never stretch an already-captioned clip.
      await new Promise<void>((resolve, reject) => execFile(binPath(ffmpegStatic!), ['-hide_banner', '-loglevel', 'error', '-y', '-i', outPath, '-af', `atempo=${rate}`, '-c:a', 'pcm_s16le', adjusted], { windowsHide: true, signal, timeout: 120000 }, (error) => error ? reject(new Error(signal?.aborted ? 'Dibatalkan' : 'Tempo narasi lokal gagal diproses. Coba lagi.')) : resolve()))
      signal?.throwIfAborted()
      renameSync(adjusted, outPath)
    } finally { rmSync(adjusted, { force: true }) }
  }
}
