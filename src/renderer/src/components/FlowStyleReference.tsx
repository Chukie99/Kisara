import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { channelReferencePatch } from '@shared/channelVisual'
import { Button } from './ui'
import { useApp } from '../store/app'
import { errorText } from '../lib/format'

/** Expose the same global Flow reference beside both project style pickers. */
export function FlowStyleReference() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [characterPreview, setCharacterPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useApp(s => s.toast)
  const load = async (next: AppSettings) => {
    setSettings(next)
    setPreview(await window.api.settings.channelStylePreview())
    setCharacterPreview(await window.api.settings.channelCharacterPreview())
  }
  useEffect(() => {
    let alive = true
    void Promise.all([window.api.settings.get(), window.api.settings.channelStylePreview(), window.api.settings.channelCharacterPreview()]).then(([s, image, character]) => {
      if (alive) { setSettings(s); setPreview(image); setCharacterPreview(character) }
    }).catch(e => { if (alive) toast('error', errorText(e)) })
    return () => { alive = false }
  }, [])
  const run = async (task: () => Promise<AppSettings | null>) => {
    setBusy(true)
    try {
      const next = await task()
      if (next) { await load(next); toast('success', 'Pilihan karakter dan gaya tersimpan untuk gambar Flow berikutnya.') }
    } catch (e) { toast('error', errorText(e)) }
    finally { setBusy(false) }
  }
  return <section aria-label="Referensi gaya Flow" className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-accent/5 px-4 py-3">
    {preview && <img alt="Referensi gaya Flow aktif" src={preview} className="size-14 shrink-0 rounded-lg border border-line bg-white object-contain" />}
    <div className="min-w-0 flex-1 basis-44">
      <p className="text-sm font-semibold">Karakter &amp; gaya tersimpan</p>
      <p className="mt-1 text-xs text-ink-2">Karakter tetap sama saat prompt adegan berubah. Berlaku untuk gambar Flow baru di semua proyek. Referensi gaya aktif menggantikan preset di bawah.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="primary" disabled={busy || !settings} onClick={()=>void run(()=>window.api.settings.importChannelVisual())}><Upload className="size-4" />Upload karakter &amp; gaya</Button>
      <Button size="sm" disabled={busy || !settings} onClick={()=>void run(()=>window.api.settings.importChannelStyle())}>Upload gaya saja</Button>
      {settings?.channelStyleEnabled && <Button size="sm" disabled={busy} onClick={()=>void run(()=>window.api.settings.set({channelStyleEnabled:false}))}>Pakai preset di Flow</Button>}
      {settings && !settings.channelStyleEnabled && <Button size="sm" disabled={busy} onClick={()=>void run(()=>window.api.settings.set({channelStyleEnabled:true}))}>Aktifkan referensi tersimpan</Button>}
    </div>
    {settings && <div className="flex w-full min-w-0 flex-wrap items-center gap-2 border-t border-line pt-2">
      {characterPreview && <img alt="Karakter tetap Flow" src={characterPreview} className="size-10 rounded-lg border border-line bg-white object-contain" />}
      <p className="min-w-0 flex-1 text-xs text-ink-2">Karakter tetap: <strong>{settings.channelCharacterEnabled ? settings.channelCharacterName : 'nonaktif'}</strong>{settings.channelCharacterEnabled && settings.channelCharacterReference === settings.channelStyleReference ? ' · sama dengan gambar gaya' : ''}</p>
      {settings.channelStyleEnabled && (!settings.channelCharacterEnabled || settings.channelCharacterReference !== settings.channelStyleReference) && <Button size="sm" disabled={busy} onClick={()=>void run(()=>window.api.settings.set(channelReferencePatch(settings.channelStyleReference, 'visual')))}>Jadikan gambar gaya sebagai karakter</Button>}
    </div>}
  </section>
}
