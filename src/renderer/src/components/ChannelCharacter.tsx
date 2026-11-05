import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { Button, Field, inputCls } from './ui'
import { Select } from './Select'
import { useApp } from '../store/app'
import { errorText } from '../lib/format'

export function ChannelCharacter({ settings, onChanged }: { settings: AppSettings; onChanged: (s: AppSettings) => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(settings.channelCharacterName)
  const [description, setDescription] = useState(settings.channelCharacterDescription)
  const toast = useApp(s => s.toast)
  useEffect(() => { let alive = true; void window.api.settings.channelCharacterPreview().then(value => { if (alive) setPreview(value) }).catch(e => { if (alive) toast('error', errorText(e)) }); return () => { alive = false } }, [settings.channelCharacterReference, settings.channelCharacterEnabled])
  const run = async (task: () => Promise<AppSettings | null>) => { setBusy(true); try { const s = await task(); if (s) { onChanged(s); toast('success', 'Karakter utama tersimpan untuk semua proyek.') } } catch(e) { toast('error', errorText(e)) } finally { setBusy(false) } }
  return <><section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
    <h2 className="text-xl font-bold">Karakter utama channel</h2>
    <p className="text-sm text-ink-2">Satu identitas untuk setiap video. Saat membuat gambar lewat Flow, referensi ini otomatis dilampirkan di semua proyek. Gambar yang sudah jadi tetap tersimpan; buat ulang jika ingin memakai karakter terbaru.</p>
    {preview && <img src={preview} alt="Referensi karakter utama" className="max-h-64 w-full rounded-xl bg-white object-contain" />}
    <Field label="Nama karakter"><input className={inputCls} value={name} onChange={e=>setName(e.target.value)} /></Field>
    <Field label="Ciri tetap"><textarea className={inputCls} rows={3} value={description} onChange={e=>setDescription(e.target.value)} /></Field>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.channelCharacterEnabled} disabled={busy} onChange={e=>void run(()=>window.api.settings.set({channelCharacterEnabled:e.target.checked}))} />Gunakan otomatis di setiap proyek Flow</label>
    <div className="flex gap-2"><Button disabled={busy} onClick={()=>void run(()=>window.api.settings.importChannelCharacter())}>Upload gambar karakter</Button><Button variant="primary" disabled={busy || !name.trim()} onClick={()=>void run(()=>window.api.settings.set({channelCharacterName:name.trim(),channelCharacterDescription:description.trim()}))}>Simpan karakter utama</Button></div>
  </section><ChannelStyle settings={settings} onChanged={onChanged} /></>
}

function ChannelStyle({ settings, onChanged }: { settings: AppSettings; onChanged: (s: AppSettings) => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [description, setDescription] = useState(settings.channelStyleDescription)
  const [busy, setBusy] = useState(false)
  const toast = useApp(s => s.toast)
  useEffect(() => { let alive = true; void window.api.settings.channelStylePreview().then(value => { if (alive) setPreview(value) }).catch(e => { if (alive) toast('error', errorText(e)) }); return () => { alive = false } }, [settings.channelStyleReference, settings.channelStyleEnabled])
  const run = async (task: () => Promise<AppSettings | null>) => { setBusy(true); try { const s = await task(); if (s) { onChanged(s); toast('success', 'Gaya visual tersimpan untuk gambar Flow berikutnya.') } } catch(e) { toast('error', errorText(e)) } finally { setBusy(false) } }
  return <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6">
    <h2 className="text-xl font-bold">Gaya visual seluruh adegan</h2>
    <p className="text-sm text-ink-2">Bawaan mengikuti ilustrasi Kenzo. NPC, latar, bangunan dan benda diarahkan memakai gaya yang sama. Upload contoh lain untuk mengganti gaya tanpa mengganti identitas Kenzo. Hasil AI tetap perlu diperiksa; gambar lama tidak diubah.</p>
    {preview && <img src={preview} alt="Referensi gaya visual" className="max-h-64 w-full rounded-xl bg-white object-contain" />}
    <Field label="Cara menganimasikan gambar di Flow"><Select label="Cara menganimasikan gambar di Flow" value={settings.flowVideoInputMode} disabled={busy} onChange={value=>void run(()=>window.api.settings.set({flowVideoInputMode:value as 'agent'|'frames'}))} options={[
      {value:'agent',label:'Agent · animasi dari referensi gambar',hint:'Jalur yang sudah berhasil diuji di Flow. Tampilan karakter masih dapat berubah.'},
      {value:'frames',label:'Frames · gambar adegan sebagai frame awal',hint:'Memerlukan prompt standar Video → Frames di Chrome. Belum diverifikasi pada Flow akun ini; berhenti bila frame awal tidak terbaca.'}
    ]}/></Field>
    <Field label="Aturan gaya"><textarea className={inputCls} rows={4} value={description} onChange={e=>setDescription(e.target.value)} /></Field>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.channelStyleEnabled} disabled={busy} onChange={e=>void run(()=>window.api.settings.set({channelStyleEnabled:e.target.checked}))} />Terapkan ke semua gambar Flow baru</label>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={()=>void run(()=>window.api.settings.importChannelStyle())}>Upload referensi gaya</Button>
      <Button disabled={busy} onClick={()=>void run(()=>window.api.settings.set({channelStyleReference:settings.channelCharacterReference,channelStyleEnabled:true}))}>Pakai gaya karakter utama</Button>
      <Button variant="primary" disabled={busy} onClick={()=>void run(()=>window.api.settings.set({channelStyleDescription:description.trim()}))}>Simpan gaya visual</Button>
    </div>
  </section>
}
