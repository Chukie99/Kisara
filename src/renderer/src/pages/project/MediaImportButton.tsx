import { useEffect, useRef, useState } from 'react'
import type { MediaImportPlan } from '@shared/production'
import { Button, Modal, Switch } from '../../components/ui'
import { Select } from '../../components/Select'
import { useProject } from '../../store/project'
import { useApp } from '../../store/app'
import { errorText } from '../../lib/format'

export function MediaImportButton(): React.JSX.Element {
  const { project, clips, flush } = useProject()
  const { toast } = useApp()
  const [plan, setPlan] = useState<MediaImportPlan | null>(null)
  const [pairs, setPairs] = useState<Record<string,string>>({})
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [replace, setReplace] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const token = useRef<string | null>(null)
  useEffect(() => () => { if (token.current) void window.api.assets.discardMediaImport(token.current).catch(() => {}) }, [project?.id])
  const close = (): void => {
    if (busy) return
    if (plan) void window.api.assets.discardMediaImport(plan.token).catch(() => {})
    token.current = null; setPlan(null); setError(null)
  }
  const pick = async (): Promise<void> => {
    if (!project || picking || busy) return
    setPicking(true); setError(null)
    const id = project.id
    try {
      await flush()
      const result = await window.api.assets.prepareMediaImport(id)
      if (!result) return
      if (useProject.getState().project?.id !== id) { await window.api.assets.discardMediaImport(result.token); return }
      token.current = result.token; setPlan(result); setReplace(false)
      setPairs(Object.fromEntries(result.rows.map(row => [row.id,row.suggestedClipId ?? ''])))
    } catch (e) { setError(errorText(e)) }
    finally { setPicking(false) }
  }
  const selected = plan?.rows.filter(row => pairs[row.id]) ?? []
  const seen = new Set<string>()
  let duplicates = false
  for (const row of selected) { const pair = pairs[row.id] + ':' + row.kind; if (seen.has(pair)) duplicates = true; seen.add(pair) }
  const replacements = selected.filter(row => { const clip = clips.find(c => c.id === pairs[row.id]); return clip && (row.kind === 'video' ? clip.videoAssetId : clip.imageAssetId || clip.videoAssetId) }).length
  const apply = async (): Promise<void> => {
    if (!plan || !project || busy) return
    setBusy(true); setCanceling(false); setError(null)
    try {
      await flush()
      const result = await window.api.assets.applyMediaImport(project.id,plan.token,plan.rows.map(row => ({fileId:row.id,clipId:pairs[row.id] || null})),replace)
      token.current = null; setPlan(null)
      toast('success',result.imported + ' file dipasang · ' + result.skipped + ' dilewati.')
    } catch(e) { setError(errorText(e)) }
    finally { setBusy(false); setCanceling(false) }
  }
  return <>
    <Button loading={picking} disabled={!project || !clips.length || busy} onClick={() => void pick()}>Impor hasil Flow</Button>
    {!plan && error && <span role="alert" className="max-w-xs text-xs text-bad-ink">{error}</span>}
    <Modal open={!!plan} onClose={close} title="Pasangkan hasil Flow" subtitle="Nomor 001, 002, dan seterusnya dicocokkan ke urutan adegan. Periksa sebelum memasang; file tanpa pasangan bisa dipilih manual atau dilewati." width={920}>
      <p className="text-sm text-ink-2">{selected.length} dipilih dari {plan?.rows.length ?? 0} file. Satu gambar dan satu video boleh menuju adegan yang sama; dua file sejenis harus dipilih salah satu. Video menjadi visual aktif bila keduanya dipasang.</p>
      <div className="flex flex-col gap-2">{plan?.rows.map(row => <div key={row.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 rounded-xl border border-line p-3">
        <div className="min-w-0"><p className="break-all text-sm font-medium">{row.name}</p><p className="mt-1 text-xs text-muted">{row.kind === 'image' ? 'Gambar' : 'Video'}{row.suggestedClipId ? ' · pasangan awal dari nama file' : ' · belum punya pasangan otomatis'}</p></div>
        <Select label={'Tujuan ' + row.name} disabled={busy} value={pairs[row.id] ?? ''} onChange={clipId => setPairs({...pairs,[row.id]:clipId})} options={[{value:'',label:'Lewati file ini'},...clips.map((clip,i)=>({value:clip.id,label:String(i+1).padStart(3,'0') + ' - ' + clip.title}))]} />
      </div>)}</div>
      {!!replacements && <div className="flex items-center gap-3 rounded-xl bg-sun-soft p-3 text-sm"><Switch on={replace} onChange={value => { if (!busy) setReplace(value) }} label="Izinkan mengganti visual lama" /><span>{replacements} visual aktif akan diganti. Aset lama tetap ada di riwayat klip. Impor gambar akan mengaktifkan gambar dan melepas pilihan video aktifnya.</span></div>}
      {duplicates && <p role="alert" className="text-sm text-bad-ink">Ada dua file sejenis menuju satu adegan. Pilih salah satu; pasangan tidak ditebak dari urutan unduhan.</p>}
      {error && <p role="alert" className="rounded-xl bg-bad-soft p-3 text-sm text-bad-ink">{error} Tidak ada pasangan dari percobaan gagal ini yang diterapkan.</p>}
      {busy && <p role="status" className="text-sm">Memeriksa media dan memasang paket. Jendela ini akan terbuka sampai selesai; file besar bisa memerlukan waktu.</p>}
      <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t border-line bg-surface pb-1 pt-3"><Button disabled={canceling} onClick={() => { if (!busy) close(); else if (plan) { setCanceling(true); void window.api.assets.discardMediaImport(plan.token).catch(e => { setError(errorText(e)); setCanceling(false) }) } }}>{busy ? canceling ? 'Membatalkan...' : 'Batalkan impor' : 'Batal'}</Button><Button variant="primary" loading={busy} disabled={!selected.length || duplicates || (!!replacements && !replace)} onClick={() => void apply()}>Pasang {selected.length} file</Button></div>
    </Modal>
  </>
}
