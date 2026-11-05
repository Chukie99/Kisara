export type ContentFormat = 'short' | 'long'
export interface FormatPlan { format: ContentFormat; synopsis: string; outline: string[]; estimatedSec: number }
export function formatDirection(format?: ContentFormat): string {
  if(!format)return ''
  return format==='short'
    ? 'SHORT FORMAT: choose ONE specific question or conflict and ONE complete causal path. Narrow the scope before writing. Keep necessary definitions, motives, bridges and the answer; remove side topics instead of squeezing a broad subject into fast disconnected lines. No mandatory minute target before the outline.'
    : 'LONG FORMAT: develop ONE central question or conflict in connected sections. Establish context, necessary definitions or motives, mechanism or consequences, concrete example and a supported resolution. Depth comes from development, not repetition. Estimate duration from the outline rather than filling a preset number of minutes.'
}
export function parseFormatPlan(value: unknown, format: ContentFormat, synopsis: string): FormatPlan {
  const v=value as Partial<FormatPlan>|null
  if(!v || !Array.isArray(v.outline) || v.outline.length<3 || v.outline.length>10 || v.outline.some(s=>typeof s!=='string'||!s.trim()||s.length>1000) || !Number.isFinite(v.estimatedSec) || v.estimatedSec!<(format==='short'?15:120) || v.estimatedSec!>(format==='short'?120:1200))throw new Error('Kerangka atau perkiraan durasi belum cocok dengan format. Coba lagi; ide kamu tetap aman.')
  return {format,synopsis,outline:v.outline.map(s=>s.trim()),estimatedSec:Math.round(v.estimatedSec!)}
}
export function matchingFormatPlan(plan: FormatPlan|undefined, format: ContentFormat|undefined, synopsis: string): FormatPlan|null {
  if (!plan || !format || plan.format !== format || plan.synopsis !== synopsis) return null
  try { return parseFormatPlan(plan, format, synopsis) } catch { return null }
}
