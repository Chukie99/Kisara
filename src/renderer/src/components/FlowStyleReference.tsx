import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { Button } from './ui'
import { useApp } from '../store/app'
import { errorText } from '../lib/format'

/** Expose the same global Flow reference beside both project style pickers. */
export function FlowStyleReference() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useApp(s => s.toast)
  const load = async (next: AppSettings) => {
    setSettings(next)
    setPreview(await window.api.settings.channelStylePreview())
  }
  useEffect(() => {
    let alive = true
    void Promise.all([window.api.settings.get(), window.api.settings.channelStylePreview()]).then(([s, image]) => {
      if (alive) { setSettings(s); setPreview(image) }
    }).catch(e => { if (alive) toast('error', errorText(e)) })
    return () => { alive = false }
  }, [])
  const run = async (task: () => Promise<AppSettings | null>) => {
    setBusy(true)
    try {
      const next = await task()
      if (next) { await load(next); toast('success', next.channelStyleEnabled ? 'Referensi gaya aktif untuk gambar Flow baru di semua proyek.' : 'Flow kembali memakai preset gaya proyek.') }
    } catch (e) { toast('error', errorText(e)) }
    finally { setBusy(false) }
  }
  return <section aria-label="Referensi gaya Flow" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-accent/5 px-4 py-3">
    {preview && <img alt="Referensi gaya Flow aktif" src={preview} className="size-14 shrink-0 rounded-lg border border-line bg-white object-contain" />}
    <div className="min-w-0 flex-1 basis-44">
      <p className="text-sm font-semibold">Referensi gambar sendiri {settings?.channelStyleEnabled ? '· aktif di Flow' : ''}</p>
      <p className="mt-1 text-xs text-ink-2">Untuk gaya NPC, latar dan benda. Berlaku pada gambar Flow baru di semua proyek; referensi aktif menggantikan preset di bawah.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="primary" disabled={busy || !settings} onClick={()=>void run(()=>window.api.settings.importChannelStyle())}><Upload className="size-4" />Upload referensi gambar</Button>
      {settings?.channelStyleEnabled && <Button size="sm" disabled={busy} onClick={()=>void run(()=>window.api.settings.set({channelStyleEnabled:false}))}>Pakai preset di Flow</Button>}
      {settings && !settings.channelStyleEnabled && <Button size="sm" disabled={busy} onClick={()=>void run(()=>window.api.settings.set({channelStyleEnabled:true}))}>Aktifkan referensi tersimpan</Button>}
    </div>
  </section>
}
