import type { Asset, Clip, SfxOverlay } from './types'

/** Source duration and timeline bounds are shared so an effect stops at the same point in both outputs. */
export function soundSpan(fx: Pick<SfxOverlay, 'start' | 'clipId' | 'offsetSec'>, asset: Pick<Asset, 'durationMs'>, total: number, clips?: Pick<Clip, 'id' | 'durationMs'>[]) {
  const anchor = fx.clipId && clips ? sceneStart(clips, fx.clipId) : undefined
  const clip = clips?.find((c) => c.id === fx.clipId)
  const raw = anchor != null ? anchor + Math.max(0, fx.offsetSec ?? 0) : fx.start
  const start = Math.max(0, Number.isFinite(raw) ? raw : 0)
  if (fx.clipId && clips && anchor == null) return { start, end: start }
  const duration = Math.max(0, (asset.durationMs ?? 0) / 1000)
  const clipEnd = clip && anchor != null ? anchor + clip.durationMs / 1000 : total
  return { start, end: Math.max(start, Math.min(total, clipEnd, start + duration)) }
}

export function sceneStart(clips: Pick<Clip, 'id' | 'durationMs'>[], clipId: string): number | null {
  let start = 0
  for (const clip of clips) {
    if (clip.id === clipId) return start
    start += clip.durationMs / 1000
  }
  return null
}
