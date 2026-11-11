import { estimateWordTimings } from './captions'
import { pronunciationText, stripVoiceTags } from './speech'
import { clipCaptionWords } from './timeline'
import type { Asset, Clip, Overlay, ShotRole, TextOverlay } from './types'

export const SHOT_ROLES: { id: ShotRole; label: string }[] = [
  { id: 'situation', label: 'Situasi' }, { id: 'detail', label: 'Detail bukti' },
  { id: 'comparison', label: 'Perbandingan' }, { id: 'reaction', label: 'Reaksi' },
  { id: 'consequence', label: 'Akibat / langkah baru' }, { id: 'chapter', label: 'Pergantian bagian' }
]
const fold = (text: string): string => stripVoiceTags(text).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const words = (text: string, language: string): string[] => fold(pronunciationText(text, language)).split(/\s+/).filter(Boolean)

/** Emphasis is a quote, never a second factual claim invented by the image model. */
export function presentationOverlay(clip: Clip, text: string, quote: string, language: string): TextOverlay | null {
  if (!text.trim() && !quote.trim()) return null
  if (!text.trim() || text.length > 60 || text.trim().split(/\s+/).length > 8 || !quote.trim() || quote.length > 300 || !clip.narration.includes(quote) || fold(text) !== fold(quote))
    throw new Error('Teks penekanan harus berupa kutipan singkat dari narasi adegan, tanpa angka atau klaim tambahan.')
  return { id: 'presentation-' + clip.id, kind: 'text', text: text.trim(), start: 0, end: clip.durationMs / 1000,
    anchor: 8, x: .5, y: .09, size: .055, color: '#FFD43B', style: 'outline', bold: true, animation: 'pop', animationSec: .16,
    presentationCue: { clipId: clip.id, narration: clip.narration, quote, language } }
}

/** One timing calculation for preview, timeline, inspector and export, including voice trims. */
export function resolvePresentationOverlays(overlays: Overlay[], clips: Clip[], assets: Record<string, Asset>): Overlay[] {
  const starts = new Map<string, number>(); let cursor = 0
  for (const clip of clips) { starts.set(clip.id, cursor); cursor += clip.durationMs / 1000 }
  return overlays.flatMap(o => {
    if (o.kind !== 'text' || !o.presentationCue) return [o]
    const cue = o.presentationCue, clip = clips.find(c => c.id === cue.clipId)
    if (!clip || clip.narration !== cue.narration) return []
    const audio = clip.audioAssetId ? assets[clip.audioAssetId] : undefined
    const duration = audio?.durationMs ?? clip.durationMs
    const source = audio?.meta.words?.length ? audio.meta.words : estimateWordTimings(pronunciationText(clip.narration, cue.language), duration / 1000)
    const shown = clipCaptionWords(clip, source, duration).words
    const tokens = shown.flatMap(w => words(w.text, cue.language).map(text => ({ text, start: w.start, end: w.end })))
    const needle = words(cue.quote, cue.language)
    const index = tokens.findIndex((_, i) => needle.length > 0 && needle.every((word, j) => tokens[i + j]?.text === word))
    if (index < 0) return []
    const localStart = Math.max(0, tokens[index].start), localEnd = Math.min(clip.durationMs / 1000, Math.max(localStart + 1.2, tokens[index + needle.length - 1].end + .35))
    if (localEnd - localStart < .3) return []
    const start = starts.get(clip.id)!
    return [{ ...o, start: start + localStart, end: start + localEnd }]
  })
}
