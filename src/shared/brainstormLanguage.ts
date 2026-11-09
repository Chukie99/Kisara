import type { BrainstormIdea } from './brainstorm'

const ENGLISH = new Set('the this that these those you your yours they their them we our what which who when why how is are was were been being with without from into than because while but and of to for could would should will have has'.split(' '))
const INDONESIAN = new Set('yang dan atau di ke dari untuk dengan tanpa karena tapi tetapi kalau jika saat ketika bisa dapat akan sudah belum tidak bukan ini itu kamu kita mereka kenapa mengapa bagaimana siapa apa lebih jadi agar supaya pada oleh adalah hingga setelah sebelum walau meski namun anda'.split(' '))

/** A conservative guard for the observed all-English response, not a general language detector. */
export function brainstormHasEnglishProse(ideas: BrainstormIdea[], language: string): boolean {
  if (language !== 'id') return false
  const fields = ideas.flatMap(i => [i.title, i.audience, i.angle, i.hook, i.cta, i.synopsis, i.why, ...i.outline, ...i.checks])
  return fields.some(text => {
    const words = text.toLocaleLowerCase().match(/\p{L}+/gu) ?? []
    const english = words.filter(w => ENGLISH.has(w)).length
    const indonesian = words.filter(w => INDONESIAN.has(w)).length
    return english >= 3 && english > indonesian * 2
  })
}
