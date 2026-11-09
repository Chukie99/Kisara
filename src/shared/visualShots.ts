import { pronunciationText, spokenWords, tagPauseSec } from './speech'
import type { Clip } from './types'

export interface VisualShotPart { narration: string; durationMs: number }

/** Media that has already been approved must not be silently detached by storyboarding. */
export function canDivideVisual(clip: Clip): boolean {
  return !clip.imageAssetId && !clip.videoAssetId && !clip.audioAssetId && clip.motionType !== 'video'
    && clip.voiceInMs === 0 && clip.voiceOutMs == null && clip.voiceStartMs === 0 && clip.mediaInMs === 0
}

/** Split the editable text losslessly; punctuation is preferred over arbitrary equal word counts. */
export function visualShotParts(narration: string, durationMs: number, language: string, opening = false): VisualShotPart[] {
  const unchanged = [{ narration, durationMs }]
  const limit = opening ? 4500 : 7000
  if (!Number.isFinite(durationMs) || durationMs <= limit) return unchanged
  const tokens = [...narration.matchAll(/<[^>]*>|\S+/g)].filter(m => !m[0].startsWith('<'))
  if (tokens.length < 4) return unchanged
  const cuts = [0]
  for (let i = 0; i < tokens.length - 1; i++) {
    const left = tokens[i][0], right = tokens[i + 1][0]
    // Currency amounts and their scale/unit must remain one pronounceable expression.
    if (/^Rp\.?$/i.test(left) || /^(?:ribu|juta|miliar|triliun|rupiah|persen|%)\b/i.test(right)
      || (/\d[.,\d]*$/.test(left) && /^(?:tahun|bulan|hari|detik|menit|jam|kali)\b/i.test(right))) continue
    cuts.push(tokens[i].index! + left.length)
  }
  cuts.push(narration.length)
  const weight = (text: string) => spokenWords(pronunciationText(text, language)).length + tagPauseSec(text) * 2.6
  const total = weight(narration)
  if (!total) return unchanged
  const positions = cuts.map((cut, i) => i === cuts.length - 1 ? durationMs : Math.round(durationMs * weight(narration.slice(0, cut)) / total))
  const target = opening ? 3000 : 4500
  const scores = cuts.map(() => Infinity), previous = cuts.map(() => -1)
  scores[0] = 0
  for (let end = 1; end < cuts.length; end++) {
    for (let start = end - 1; start >= 0; start--) {
      const ms = positions[end] - positions[start]
      if (ms > limit) break
      if (ms < 1800 || !Number.isFinite(scores[start])) continue
      const punctuation = narration.slice(0, cuts[end]).trimEnd()
      const boundary = end === cuts.length - 1 || /[.!?…][”"')]*$/.test(punctuation) ? 0 : /[,;:][”"')]*$/.test(punctuation) ? 0.35 : 1
      const score = scores[start] + ((ms - target) / target) ** 2 + boundary + 0.15
      if (score < scores[end]) { scores[end] = score; previous[end] = start }
    }
  }
  if (previous.at(-1) === -1) return unchanged
  const parts: VisualShotPart[] = []
  let end = cuts.length - 1
  while (end > 0) {
    const start = previous[end]
    parts.unshift({ narration: narration.slice(cuts[start], cuts[end]), durationMs: positions[end] - positions[start] })
    end = start
  }
  return parts.length > 1 ? parts : unchanged
}
