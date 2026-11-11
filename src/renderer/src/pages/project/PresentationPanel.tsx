import { useState } from 'react'
import { SHOT_ROLES } from '@shared/presentation'
import { Button, confirmDialog } from '../../components/ui'
import { useProject } from '../../store/project'
import { useApp } from '../../store/app'
import { errorText } from '../../lib/format'

export function PresentationPanel({ disabled, onPlan, onSelect }: { disabled?: boolean; onPlan?: () => void; onSelect?: (id: string) => void }) {
  const { project, clips, jobs, flush, load } = useProject(), { go, toast } = useApp()
  const [copying, setCopying] = useState(false)
  if (!project || !clips.length) return null
  const shots = project.editor.presentation?.shots ?? []
  const produced = clips.some(clip => clip.imageAssetId || clip.videoAssetId || clip.audioAssetId)
  const active = disabled || copying || Object.values(jobs).some(job => job.status === 'running' || job.status === 'queued')
  const rebuild = async (): Promise<void> => {
    const ok = await confirmDialog({ title: 'Buat versi penyajian baru?', body: 'Kisara membuat salinan proyek dan membagi narasi menjadi shot yang lebih singkat. Gambar, suara dan video pada proyek asal tetap aman. Versi baru memakai naskah yang sama dan perlu disusun prompt, gambar serta suaranya lagi. Belum mengirim generasi berbayar.', confirm: 'Buat versi baru' })
    if (!ok) return
    setCopying(true)
    try { await flush(); const bundle = await window.api.story.presentationVersion(project.id); load(bundle); go({ name: 'project', id: bundle.project.id }); toast('success', 'Versi baru siap. Tinjau shot, lalu susun penyajian & prompt.') }
    catch (error) { toast('error', errorText(error)) } finally { setCopying(false) }
  }
  return <section aria-label="Penyajian acuan" className="rounded-xl border border-line bg-surface p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Penyajian cerita · mengikuti acuan</h2><p className="mt-1 text-xs text-muted">Situasi → detail bukti → perbandingan → reaksi → akibat. Narasi tetap berkesinambungan.</p></div><div className="flex flex-wrap gap-2">{onPlan && !produced && <Button size="sm" disabled={!!active} onClick={onPlan}>Susun penyajian & prompt</Button>}<Button size="sm" loading={copying} disabled={!!active} onClick={()=>void rebuild()}>Buat versi penyajian baru</Button></div></div>
    <p className="mt-3 text-xs leading-relaxed text-muted">{produced ? 'Proyek ini sudah punya media. Gunakan versi baru untuk membagi shot tanpa menimpa hasil yang sudah kamu buat.' : 'Shot panjang dibagi sebelum produksi. Kamera diarahkan ke fokus adegan, mayoritas sambungan memakai cut, dan teks penekanan mengikuti kutipan narasi.'} Teks bisa diedit di Editor → Overlay; menggeser waktunya akan melepas sinkron otomatis untuk teks itu.</p>
    {shots.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold">{shots.length} shot punya tujuan visual · lihat rencana</summary><div className="mt-2 max-h-64 overflow-y-auto divide-y divide-line">{clips.map((clip, i)=>{const shot=shots.find(s=>s.clipId===clip.id);return shot?<button key={clip.id} type="button" disabled={!onSelect} onClick={()=>onSelect?.(clip.id)} className="flex w-full gap-3 py-2 text-left text-xs"><span className="shrink-0 text-accent">{String(i+1).padStart(2,'0')} · {SHOT_ROLES.find(role=>role.id===shot.role)?.label}</span><span>{shot.focus}</span></button>:null})}</div></details>}
  </section>
}
