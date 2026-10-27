import type { Character, Clip } from './types'

/** Titles and translated roles are aliases, not new characters. Avoid fuzzy matching two similar names. */
export function characterKey(name: string): string {
  return name.toLowerCase().replace(/['’]s\b/g, '').replace(/\b(?:ustaz|ustadz|ustadzah|pak|bu|bapak|the|female|male)\b/g, ' ')
    .replace(/\b(?:ayah|father)\b/g, 'father').replace(/\b(?:ibu|mother)\b/g, 'mother')
    .replace(/\b(?:pembantu|maid)\b/g, 'maid').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

function aliases(c: Pick<Character, 'name' | 'description'>): string[] {
  const first = c.description.split(/[.!\n]/)[0].trim()
  return [...new Set([characterKey(c.name), ...(first.length < 60 ? [characterKey(first)] : [])])].filter(Boolean)
}

export function resolveCharacter(name: string, chars: Pick<Character, 'id' | 'name' | 'description'>[]): string | null {
  const key = characterKey(name)
  const exact = chars.filter((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase())
  if (exact.length === 1) return exact[0].id
  const matches = chars.filter((c) => aliases(c).includes(key))
  return matches.length === 1 ? matches[0].id : null
}

/** Longer aliases win over contained names: "Ari's father" must not also select Ari. */
export function charactersMentioned(text: string, chars: Character[]): string[] {
  let remaining = ` ${characterKey(text)} `
  const found = new Set<string>()
  const names = chars.flatMap((c) => aliases(c).map((alias) => ({ alias, id: c.id })))
    .sort((a, b) => b.alias.length - a.alias.length)
  for (const { alias, id } of names) {
    if (resolveCharacter(alias, chars) !== id) continue
    const needle = ` ${alias} `
    if (!remaining.includes(needle)) continue
    found.add(id)
    remaining = remaining.split(needle).join(' ')
  }
  return [...found]
}

export function sceneCharacters(clip: Pick<Clip, 'characterIds' | 'visualPrompt'>, chars: Character[]): Character[] {
  // Only visible action and wardrobe can repair old links; narration can mention people who are off screen.
  const visible = clip.visualPrompt.split('\n').filter((line) => /^(?:Action|Wardrobe):/i.test(line.trim())).join(' ')
  const ids = new Set([...clip.characterIds, ...charactersMentioned(visible, chars)])
  return chars.filter((c) => ids.has(c.id))
}
