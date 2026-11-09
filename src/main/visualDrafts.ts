import { readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { projectDir } from './paths'
import type { VisualPlan } from './story'
import { createHash } from 'node:crypto'
import type { Character, Clip, Project, VisualReviewIssue } from '@shared/types'

export interface VisualDraft {
  fingerprint: string
  plan: VisualPlan
  groupSize: number
  reviewIssues?: VisualReviewIssue[]
}

/** Status recovery uses the same source binding as generation, so a stale review cannot block new text. */
export function visualDraftFingerprint(mode: 'missing' | 'all', project: Project, characters: Character[], clips: Clip[]): string {
  return createHash('sha256').update(JSON.stringify(['visual-draft-v6-shot-focus', mode, project.synopsis, project.language, project.styleId, project.aspectRatio, characters.map(c => [c.id, c.name, c.description]), clips.map(c => [c.id, c.title, c.story, c.narration, c.visualPrompt])])).digest('hex')
}

const file = (id: string) => join(projectDir(id), 'visual-draft.json')
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string'

/** A checkpoint is data, never authority: reject malformed or stale files before any plan is reused. */
export function readVisualDraft(projectId: string, fingerprint: string): VisualDraft | null {
  try {
    const path = file(projectId)
    if (statSync(path).size > 8 * 1024 * 1024) return null
    const draft: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (!record(draft) || draft.version !== 1 || draft.fingerprint !== fingerprint || typeof draft.groupSize !== 'number' || ![1, 3, 6].includes(draft.groupSize) || !record(draft.plan)) return null
    const plan = draft.plan
    if (!text(plan.world ?? '') || !Array.isArray(plan.scenes) || !Array.isArray(plan.characters)) return null
    const ids = new Set<number>()
    for (const scene of plan.scenes) {
      if (!record(scene) || !Number.isInteger(scene.scene) || Number(scene.scene) < 1 || ids.has(Number(scene.scene))) return null
      ids.add(Number(scene.scene))
      if (!text(scene.setting) || !scene.setting.trim() || !text(scene.action) || !scene.action.trim() || !Array.isArray(scene.characters) || !scene.characters.every(text)) return null
      if (!Array.isArray(scene.wardrobe) || scene.wardrobe.some((w) => !record(w) || !text(w.name) || !text(w.source) || !text(w.outfit))) return null
      if (['framing', 'avoid', 'camera', 'strength', 'motion', 'transition'].some((key) => scene[key] != null && !text(scene[key]))) return null
    }
    if (plan.characters.some((c) => !record(c) || !text(c.name) || !c.name.trim() || !text(c.identity ?? '') || !text(c.outfit ?? ''))) return null
    const plannedScenes = plan.scenes
    if (draft.reviewIssues != null && (!Array.isArray(draft.reviewIssues) || draft.reviewIssues.length > 20 || draft.reviewIssues.some(issue => !record(issue) || !Number.isInteger(issue.scene) || !text(issue.quote) || !issue.quote.trim() || !text(issue.reason) || !issue.reason.trim() || issue.reason.length > 1800 || (issue.kind != null && !['script', 'visual'].includes(String(issue.kind))) || !plannedScenes.some(scene => record(scene) && scene.scene === issue.scene && text(scene.action) && scene.action.includes(String(issue.quote)))))) delete draft.reviewIssues
    return draft as unknown as VisualDraft
  } catch {
    return null
  }
}

/** Rename a sibling file so a crash never leaves a half-written checkpoint in place. No API keys enter it. */
export function writeVisualDraft(projectId: string, draft: VisualDraft): void {
  const target = file(projectId)
  try {
    writeFileSync(`${target}.tmp`, JSON.stringify({ version: 1, ...draft }), 'utf8')
    renameSync(`${target}.tmp`, target)
  } catch {
    throw new Error('Hasil prompt sementara belum bisa disimpan ke disk. Periksa ruang kosong dan izin folder data, lalu coba lanjutkan.')
  }
}

export function clearVisualDraft(projectId: string): void {
  try { unlinkSync(file(projectId)) } catch { /* A completed plan is already in SQLite; stale checkpoints cannot match it. */ }
}
