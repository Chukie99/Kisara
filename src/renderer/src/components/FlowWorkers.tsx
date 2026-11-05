import { useEffect, useRef, useState } from 'react'
import type { FlowProfile, FlowSetup } from '@shared/production'
import { Select } from './Select'
import { Button, inputCls } from './ui'
import { errorText } from '../lib/format'

/** Pair explicitly by account identity; route order alone cannot identify the Google login. */
export function FlowWorkers({browserMode=false}:{browserMode?:boolean}): React.JSX.Element {
  const [profiles,setProfiles]=useState<FlowProfile[]>([])
  const [email,setEmail]=useState('')
  const [opening,setOpening]=useState(false)
  const [data, setData] = useState<FlowSetup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const refreshLock = useRef(false)
  const refresh = async (): Promise<void> => {
    if (refreshLock.current || busy) return
    refreshLock.current = true; setRefreshing(true); setError(null); setNotice(null)
    try {
      const latest = await window.api.settings.flowSetup()
      setData(latest)
      const at = new Date().toLocaleTimeString('id-ID')
      setNotice(latest.workers.length ? 'Daftar diperbarui pukul ' + at + '. ' + latest.workers.length + ' worker tersambung.' : 'Daftar sudah diperiksa pukul ' + at + ', tetapi belum ada worker Chrome tersambung. Buka ekstensi Flow2API Captcha Worker pada profil Chrome akunmu; klik Perbarui daftar setelah tersambung.')
    } catch (e) { setError(errorText(e)) }
    finally { refreshLock.current = false; setRefreshing(false) }
  }
  useEffect(() => { void refresh() }, [])
  const resume = async (): Promise<void> => {
    if (refreshLock.current || busy) return
    setBusy(true); setError(null)
    try { setData(await window.api.settings.resumeFlowGeneration()); setNotice('Jeda lokal dibuka. Coba satu gambar dari proyek; ini belum membuktikan Google menerima generasi.') }
    catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }
  const inspect = async (id: number): Promise<void> => {
    if (busy || refreshLock.current) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const result = await window.api.settings.inspectFlowBrowser(id)
      setNotice(result.blocked ? 'Google menampilkan pembatasan. Selesaikan langsung di browser; otomatisasi tidak dijalankan.' : result.projectOpen ? 'Halaman Flow terbaca: ' + result.fields.length + ' kolom input dan ' + result.buttons.length + ' tombol. Pemeriksaan ini tidak membuat gambar.' : 'Buka satu proyek Flow yang memiliki kotak prompt.')
    } catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }
  const pair = async (id: number): Promise<void> => {
    if (refreshLock.current || busy) return
    setBusy(true); setError(null); setNotice(null)
    try { setData(await window.api.settings.pairFlowRoute(id, selected[id])); setSelected(s => ({...s, [id]: ''})) }
    catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }
  const openBrowser = async (email: string): Promise<void> => {
    setOpening(true);setError(null)
    try { await window.api.settings.openFlowProfile(email);setProfiles(await window.api.settings.flowProfiles());setEmail('') }
    catch(e){setError(errorText(e))}finally{setOpening(false)}
  }
  useEffect(()=>{
    let live=true
    const poll=async ():Promise<void>=>{try{const items=await window.api.settings.flowProfiles();if(live){setProfiles(items);if(items.some(p=>p.status==='ready'))setData(await window.api.settings.flowSetup())}}catch{/* Manual refresh retains a visible error if setup fails. */}}
    void poll();const timer=setInterval(()=>void poll(),5000)
    return ()=>{live=false;clearInterval(timer)}
  },[])
  const ready = data?.accounts.filter(a => (browserMode || a.active) && a.workerConnected && a.imageEnabled).length ?? 0
  return <section aria-label="Pasangkan akun dan worker" className="flex flex-col gap-3 rounded-xl border border-line p-3">
    <div className="flex items-center gap-3"><strong className="flex-1 text-sm">Pasangkan akun dan worker</strong><Button size="sm" aria-label="Perbarui daftar worker Flow" disabled={busy} loading={refreshing} onClick={() => void refresh()}>{refreshing ? 'Memeriksa…' : 'Perbarui daftar'}</Button></div>
    {data?.generationPause && <div role="alert" className="rounded-lg border border-bad-ink p-3 text-sm"><strong>{data.generationPause.retryAllowed ? 'Satu percobaan Flow diizinkan' : 'Generasi Flow dijeda'}</strong><p className="my-2">{data.generationPause.code === 'uncertain_result' ? 'Hasil generasi belum dipastikan sejak ' : 'Google menolak aktivitas tidak biasa pada '}{new Date(data.generationPause.pausedAt).toLocaleString('id-ID')}. Periksa Flow langsung di Chrome. Restart Kisara tidak menghapus jeda ini; tidak ada pengulangan atau perpindahan akun otomatis.</p>{!data.generationPause.retryAllowed && <Button size="sm" disabled={busy || refreshing} onClick={() => void resume()}>Sudah cek Flow · izinkan satu percobaan</Button>}</div>}
    {notice && <p role="status" className="rounded-lg bg-paper p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="text-sm text-bad-ink">{error}</p>}
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3"><strong className="text-sm">Tambah akun dari Kisara</strong><p className="text-xs text-muted">Isi email, lalu login Google di browser khusus yang dibuka. Koneksi dan pemasangan disiapkan otomatis; kamu tidak perlu menyalin token.</p><div className="flex gap-2"><input aria-label="Email akun Flow baru" type="email" className={inputCls} placeholder="Email Google" value={email} onChange={e=>setEmail(e.target.value)} disabled={opening}/><Button loading={opening} disabled={!email.trim()} onClick={()=>void openBrowser(email)}>Tambah akun</Button></div></div>
    {profiles.map(p=><div key={p.id} className="rounded-lg border border-line p-3 text-sm"><strong className="break-all">{p.email}</strong><p className="mt-1 text-xs text-muted">{p.message}</p>{['closed','error'].includes(p.status)&&<Button size="sm" className="mt-2" disabled={opening} onClick={()=>void openBrowser(p.email)}>Buka browser akun</Button>}</div>)}
    {data && <>
      <p role="status" className="text-sm">{ready} akun terhubung ke worker · {data.workers.length} worker Chrome tersambung. Ini belum menguji generasi Google.</p>
      {!data.extensionMode ? <p className="text-xs text-muted">Server memakai metode CAPTCHA lain. Pengaturan worker ini berlaku pada mode extension.</p> : <>
        <p className="text-xs text-muted">Pilih worker dari profil Chrome yang login dengan email akun yang sama. Buka profil Chrome dan Google Flow jika worker belum muncul.</p>
        {data.accounts.map(account => <div key={account.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center gap-2"><span className="flex-1 break-all text-sm font-semibold">{account.email}</span><Button size="sm" disabled={busy || !account.workerConnected} onClick={() => void inspect(account.id)}>Periksa halaman Flow</Button><Button size="sm" disabled={opening} onClick={()=>void openBrowser(account.email)}>Buka browser akun</Button></div>
          <span className="text-xs text-muted">{!account.active && !browserMode ? 'Akun dinonaktifkan' : !account.imageEnabled ? 'Gambar dinonaktifkan' : account.workerConnected ? 'Worker terhubung' : account.routeKey ? 'Worker tidak tersambung' : 'Belum dipasangkan'}{account.routeKey ? ' · ' + account.routeKey : ''}</span>
          <div className="flex items-center gap-2"><Select label={'Worker untuk ' + account.email} value={selected[account.id] ?? ''} onChange={value => setSelected(s => ({...s, [account.id]:value}))} options={[{value:'',label:'Pilih profil Chrome yang sesuai'}, ...[...new Map(data.workers.filter(w=>w.routeKey && (!data.accounts.some(a=>a.id!==account.id&&a.routeKey===w.routeKey))).map(w=>[w.routeKey,w])).values()].map(w=>({value:w.routeKey,label:w.label || w.routeKey,hint:w.routeKey}))]} disabled={busy || refreshing}/><Button size="sm" disabled={busy || refreshing || !selected[account.id]} onClick={() => void pair(account.id)}>Pasangkan</Button></div>
        </div>)}
      </>}
    </>}
  </section>
}
