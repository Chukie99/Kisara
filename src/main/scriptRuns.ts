import { clipCountFor } from '@shared/models'
import type { ProjectBundle, ScriptProgress } from '@shared/types'
import { emit } from './events'
import { getProject } from './repo'
import { generateScript } from './story'

const runs = new Map<string, { state: ScriptProgress; controller: AbortController; promise: Promise<ProjectBundle> }>()

export function scriptStatus(projectId: string): ScriptProgress | null {
  getProject(projectId)
  return runs.get(projectId)?.state ?? null
}

export function cancelScript(projectId: string): void {
  getProject(projectId)
  const run = runs.get(projectId)
  if (run?.state.status === 'running') run.controller.abort()
}

/** Share one in-flight request per project, and retain its outcome after a renderer remount. */
export function runScript(projectId: string): Promise<ProjectBundle> {
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
    signal: controller.signal,
    progress: (completed, total, message) => publish({ completed, total, message })
  })).then((bundle) => {
    publish({ status: 'done', completed: bundle.clips.length, total: bundle.clips.length, message: `${bundle.clips.length} adegan tersimpan. Naskah siap ditinjau.` })
    return bundle
  }).catch((error: unknown) => {
    const canceled = controller.signal.aborted
    const detail = error instanceof Error ? error.message : 'AI penulis tidak memberikan hasil yang bisa dipakai.'
    const message = canceled ? 'Penyusunan dibatalkan. Naskah lama tetap aman.' : `Naskah belum tersimpan (${run.state.completed}/${run.state.total} adegan). ${detail}`
    publish({ status: canceled ? 'canceled' : 'failed', message })
    throw new Error(message)
  })
  return run.promise
}
