import type { AspectRatio, KeyTestResult } from '@shared/types'
import { getSecret, requireSecret } from '../secrets'
import { getSettings } from '../settings'

/**
 * Cloudflare Workers AI as a free image source: 10,000 neurons a day without a card, which is roughly
 * 170 FLUX images. The REST endpoint is per-account, so an account id is stored beside the token.
 */

const BASE = 'https://api.cloudflare.com/client/v4/accounts'
const TEST_MODEL = '@cf/black-forest-labs/flux-1-schnell'

/** The Flux models misfire on the NSFW filter; SDXL is the model that does not. */
export const NSFW_SAFE_MODEL = '@cf/stabilityai/stable-diffusion-xl-base-1.0'

/** True when Cloudflare refused the prompt because its content filter fired on an innocent prompt. */
export function isNsfwError(e: unknown): boolean {
  return /nsfw/i.test((e as Error)?.message ?? '')
}

function accountId(override?: string): string {
  const id = (override ?? getSettings().cloudflareAccountId).trim()
  if (!id) throw new Error('Account ID Cloudflare belum diisi. Buka Pengaturan untuk menambahkannya.')
  return id
}

interface CfError {
  code?: number
  message?: string
}

/** Cloudflare answers with `{ success: false, errors: [{ code, message }] }`, unlike the other services. */
function cfErrors(raw: string): CfError[] {
  try {
    return (JSON.parse(raw) as { errors?: CfError[] }).errors ?? []
  } catch {
    return []
  }
}

function friendly(status: number, raw: string): Error {
  const first = cfErrors(raw)[0]
  const code = first?.code
  const detail = first?.message ?? raw.slice(0, 200) ?? ''
  if (status === 401 || code === 10000) return new Error('Kunci Cloudflare ditolak. Tempel ulang API token di Pengaturan.')
  // The Flux models reject plainly innocent prompts as NSFW and the filter cannot be turned off
  // (cloudflare/developer-platform#58), so point the user at the model that is not affected.
  if (code === 3030 || code === 8007 || /nsfw/i.test(detail))
    return new Error(
      'Cloudflare menolak prompt ini sebagai NSFW padahal isinya biasa. Ini bug filter pada model FLUX di Workers AI yang belum diperbaiki Cloudflare. Ganti Model gambar ke Stable Diffusion XL di Pengaturan, lalu coba lagi.'
    )
  if (status === 403) return new Error(`Cloudflare menolak akses (kode ${code ?? status}): ${detail}`)
  if (status === 429)
    return new Error(
      `Cloudflare membatasi permintaan (kode ${code ?? 429}): ${detail}. Cek kuota gratis di dash.cloudflare.com, menu Workers & Pages lalu Workers AI.`
    )
  if (status === 404) return new Error(`Model atau Account ID Cloudflare tidak ditemukan (kode ${code ?? 404}): ${detail}`)
  if (status >= 500) return new Error(`Server Cloudflare sedang bermasalah (${status}). Coba lagi nanti.`)
  return new Error(`Cloudflare menolak permintaan (kode ${code ?? status}): ${detail}`)
}

/**
 * Image sizes per aspect ratio. SDXL only composes well at its own training buckets, so it gets 1344x768 and
 * 768x1344. Anything else (FLUX) takes the smaller, cheaper sizes. An off-bucket size makes SDXL repeat its
 * subject and tile the picture into panels, which is what a 576x1024 request used to produce.
 */
function dimensions(aspect: AspectRatio, model: string): { width: number; height: number } {
  const wide = aspect !== '9:16'
  if (model.includes('stable-diffusion')) return wide ? { width: 1344, height: 768 } : { width: 768, height: 1344 }
  return wide ? { width: 1024, height: 576 } : { width: 576, height: 1024 }
}

async function run(token: string, account: string, model: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<Buffer> {
  const res = await fetch(`${BASE}/${account}/ai/run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    throw friendly(res.status, raw)
  }
  const type = res.headers.get('content-type') ?? ''
  if (type.startsWith('image/')) return Buffer.from(await res.arrayBuffer())
  // Some models answer with JSON instead of raw bytes.
  const json = (await res.json()) as { result?: { image?: string }; image?: string }
  const b64 = json.result?.image ?? json.image
  if (!b64) throw new Error('Cloudflare selesai tanpa mengirim gambar.')
  return Buffer.from(b64, 'base64')
}

/**
 * SDXL answers a long scene description by tiling the frame into a grid of little panels instead of drawing
 * one picture. Its negative prompt is the only lever that names that behaviour, so it goes out on every draw.
 */
const NEGATIVE_PROMPT =
  'multiple panels, panel grid, collage, storyboard, contact sheet, split screen, comic strip, diptych, ' +
  'triptych, duplicate scenes, repeated figures, tiled layout, picture frames, borders, white margins, ' +
  'text, letters, words, captions, watermark, logo, signature, blurry, low quality, distorted faces'

/** Draws one clip image. FLUX takes no size, SDXL does, so only SDXL is given the video's ratio. */
export async function generateImage(prompt: string, aspect: AspectRatio, model: string, signal?: AbortSignal): Promise<Buffer> {
  const token = requireSecret('cloudflare')
  const body: Record<string, unknown> = { prompt: prompt.slice(0, 2048) }
  if (model.includes('stable-diffusion')) {
    const { width, height } = dimensions(aspect, model)
    body.width = width
    body.height = height
    body.num_steps = 20
    body.negative_prompt = NEGATIVE_PROMPT
  } else {
    body.steps = 4
  }
  return run(token, accountId(), model, body, signal)
}

/** A long, plainly benign prompt: the Flux models reject short innocent prompts as NSFW. */
const TEST_PROMPT =
  'a wide landscape photograph of calm green hills under a soft blue sky in daylight, gentle clouds, natural colours, high detail'

/** A real but tiny generation proves the token, the account id and model access all work. */
export async function testKey(token?: string, account?: string): Promise<KeyTestResult> {
  const key = token ?? getSecret('cloudflare')
  if (!key) return { ok: false, message: 'Kunci belum diatur' }
  try {
    const model = getSettings().cloudflareModel || TEST_MODEL
    const body: Record<string, unknown> = { prompt: TEST_PROMPT }
    if (model.includes('stable-diffusion')) {
      body.width = 1024
      body.height = 576
      body.num_steps = 8
    } else {
      body.steps = 4
    }
    await run(key, accountId(account), model, body)
    return { ok: true, message: `Terhubung · ${model.split('/').pop()} siap · kuota gratis 10.000 neurons/hari` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
