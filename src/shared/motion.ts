import type { CameraPresetId, MotionStrength, TransitionId } from './types'

/**
 * Camera motion shared by the live preview (CSS transforms) and the FFmpeg export (perspective),
 * so what the user sees in the editor is what lands in the MP4.
 *
 * zoom >= 1. x and y are the camera centre offset inside the free space: -1 = far left/top, 1 = far right/bottom.
 * rot is the view's turn in degrees, 0 when the camera does not rotate.
 */
export interface CameraFrame {
  zoom: number
  x: number
  y: number
  rot?: number
}

export const CAMERA_PRESETS: { id: CameraPresetId; label: string }[] = [
  { id: 'zoomin', label: 'Zoom in' },
  { id: 'zoomout', label: 'Zoom out' },
  { id: 'panleft', label: 'Geser kiri' },
  { id: 'panright', label: 'Geser kanan' },
  { id: 'panup', label: 'Geser naik' },
  { id: 'pandown', label: 'Geser turun' },
  { id: 'zoomleft', label: 'Zoom serong kiri' },
  { id: 'zoomright', label: 'Zoom serong kanan' },
  { id: 'kenburns', label: 'Ken Burns' },
  { id: 'reveal', label: 'Buka perlahan' },
  { id: 'rotate', label: 'Putar pelan' },
  { id: 'handheld', label: 'Kamera genggam' },
  { id: 'shake', label: 'Goyang halus' },
  { id: 'static', label: 'Diam' }
]

export const MOTION_STRENGTHS: { id: MotionStrength; label: string; amount: number }[] = [
  { id: 'halus', label: 'Halus', amount: 0.08 },
  { id: 'sedang', label: 'Sedang', amount: 0.15 },
  { id: 'kuat', label: 'Kuat', amount: 0.25 }
]

export const TRANSITIONS: { id: TransitionId; label: string; ffmpeg: string | null }[] = [
  { id: 'fade', label: 'Pudar', ffmpeg: 'fade' },
  { id: 'cut', label: 'Potong langsung', ffmpeg: null },
  { id: 'slideleft', label: 'Geser ke kiri', ffmpeg: 'slideleft' },
  { id: 'slideright', label: 'Geser ke kanan', ffmpeg: 'slideright' },
  { id: 'slideup', label: 'Geser ke atas', ffmpeg: 'slideup' },
  { id: 'wipeleft', label: 'Sapu ke kiri', ffmpeg: 'wipeleft' },
  { id: 'circleopen', label: 'Lingkaran membuka', ffmpeg: 'circleopen' },
  { id: 'zoomin', label: 'Zoom tembus', ffmpeg: 'zoomin' },
  { id: 'squeezev', label: 'Himpit', ffmpeg: 'squeezev' },
  { id: 'blur', label: 'Blur', ffmpeg: 'hblur' }
]

export const TRANSITION_SEC = 0.4

/** Transition lengths the editor offers, in seconds. */
export const TRANSITION_MIN_SEC = 0.2
export const TRANSITION_MAX_SEC = 2

/** How long the transition from a clip into the next one lasts, in seconds; 0 for a cut. */
export function transitionSecOf(clip: { transition: TransitionId; transitionMs: number | null }): number {
  if (clip.transition === 'cut') return 0
  const ms = clip.transitionMs ?? TRANSITION_SEC * 1000
  return Math.min(TRANSITION_MAX_SEC, Math.max(TRANSITION_MIN_SEC, ms / 1000))
}

export function strengthAmount(strength: MotionStrength): number {
  return MOTION_STRENGTHS.find((s) => s.id === strength)?.amount ?? 0.08
}

const smooth = (p: number): number => {
  const c = Math.min(1, Math.max(0, p))
  return c * c * (3 - 2 * c)
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** p is progress 0..1 through the clip, t is seconds since the clip started. */
export function cameraAt(preset: CameraPresetId, strength: MotionStrength, p: number, t: number): CameraFrame {
  const s = strengthAmount(strength)
  const e = smooth(p)
  switch (preset) {
    case 'zoomin':
      return { zoom: lerp(1, 1 + s, e), x: 0, y: 0 }
    case 'zoomout':
      return { zoom: lerp(1 + s, 1, e), x: 0, y: 0 }
    case 'panleft':
      return { zoom: 1 + s, x: lerp(0.9, -0.9, e), y: 0 }
    case 'panright':
      return { zoom: 1 + s, x: lerp(-0.9, 0.9, e), y: 0 }
    case 'panup':
      return { zoom: 1 + s, x: 0, y: lerp(0.9, -0.9, e) }
    case 'pandown':
      return { zoom: 1 + s, x: 0, y: lerp(-0.9, 0.9, e) }
    // A diagonal push: the camera moves in while drifting sideways, which reads as more deliberate than a
    // straight zoom and keeps the subject from sitting dead centre.
    case 'zoomleft':
      return { zoom: lerp(1 + s * 0.15, 1 + s, e), x: lerp(0.85, -0.35, e), y: lerp(0.2, -0.2, e) }
    case 'zoomright':
      return { zoom: lerp(1 + s * 0.15, 1 + s, e), x: lerp(-0.85, 0.35, e), y: lerp(-0.2, 0.2, e) }
    case 'kenburns':
      return { zoom: lerp(1 + s * 0.3, 1 + s, e), x: lerp(-0.5, 0.5, e), y: lerp(0.3, -0.3, e) }
    // Starts close and pulls back, as if the camera is stepping away to show the whole place.
    case 'reveal':
      return { zoom: lerp(1 + s * 1.3, 1 + s * 0.1, e), x: lerp(-0.45, 0.45, e), y: lerp(0.35, -0.35, e) }
    // A slow turn. The extra zoom keeps the turned corners inside the picture, so no black wedge shows.
    case 'rotate':
      return { zoom: 1 + s * 0.6 + 0.05, x: 0, y: 0, rot: lerp(-s * 12, s * 12, e) }
    // Two slow waves on each axis, the way a camera held in a hand breathes, instead of shake's fast rattle.
    case 'handheld':
      return {
        zoom: 1 + Math.max(0.05, s * 0.7),
        x: 0.2 * Math.sin(2 * Math.PI * 0.21 * t) + 0.07 * Math.sin(2 * Math.PI * 0.57 * t + 2),
        y: 0.16 * Math.sin(2 * Math.PI * 0.29 * t + 1) + 0.06 * Math.sin(2 * Math.PI * 0.79 * t)
      }
    case 'shake':
      return {
        zoom: 1 + Math.max(0.04, s * 0.5),
        x: 0.35 * Math.sin(2 * Math.PI * 1.3 * t),
        y: 0.3 * Math.sin(2 * Math.PI * 1.7 * t + 1)
      }
    default:
      return { zoom: 1, x: 0, y: 0 }
  }
}

/** CSS transform for an image that exactly covers its frame. */
export function cameraCss(frame: CameraFrame): string {
  const free = ((frame.zoom - 1) / 2) * 100
  const turn = frame.rot ? ` rotate(${frame.rot.toFixed(3)}deg)` : ''
  return `translate(${(-frame.x * free).toFixed(3)}%, ${(-frame.y * free).toFixed(3)}%) scale(${frame.zoom.toFixed(4)})${turn}`
}

/**
 * FFmpeg `perspective` options for the same motion, evaluated per frame, or null for a still camera.
 * The crop window is given in source pixels with fractions and resampled with cubic interpolation, so slow
 * moves glide. (zoompan rounds its window to whole pixels every frame, which makes thin lines shimmer and
 * the picture look shaky.) `frames` is the clip length in output frames.
 */
export function cameraPerspective(preset: CameraPresetId, strength: MotionStrength, frames: number, fps: number): string | null {
  if (preset === 'static') return null
  const s = strengthAmount(strength)
  const n = Math.max(1, frames - 1)
  // perspective counts frames from 1.
  const f = '(on-1)'
  const p = `min(${f}/${n},1)`
  const e = `(${p}*${p}*(3-2*${p}))`
  const t = `(${f}/${fps})`
  const lin = (a: number, b: number): string => `(${a}+(${b - a})*${e})`
  let z = '1'
  let x = '0'
  let y = '0'
  let rot = ''
  switch (preset) {
    case 'zoomin':
      z = lin(1, 1 + s)
      break
    case 'zoomout':
      z = lin(1 + s, 1)
      break
    case 'panleft':
      z = `${1 + s}`
      x = lin(0.9, -0.9)
      break
    case 'panright':
      z = `${1 + s}`
      x = lin(-0.9, 0.9)
      break
    case 'panup':
      z = `${1 + s}`
      y = lin(0.9, -0.9)
      break
    case 'pandown':
      z = `${1 + s}`
      y = lin(-0.9, 0.9)
      break
    case 'zoomleft':
      z = lin(1 + s * 0.15, 1 + s)
      x = lin(0.85, -0.35)
      y = lin(0.2, -0.2)
      break
    case 'zoomright':
      z = lin(1 + s * 0.15, 1 + s)
      x = lin(-0.85, 0.35)
      y = lin(-0.2, 0.2)
      break
    case 'kenburns':
      z = lin(1 + s * 0.3, 1 + s)
      x = lin(-0.5, 0.5)
      y = lin(0.3, -0.3)
      break
    case 'reveal':
      z = lin(1 + s * 1.3, 1 + s * 0.1)
      x = lin(-0.45, 0.45)
      y = lin(0.35, -0.35)
      break
    case 'rotate':
      z = `${1 + s * 0.6 + 0.05}`
      rot = lin(-s * 12, s * 12)
      break
    case 'handheld':
      z = `${1 + Math.max(0.05, s * 0.7)}`
      x = `(0.2*sin(2*PI*0.21*${t})+0.07*sin(2*PI*0.57*${t}+2))`
      y = `(0.16*sin(2*PI*0.29*${t}+1)+0.06*sin(2*PI*0.79*${t}))`
      break
    case 'shake':
      z = `${1 + Math.max(0.04, s * 0.5)}`
      x = `(0.35*sin(2*PI*1.3*${t}))`
      y = `(0.3*sin(2*PI*1.7*${t}+1))`
      break
  }
  // The visible window: 1/zoom of the frame, placed in the free space by x and y (-1 to 1), as in cameraCss.
  const w = `(W/${z})`
  const h = `(H/${z})`
  const left = `((W-${w})*(1+${x})/2)`
  const top = `((H-${h})*(1+${y})/2)`
  const right = `(${left}+${w})`
  const bottom = `(${top}+${h})`
  const common = 'interpolation=cubic:sense=source:eval=frame'
  if (!rot) {
    return `perspective=x0='${left}':y0='${top}':x1='${right}':y1='${top}':x2='${left}':y2='${bottom}':x3='${right}':y3='${bottom}':${common}`
  }
  // Turning the view means turning the window's four corners around the window's own centre. The extra zoom
  // the preset asks for keeps those corners inside the picture, so the turned view shows no black wedge.
  const ang = `(${rot}*PI/180)`
  const ca = `cos(${ang})`
  const sa = `sin(${ang})`
  const cx = `(${left}+${w}/2)`
  const cy = `(${top}+${h}/2)`
  const rx = (px: string, py: string): string => `(${cx}+((${px})-${cx})*${ca}-((${py})-${cy})*${sa})`
  const ry = (px: string, py: string): string => `(${cy}+((${px})-${cx})*${sa}+((${py})-${cy})*${ca})`
  return (
    'perspective=' +
    `x0='${rx(left, top)}':y0='${ry(left, top)}':` +
    `x1='${rx(right, top)}':y1='${ry(right, top)}':` +
    `x2='${rx(left, bottom)}':y2='${ry(left, bottom)}':` +
    `x3='${rx(right, bottom)}':y3='${ry(right, bottom)}':${common}`
  )
}
