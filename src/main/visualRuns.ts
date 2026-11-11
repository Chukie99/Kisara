import { needsVisual } from '@shared/script'
import type { ProjectBundle, ScriptProgress } from '@shared/types'
import { emit } from './events'
import { getProject, getBundle } from './repo'
import { readVisualDraft, visualDraftFingerprint, writeVisualDraft } from './visualDrafts'
import { generateVisuals } from './story'

const runs = new Map<string, { state: ScriptProgress; source: string; controller: AbortController; promise: Promise<ProjectBundle> }>()
const sourceKey = (b: ProjectBundle): string => JSON.stringify([visualDraftFingerprint('all', b.project, b.characters, b.clips), b.project.editor.flowMode, b.clips.map(c => [c.videoPrompt, c.characterIds])])

export function visualStatus(projectId: string): ScriptProgress | null {
  getProject(projectId)
  const run = runs.get(projectId)
  const active = run?.state
  if (active?.status === 'running') return active
  const bundle = getBundle(projectId)
  // Keep the real failure on remount; checkpoints must not replace it with a generic cancellation.
  if (run?.source === sourceKey(bundle)) return run.state
  for (const mode of ['missing', 'all'] as const) {
    const draft = readVisualDraft(projectId, visualDraftFingerprint(mode, bundle.project, bundle.characters, bundle.clips))
    if (!draft || (!draft.plan.scenes?.length && !draft.failure)) continue
    const total = bundle.clips.filter(c => mode === 'all' || needsVisual(c) || (bundle.project.editor.flowMode === 'video' && !c.videoPrompt.trim())).length
    const issues = draft.reviewIssues ?? []
    return { projectId, status: draft.failure?.status ?? (issues.length ? 'failed' : 'canceled'), completed: draft.plan.scenes?.length ?? 0, total, visualIssues: issues,
      message: draft.failure?.message ?? (issues.length ? 'Draf prompt tersimpan, tetapi pemeriksaan belum lolos. Tinjau adegan yang ditandai sebelum melanjutkan.' : 'Draf prompt tersimpan. Klik Susun/perbarui prompt untuk melanjutkan pemeriksaan tanpa menulis ulang prompt yang sudah lengkap.') }
  }
  return null
}

export function cancelVisuals(projectId: string): void {
  getProject(projectId)
  const run = runs.get(projectId)
  if (run?.state.status === 'running') run.controller.abort()
}

/** Share one in-flight request per project, and retain its outcome after a renderer remount. */
export function runVisuals(projectId: string, mode: 'missing' | 'all'): Promise<ProjectBundle> {
  const active = runs.get(projectId)
  if (active?.state.status === 'running') return active.promise
  getProject(projectId)
  const controller = new AbortController()
  const initial = getBundle(projectId)
  const state: ScriptProgress = { projectId, status: 'running', completed: 0, total: initial.clips.filter((c) => mode === 'all' || needsVisual(c) || (initial.project.editor.flowMode === 'video' && !c.videoPrompt.trim())).length, message: 'Menghubungi AI penulis untuk prompt visual. Layanan gambar tidak dipakai.' }
  const run = { state, source: '', controller, promise: undefined as unknown as Promise<ProjectBundle> }
  const publish = (patch: Partial<ScriptProgress>) => {
    run.state = { ...run.state, ...patch }
    emit.visualProgress(run.state)
  }
  runs.set(projectId, run)
  publish({})
  run.promise = Promise.resolve().then(() => generateVisuals(projectId, mode, {
    signal: controller.signal,
    progress: (completed, total, message) => publish({ completed, total, message }),
    review: (visualIssues) => publish({ visualIssues })
  })).then((bundle) => {
    run.source = sourceKey(bundle)
    publish({ status: 'done', completed: bundle.clips.length, total: bundle.clips.length, message: `Prompt visual siap untuk ${bundle.clips.length} adegan. Kamu bisa mengekspor TXT atau DOCX.` })
    return bundle
  }).catch((error: unknown) => {
    const canceled = controller.signal.aborted
    const detail = error instanceof Error ? error.message : 'AI penulis tidak memberikan hasil yang bisa dipakai.'
    const message = canceled ? 'Penyusunan prompt dibatalkan. Naskah tetap aman. Prompt yang sudah diperiksa tersimpan di disk; klik Susun/perbarui prompt untuk melanjutkan.' : run.state.total > 0 && run.state.completed >= run.state.total ? `${run.state.completed}/${run.state.total} prompt sudah tersusun, tetapi belum lolos pemeriksaan. ${detail}` : `Prompt baru tersusun ${run.state.completed}/${run.state.total} adegan. ${detail}`
    const latest = getBundle(projectId)
    run.source = sourceKey(latest)
    const draft = readVisualDraft(projectId, visualDraftFingerprint(mode, latest.project, latest.characters, latest.clips))
    if (draft) {
      draft.failure = { status: canceled ? 'canceled' : 'failed', message: message.slice(0, 4000) }
      try { writeVisualDraft(projectId, draft) } catch { /* Preserve the original failure if the disk itself is unavailable. */ }
    }
    publish({ status: canceled ? 'canceled' : 'failed', message })
    throw new Error(message)
  })
  return run.promise
}
