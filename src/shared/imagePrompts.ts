import type { Asset, Character, Clip, Project } from './types'
import { getStyle } from './styles'
import { resolveCharacter } from './characters'

export function imageFingerprint(project: Pick<Project, 'styleId' | 'aspectRatio'>, clip: Pick<Clip, 'visualPrompt'>, chars: Character[]): string {
  return JSON.stringify([2, project.styleId, project.aspectRatio, clip.visualPrompt, chars.map((c) => [c.name, c.description]).sort((a, b) => a[0].localeCompare(b[0]))])
}

export function imageNeedsRefresh(asset: Asset | null | undefined, project: Pick<Project, 'styleId' | 'aspectRatio'>, clip: Pick<Clip, 'visualPrompt'>, chars: Character[]): boolean {
  if (!asset) return true
  if (asset.provider === 'local' || asset.provider === 'demo') return false
  return asset.meta.imageFingerprint !== imageFingerprint(project, clip, chars)
}

function fit(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.lastIndexOf(' ', max)
  return clean.slice(0, cut > max / 2 ? cut : max).replace(/[,;:. ]+$/, '')
}

/** Reserve space for identity and wardrobe instead of letting the style paragraph consume the whole prompt. */
export function compactImagePrompt(project: Pick<Project, 'styleId' | 'aspectRatio'>, clip: Pick<Clip, 'visualPrompt'>, chars: Character[], limit: number): string {
  const lines = clip.visualPrompt.split('\n')
  const field = (name: string): string => lines.find((line) => line.trim().toLowerCase().startsWith(`${name.toLowerCase()}:`))?.replace(/^[^:]+:\s*/, '').trim() ?? ''
  const wardrobe = field('Wardrobe').replace(/default outfit as on the reference sheet/gi, 'default').replace(/custom for this scene:|default outfit:|Default:/gi, '').replace(/\s+/g, ' ')
  const identities = chars.map((c) => {
    const row = field('Wardrobe').split(';').find((part) => resolveCharacter(part.split(/\s+-\s+/)[0], chars) === c.id)
    const custom = /custom/i.test(row ?? '')
    return `${c.name}: ${custom ? c.description.split(/Default outfit:/i)[0] : c.description}`
  })
  const head = `${getStyle(project.styleId).tag}. ${project.aspectRatio === '9:16' ? 'Vertical' : 'Wide'} single cinematic illustration. `
  const tail = ' No lettering, speech bubbles, panels or logos.'
  const parts = [
    ...identities.map((text) => ({ text, weight: 0.31 / identities.length })),
    { text: field('Action') || clip.visualPrompt.split(/\n(?:Avoid|Framing):/i)[0], weight: 0.25 },
    { text: [field('World'), field('Setting')].filter(Boolean).join('. '), weight: 0.12 },
    { text: wardrobe && `Clothing: ${wardrobe}`, weight: 0.2 },
    { text: field('Framing'), weight: 0.05 },
    { text: field('Avoid') && `Exclude: ${field('Avoid')}`, weight: 0.07 }
  ].filter((part) => part.text)
  let spare = Math.max(0, limit - head.length - tail.length - parts.length * 2)
  const weight = parts.reduce((n, p) => n + p.weight, 0)
  const budgets = parts.map((p) => Math.floor(spare * p.weight / weight))
  parts.forEach((p, i) => { spare -= Math.min(p.text.length, budgets[i]) })
  parts.forEach((p, i) => {
    const extra = Math.min(spare, Math.max(0, p.text.length - budgets[i]))
    budgets[i] += extra
    spare -= extra
  })
  return `${head}${parts.map((p, i) => fit(p.text, budgets[i])).filter(Boolean).join('. ')}${tail}`.slice(0, limit)
}
