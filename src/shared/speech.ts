import type { Asset, Clip, Project } from './types'

/**
 * Inline vocal tags in narration, written the Gemini TTS way: English words in angle brackets, like
 * <short pause> or <chuckles>. They steer the voice and are never shown in captions.
 */
export const VOICE_TAGS = ['short pause', 'long pause', 'chuckles', 'laugh', 'sigh', 'gasp', 'whispers', 'breath', 'sad', 'excited', 'angry']

/** A visual cut inside a sentence must not instruct the narrator to stop for a new paragraph. */
export function narrationTakeText(clips: Pick<Clip, 'narration'>[], paragraphSeparator = '\n\n'): string {
  return clips.reduce((text, clip, index) => {
    const previous = index ? stripVoiceTags(clips[index - 1].narration).trim() : ''
    const separator = /[.!?…][”"')]*$/.test(previous) ? paragraphSeparator : ' '
    return text + (index ? separator : '') + clip.narration.trim()
  }, '')
}

export function narrationSpeed(value?: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0.8, Math.min(1.1, value)) * 100) / 100 : 0.9
}

export function speechFingerprint(project: Pick<Project, 'ttsProvider' | 'ttsVoice' | 'editor'> & Partial<Pick<Project, 'language'>>): string {
  const identity = ['pronunciation-v1', project.language ?? 'id', project.ttsProvider, project.ttsVoice, project.ttsProvider === 'supertonic' ? 'local-preset' : project.ttsProvider === 'f5-hf' || project.ttsProvider === 'f5-local' ? 'reference-voice' : effectiveDelivery(project)]
  if (project.ttsProvider === 'supertonic' || project.ttsProvider === 'f5-local') identity.push(String(narrationSpeed(project.editor.narrationSpeed)))
  return JSON.stringify(identity)
}

/** Explicit delivery wins; educational material should not inherit theatrical fiction delivery. */
export function effectiveDelivery(project: Pick<Project, 'editor'>): NonNullable<Project['editor']['voiceDelivery']> {
  return project.editor.voiceDelivery ?? (project.editor.storyBrief?.fictional === true ? 'dramatic' : 'natural')
}

const DIGITS = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan']
function indonesianInteger(n: number): string {
  if (n < 10) return DIGITS[n]
  if (n === 10) return 'sepuluh'
  if (n === 11) return 'sebelas'
  if (n < 20) return DIGITS[n - 10] + ' belas'
  if (n < 100) return DIGITS[Math.floor(n / 10)] + ' puluh' + (n % 10 ? ' ' + DIGITS[n % 10] : '')
  if (n < 200) return 'seratus' + (n % 100 ? ' ' + indonesianInteger(n % 100) : '')
  if (n < 1000) return DIGITS[Math.floor(n / 100)] + ' ratus' + (n % 100 ? ' ' + indonesianInteger(n % 100) : '')
  if (n < 2000) return 'seribu' + (n % 1000 ? ' ' + indonesianInteger(n % 1000) : '')
  for (const [size, label] of [[1e12, 'triliun'], [1e9, 'miliar'], [1e6, 'juta'], [1000, 'ribu']] as const) {
    if (n >= size) return indonesianInteger(Math.floor(n / size)) + ' ' + label + (n % size ? ' ' + indonesianInteger(n % size) : '')
  }
  return String(n)
}

/** Only unambiguous Indonesian money/percent notation is expanded; dates, IDs and URLs stay literal. */
export function pronunciationText(text: string, language: string): string {
  if (language !== 'id') return text
  const number = (value: string): string => {
    const [integer, fraction] = value.replace(/\./g, '').split(',')
    if (!Number.isSafeInteger(Number(integer)) || Number(integer) >= 1e15) return value
    return indonesianInteger(Number(integer)) + (fraction ? ' koma ' + [...fraction].map(d => DIGITS[Number(d)]).join(' ') : '')
  }
  return text.split(/(<[^<>]*>|https?:\/\/\S+)/g).map(part => {
    if (/^(?:<|https?:\/\/)/.test(part)) return part
    return part.replace(/\bRp\.?\s*((?:\d{1,3}(?:\.\d{3})+|\d{1,12})(?:,\d+)?)(?:\s*(ribu|juta|miliar|triliun))?(?![\d,\w]|\.\d)/gi,
    (_match, value: string, scale?: string) => number(value) + (scale ? ' ' + scale.toLowerCase() : '') + ' rupiah')
    .replace(/(?<![\w./:,\-])(\d{1,3}(?:\.\d{3})*|\d{1,12})(,\d+)?\s*%/g, (_match, integer: string, fraction?: string) => number(integer + (fraction ?? '')) + ' persen')
    .replace(/\b(KPR|DP|FLPP|BPS|OJK|BPJS)\b/g, value => ({ KPR: 'ka pe er', DP: 'de pe', FLPP: 'ef el pe pe', BPS: 'be pe es', OJK: 'o je ka', BPJS: 'be pe je es' })[value]!)
  }).join('')
}

export function narrationNeedsRefresh(asset: Asset | null | undefined, clip: Pick<Clip, 'narration'>, project: Pick<Project, 'ttsProvider' | 'ttsVoice' | 'editor'> & Partial<Pick<Project, 'language'>>): boolean {
  if (!clip.narration.trim()) return false
  if (!asset || asset.prompt?.trim() !== clip.narration.trim()) return true
  if (asset.provider === 'demo' || asset.provider === 'local') return false
  return asset.meta.speechFingerprint !== speechFingerprint(project)
}

export const VOICE_DELIVERIES = [
  { id: 'natural', label: 'Natural', style: 'Conversational storyteller, clear and grounded. Vary rhythm with the story. Perform quoted dialogue with a subtle change in intention, then return to the narrator. No exaggerated announcer voice.' },
  { id: 'dramatic', label: 'Dramatis', style: 'Emotionally engaged storyteller. Build tension gradually, give reveals a brief breath, soften vulnerable lines. Act quoted dialogue with distinct intention while keeping the same narrator identity. Avoid constant shouting or theatrical overacting.' },
  { id: 'warm', label: 'Hangat', style: 'Warm, empathetic storyteller. Gentle pace, sincere emotion and intimate delivery. Perform quoted dialogue naturally with a slight change in tone. Keep the narration clear and avoid a flat reading.' },
  { id: 'tense', label: 'Tegang', style: 'Controlled suspense, intimate and alert. Quieter anticipation, deliberate pauses and crisp urgent lines when the story calls for them. Give quoted dialogue its emotional intention. Never shout throughout.' }
] as const

export function deliveryStyle(id?: string): string {
  return (VOICE_DELIVERIES.find((d) => d.id === id) ?? VOICE_DELIVERIES[0]).style + ' Read only the supplied narration in its language. Preserve its words, amounts and units; do not translate, paraphrase, add an introduction or speak stage directions. Follow sentence meaning and punctuation with natural breathing, not an identical pause after every visual scene.'
}

export interface DialogueLine {
  speaker: string
  text: string
  emotion?: string
}

/** Remove speaker headings, not names that are part of a spoken sentence. Keep vocal tags. */
export function stripSpeakerLabels(text: string, speakers: string[] = []): string {
  const names = [...new Set(['Narator', 'Narrator', ...speakers].map(name => name.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length).map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const boundary = String.raw`(^|[\r\n]|[.!?…][”"’]?\s+|[”"]\s+)`
  const heading = new RegExp(boundary + String.raw`[ \t]*((?:<[^<>]{1,40}>\s*)*)(?:\*\*)?(?:` + names + String.raw`)(?:\*\*)?\s*(?::(?:\*\*)?\s*|,\s*(?=(?:<[^<>]{1,40}>\s*)*[“"‘]))`, 'giu')
  return text.replace(heading, '$1$2').trim()
}


/** Keep dialogue in the spoken script itself, so every TTS provider, caption and export receives it. */
export function composeSceneSpeech(narration: string, dialogue: DialogueLine[], vocalTags: boolean): string {
  const lines = dialogue.filter((line) => line && typeof line.speaker === 'string' && typeof line.text === 'string' && line.speaker.trim() && line.text.trim())
  const base = stripSpeakerLabels(narration, lines.map(line => line.speaker))
  const spoken = [base]
  for (const line of lines) {
    const text = stripVoiceTags(line.text).replace(/^[“”"]+|[“”"]+$/g, '')
    if (!text || stripVoiceTags(base).includes(text)) continue
    const tag = vocalTags && ['whispers', 'sad', 'angry', 'excited', 'gasp'].includes(line.emotion ?? '') ? `<${line.emotion}> ` : ''
    spoken.push(`${tag}“${text}”`)
  }
  return spoken.filter(Boolean).join(' ')
}

const ANGLE = /<[^<>]{1,40}>/g
const SQUARE = /\[[^[\]]{1,40}\]/g

/** The words a listener hears: tags removed, spacing tidied. */
export function stripVoiceTags(text: string): string {
  return text.replace(ANGLE, ' ').replace(SQUARE, ' ').replace(/\s+/g, ' ').trim()
}

export function spokenWords(text: string): string[] {
  return stripVoiceTags(text).split(/\s+/).filter(Boolean)
}

/** The local studio has no native vocal-tag support; preserve paragraph pauses without reading directions. */
export function toSupertonicText(text: string): string {
  return text.replace(/<long pause>/gi, '\n\n').replace(ANGLE, ' ').replace(SQUARE, ' ')
    .split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).join('\n').trim()
}

/** Extra seconds the pause tags add to a line. */
export function tagPauseSec(text: string): number {
  const short = (text.match(/<short pause>/gi) ?? []).length
  const long = (text.match(/<long pause>/gi) ?? []).length
  return short * 0.4 + long * 1
}

/**
 * The same line for ElevenLabs: v3 models take tags in square brackets; older models only understand
 * <break> pauses, so other tags are dropped there.
 */
export function toElevenLabsText(text: string, model: string): string {
  if (/v3/i.test(model)) return text.replace(/<([^<>]{1,40})>/g, (_tag, name: string) => {
    const tags: Record<string, string> = { 'short pause': 'short pause', 'long pause': 'long pause', chuckles: 'chuckles', laugh: 'laughs', sigh: 'sighs', gasp: 'gasps', whispers: 'whispers', breath: 'exhales' }
    return `[${tags[name.toLowerCase()] ?? name}]`
  })
  return text
    .replace(/<short pause>/gi, '<break time="0.4s" />')
    .replace(/<long pause>/gi, '<break time="1.0s" />')
    .replace(/<(?!break\b)[^<>]{1,40}>/gi, ' ')
    .replace(/\s{2,}/g, ' ')
}

/** True for word tokens that are only tag syntax (e.g. "[laughs]" or parts of a <break> tag). */
export function isTagToken(word: string): boolean {
  return /[<>[\]=]|^\/$/.test(word)
}
