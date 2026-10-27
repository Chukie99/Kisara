import type { StoryPacing } from './types'

/** Bind the assessment to the reviewed text; an edited synopsis must never use an old outline. */
export function currentPacing(pacing: StoryPacing | undefined, synopsis: string, idea: string): StoryPacing | null {
  return pacing && pacing.synopsis === synopsis && pacing.idea === idea ? pacing : null
}

export function pacingSeconds(pacing: StoryPacing): number {
  return Math.ceil(pacing.beats.reduce((sum, beat) => sum + beat.seconds, 0) / 60) * 60
}

export function parsePacing(value: unknown, synopsis: string, idea: string, partial: boolean): StoryPacing {
  const data = value as Partial<StoryPacing> | null
  if (!data || typeof data.reason !== 'string' || !data.reason.trim() || data.reason.length > 1600 || !Array.isArray(data.beats) || data.beats.length < 5 || data.beats.length > 14 || data.beats.some(b => !b || typeof b.event !== 'string' || !b.event.trim() || b.event.length > 1200 || !Number.isFinite(b.seconds) || b.seconds < 10 || b.seconds > 120))
    throw new Error('Penilaian alur dan durasi belum lengkap. Coba ambil ide lagi; hasil sebelumnya tetap aman.')
  const result = { synopsis, idea, partial, reason: data.reason.trim(), beats: data.beats.map(b => ({ event: b.event.trim(), seconds: Math.round(b.seconds) })) }
  if (pacingSeconds(result) > 1200) throw new Error('Alur terlalu panjang untuk dinilai dalam satu cerita. Pilih satu alur yang lebih fokus.')
  return result
}
