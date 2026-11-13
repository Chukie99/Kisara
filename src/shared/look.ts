import type { Clip } from './types'

/**
 * A clip's visual look, shared by the editor preview (CSS) and the export (FFmpeg), so a colour change
 * chosen in the editor lands in the MP4. Values are percentages, except hue which is degrees.
 *
 * Brightness is additive: the preview lays a black or white veil over the picture and FFmpeg uses the
 * same amount in `eq=brightness`. Contrast and saturation are multipliers, and hue turns every colour.
 */
export interface ClipLook {
  brightness: number
  contrast: number
  saturation: number
  hue: number
}

type LookClip = Pick<Clip, 'lookBrightness' | 'lookContrast' | 'lookSaturation' | 'lookHue'>

export const LOOK_MIN = -100
export const LOOK_MAX = 100
export const LOOK_HUE_MIN = -180
export const LOOK_HUE_MAX = 180

export interface LookPreset {
  id: string
  label: string
  look: ClipLook
}

export const LOOK_PRESETS: LookPreset[] = [
  { id: 'normal', label: 'Normal', look: { brightness: 0, contrast: 0, saturation: 0, hue: 0 } },
  { id: 'cerah', label: 'Cerah', look: { brightness: 12, contrast: 8, saturation: 12, hue: 0 } },
  { id: 'sinematik', label: 'Sinematik', look: { brightness: -6, contrast: 22, saturation: -12, hue: -4 } },
  { id: 'lembut', label: 'Lembut', look: { brightness: 8, contrast: -10, saturation: -8, hue: 0 } },
  { id: 'vintage', label: 'Vintage', look: { brightness: 6, contrast: -8, saturation: -35, hue: 12 } },
  { id: 'pudar', label: 'Pudar', look: { brightness: 8, contrast: -18, saturation: -30, hue: 0 } },
  { id: 'mono', label: 'Hitam putih', look: { brightness: 0, contrast: 8, saturation: -100, hue: 0 } }
]

export function lookOf(clip: LookClip): ClipLook {
  return {
    brightness: clip.lookBrightness ?? 0,
    contrast: clip.lookContrast ?? 0,
    saturation: clip.lookSaturation ?? 0,
    hue: clip.lookHue ?? 0
  }
}

export function lookIsDefault(look: ClipLook): boolean {
  return look.brightness === 0 && look.contrast === 0 && look.saturation === 0 && look.hue === 0
}

export function lookMatches(look: ClipLook, preset: ClipLook): boolean {
  return look.brightness === preset.brightness && look.contrast === preset.contrast && look.saturation === preset.saturation && look.hue === preset.hue
}

/** The CSS filter for contrast, saturation and hue; brightness uses its own veil so it adds light. */
export function lookFilterCss(look: ClipLook): string {
  const parts: string[] = []
  if (look.contrast) parts.push(`contrast(${(1 + look.contrast / 100).toFixed(3)})`)
  if (look.saturation) parts.push(`saturate(${(1 + look.saturation / 100).toFixed(3)})`)
  if (look.hue) parts.push(`hue-rotate(${look.hue.toFixed(2)}deg)`)
  return parts.join(' ')
}

/** A black or white layer over the picture, matching FFmpeg's additive `eq=brightness`. */
export function lookBrightnessLayer(look: ClipLook): { color: '#000' | '#fff'; opacity: number } | null {
  if (!look.brightness) return null
  return { color: look.brightness > 0 ? '#fff' : '#000', opacity: Math.min(1, Math.abs(look.brightness) / 100) }
}

/** The same look as FFmpeg filters, or null when the clip is untouched. */
export function lookFfmpeg(look: ClipLook): string | null {
  const filters: string[] = []
  const brightness = look.brightness / 100
  const contrast = 1 + look.contrast / 100
  const saturation = 1 + look.saturation / 100
  if (brightness !== 0 || contrast !== 1 || saturation !== 1) {
    filters.push(`eq=brightness=${brightness.toFixed(3)}:contrast=${contrast.toFixed(3)}:saturation=${saturation.toFixed(3)}`)
  }
  if (look.hue) filters.push(`hue=h=${look.hue.toFixed(2)}`)
  return filters.length ? filters.join(',') : null
}
