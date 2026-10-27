import { useEffect, useState } from 'react'
import { inspectScript, scriptReviewKey } from '@shared/scriptReview'
import { SourceReview } from '../../components/SourceEditor'
import { Button } from '../../components/ui'
import { errorText } from '../../lib/format'
import { useProject } from '../../store/project'

export function ScriptReviewPanel({ onScene }: { onScene: (clipId: string) => void }): React.JSX.Element | null {
  const { project, clips, flush, updateEditor } = useProject()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setError(null); setBusy(false) }, [project?.id])
  if (!project) return null
  const key = scriptReviewKey(project, clips)
  const report = project.editor.scriptAssessment
  const current = report?.fingerprint === key
  const findings = [...inspectScript(project, clips), ...(current ? report.findings : [])]
  const review = async (): Promise<void> => {
    if (busy) return
    setBusy(true); setError(null)
    const id = project.id
    try {
      await flush()
      const result = await window.api.story.reviewScript(id)
      const state = useProject.getState()
      if (state.project?.id !== id) return
      if (scriptReviewKey(state.project, state.clips) !== result.fingerprint) throw new Error('Naskah berubah saat diperiksa. Jalankan pemeriksaan lagi untuk versi terbaru.')
      updateEditor({ scriptAssessment: result })
    } catch (e) { if (useProject.getState().project?.id === id) setError(errorText(e)) }
    finally { if (useProject.getState().project?.id === id) setBusy(false) }
  }
  return <section aria-label="Pemeriksaan kualitas naskah" className="rounded-xl border border-line bg-surface p-4">
    <details>
      <summary className="cursor-pointer text-sm font-semibold">Periksa naskah <span className="ml-2 font-normal text-muted">{findings.length ? findings.length + ' hal untuk ditinjau' : 'Tidak ada masalah pola yang terdeteksi'}</span></summary>
      <div className="mt-4 flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-muted">Pemeriksaan lokal mencari teks kosong, pengulangan, istilah, dan durasi. Temuan adalah petunjuk penyuntingan; bukan verifikasi fakta atau jaminan monetisasi.</p>
        <div className="flex flex-wrap items-center gap-3"><Button size="sm" loading={busy} onClick={() => void review()}>Minta tinjauan AI</Button><span className="text-xs text-muted">Memakai model penulis yang kamu pilih; mengirim naskah dan memakai kuota layanan.</span></div>
        {busy && <p role="status" className="text-sm">AI sedang memeriksa naskah. Batas waktu 90 detik; kamu bisa tetap membaca.</p>}
        {report && !current && <p className="text-sm text-sun-ink">Naskah atau ide berubah. Tinjauan AI sebelumnya sudah tidak berlaku.</p>}
        {current && <p className="text-xs text-muted">Tinjauan AI tersimpan untuk versi naskah ini. {report.findings.length === 0 ? 'AI tidak menandai masalah tambahan; tetap tinjau hasilnya sendiri.' : ''}</p>}
        {findings.map(finding => <article key={finding.id} className="rounded-lg border border-line bg-paper p-3 text-sm">
          <div className="flex items-center gap-2"><strong>{finding.title}</strong><span className="ml-auto text-xs text-muted">{finding.origin === 'ai' ? 'Tinjauan AI' : 'Pola lokal'}</span></div>
          <p className="mt-2 leading-relaxed text-ink-2">{finding.detail}</p>
          {finding.quote && <blockquote className="mt-2 max-h-32 overflow-y-auto border-l-2 border-line-2 pl-3 text-xs leading-relaxed text-muted">{finding.quote}</blockquote>}
          {!!finding.clipIds.length && <div className="mt-2 flex flex-wrap gap-2">{finding.clipIds.map(id => { const index = clips.findIndex(c => c.id === id); return index < 0 ? null : <Button key={id} size="sm" onClick={() => onScene(id)}>Buka adegan {String(index+1).padStart(3,'0')}</Button> })}</div>}
        </article>)}
        <SourceReview brief={project.editor.storyBrief} />
      </div>
    </details>
    {error && <p role="alert" className="mt-3 rounded-lg bg-bad-soft p-3 text-sm text-bad-ink">Tinjauan AI belum selesai. {error} Pemeriksaan lokal tetap bisa dipakai; naskah tidak diubah.</p>}
  </section>
}
