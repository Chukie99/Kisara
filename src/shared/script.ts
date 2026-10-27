import { spokenWords, stripVoiceTags, tagPauseSec } from './speech'
import type { Clip } from './types'

/** Silence kept after each narration line, so scenes do not feel rushed. */
export const VOICE_PAD_MS = 400

/** Spoken words per second assumed when no voice exists yet; matches a normal cloud narrator. */
export const NARRATION_WPS = 2.6

/**
 * Scene length before a voice exists: about `wordsPerSecond` spoken words per second plus a breath. Once
 * the narration is voiced, the clip follows the real audio length instead. Pass the narrator's own speed:
 * the local Supertonic studio speaks far more slowly than a cloud voice, which stretches every clip.
 */
export function estimateNarrationMs(narration: string, wordsPerSecond = NARRATION_WPS): number {
  const words = spokenWords(narration).length
  return Math.round(Math.min(15, Math.max(3, words / wordsPerSecond + 0.6 + tagPauseSec(narration))) * 1000)
}

/** Spoken words only; vocal tags such as <short pause> do not count. */
export function wordCount(text: string): number {
  return spokenWords(text).length
}

/** The plan depends on both story and spoken dialogue; versioning refreshes legacy plans with bad rules. */
export function visualSourceOf(clip: Pick<Clip, 'story' | 'narration'>): string {
  return JSON.stringify(['visual-v2', clip.story.trim().replace(/\s+/g, ' '), stripVoiceTags(clip.narration)])
}

/** A scene needs a (new) visual plan when it has none, or when its story changed after the plan was written. */
export function needsVisual(clip: Pick<Clip, 'story' | 'narration' | 'visualPrompt' | 'visualSource'>): boolean {
  if (!clip.visualPrompt.trim()) return true
  return clip.visualSource != null && clip.visualSource !== visualSourceOf(clip)
}
