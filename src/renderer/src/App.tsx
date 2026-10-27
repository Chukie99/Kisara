import { useEffect } from 'react'
import { ConfirmHost } from './components/ui'
import { Toasts } from './components/Toasts'
import { Home } from './pages/Home'
import { ProjectPage } from './pages/project/ProjectPage'
import { Settings } from './pages/Settings'
import { useApp } from './store/app'
import { useProject } from './store/project'
import { errorText } from './lib/format'

const KIND_LABEL: Record<string, string> = {
  image: 'Gambar',
  sheet: 'Lembar karakter',
  video: 'Video AI',
  tts: 'Suara',
  export: 'Ekspor'
}

/** Compact mode is a smaller root font size, which tightens every rem-based gap in the interface. */
export function applyDensity(density: 'nyaman' | 'padat'): void {
  document.documentElement.classList.toggle('density-padat', density === 'padat')
}

export function App() {
  const route = useApp((s) => s.route)

  // Read the density preference once at start; the Settings page applies a change as it happens.
  useEffect(() => {
    void window.api.settings.get().then((s) => applyDensity(s.density))
  }, [])

  useEffect(() => {
    const p = useProject.getState
    const offs = [
      window.api.on.production((bundle) => {
        if (p().project?.id === bundle.project.id) p().load(bundle)
      }),
      window.api.on.editor(({ projectId, patch, sfxAdded }) => {
        const project = p().project
        if (project?.id !== projectId) return
        if (sfxAdded) {
          if (project.editor.autoSound === false) return
          const local = project.editor.sfx ?? []
          const added = sfxAdded.filter((fx) => !local.some((existing) => existing.id === fx.id || (existing.clipId === fx.clipId && !!fx.clipId) || (!existing.clipId && Math.abs(existing.start - fx.start) < 0.5)))
          p().updateEditor({ ...patch, sfx: [...local, ...added] })
        } else p().updateEditor(patch)
      }),
      window.api.on.job((job) => {
        p().upsertJob(job)
        const { toast } = useApp.getState()
        if (job.status === 'failed' && job.error) toast('error', `${KIND_LABEL[job.kind] ?? 'Proses'} gagal: ${job.error}`)
        if (job.status === 'done' && job.kind === 'export' && job.message) {
          const path = job.message
          toast('success', 'Video selesai diekspor.', { label: 'Buka folder', run: () => void window.api.exporter.reveal(path) })
        }
      }),
      window.api.on.clip((e) => p().applyClip(e.clipId, e.patch)),
      window.api.on.character((e) => p().applyCharacter(e.characterId, e.patch)),
      window.api.on.asset((a) => p().addAsset(a))
    ]
    return () => offs.forEach((off) => off())
  }, [])

  // Finish any pending save before the window closes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      const s = useProject.getState()
      if (s.saveState === 'dirty' || s.saveState === 'saving' || s.saveState === 'error') {
        e.preventDefault()
        e.returnValue = ''
        void s.flush().then(() => window.close()).catch((error) => useApp.getState().toast('error', errorText(error)))
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  return (
    <>
      {route.name === 'home' && <Home />}
      {route.name === 'settings' && <Settings />}
      {route.name === 'project' && <ProjectPage key={route.id} id={route.id} />}
      <Toasts />
      <ConfirmHost />
    </>
  )
}
