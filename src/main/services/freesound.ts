import type { SfxHit } from '@shared/types'
import { soundLicense } from '@shared/licenses'
import { getSecret } from '../secrets'

/** File licenses and API access are separate: the commercial API terms still apply to CC0 searches. */

const BASE = 'https://freesound.org/apiv2'

/** Where a free token comes from; shown to the user when none is stored yet. */
export const FREESOUND_APPLY_URL = 'https://freesound.org/apiv2/apply/'

function token(override?: string): string {
  const key = (override ?? getSecret('freesound') ?? '').trim()
  if (!key) throw new Error(`Token Freesound belum diisi. Buat gratis di ${FREESOUND_APPLY_URL}, lalu tempel di Pengaturan.`)
  return key
}

interface RawSound {
  id?: number
  name?: string
  duration?: number
  license?: string
  username?: string
  previews?: Record<string, string>
}

/** A licence written for a person, not a lawyer: "CC0" needs no credit, "CC BY" does. */
function licenseLabel(raw: string): string {
  const license = soundLicense(raw)
  if (license === 'CC0') return 'CC0 · tanpa atribusi'
  if (license === 'CC BY-NC') return 'CC BY-NC · sebut pembuat, non-komersial'
  if (license === 'CC BY') return 'CC BY · wajib sebut pembuat'
  return raw || 'tidak diketahui'
}

/** Searches for sound effects. Short ones only: a short video rarely needs a minute-long effect. */
export async function search(query: string, limit = 12, signal?: AbortSignal): Promise<SfxHit[]> {
  const q = query.trim()
  if (!q) return []
  const url = new URL(`${BASE}/search/text/`)
  url.searchParams.set('query', q)
  url.searchParams.set('fields', 'id,name,duration,license,username,previews')
  url.searchParams.set('page_size', String(Math.min(30, Math.max(1, limit))))
  url.searchParams.set('sort', 'score')
  url.searchParams.set('filter', 'duration:[0 TO 60] license:"Creative Commons 0"')

  const res = await fetch(url, { signal, headers: { Authorization: `Token ${token()}` } })
  if (!res.ok) {
    if (res.status === 401) throw new Error('Token Freesound ditolak. Periksa lagi di Pengaturan.')
    if (res.status === 429) throw new Error('Freesound sedang membatasi permintaan. Tunggu sebentar lalu coba lagi.')
    throw new Error(`Freesound menolak permintaan (HTTP ${res.status}).`)
  }
  const json = (await res.json()) as { results?: RawSound[] }
  return (json.results ?? [])
    .map((s): SfxHit | null => {
      // The high-quality mp3 preview is what a free token can fetch; the original needs OAuth.
      const file = s.previews?.['preview-hq-mp3'] ?? s.previews?.['preview-lq-mp3']
      if (!s.id || !file || soundLicense(s.license ?? '') !== 'CC0') return null
      return {
        id: String(s.id),
        name: (s.name ?? 'Tanpa nama').replace(/\.(wav|mp3|ogg|aiff?|flac)$/i, ''),
        duration: Number(s.duration ?? 0),
        author: s.username ?? 'tidak diketahui',
        license: licenseLabel(s.license ?? ''),
        url: file,
        pageUrl: `https://freesound.org/s/${s.id}/`
      }
    })
    .filter((h): h is SfxHit => h !== null)
}

/** Fetches the audio of one search hit. */
export async function download(url: string, signal?: AbortSignal): Promise<Buffer> {
  const source = new URL(url)
  if (source.protocol !== 'https:' || !/(^|\.)freesound\.org$/i.test(source.hostname)) throw new Error('Alamat efek suara bukan dari Freesound.')
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Gagal mengunduh efek suara (HTTP ${res.status}).`)
  return Buffer.from(await res.arrayBuffer())
}

/** A one-result search proves the token works without downloading anything. */
export async function testKey(key?: string): Promise<{ ok: boolean; message: string }> {
  try {
    const url = new URL(`${BASE}/search/text/`)
    url.searchParams.set('query', 'wind')
    url.searchParams.set('fields', 'id,name')
    url.searchParams.set('page_size', '1')
    const res = await fetch(url, { headers: { Authorization: `Token ${token(key)}` } })
    if (!res.ok) throw new Error(res.status === 401 ? 'Token ditolak Freesound. Periksa lagi tokennya.' : `Freesound membalas HTTP ${res.status}.`)
    const json = (await res.json()) as { count?: number }
    return { ok: true, message: `Terhubung · ${(json.count ?? 0).toLocaleString('id-ID')} efek suara tersedia` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
