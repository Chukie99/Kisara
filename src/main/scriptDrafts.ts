import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { projectDir } from './paths'
import type { ScriptPlan } from './story'

export interface ScriptDraft {
  fingerprint: string
  title?: string
  beats: string[]
  scenes: NonNullable<ScriptPlan['scenes']>
  complete: boolean
}
const file = (id: string): string => join(projectDir(id), 'script-draft.json')
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 30000

/** Reuse only a complete prefix bound to the exact source and existing script. */
export function readScriptDraft(id: string, fingerprint: string, count: number): ScriptDraft | null {
  try {
    const path = file(id)
    if (statSync(path).size > 12 * 1024 * 1024) return null
    const d: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!record(d) || d.version !== 1 || d.fingerprint !== fingerprint || !text(d.title ?? '') || typeof d.complete !== 'boolean' || !Array.isArray(d.beats) || d.beats.length > 160 || !d.beats.every(b => text(b) && b.trim()) || !Array.isArray(d.scenes) || d.scenes.length > 160) return null
    if (count > 32 && (d.beats.length < 3 || d.scenes.length > count || (d.complete && d.scenes.length !== count))) return null
    for (const [i, s] of d.scenes.entries()) {
      if (!record(s) || (count > 32 && s.sourceScene !== i + 1) || !text(s.title ?? '') || !text(s.story ?? '') || !text(s.narration ?? '') || (s.dialogue != null && (!Array.isArray(s.dialogue) || s.dialogue.length > 100 || s.dialogue.some(l => !record(l) || !text(l.speaker) || !text(l.text) || !text(l.emotion ?? ''))))) return null
      if (!(typeof s.narration === 'string' && s.narration.trim()) && !(Array.isArray(s.dialogue) && s.dialogue.some(l => l.speaker.trim() && l.text.trim()))) return null
    }
    return d as unknown as ScriptDraft
  } catch { return null }
}

/** A sibling rename leaves the previous checkpoint intact if writing is interrupted. */
export function writeScriptDraft(id: string, draft: ScriptDraft): void {
  const target = file(id)
  try {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target + '.tmp', JSON.stringify({ version: 1, ...draft }), 'utf8')
    renameSync(target + '.tmp', target)
  } catch { throw new Error('Progres naskah belum bisa disimpan ke disk. Periksa ruang kosong dan izin folder data.') }
}
export function clearScriptDraft(id: string): void {
  try { unlinkSync(file(id)) } catch { /* A committed script changes the fingerprint. */ }
}

/** Metadata for offering recovery after restart; opening still checks the exact current fingerprint. */
export function savedScriptDraftCount(id: string): number {
  try {
    const target = file(id)
    if (statSync(target).size > 12 * 1024 * 1024) return 0
    const d = JSON.parse(readFileSync(target, 'utf8'))
    if (!record(d) || typeof d.fingerprint !== 'string' || !Array.isArray(d.scenes)) return 0
    const draft = readScriptDraft(id, d.fingerprint, d.scenes.length)
    return draft?.complete ? draft.scenes.length : 0
  } catch { return 0 }
}
