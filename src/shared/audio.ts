/**
 * Fade rules shared by the preview and the export. The preview multiplies the volume of an audio element
 * every frame; the export writes the same fade as FFmpeg `afade`, so both ramp over the same span.
 */

/** Volume multiplier at `tSec` on the timeline for an item playing `startSec`–`endSec`. */
export function fadeGain(tSec: number, startSec: number, endSec: number, fadeInSec: number, fadeOutSec: number): number {
  const length = Math.max(0, endSec - startSec)
  if (length <= 0) return 0
  const at = Math.min(length, Math.max(0, tSec - startSec))
  let gain = 1
  if (fadeInSec > 0) gain = Math.min(gain, at / Math.min(fadeInSec, length))
  if (fadeOutSec > 0) gain = Math.min(gain, (length - at) / Math.min(fadeOutSec, length))
  return Math.min(1, Math.max(0, gain))
}

/** A fade can never be longer than the sound it belongs to. */
export function clampFadeMs(ms: number | null | undefined, lengthMs: number): number {
  return Math.min(Math.max(0, ms ?? 0), Math.max(0, lengthMs))
}

/** `afade` filters for a sound of `lengthSec`, or an empty string when neither fade is set. */
export function fadeFilters(lengthSec: number, fadeInSec: number, fadeOutSec: number): string {
  const parts: string[] = []
  if (fadeInSec > 0.01) parts.push(`afade=t=in:st=0:d=${Math.min(fadeInSec, lengthSec).toFixed(3)}`)
  if (fadeOutSec > 0.01) parts.push(`afade=t=out:st=${Math.max(0, lengthSec - fadeOutSec).toFixed(3)}:d=${Math.min(fadeOutSec, lengthSec).toFixed(3)}`)
  return parts.join(',')
}
