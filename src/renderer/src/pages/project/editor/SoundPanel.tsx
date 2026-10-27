import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Play, Plus, Search, Sparkles, Trash2, X } from 'lucide-react'
import { sceneStart } from '@shared/sound'
import { soundSpan } from '@shared/sound'
import type { SfxHit, SfxOverlay } from '@shared/types'
import { Button, IconButton, Switch, cx, inputCls } from '../../../components/ui'
import { Select } from '../../../components/Select'
import { errorText, timecode } from '../../../lib/format'
import { useProject } from '../../../store/project'
import { isRunning, jobFor } from '../../../store/project'
import { useApp } from '../../../store/app'
import { usePlayback, useSfxUi } from './engine'

export function SoundPanel() {
  const { project, clips, assets, jobs, updateEditor, flush, addAsset } = useProject()
  const { toast, go } = useApp()
  const [query, setQuery] = useState('')
  const [clipId, setClipId] = useState('playhead')
  const [hits, setHits] = useState<SfxHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const selectedId = useSfxUi((s) => s.selectedId)
  const searchId = useRef(0)
  useEffect(() => () => { audio.current?.pause(); searchId.current++ }, [])
  useEffect(() => usePlayback.subscribe((state) => {
    if (state.playing) { audio.current?.pause(); setPreviewing(null) }
  }), [])
  if (!project) return null
  const effects = project.editor.sfx ?? []
  const soundJob = jobFor(jobs, 'sfx', {})
  const soundRunning = isRunning(soundJob)
  const total = clips.reduce((n, c) => n + c.durationMs / 1000, 0)
  const patch = (id: string, change: Partial<SfxOverlay>): void => {
    const state = useProject.getState()
    state.updateEditor({ sfx: (state.project?.editor.sfx ?? []).map((fx) => fx.id === id ? { ...fx, ...change } : fx) })
  }
  const find = async (text = query): Promise<void> => {
    if (!text.trim()) return
    const request = ++searchId.current
    setSearching(true)
    try {
      const results = await window.api.sfx.search(text)
      if (request === searchId.current) setHits(results)
    } catch (e) {
      if (request === searchId.current) toast('error', errorText(e))
    } finally {
      if (request === searchId.current) setSearching(false)
    }
  }
  const plan = async (): Promise<void> => {
    setPlanning(true)
    try {
      await flush()
      const soundPlan = await window.api.story.soundPlan(project.id)
      if (useProject.getState().project?.id === project.id) updateEditor({ soundPlan })
      if (!soundPlan.length) toast('info', 'Cerita ini tidak memerlukan efek tambahan menurut AI. Kamu tetap bisa mencari sendiri.')
    } catch (e) { toast('error', errorText(e)) }
    finally { setPlanning(false) }
  }
  const preview = (hit: SfxHit): void => {
    audio.current?.pause()
    if (previewing === hit.id) { setPreviewing(null); return }
    usePlayback.getState().pause()
    const el = new Audio(hit.url)
    el.volume = 0.5
    audio.current = el
    setPreviewing(hit.id)
    el.onended = () => setPreviewing(null)
    void el.play().catch(() => { setPreviewing(null); toast('error', 'Pratinjau efek tidak bisa diputar.') })
  }
  const add = async (hit: SfxHit): Promise<void> => {
    setAdding(hit.id)
    audio.current?.pause()
    setPreviewing(null)
    try {
      const asset = await window.api.sfx.add(project.id, hit)
      const state = useProject.getState()
      if (state.project?.id !== project.id) return
      const start = clipId === 'playhead' ? usePlayback.getState().t : sceneStart(state.clips, clipId)
      if (start == null) throw new Error('Adegan sudah dihapus. Pilih posisi efek lagi.')
      const duration = state.clips.reduce((n, c) => n + c.durationMs / 1000, 0)
      if (start >= duration) throw new Error('Geser playhead ke dalam video sebelum menambah efek.')
      addAsset(asset)
      state.updateEditor({ sfx: [...(state.project.editor.sfx ?? []), { id: crypto.randomUUID(), assetId: asset.id, label: hit.name, start, volumeDb: -12 }] })
      toast('success', 'Efek ditambahkan ke timeline.')
    } catch (e) { toast('error', errorText(e)) }
    finally { setAdding(null) }
  }
  return (
    <div className="flex flex-col text-[13px]">
      <section className="flex flex-col gap-3 border-b border-line p-4">
        <div><h2 className="font-semibold">Desain suara</h2><p className="mt-1 text-xs leading-relaxed text-muted">Efek mengikuti momen cerita. Musik latar tetap di panel Musik.</p></div>
        <label className="flex items-center justify-between gap-3 text-xs"><span>Pasang efek setelah membuat narasi</span><Switch label="Efek cerita otomatis" on={project.editor.autoSound !== false} onChange={(autoSound) => updateEditor({ autoSound })} /></label>
        <Button size="sm" variant="primary" loading={soundRunning} disabled={!clips.length} onClick={async () => {
          try {
            updateEditor({ autoSound: true })
            await flush()
            await window.api.sfx.auto(project.id)
          } catch (e) { toast('error', errorText(e)) }
        }}>Pasang efek cerita sekarang</Button>
        <p className="text-[11px] leading-relaxed text-muted">Efek benar-benar ditambahkan ke timeline. Jika Freesound belum terhubung atau tidak ada hasil yang cocok, aplikasi memakai efek sintetis bawaan yang tersedia. Efek yang dipasang manual dipertahankan.</p>
        {soundJob?.message && <p className="text-xs text-accent-dark">{soundJob.message}</p>}
        <Button size="sm" icon={<Sparkles className="size-4" />} loading={planning} disabled={!clips.length} onClick={() => void plan()}>Susun saran dari cerita</Button>
        {(project.editor.soundPlan ?? []).filter((cue) => clips.some((c) => c.id === cue.clipId)).map((cue) => (
          <button key={cue.clipId} type="button" onClick={() => { setQuery(cue.query); setClipId(cue.clipId); void find(cue.query) }} className="rounded-lg border border-line bg-paper p-3 text-left hover:border-line-3">
            <span className="text-[11px] text-accent-dark">{clips.find((c) => c.id === cue.clipId)?.title}</span>
            <span className="mt-1 block font-medium">{cue.label}</span><span className="mt-1 block text-xs leading-relaxed text-muted">{cue.reason}</span>
          </button>
        ))}
      </section>
      <section className="flex flex-col gap-3 border-b border-line p-4">
        <h2 className="font-semibold">Cari efek · Freesound</h2>
        <form onSubmit={(e) => { e.preventDefault(); void find() }} className="flex gap-2">
          <input className={`${inputCls} min-w-0 flex-1 text-sm`} aria-label="Cari efek suara" placeholder="rain, door, footsteps…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <IconButton label="Cari efek" size={36} disabled={searching || !query.trim()} onClick={() => void find()}><Search className="size-4" /></IconButton>
          <button type="submit" className="sr-only">Cari</button>
        </form>
        <p className="text-[11px] leading-relaxed text-muted">Pencarian dibatasi ke CC0. Lisensi ini mengizinkan penggunaan komersial, tetapi bukan jaminan bebas klaim. Periksa halaman sumbernya.</p>
        <button type="button" onClick={async () => { try { await flush(); go({ name: 'settings', back: { name: 'project', id: project.id } }) } catch (e) { toast('error', errorText(e)) } }} className="self-start text-xs text-accent-dark hover:underline">Atur token Freesound</button>
        <Select label="Posisi efek" value={clipId} onChange={setClipId} options={[{ value: 'playhead', label: 'Di posisi playhead' }, ...clips.map((c, i) => ({ value: c.id, label: `${i + 1}. ${c.title}` }))]} />
        {searching && <p className="text-muted">Mencari efek…</p>}
        {hits?.length === 0 && <p className="text-muted">Tidak ada hasil CC0. Coba kata yang lebih sederhana.</p>}
        {hits?.map((hit) => (
          <div key={hit.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
            <div className="flex items-start gap-2"><p className="min-w-0 flex-1 break-words font-medium">{hit.name}</p><button type="button" aria-label={`Sumber ${hit.name}`} onClick={() => void window.api.app.openExternal(hit.pageUrl)} className="text-muted hover:text-ink"><ExternalLink className="size-4" /></button></div>
            <p className="text-[11px] text-muted">{hit.author} · {Math.round(hit.duration * 10) / 10} dtk · {hit.license}</p>
            <div className="flex gap-2"><Button size="sm" variant="ghost" icon={previewing === hit.id ? <X className="size-3" /> : <Play className="size-3" />} onClick={() => preview(hit)}>{previewing === hit.id ? 'Berhenti' : 'Dengar'}</Button><Button size="sm" icon={<Plus className="size-3" />} loading={adding === hit.id} disabled={!!adding || !total} onClick={() => void add(hit)}>Pakai</Button></div>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">Efek di timeline · {effects.length}</h2>
        {!effects.length && <p className="text-xs leading-relaxed text-muted">Belum ada efek. Pilih saran cerita atau cari suara, dengarkan, lalu klik Pakai.</p>}
        {effects.map((fx) => {
          const asset = assets[fx.assetId]
          const start = asset ? soundSpan(fx, asset, total, clips).start : fx.start
          return (
          <div key={fx.id} onFocusCapture={() => useSfxUi.getState().select(fx.id)} className={cx('flex flex-col gap-2 rounded-lg border border-line p-3', selectedId === fx.id && 'ring-2 ring-accent')}>
            <div className="flex items-start gap-2"><button type="button" onClick={() => usePlayback.getState().seek(start)} className="min-w-0 flex-1 break-words text-left font-medium">{fx.label}</button><button type="button" aria-label={`Hapus efek ${fx.label}`} onClick={() => updateEditor({ sfx: effects.filter((e) => e.id !== fx.id) })}><Trash2 className="size-4 text-muted" /></button></div>
            <label className="flex items-center gap-2 text-xs text-muted">Mulai (dtk)<input type="number" min={0} max={total} step={0.1} value={Math.round(start * 1000) / 1000} onChange={(e) => { const value = e.currentTarget.valueAsNumber; if (Number.isFinite(value)) patch(fx.id, { start: Math.max(0, Math.min(total, value)), clipId: undefined, offsetSec: undefined, source: undefined }) }} className={`${inputCls} w-24 text-xs`} /></label>
            <label className="flex items-center gap-2 text-xs text-muted">Volume<input type="range" min={-36} max={0} value={fx.volumeDb} onChange={(e) => patch(fx.id, { volumeDb: Number(e.target.value) })} aria-label={`Volume ${fx.label}`} className="min-w-0 flex-1" /><span>{fx.volumeDb} dB</span></label>
            <p className="text-[11px] text-muted">{timecode(start)} · {fx.clipId ? 'Mengikuti adegan · ' : ''}{String(asset?.meta.license ?? 'Periksa sumber audio')}</p>
          </div>
        )})}
        {!!effects.length && <p className="text-[11px] leading-relaxed text-muted">Daftar sumber dan lisensi audio ikut disimpan di samping MP4 saat ekspor.</p>}
      </section>
    </div>
  )
}
