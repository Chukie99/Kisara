import type { ImageOverlay, Overlay, TextOverlay, TextOverlayStyle } from './types'

/**
 * Logos, watermarks and text drawn over the video. The editor preview and the FFmpeg export both read
 * these helpers, so an overlay lands in the same spot in both.
 */

export type Anchor = Overlay['anchor']

/** Gap between a corner overlay and the frame edge, as a fraction of the frame width. */
export const OVERLAY_MARGIN = 0.035

export const TEXT_SIZES: { id: string; label: string; size: number }[] = [
  { id: 'kecil', label: 'Kecil', size: 0.045 },
  { id: 'sedang', label: 'Sedang', size: 0.065 },
  { id: 'besar', label: 'Besar', size: 0.09 }
]

export const TEXT_COLORS = ['#FFFFFF', '#1F1D1A', '#FFD43B', '#E4572E', '#4DABF7', '#51CF66']

export const TEXT_STYLES: { id: TextOverlayStyle; label: string }[] = [
  { id: 'box', label: 'Kotak' },
  { id: 'outline', label: 'Garis' },
  { id: 'plain', label: 'Polos' }
]

/** Where the anchor sits on the overlay itself: 0, 0.5 or 1 of its width (ax) and height (ay). Numpad layout. */
export function anchorOffset(anchor: Anchor): { ax: number; ay: number } {
  const col = (anchor - 1) % 3
  const row = Math.floor((anchor - 1) / 3)
  return { ax: col / 2, ay: row === 2 ? 0 : row === 1 ? 0.5 : 1 }
}

/** The frame point matching an anchor preset, with the same pixel margin from the side and the top or bottom. */
export function anchorPoint(anchor: Anchor, frameAspect: number): { x: number; y: number } {
  const { ax, ay } = anchorOffset(anchor)
  const mx = OVERLAY_MARGIN
  const my = OVERLAY_MARGIN * frameAspect
  return { x: ax === 0 ? mx : ax === 1 ? 1 - mx : 0.5, y: ay === 0 ? my : ay === 1 ? 1 - my : 0.5 }
}

export function overlayEnd(o: Overlay, total: number): number {
  return Math.min(o.end ?? total, total)
}

export function overlayVisible(o: Overlay, t: number, total: number): boolean {
  return t >= o.start && t < overlayEnd(o, total)
}

/** Dark ink for light text and white for dark text: used for boxes and outlines. */
export function contrastColor(hex: string): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#1F1D1A' : '#FFFFFF'
}

/** Box padding, outline width and shadow offset, in pixels, for text of `fontPx`. */
export function textEffects(style: TextOverlayStyle, fontPx: number): { pad: number; outline: number; shadow: number } {
  return {
    pad: style === 'box' ? Math.round(fontPx * 0.28) : 0,
    outline: style === 'outline' ? Math.max(1, Math.round(fontPx * 0.08)) : 0,
    shadow: style === 'plain' ? Math.max(1, Math.round(fontPx * 0.05)) : 0
  }
}

export function newImageOverlay(assetId: string, frameAspect: number): ImageOverlay {
  return {
    id: crypto.randomUUID(),
    kind: 'image',
    assetId,
    anchor: 9,
    ...anchorPoint(9, frameAspect),
    width: frameAspect >= 1 ? 0.14 : 0.24,
    opacity: 0.9,
    start: 0,
    end: null
  }
}

export function newTextOverlay(start: number, end: number, frameAspect: number): TextOverlay {
  return {
    id: crypto.randomUUID(),
    kind: 'text',
    text: 'Teks baru',
    animation: 'fade',
    anchor: 8,
    ...anchorPoint(8, frameAspect),
    size: 0.065,
    color: '#FFFFFF',
    style: 'box',
    bold: true,
    start,
    end
  }
}

export const TEXT_ANIMATIONS = [{ id: 'none', label: 'Diam' }, { id: 'fade', label: 'Pudar' }, { id: 'pop', label: 'Membesar' }, { id: 'slideup', label: 'Naik perlahan' }] as const
export const OVERLAY_FPS = 30
const bound = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo))
export interface TextFrame { text: string; opacity: number; scale: number; dy: number }
/** A shared, deterministic frame for seeking, preview and ASS export, including backwards counters. */
export function textOverlayFrame(o: TextOverlay, time: number, total: number): TextFrame {
  const t = Math.max(o.start, Math.floor((time + 1e-8) * OVERLAY_FPS) / OVERLAY_FPS)
  const length = Math.max(0, overlayEnd(o, total) - o.start)
  const duration = Math.min(length / 2, bound(o.animationSec ?? 0.35, 0.1, 2))
  const animated = !!o.animation && o.animation !== 'none'
  const enter = duration ? bound((t - o.start) / duration, 0, 1) : 1
  const leave = duration ? bound((overlayEnd(o, total) - t) / duration, 0, 1) : 1
  const opacity = animated ? Math.min(enter, leave) : 1
  let text = o.text
  if (o.counter) {
    const c = o.counter, p = bound((t - o.start + bound(c.offset ?? 0, 0, 1e12)) / bound(c.duration, 0.1, 10), 0, 1)
    const value = bound(c.from, -1e12, 1e12) + (bound(c.to, -1e12, 1e12) - bound(c.from, -1e12, 1e12)) * p
    const decimals = Math.round(bound(c.decimals, 0, 2))
    const formatted = new Intl.NumberFormat('id-ID', {minimumFractionDigits: decimals, maximumFractionDigits: decimals}).format(Math.abs(value) < 0.5 * 10 ** -decimals ? 0 : value)
    text = [o.text, c.prefix + formatted + c.suffix].filter(Boolean).join('\n')
  }
  return { text, opacity, scale: o.animation === 'pop' ? 0.82 + 0.18 * opacity : 1, dy: o.animation === 'slideup' ? 0.035 * (1 - enter) : 0 }
}
/** Only entry, counter and exit need per-frame events; long static holds stay one event. */
export function textOverlayFrames(o: TextOverlay, total: number): { start: number; end: number; frame: TextFrame }[] {
  const end = overlayEnd(o, total)
  if (!(end > o.start)) return []
  const animated = !!o.animation && o.animation !== 'none'
  const duration = animated ? Math.min((end - o.start) / 2, bound(o.animationSec ?? 0.35, 0.1, 2)) : 0
  const activeEnd = Math.min(end, o.start + Math.max(duration, o.counter ? Math.max(0,bound(o.counter.duration, 0.1, 10) - bound(o.counter.offset ?? 0,0,1e12)) : 0))
  const cuts = new Set([o.start, end, activeEnd, Math.max(o.start, end - duration)])
  for (const [a,b] of [[o.start,activeEnd],[end-duration,end]]) {
    for(let tick=Math.ceil(a*OVERLAY_FPS);tick/OVERLAY_FPS<b;tick++) cuts.add(tick/OVERLAY_FPS)
  }
  const points=[...cuts].filter(t=>t>=o.start && t<=end).sort((a,b)=>a-b)
  const out: {start:number;end:number;frame:TextFrame}[]=[]
  for(let i=0;i<points.length-1;i++) {
    const frame=textOverlayFrame(o,points[i],total), previous=out.at(-1)
    if(previous && JSON.stringify(previous.frame)===JSON.stringify(frame)) previous.end=points[i+1]
    else out.push({start:points[i],end:points[i+1],frame})
  }
  return out
}

/** Keep a counter's numeric progress when splitting its timeline item. */
export function splitOverlay(o: Overlay, at: number, id: string): Overlay[] {
  // A manual split fixes the resolved times of both halves instead of reattaching the full quote.
  const first: Overlay = o.kind === 'text' ? { ...o, presentationCue: undefined } : o
  const second: Overlay = {...first,id,start:at}
  if(second.kind==='text' && second.counter) second.counter={...second.counter,offset:(second.counter.offset??0)+at-o.start}
  return [{...first,end:at},second]
}
