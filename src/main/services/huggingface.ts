import type { AspectRatio, KeyTestResult } from '@shared/types'
import { getSecret } from '../secrets'
import { getSettings } from '../settings'
import { normalizeGeneratedImage } from '../imageQuality'
import { sleep } from './http'

/**
 * The user's own Hugging Face Space as the image service. The Space (see `tools/hf-space`) runs a real
 * FLUX model on ZeroGPU and the app calls its Gradio API, so the pictures are free and full quality.
 */

const FN = 'generate'

/** Image sizes for a video aspect ratio; FLUX wants multiples of 16. */
function dimensions(aspect: AspectRatio): { width: number; height: number } {
  return aspect === '9:16' ? { width: 576, height: 1024 } : { width: 1024, height: 576 }
}

/** "owner/name" — or a pasted Space URL — becomes the host that serves the API. */
export function spaceHost(space?: string): string {
  const raw = (space ?? getSettings().hfSpace).trim()
  if (!raw) throw new Error('Nama Space Hugging Face belum diisi. Buka Pengaturan untuk menambahkannya.')
  const clean = raw
    .replace(/^https?:\/\//i, '')
    .replace(/^huggingface\.co\/spaces\//i, '')
    .replace(/\/+$/, '')
  const cut = clean.indexOf('/')
  const owner = cut === -1 ? '' : clean.slice(0, cut)
  const name = cut === -1 ? '' : clean.slice(cut + 1)
  if (!/^[a-z\d][a-z\d-]*$/i.test(owner) || !/^[a-z\d][a-z\d._-]*$/i.test(name))
    throw new Error('Nama Space harus berbentuk "pengguna/nama-space".')
  // A Space answers on its own host: slashes, dots and underscores all become dashes.
  return `${owner}-${name}`.toLowerCase().replace(/[._]/g, '-') + '.hf.space'
}

function auth(token?: string): Record<string, string> {
  const key = token ?? getSecret('huggingface')
  return key ? { Authorization: `Bearer ${key}` } : {}
}

function friendly(status: number, detail: string): Error {
  if (status === 401 || status === 403)
    return new Error('Space-nya private atau tokennya salah. Isi token Hugging Face di Pengaturan, atau buat Space-nya publik.')
  if (status === 404) return new Error('Space tidak ditemukan. Periksa namanya, bentuknya "pengguna/nama-space".')
  if (status === 503) return new Error('Space-nya sedang tidur atau masih dibangun. Buka halamannya di huggingface.co sampai berstatus Running, lalu coba lagi.')
  return new Error(`Hugging Face menolak permintaan (HTTP ${status}): ${detail.slice(0, 200)}`)
}

/**
 * Gradio streams the answer as server-sent events: an `event: complete` line followed by a `data:` line
 * holding the outputs. Progress events carry `null`, so the first entry with an image URL is the result.
 */
function streamEvents(stream: string): { event: string; data: string }[] {
  return stream.split(/\r?\n\r?\n/).map((block) => {
    const lines = block.split(/\r?\n/)
    return {
      event: lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? '',
      data: lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
    }
  })
}

function resultUrl(stream: string): string | null {
  for (const { event, data } of streamEvents(stream)) {
    if (event !== 'complete') continue
    try {
      const payload = JSON.parse(data) as unknown
      const first = Array.isArray(payload) ? (payload[0] as { url?: unknown } | null) : null
      if (first && typeof first.url === 'string' && first.url) return first.url
    } catch {
      // Not the result line; progress events are not JSON we care about.
    }
  }
  return null
}

/** The message Gradio sends when the Space itself raised, so the user sees why. */
function streamError(stream: string): string | null {
  for (const entry of streamEvents(stream)) {
    if (entry.event !== 'error') continue
    const data = entry.data.trim()
    // Gradio often sends a bare `null` when the Space itself raised. That is not a message: saying
    // "Error: null" tells the user nothing, so name the two causes that actually produce it.
    if (!data || data === 'null' || data === 'undefined')
      return 'Space-nya gagal menyelesaikan permintaan. Biasanya kuota ZeroGPU harian sudah habis, atau Space-nya sedang sibuk. Buka halaman Space-nya di huggingface.co untuk melihat log, atau pakai provider gambar lain di Pengaturan.'
    return data.slice(0, 300)
  }
  return null
}

/**
 * The model the Space actually loaded, asked of the Space itself. This matters because the Space walks a
 * fallback chain: when the gated FLUX cannot be fetched it quietly drops to a weaker model, and without
 * this the user would keep believing they are getting FLUX. Null when the Space runs an older app.py.
 */
async function activeModel(host: string, headers: Record<string, string>): Promise<string | null> {
  try {
    const signal = AbortSignal.timeout(15000)
    const submit = await fetch(`https://${host}/gradio_api/call/which_model`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [] }), signal
    })
    if (!submit.ok) return null
    const { event_id: eventId } = (await submit.json()) as { event_id?: string }
    if (!eventId) return null
    const stream = await fetch(`https://${host}/gradio_api/call/which_model/${encodeURIComponent(eventId)}`, { headers, signal })
    if (!stream.ok) return null
    for (const line of (await stream.text()).split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      try {
        const payload = JSON.parse(trimmed.slice(5).trim()) as unknown
        if (Array.isArray(payload) && typeof payload[0] === 'string' && payload[0]) return payload[0]
      } catch {
        // Progress events carry null; the answer is the one data line that parses to a string.
      }
    }
    return null
  } catch {
    return null
  }
}

/** One attempt at drawing a picture with the user's Space. */
async function drawOnce(prompt: string, aspect: AspectRatio, signal?: AbortSignal): Promise<Buffer> {
  signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(180000)])
  const host = spaceHost()
  const { width, height } = dimensions(aspect)
  const headers = auth()

  const submit = await fetch(`https://${host}/gradio_api/call/${FN}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [prompt, width, height, 4] }),
    signal
  })
  if (!submit.ok) throw friendly(submit.status, await submit.text().catch(() => ''))
  const { event_id: eventId } = (await submit.json()) as { event_id?: string }
  if (!eventId) throw new Error('Space tidak mengembalikan event id.')

  const stream = await fetch(`https://${host}/gradio_api/call/${FN}/${encodeURIComponent(eventId)}`, { headers, signal })
  if (!stream.ok) throw friendly(stream.status, await stream.text().catch(() => ''))
  const text = await stream.text()

  const url = resultUrl(text)
  if (!url) throw new Error(streamError(text) ?? 'Space selesai tanpa mengirim gambar. Cek halaman Space-nya di huggingface.co.')

  const source = new URL(url, `https://${host}`)
  if (source.protocol !== 'https:' || source.username || source.password ||
    !(source.hostname === host || /(^|\.)huggingface\.co$|(^|\.)hf\.co$/i.test(source.hostname)))
    throw new Error('Space mengirim alamat gambar di luar layanan Hugging Face.')
  // A Space output must not receive the API token when it points to a different host.
  const file = await fetch(source, { headers: source.origin === `https://${host}` ? headers : {}, signal })
  if (!file.ok) throw new Error(`Gagal mengunduh gambar dari Space (HTTP ${file.status}).`)
  return normalizeGeneratedImage(Buffer.from(await file.arrayBuffer()))
}

/**
 * Draws one clip image with the user's Space. A shared ZeroGPU Space refuses a request now and then while it
 * hands the GPU over or while its queue is busy, so one attempt is retried after a pause: a picture the user
 * is waiting for is worth four more seconds, and a single refusal should not fail a whole pipeline.
 */
export async function generateImage(prompt: string, aspect: AspectRatio, signal?: AbortSignal): Promise<Buffer> {
  let last: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await drawOnce(prompt, aspect, signal)
    } catch (e) {
      last = e
      if (signal?.aborted) throw e
      if (attempt === 0) await sleep(4000, signal)
    }
  }
  throw last instanceof Error ? last : new Error('Gagal menggambar di Space.')
}

/** Checks the Space is up and exposes the function the app calls, and reports which model it loaded. */
export async function testKey(token?: string, space?: string): Promise<KeyTestResult> {
  try {
    const host = spaceHost(space)
    const headers = auth(token)
    const res = await fetch(`https://${host}/gradio_api/info`, { headers, signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw friendly(res.status, await res.text().catch(() => ''))
    const info = (await res.json()) as { named_endpoints?: Record<string, unknown> }
    if (!info.named_endpoints?.[`/${FN}`])
      throw new Error(`Space-nya jalan, tapi tidak punya fungsi "${FN}". Unggah app.py dari folder tools/hf-space ke Space itu.`)
    const model = await activeModel(host, headers)
    if (!model) return { ok: true, message: `Terhubung · ${host} siap dipakai` }
    // The Space falls back to a weaker model when the gated FLUX is out of reach, so say so plainly.
    const weak = !/flux/i.test(model)
    return {
      ok: true,
      message: `Terhubung · model aktif: ${model}${weak ? ' (bukan FLUX — terima lisensi FLUX.1-schnell dan tambah secret HF_TOKEN untuk kualitas terbaik)' : ''}`
    }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

let cachedModel: string | null | undefined

/** Forgets the remembered model, so a Space that was switched to another model is asked again. */
export function forgetActiveModel(): void {
  cachedModel = undefined
}

/**
 * The model the Space is running, asked once per session. Image prompts are sized by it: a modern model
 * (FLUX, Lumina, Sana) follows a long, detailed prompt, while an SDXL-class one starts tiling the picture
 * into a grid of panels as soon as the prompt grows. Null when it cannot be determined.
 */
export async function activeModelName(): Promise<string | null> {
  if (cachedModel !== undefined) return cachedModel
  try {
    cachedModel = await activeModel(spaceHost(), auth())
  } catch {
    cachedModel = null
  }
  return cachedModel
}
