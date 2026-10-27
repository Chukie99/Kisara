import { execFile } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import ffmpegStatic from 'ffmpeg-static'
import { binPath, dataDir } from '../paths'
import { recognize, whisperReady } from '../whisper'

/**
 * YouTube intake: a link becomes text, so the idea generator can work from a real spoken story instead of a
 * blank page. yt-dlp does the fetching. Its own auto-captions are used first because they come back in
 * seconds; the local Whisper model is only a fallback, since transcribing an hour of speech on a CPU takes
 * hours. Only the audio opening is downloaded when local transcription is needed.
 */

export interface VideoInfo {
  title: string
  durationSec: number
  uploader: string
  uploadDate: string | null
}

export interface Transcript {
  text: string
  /** "captions" came from YouTube in seconds; "whisper" was transcribed locally from the audio. */
  source: 'captions' | 'whisper'
  language: string | null
  /** True when only the opening minutes were read (Whisper fallback on a long video). */
  partial: boolean
}

const EXE = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
const RELEASE_URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${EXE}`

/** How much of the video's opening is transcribed when there are no captions and Whisper has to run. */
const WHISPER_FALLBACK_MINUTES = 20

/** Past this length a caption-less video is refused: a local transcription would take hours, not minutes. */
const WHISPER_FALLBACK_LIMIT_SEC = 45 * 60

function bundledPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'yt-dlp', EXE) : join(app.getAppPath(), 'resources', 'yt-dlp', EXE)
}

function managedPath(): string {
  const dir = join(dataDir(), 'bin')
  mkdirSync(dir, { recursive: true })
  return join(dir, EXE)
}

/**
 * One way of launching yt-dlp. `bare` marks a plain command name that is looked up on PATH (yt-dlp, python);
 * anything else is a path that has to exist before it is tried.
 */
interface Runner {
  cmd: string
  pre: string[]
  bare?: boolean
  jsRuntime?: boolean
}

let resolved: Runner | null | undefined
let fetching: Promise<void> | null = null

function works(r: Runner): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(r.cmd, [...r.pre, '--version'], { windowsHide: true, timeout: 20000 }, (err, stdout) => {
      resolve(!err && /^\d{4}\.\d{2}\.\d{2}/.test(String(stdout).trim()))
    })
  })
}

async function resolveYtdlp(): Promise<Runner | null> {
  if (resolved !== undefined) return resolved
  const candidates: Runner[] = [
    { cmd: bundledPath(), pre: [] },
    { cmd: managedPath(), pre: [] },
    { cmd: 'yt-dlp', pre: [], bare: true },
    { cmd: EXE, pre: [], bare: true },
    { cmd: 'python', pre: ['-m', 'yt_dlp'], bare: true },
    { cmd: 'py', pre: ['-m', 'yt_dlp'], bare: true },
    { cmd: 'python3', pre: ['-m', 'yt_dlp'], bare: true }
  ]
  for (const c of candidates) {
    if (!c.bare && !existsSync(c.cmd)) continue
    if (await works(c)) {
      resolved = c
      return c
    }
  }
  resolved = null
  return null
}

/**
 * Makes sure a yt-dlp exists, downloading the official standalone build into the app's data folder when the
 * machine has none. The download runs once; after that the file is reused.
 */
export async function ensureYtdlp(): Promise<void> {
  if (await resolveYtdlp()) return
  if (!fetching) {
    fetching = (async () => {
      const dst = managedPath()
      const part = `${dst}.part`
      const res = await fetch(RELEASE_URL, { redirect: 'follow', signal: AbortSignal.timeout(120000) })
      if (!res.ok || !res.body) throw new Error(`Gagal mengunduh yt-dlp (HTTP ${res.status}). Periksa koneksi internet.`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 1_000_000) throw new Error('Unduhan yt-dlp tidak lengkap. Coba lagi.')
      writeFileSync(part, buf)
      if (process.platform !== 'win32') chmodSync(part, 0o755)
      // Rename is atomic on the same volume, so a half-written file is never used.
      renameSync(part, dst)
      resolved = undefined
    })().finally(() => {
      fetching = null
    })
  }
  await fetching
  if (!(await resolveYtdlp())) throw new Error('yt-dlp tidak bisa disiapkan di komputer ini.')
}

async function runner(): Promise<Runner> {
  await ensureYtdlp()
  const r = await resolveYtdlp()
  if (!r) throw new Error('yt-dlp tidak tersedia.')
  if (r.jsRuntime === undefined) {
    r.jsRuntime = await new Promise<boolean>((resolve) => {
      execFile(r.cmd, [...r.pre, '--help'], { windowsHide: true, timeout: 20000 }, (err, stdout) => {
        resolve(!err && String(stdout).includes('--js-runtimes'))
      })
    })
  }
  return r
}

/** Where yt-dlp finds FFmpeg: the copy bundled with the app, so no system install is needed. */
function ffmpegLocation(): string[] {
  const dir = dirname(binPath(ffmpegStatic!))
  return existsSync(dir) ? ['--ffmpeg-location', dir] : []
}

function run(r: Runner, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      r.cmd,
      [...r.pre, '--ignore-config', '--no-warnings', '--socket-timeout', '25', '--retries', '2',
        ...(r.jsRuntime ? ['--js-runtimes', `node:${process.execPath}`] : []), ...args],
      // Electron's bundled Node also works when the desktop user has no node.exe on PATH.
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
      (err, stdout, stderr) => {
        if (err) {
          // Keep yt-dlp's own words: the user needs to know whether the video is private, age-locked or
          // simply blocked, and a generic "failed" hides all of that. Errors first, then any other line.
          const lines = String(stderr)
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
          const errors = lines.filter((l) => /^ERROR/i.test(l))
          const tail = (errors.length ? errors : lines.filter((l) => !/^WARNING/i.test(l))).slice(-2)
          const detail = tail
            .join(' ')
            .replace(/^ERROR:\s*/i, '')
            .replace(/\s*\(caused by.*$/i, '')
            .trim()
          const timedOut = (err as NodeJS.ErrnoException).code === 'ETIMEDOUT' || ('killed' in err && err.killed) || /timed out/i.test((err as Error).message)
          if (timedOut) return reject(new Error('YouTube terlalu lama merespons. Periksa koneksi internet lalu coba lagi.'))
          return reject(new Error(detail || 'yt-dlp gagal mengambil data dari video ini.'))
        }
        resolve(String(stdout))
      }
    )
  })
}

export function isYoutubeUrl(url: string): boolean {
  return normalizeYoutubeUrl(url) !== null
}

/** Discard share/tracking parameters, while accepting mobile, Shorts and embedded video links. */
export function normalizeYoutubeUrl(input: string): string | null {
  try {
    const clean = input.trim()
    if (/\s/.test(clean)) return null
    const url = new URL(/^https?:\/\//i.test(clean) ? clean : `https://${clean}`)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null
    const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '')
    let id: string | null = null
    if (host === 'youtu.be') id = url.pathname.split('/')[1]
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(shorts|live|embed|v)\//.test(url.pathname) ? url.pathname.split('/')[2] : null
    }
    return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null
  } catch {
    return null
  }
}

/** Title, length and channel of a video, without downloading it. */
export async function fetchInfo(url: string): Promise<VideoInfo> {
  const canonical = normalizeYoutubeUrl(url)
  if (!canonical) throw new Error('Link YouTube tidak valid. Salin link satu video, bukan link channel atau playlist.')
  const r = await runner()
  const out = await run(
    r,
    [
      '--no-playlist',
      '--skip-download',
      '--print', '%(title)s',
      '--print', '%(duration)s',
      '--print', '%(uploader)s',
      '--print', '%(upload_date)s',
      canonical
    ],
    120000
  )
  const [title = '', duration = '', uploader = '', uploadDate = ''] = out.split('\n')
  const seconds = Number(duration)
  return {
    title: title.trim() || 'Video YouTube',
    durationSec: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0,
    uploader: uploader.trim() || 'tidak diketahui',
    uploadDate: /^\d{8}$/.test(uploadDate.trim()) ? uploadDate.trim() : null
  }
}

/**
 * Turns a WebVTT caption file into plain prose. YouTube's auto-captions roll: every cue repeats the tail of
 * the one before it, and each cue also carries word-level `<c>` tags. Dropping the tags and any line that
 * repeats the line before it leaves the spoken text, once.
 */
export function vttToText(vtt: string): string {
  const out: string[] = []
  let last = ''
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (/^WEBVTT/.test(line) || /^(Kind|Language|NOTE|STYLE|REGION)(:|\s|$)/.test(line)) continue
    if (line.includes('-->') || /^\d+$/.test(line)) continue
    const text = line.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text || text === last) continue
    out.push(text)
    last = text
  }
  return out.join(' ').replace(/\s+/g, ' ').trim()
}

/** Picks the caption file closest to the wanted language, falling back to any that was written. */
function pickVtt(files: string[], prefer: string[]): { file: string; lang: string } | null {
  const langs = [...new Set([...prefer, 'id', 'en'])]
  for (const lang of langs) {
    const hit = files.find((f) => f.endsWith(`.${lang}.vtt`)) ?? files.find((f) => f.endsWith(`.${lang}-orig.vtt`)) ?? files.find((f) => f.includes(`.${lang}-`))
    if (hit) return { file: hit, lang: hit.match(/\.([\w-]+)\.vtt$/)?.[1] ?? lang }
  }
  const any = files.find((f) => f.endsWith('.vtt'))
  return any ? { file: any, lang: any.replace(/^.*\.([a-z-]+)\.vtt$/i, '$1') } : null
}

/**
 * The spoken text of a video: YouTube's own captions when the uploader or YouTube made them, otherwise a
 * local Whisper transcription of the opening minutes. `prefer` is the language order to look for, and
 * `durationSec` (0 when unknown) guards the fallback: transcribing an hour of speech on a CPU takes hours,
 * so a long video without captions is refused with a readable reason instead of appearing to hang.
 */
export async function fetchTranscript(url: string, prefer: string[], durationSec = 0): Promise<Transcript> {
  const canonical = normalizeYoutubeUrl(url)
  if (!canonical) throw new Error('Link YouTube tidak valid. Salin link satu video, bukan link channel atau playlist.')
  const r = await runner()
  const tmp = join(dataDir(), 'tmp', `yt-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmp, { recursive: true })
  try {
    const langs = [...new Set([...prefer, 'id', 'en'])].filter((lang) => /^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(lang)).map((lang) => `${lang}.*`).join(',')
    // YouTube rate-limits caption downloads (HTTP 429) when a burst of them arrives; one retry after a short
    // pause usually gets through, and it is far cheaper than falling back to a local transcription.
    const grabSubs = async (): Promise<string[]> => {
      captionError = null
      await run(
        r,
        [
          '--no-playlist',
          '--skip-download',
          '--write-auto-subs',
          '--write-subs',
          '--sub-langs', langs,
          '--sub-format', 'vtt/best',
          '-o', join(tmp, 'v'),
          canonical
        ],
        240000
      ).catch((error: unknown) => {
        // A denied request is not evidence of absent captions; do not silently start a long audio download.
        captionError = error instanceof Error ? error.message : 'Caption YouTube gagal diambil.'
      })
      return readdirSync(tmp).filter((f) => f.endsWith('.vtt'))
    }
    let captionError: string | null = null
    let files = await grabSubs()
    if (!files.length && captionError && /429|too many requests/i.test(captionError)) {
      await new Promise((res) => setTimeout(res, 2500))
      files = await grabSubs()
    }
    const best = pickVtt(files, prefer)
    if (best) {
      const text = vttToText(readFileSync(join(tmp, best.file), 'utf8'))
      // A handful of characters means the caption track was empty or a stub.
      if (text.length >= 80) return { text, source: 'captions', language: best.lang, partial: false }
    }

    if (captionError) throw new Error(`Caption YouTube gagal diambil: ${captionError} Kamu juga bisa menyalin transkrip YouTube lalu menempelkannya di kotak podcast.`)

    // No captions: transcribe the opening minutes locally. Kept short on purpose — Whisper on a CPU runs
    // slower than the audio itself, so a whole podcast is not practical.
    if (durationSec > WHISPER_FALLBACK_LIMIT_SEC)
      throw new Error(
        `Caption yang bisa dibaca tidak tersedia, dan durasinya ${Math.round(durationSec / 60)} menit. Transkripsi lokal bisa berjam-jam. Salin transkrip YouTube lalu tempel di kotak podcast, atau pilih video dengan caption.`
      )
    if (!whisperReady()) throw new Error('Caption yang bisa dibaca tidak tersedia. Pasang model Whisper di Pengaturan untuk membaca audio, atau salin transkrip YouTube lalu tempel di kotak podcast.')
    const audio = await run(
      r,
      [
        '--no-playlist',
        '-f', 'bestaudio/best',
        '-x', '--audio-format', 'wav',
        '--download-sections', `*0:00-${WHISPER_FALLBACK_MINUTES}:00`,
        ...ffmpegLocation(),
        '-o', join(tmp, 'a'),
        canonical
      ],
      900000
    )
      .then(() => readdirSync(tmp).find((f) => /\.(wav|m4a|mp3|opus|webm)$/i.test(f)))
      .catch((error: unknown) => { throw new Error(`Audio YouTube gagal diambil: ${error instanceof Error ? error.message : 'Unduhan gagal.'}`) })
    if (!audio) throw new Error('Video ini tidak punya caption, dan suaranya tidak bisa diunduh untuk ditranskrip.')
    const heard = await recognize(join(tmp, audio), prefer[0] ?? 'id', tmp)
    const text = heard.map((w) => w.text).join(' ').replace(/\s+/g, ' ').trim()
    if (text.length < 200) throw new Error('Transkrip kosong. Video ini mungkin tanpa suara atau tanpa caption.')
    return { text, source: 'whisper', language: prefer[0] ?? null, partial: !durationSec || durationSec > WHISPER_FALLBACK_MINUTES * 60 }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** Whether a usable yt-dlp is present, and its version, so the interface can say what to expect. */
export async function ytdlpStatus(): Promise<{ ready: boolean; version: string | null; path: string | null }> {
  const r = await resolveYtdlp()
  if (!r) return { ready: false, version: null, path: null }
  const version = await new Promise<string | null>((resolve) => {
    execFile(r.cmd, [...r.pre, '--version'], { windowsHide: true, timeout: 20000 }, (err, stdout) =>
      resolve(err ? null : String(stdout).trim())
    )
  })
  const shown = r.pre.length ? `${r.cmd} ${r.pre.join(' ')}` : r.cmd
  return { ready: true, version, path: shown }
}
