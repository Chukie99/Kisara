import { needsVisual } from '@shared/script'
import type { ProjectBundle, ScriptProgress } from '@shared/types'
import { emit } from './events'
import { getProject, clipsOf } from './repo'
import { generateVisuals } from './story'

const runs = new Map<string, { state: ScriptProgress; controller: AbortController; promise: Promise<ProjectBundle> }>()

export function visualStatus(projectId: string): ScriptProgress | null {
  getProject(projectId)
  return runs.get(projectId)?.state ?? null
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
  const state: ScriptProgress = { projectId, status: 'running', completed: 0, total: clipsOf(projectId).filter((c) => mode === 'all' || needsVisual(c)).length, message: 'Menghubungi AI penulis untuk prompt visual. Layanan gambar tidak dipakai.' }
  const run = { state, controller, promise: undefined as unknown as Promise<ProjectBundle> }
  const publish = (patch: Partial<ScriptProgress>) => {
    run.state = { ...run.state, ...patch }
    emit.visualProgress(run.state)
  }
  runs.set(projectId, run)
  publish({})
  run.promise = Promise.resolve().then(() => generateVisuals(projectId, mode, {
    signal: controller.signal,
    progress: (completed, total, message) => publish({ completed, total, message })
  })).then((bundle) => {
    publish({ status: 'done', completed: bundle.clips.length, total: bundle.clips.length, message: `Prompt visual siap untuk ${bundle.clips.length} adegan. Kamu bisa mengekspor TXT atau DOCX.` })
    return bundle
  }).catch((error: unknown) => {
    const canceled = controller.signal.aborted
    const detail = error instanceof Error ? error.message : 'AI penulis tidak memberikan hasil yang bisa dipakai.'
    const message = canceled ? 'Penyusunan prompt dibatalkan. Naskah tetap aman. Prompt yang sudah diperiksa tersimpan di disk; klik Susun/perbarui prompt untuk melanjutkan.' : `Prompt belum lengkap (${run.state.completed}/${run.state.total} adegan). ${detail}`
    publish({ status: canceled ? 'canceled' : 'failed', message })
    throw new Error(message)
  })
  return run.promise
}
