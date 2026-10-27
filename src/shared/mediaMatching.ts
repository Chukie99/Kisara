import type { Clip } from './types'

/** Match explicit scene numbers only; download order is never evidence of a scene association. */
export function matchMediaScene(name: string, clips: Pick<Clip, 'id' | 'title'>[]): string | null {
  const stem = name.replace(/\.[^.]+$/, '')
  const numbered = /^(?:scene|adegan|klip)[ _-]*([0-9]{1,3})(?:[^0-9]|$)/i.exec(stem) ?? /^([0-9]{1,3})(?:[ _.-]|$)/.exec(stem)
  if (numbered) return clips[Number(numbered[1]) - 1]?.id ?? null
  const normal = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const exact = clips.filter(clip => normal(clip.title) === normal(stem))
  return exact.length === 1 ? exact[0].id : null
}
