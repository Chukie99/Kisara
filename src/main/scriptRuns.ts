import { savedScriptDraftCount } from './scriptDrafts'
import { clipCountFor } from '@shared/models'
import type { ProjectBundle, ScriptProgress } from '@shared/types'
import { emit } from './events'
import { getProject } from './repo'
import { generateScript } from './story'

const runs = new Map<string, { state: ScriptProgress; controller: AbortController; promise: Promise<ProjectBundle> }>()

export function scriptStatus(projectId: string): ScriptProgress | null {
  getProject(projectId)
  const current = runs.get(projectId)?.state
  if (current) return current
  const count = savedScriptDraftCount(projectId)
  return count ? { draftAvailable: true, projectId, status: 'failed', completed: count, total: count, message: 'Draf lengkap tersimpan, tetapi pemeriksaan alur AI belum selesai. Kamu bisa melanjutkan pemeriksaan atau membuka draf untuk ditinjau sendiri.' } : null
}

export function cancelScript(projectId: string): void {
  getProject(projectId)
  const run = runs.get(projectId)
  if (run?.state.status === 'running') run.controller.abort()
}

/** Share one in-flight request per project, and retain its outcome after a renderer remount. */
export function runScript(projectId: string, useSavedDraft = false): Promise<ProjectBundle> {
  const active = runs.get(projectId)
  if (active?.state.status === 'running') return active.promise
  const project = getProject(projectId)
  const controller = new AbortController()
  const state: ScriptProgress = { projectId, status: 'running', completed: 0, total: clipCountFor(project.durationSec), message: 'Menghubungi AI penulis. Tidak ada permintaan ke layanan gambar.' }
  const run = { state, controller, promise: undefined as unknown as Promise<ProjectBundle> }
  const publish = (patch: Partial<ScriptProgress>) => {
    run.state = { ...run.state, ...patch }
    emit.scriptProgress(run.state)
  }
  runs.set(projectId, run)
  publish({})
  run.promise = Promise.resolve().then(() => generateScript(projectId, {
    useSavedDraft,
    signal: controller.signal,
    progress: (completed, total, message) => publish({ completed, total, message })
  })).then((bundle) => {
    publish({ status: 'done', completed: bundle.clips.length, total: bundle.clips.length, message: useSavedDraft ? `${bundle.clips.length} adegan dipulihkan untuk ditinjau. Pemeriksaan AI belum selesai.` : `${bundle.clips.length} adegan tersimpan. Naskah siap ditinjau.` })
    return bundle
  }).catch((error: unknown) => {
    const canceled = controller.signal.aborted
    const detail = error instanceof Error ? error.message : 'AI penulis tidak memberikan hasil yang bisa dipakai.'
    const continuation = detail.includes('Susun naskah') ? '' : ' Klik Susun naskah lagi untuk melanjutkan progres tersimpan jika ide dan pengaturan belum berubah.'
    const message = canceled ? 'Penyusunan dibatalkan. Naskah lama tetap aman.' : `Naskah belum diterapkan (${run.state.completed}/${run.state.total} adegan). ${detail}${continuation}`
    publish({ status: canceled ? 'canceled' : 'failed', message, draftAvailable: savedScriptDraftCount(projectId) > 0 })
    throw new Error(message)
  })
  return run.promise
}
