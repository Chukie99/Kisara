import { useEffect, useRef, useState } from 'react'
import type { FlowProfile, FlowSetup } from '@shared/production'
import { flowReadiness, type FlowReadiness } from '@shared/flowReadiness'
import { Select } from './Select'
import { Button, inputCls } from './ui'
import { errorText } from '../lib/format'

/** Pair explicitly by account identity; route order alone cannot identify the Google login. */
export function FlowWorkers({browserMode=false,selectedAccountId=0}:{browserMode?:boolean;selectedAccountId?:number}): React.JSX.Element {
  const [checks,setChecks]=useState<Record<number,FlowReadiness & {checkedAt:number}>>({})
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
  const checkAccount = async (id:number):Promise<FlowReadiness & {checkedAt:number}> => {
    try{return {...flowReadiness(await window.api.settings.inspectFlowBrowser(id)),checkedAt:Date.now()}}
    catch(e){return {state:'unavailable',label:'Halaman belum siap',detail:errorText(e),checkedAt:Date.now()}}
  }
  const refresh = async (quiet=false): Promise<void> => {
    if (refreshLock.current || busy) return
    refreshLock.current = true; setRefreshing(true); if(!quiet){setError(null);setNotice(null)}
    try {
      const latest = await window.api.settings.flowSetup()
      setData(latest)
      if(browserMode){
        const connected=latest.accounts.filter(a=>a.active&&a.workerConnected&&a.imageEnabled),next:Record<number,FlowReadiness & {checkedAt:number}>={}
        for(let i=0;i<connected.length;i+=4){
          const values=await Promise.all(connected.slice(i,i+4).map(async a=>({id:a.id,value:await checkAccount(a.id)})))
          for(const {id,value} of values)next[id]=value
        }
        setChecks(next)
        if(!quiet)setNotice(latest.accounts.filter(a=>!a.quotaExhausted&&next[a.id]?.state==='ready').length+' halaman siap. '+(latest.generationPause?'Generasi masih dijeda; selesaikan pemeriksaan hasil sebelumnya.':'Kesiapan kuota diperiksa saat mengirim gambar.'))
      }else if(!quiet)setNotice(latest.workers.length+' worker tersambung. Kesiapan generasi Google belum diperiksa.')
    } catch (e) { setData(null);setChecks({});setError(errorText(e)) }
    finally { refreshLock.current = false; setRefreshing(false) }
  }
  useEffect(() => { void refresh() }, [])
  useEffect(()=>{
    if(!browserMode)return
    const timer=setInterval(()=>void refresh(true),15000)
    return()=>clearInterval(timer)
  },[browserMode,busy])
  const resume = async (): Promise<void> => {
    if (refreshLock.current || busy) return
    setBusy(true); setError(null)
    try { setData(await window.api.settings.resumeFlowGeneration()); setNotice('Jeda lokal dibuka. Coba satu gambar dari proyek; ini belum membuktikan Google menerima generasi.') }
    catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }
  const inspect = async (id: number): Promise<void> => {
    if (busy || refreshLock.current) return
    refreshLock.current=true;setBusy(true);setError(null);setNotice(null)
    try {
      const value=await checkAccount(id)
      setChecks(old=>({...old,[id]:value}))
      const name=data?.accounts.find(a=>a.id===id)?.email||`Akun ${id}`
      setNotice(name+': '+value.label+'. '+value.detail)
    } finally {refreshLock.current=false;setBusy(false)}
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
    const poll=async ():Promise<void>=>{try{const items=await window.api.settings.flowProfiles();if(live){setProfiles(items);}}catch{/* Manual refresh retains a visible error if setup fails. */}}
    void poll();const timer=setInterval(()=>void poll(),5000)
    return ()=>{live=false;clearInterval(timer)}
  },[])
  const connected=data?.accounts.filter(a=>a.active&&a.workerConnected&&a.imageEnabled).length??0
  const ready=data?.accounts.filter(a=>a.active&&a.workerConnected&&a.imageEnabled&&!a.quotaExhausted&&checks[a.id]?.state==='ready').length??0
  return <section aria-label="Pasangkan akun dan worker" className="flex flex-col gap-3 rounded-xl border border-line p-3">
    <div className="flex items-center gap-3"><strong className="flex-1 text-sm">Status akun Flow</strong><Button size="sm" aria-label="Perbarui daftar worker Flow" disabled={busy} loading={refreshing} onClick={() => void refresh()}>{refreshing ? 'Memeriksa…' : browserMode ? 'Periksa semua akun' : 'Perbarui daftar'}</Button></div>
    {data?.generationPause && <div role="alert" className="rounded-lg border border-bad-ink p-3 text-sm"><strong>{data.generationPause.retryAllowed ? 'Satu percobaan Flow diizinkan' : 'Generasi Flow dijeda'}</strong><p className="my-2">{data.generationPause.code === 'uncertain_result' ? 'Hasil generasi belum dipastikan sejak ' : 'Google menolak aktivitas tidak biasa pada '}{new Date(data.generationPause.pausedAt).toLocaleString('id-ID')}. Periksa Flow langsung di Chrome. Restart Kisara tidak menghapus jeda ini; tidak ada pengulangan atau perpindahan akun otomatis.</p>{data.generationPause.retryAllowed&&<p className="my-2">Coba satu gambar dari proyek. Setelah berhasil, antrean banyak gambar dapat dilanjutkan.</p>}{!data.generationPause.retryAllowed && <Button size="sm" disabled={busy || refreshing} onClick={() => void resume()}>Sudah cek Flow · izinkan satu percobaan</Button>}</div>}
    {notice && <p role="status" className="rounded-lg bg-paper p-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="text-sm text-bad-ink">{error}</p>}
    <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">Tambah akun Flow</summary><div className="mt-3 flex flex-col gap-2"><p className="text-xs text-muted">Isi email, lalu login Google di browser khusus yang dibuka. Koneksi dan pemasangan disiapkan otomatis; kamu tidak perlu menyalin token.</p><div className="flex gap-2"><input aria-label="Email akun Flow baru" type="email" className={inputCls} placeholder="Email Google" value={email} onChange={e=>setEmail(e.target.value)} disabled={opening}/><Button loading={opening} disabled={!email.trim()} onClick={()=>void openBrowser(email)}>Tambah akun</Button></div></div></details>
    {profiles.map(p=><div key={p.id} className="rounded-lg border border-line p-3 text-sm"><strong className="break-all">{p.email}</strong><p className="mt-1 text-xs text-muted">{p.message}</p>{['closed','error'].includes(p.status)&&<Button size="sm" className="mt-2" disabled={opening} onClick={()=>void openBrowser(p.email)}>Buka browser akun</Button>}</div>)}
    {data && <>
      <p role="status" className="text-sm">{browserMode ? `${ready} halaman siap · ${connected} worker tersambung${data.generationPause?' · generasi masih dijeda':''}` : `${connected} akun terhubung ke worker`}. {browserMode ? 'Worker tersambung belum berarti proyek Flow siap.' : 'Ini belum menguji generasi Google.'}</p>
      {!data.extensionMode ? <p className="text-xs text-muted">Server memakai metode CAPTCHA lain. Pengaturan worker ini berlaku pada mode extension.</p> : <>
        <p className="text-xs text-muted">{browserMode ? (selectedAccountId ? 'Mode akun manual: hanya akun yang dipilih digunakan. Perbaiki akun itu jika halamannya belum siap.' : 'Mode Otomatis: akun dengan proyek belum siap dilewati sebelum mengirim prompt. Pembatasan Google atau hasil yang belum pasti tetap menjeda generasi.') : 'Pilih worker dari profil Chrome yang login dengan akun Google yang sama.'}</p>
        {data.accounts.map(account => <div key={account.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center gap-2"><span className="flex-1 break-all text-sm font-semibold">{account.email}{selectedAccountId===account.id&&<span className="ml-2 text-xs text-accent">Dipilih</span>}</span><Button size="sm" disabled={busy || refreshing || !account.workerConnected} onClick={() => void inspect(account.id)}>Periksa halaman Flow</Button><Button size="sm" disabled={opening} onClick={()=>void openBrowser(account.email)}>Buka browser akun</Button></div>
          <span className="text-xs text-muted">Sambungan worker: {!account.active ? 'akun nonaktif' : !account.imageEnabled ? 'gambar dinonaktifkan' : account.workerConnected ? 'tersambung' : account.routeKey ? 'terputus' : 'belum dipasangkan'}</span>
          {browserMode&&account.active&&account.imageEnabled&&account.workerConnected&&<div className="text-sm"><strong className={checks[account.id]?.state==='ready'&&!account.quotaExhausted&&!data.generationPause?'text-good-ink':'text-bad-ink'}>{account.quotaExhausted?'Kuota habis terdeteksi':checks[account.id]?.state==='ready'&&data.generationPause?'Halaman siap · generasi masih dijeda':checks[account.id]?.label||(refreshing?'Sedang memeriksa halaman…':'Halaman belum diperiksa')}</strong><p className="mt-1 text-xs text-muted">{account.quotaExhausted?'Akun ini dilewati dalam mode Otomatis. Setelah kuota tersedia, pilih akun ini secara manual dan coba satu gambar untuk memeriksanya.':checks[account.id]?.detail}</p>{checks[account.id]&&<p className="mt-1 text-xs text-muted">Diperiksa {new Date(checks[account.id].checkedAt).toLocaleTimeString('id-ID')}</p>}</div>}
          <details><summary className="cursor-pointer text-xs text-muted">Pengaturan pemasangan worker</summary><div className="mt-2 flex items-center gap-2"><Select label={'Worker untuk ' + account.email} value={selected[account.id] ?? ''} onChange={value => setSelected(s => ({...s, [account.id]:value}))} options={[{value:'',label:'Pilih profil Chrome yang sesuai'}, ...[...new Map(data.workers.filter(w=>w.routeKey && (!data.accounts.some(a=>a.id!==account.id&&a.routeKey===w.routeKey))).map(w=>[w.routeKey,w])).values()].map(w=>({value:w.routeKey,label:w.label || w.routeKey,hint:w.routeKey}))]} disabled={busy || refreshing}/><Button size="sm" disabled={busy || refreshing || !selected[account.id]} onClick={() => void pair(account.id)}>Pasangkan</Button></div></details>
        </div>)}
      </>}
    </>}
  </section>
}
