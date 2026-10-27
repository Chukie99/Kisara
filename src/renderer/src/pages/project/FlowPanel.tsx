import { useState } from 'react'
import { Copy, Download, Sparkles } from 'lucide-react'
import { buildFlowPlan, flowText, flowAgentBatch, flowBatches, flowNarrationParagraph, flowNarrationText, flowAssetName, flowImageMapText, flowPrompt, flowReady } from '@shared/flow'
import { getStyle } from '@shared/styles'
import type { FlowExportOptions, ScriptProgress } from '@shared/types'
import { Button } from '../../components/ui'
import { Select } from '../../components/Select'
import { StyleSwatch } from '../../components/StyleArt'
import { errorText } from '../../lib/format'
import { useApp } from '../../store/app'
import { useProject } from '../../store/project'

function SimpleCartoonSwatch() {
  return <svg viewBox="0 0 64 64" aria-hidden="true" className="size-14 shrink-0 rounded-lg bg-[#e8dabd]">
    <path d="M3 63L5 47Q15 40 25 47L29 63" fill="#b66a45" stroke="#29251f" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M33 63L36 46Q47 39 59 47L62 63" fill="#50667b" stroke="#29251f" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M7 27Q5 10 17 9Q29 11 27 28L26 38Q18 49 9 39Z" fill="#b97c52" stroke="#29251f" strokeWidth="2.5" />
    <path d="M7 27L6 17Q12 5 22 10Q29 12 27 24L20 18L15 21L11 19Z" fill="#29251f" stroke="#29251f" strokeWidth="2" />
    <path d="M37 26Q35 9 49 10Q62 11 59 29L58 39Q47 49 39 38Z" fill="#d1a071" stroke="#29251f" strokeWidth="2.5" />
    <path d="M36 30L36 18Q39 7 51 9Q64 12 59 31L56 19L49 23L42 19L40 32" fill="#29251f" stroke="#29251f" strokeWidth="2" strokeLinejoin="round" />
    <g fill="#29251f"><circle cx="13" cy="30" r="1.5" /><circle cx="22" cy="30" r="1.5" /><circle cx="43" cy="31" r="1.5" /><circle cx="53" cy="31" r="1.5" /></g>
    <path d="M17 32L16 35L18 35M14 39L21 39M48 33L47 36L49 36M44 40L52 40" fill="none" stroke="#29251f" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
}

export function FlowPanel({ busy, onPrepare, progress }: { busy: boolean; onPrepare: () => void; progress?: ScriptProgress | null }) {
  const { project, clips, characters, assets, flush, updateEditor, updateClip } = useProject()
  const { toast } = useApp()
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'guide' | 'agent' | 'narration' | 'mapping'>('guide')
  const [selectedBatch, setSelectedBatch] = useState(0)
  if (!project || !clips.length) return null
  const plan = buildFlowPlan({ project, clips, characters, assets: Object.values(assets) })
  const ready = plan.scenes.every((scene) => flowReady(scene, plan.mode))
  const video = plan.mode === 'video'
  const hasNarration = plan.scenes.every((scene) => !!flowNarrationParagraph(scene))
  const batches = flowBatches(plan)
  const batch = batches[Math.min(selectedBatch, batches.length - 1)]
  const copy = async (makeText: () => string) => {
    try { await window.api.app.copyText(makeText()); toast('success', 'Disalin.') } catch (e) { toast('error', errorText(e)) }
  }
  const save = async (format: 'txt' | 'docx', options: FlowExportOptions = {}) => {
    setSaving(true)
    try { await flush(); const file = await window.api.story.exportFlow(project.id, format, options); if (file) toast('success', `${options.kind === 'narration' ? 'Narasi' : options.kind === 'agent' ? 'Paket prompt' : options.kind === 'mapping' ? 'Daftar gambar' : 'Panduan'} ${format.toUpperCase()} tersimpan: ${file}`) }
    catch (e) { toast('error', errorText(e)) } finally { setSaving(false) }
  }
  return (
    <section aria-label="Panduan Google Flow" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div><h2 className="font-display text-xl font-bold">Naskah & prompt Google Flow</h2>
        <p className="mt-1 text-sm text-muted">{plan.scenes.length} adegan · {plan.style} · {plan.aspect}. Tidak perlu membuat gambar di Kisara.</p>
        <p className="mt-1 text-xs text-muted">{plan.timing === 'audio' ? 'Timestamp mengikuti timeline audio.' : 'Timestamp masih perkiraan pada adegan yang belum disuarakan. Ekspor ulang setelah TTS atau timeline berubah.'} Nomor dan waktu hanya label, tidak ikut disalin ke prompt {video ? 'video' : 'gambar'}.</p>
      </div>
      <div aria-label="Jenis prompt Google Flow" className="grid grid-cols-2 gap-2">
        {([{ id: 'image', label: 'Text to Image', description: 'Buat gambar per adegan' }, { id: 'video', label: 'Image to Video', description: 'Gerakkan tokoh dan suasana dari gambar' }] as const).map((mode) => <button key={mode.id} type="button" disabled={busy || saving} aria-pressed={plan.mode === mode.id} onClick={() => updateEditor({ flowMode: mode.id })} className={`rounded-xl border p-3 text-left disabled:opacity-50 ${plan.mode === mode.id ? 'border-accent bg-accent-soft' : 'border-line-2 bg-paper hover:border-ink-2'}`}><span className="block text-sm font-semibold">{mode.label}</span><span className="mt-1 block text-xs text-muted">{mode.description}</span></button>)}
      </div>
      {video && <div className="rounded-xl border border-line-2 bg-paper p-3 text-sm leading-relaxed" role="note">Di Flow, pilih Video / Frames, pasang gambar adegan sebagai frame awal, lalu tempel prompt geraknya. Tokoh atau objek bergerak sesuai arahan, kamera hanya pendukung. Pilih durasi yang tersedia lalu sesuaikan dengan narasi di editor. Generasi dilakukan di Flow dan bisa memakai kredit; Kisara hanya menyiapkan prompt. Gunakan narasi Kisara jika video Flow menghasilkan audio.</div>}
      {!video && <div aria-label="Gaya gambar untuk Flow" className="grid grid-cols-2 gap-2">
        {([{ id: 'project', label: 'Ikuti gaya proyek', description: getStyle(project.styleId).name, styleId: project.styleId }, { id: 'cartoon-indonesia', label: 'Kartun Indonesia sederhana', description: '2D datar, garis tebal, detail sedikit', styleId: 'flat' }] as const).map((look) => <button key={look.id} type="button" disabled={busy || saving} aria-pressed={plan.look === look.id} onClick={() => updateEditor({ flowLook: look.id })} className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left disabled:opacity-50 ${plan.look === look.id ? 'border-accent bg-accent-soft' : 'border-line-2 bg-paper hover:border-ink-2'}`}>
          {look.id === 'cartoon-indonesia' ? <SimpleCartoonSwatch /> : <StyleSwatch styleId={look.styleId} className="size-14 shrink-0 rounded-lg" />}
          <span className="min-w-0"><span className="block text-sm font-semibold">{look.label}</span><span className="mt-1 block text-xs text-muted">{look.description}</span></span>
        </button>)}
      </div>}
      {progress && (progress.status !== 'done' || ready) && <div aria-label="Status penyusunan prompt" role={progress.status === 'failed' ? 'alert' : 'status'} className="rounded-xl border border-line-2 bg-paper p-4 text-sm">
        <p className="font-semibold">{progress.status === 'running' ? `Menyusun prompt · ${progress.completed}/${progress.total} diperiksa` : progress.status === 'failed' ? 'Prompt belum berhasil diselesaikan' : progress.status === 'canceled' ? 'Penyusunan prompt dibatalkan' : 'Prompt siap diekspor'}</p>
        <p className="mt-2 whitespace-pre-wrap leading-relaxed text-ink-2">{progress.message}</p>
        {progress.status === 'running' && <>
          <p className="mt-2 text-xs text-muted">Ini proses AI penulis. Hugging Face dan Cloudflare tidak dipakai. Prompt yang sudah diperiksa disimpan ke disk dan bisa dilanjutkan setelah aplikasi dibuka ulang.</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sand"><div className="h-full bg-accent transition-all" style={{ width: `${progress.total ? 100 * progress.completed / progress.total : 0}%` }} /></div>
          <Button size="sm" className="mt-3" onClick={() => void window.api.story.cancelVisuals(project.id).catch((e) => toast('error', errorText(e)))}>Batalkan penyusunan prompt</Button>
        </>}
      </div>}
      <div className="flex flex-wrap gap-2" aria-label="Tampilan panduan Flow">
        {([{ id: 'guide', label: 'Panduan adegan' }, { id: 'agent', label: 'Paket 10 prompt' }, { id: 'narration', label: 'Narasi per adegan' }, { id: 'mapping', label: 'Daftar gambar' }] as const).map((tab) => <Button key={tab.id} size="sm" variant={view === tab.id ? 'accent' : 'ghost'} aria-pressed={view === tab.id} onClick={() => setView(tab.id)}>{tab.label}</Button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Sparkles className="size-4" />} loading={busy} disabled={saving} onClick={onPrepare}>{ready ? 'Periksa prompt' : 'Susun/perbarui prompt'}</Button>
        {view === 'guide' && <><Button size="sm" icon={<Copy className="size-4" />} disabled={!ready || busy} onClick={() => void copy(() => flowText(plan))}>Salin panduan</Button>
          {(['txt', 'docx'] as const).map((format) => <Button key={format} size="sm" icon={<Download className="size-4" />} disabled={!ready || busy || saving} onClick={() => void save(format)}>Ekspor {format.toUpperCase()}</Button>)}</>}
      </div>
      {view === 'agent' && batch && <div className="flex min-w-0 flex-col gap-3" aria-label="Paket prompt Flow Agent">
        <p className="text-sm text-ink-2">Aktifkan Agent di Flow, lalu tempel satu paket. Instruksi ini meminta satu aset terpisah per adegan; hasilnya tetap bergantung pada dukungan Flow.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Select label="Pilih paket adegan" value={batch.index} onChange={setSelectedBatch} className="min-w-[190px]" options={batches.map((item) => ({ value: item.index, label: item.label, hint: `${item.scenes.length} prompt` }))} />
          <Button size="sm" disabled={batch.index === 0 || busy} onClick={() => setSelectedBatch(batch.index - 1)}>Sebelumnya</Button>
          <Button size="sm" disabled={batch.index === batches.length - 1 || busy} onClick={() => setSelectedBatch(batch.index + 1)}>Berikutnya</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" icon={<Copy className="size-4" />} disabled={!batch.ready || busy} onClick={() => void copy(() => flowAgentBatch(plan, batch.index))}>Salin {batch.scenes.length} prompt untuk Agent</Button>
          {(['txt', 'docx'] as const).map((format) => <Button key={format} size="sm" icon={<Download className="size-4" />} disabled={!batch.ready || busy || saving} onClick={() => void save(format, { kind: 'agent', batchIndex: batch.index })}>Ekspor paket {format.toUpperCase()}</Button>)}
        </div>
        <p className="text-xs text-muted">{batch.label} · target {batch.scenes.length} {video ? 'video' : 'gambar'} terpisah · cocokkan dengan paragraf bernomor sama di tab Narasi per adegan.</p>
        <details className="rounded-lg border border-line bg-paper p-3" aria-label="Nama aset paket">
          <summary className="cursor-pointer text-sm font-semibold">Nama gambar paket ini · judul Indonesia</summary>
          <p className="mt-2 text-xs text-muted">Flow diminta memakai nama berikut. Kalau penamaannya berbeda, salin nama dari daftar ini untuk merapikannya.</p>
          <div className="mt-2 max-h-48 overflow-y-auto">{batch.scenes.map((scene) => <div key={scene.clipId} className="flex min-w-0 items-center gap-2 border-t border-line py-2"><span className="min-w-0 flex-1 break-words text-sm">{flowAssetName(scene)}</span><Button size="sm" aria-label={`Salin nama gambar ${scene.index}`} onClick={() => void copy(() => flowAssetName(scene))}>Salin nama</Button></div>)}</div>
        </details>
        {batch.ready ? <pre aria-label="Isi paket prompt" className="max-h-[400px] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-paper p-3 text-xs leading-relaxed text-ink-2">{flowAgentBatch(plan, batch.index)}</pre> : <p className="text-sm text-muted">Prompt dalam paket ini belum lengkap. Pilih Susun/perbarui prompt dahulu.</p>}
      </div>}
      {view === 'mapping' && <div aria-label="Daftar pasangan gambar dan narasi" className="flex flex-col gap-3">
        <p className="text-sm text-ink-2">Gunakan nama yang sama di Flow dan folder gambar. Nomor tetap ada di judul/nama file; gambar bersih.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Copy className="size-4" />} onClick={() => void copy(() => flowImageMapText(plan))}>Salin daftar urutan</Button>
          {(['txt', 'docx'] as const).map((format) => <Button key={format} size="sm" disabled={busy || saving} icon={<Download className="size-4" />} onClick={() => void save(format, { kind: 'mapping' })}>Ekspor daftar {format.toUpperCase()}</Button>)}
        </div>
        <div className="max-h-[480px] overflow-y-auto">{plan.scenes.map((scene) => <article key={scene.clipId} className="border-t border-line py-3" aria-label={`Pasangan gambar ${scene.index}`}>
          <div className="flex min-w-0 items-center gap-2"><p className="min-w-0 flex-1 break-words text-sm font-semibold">{flowAssetName(scene)}</p><Button size="sm" aria-label={`Salin nama berkas ${scene.index}`} onClick={() => void copy(() => flowAssetName(scene))}>Salin nama</Button></div>
          <p className="mt-1 font-mono text-xs text-accent">{scene.timestamp} · Paragraf {String(scene.index).padStart(3, '0')}</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{flowNarrationParagraph(scene) || 'Narasi belum diisi.'}</p>
        </article>)}</div>
      </div>}
      {view === 'narration' && <div className="flex flex-col gap-3" aria-label="Naskah paragraf per adegan">
        <p className="text-sm text-ink-2">Satu paragraf = satu adegan. Nomor dan waktu menjadi panduan memasang gambar; salinan dan berkas narasi berisi teks ucapan saja.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Copy className="size-4" />} disabled={!hasNarration || busy} onClick={() => void copy(() => flowNarrationText(plan))}>Salin narasi utuh</Button>
          {(['txt', 'docx'] as const).map((format) => <Button key={format} size="sm" icon={<Download className="size-4" />} disabled={!hasNarration || busy || saving} onClick={() => void save(format, { kind: 'narration' })}>Ekspor narasi {format.toUpperCase()}</Button>)}
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {plan.scenes.map((scene) => <article key={scene.clipId} className="border-t border-line py-3" aria-label={`Narasi adegan ${scene.index}`}>
            <p className="text-xs font-semibold text-accent">Paragraf {String(scene.index).padStart(2, '0')} · Gambar {String(scene.index).padStart(2, '0')} · {scene.timestamp}</p>
            <p className="mt-1 break-words text-sm font-semibold">{flowAssetName(scene)}</p>
            <p className="mt-2 text-sm leading-relaxed">{flowNarrationParagraph(scene) || 'Narasi belum diisi.'}</p>
            <Button size="sm" className="mt-2" disabled={!flowNarrationParagraph(scene)} icon={<Copy className="size-3.5" />} onClick={() => void copy(() => flowNarrationParagraph(scene))}>Salin paragraf {String(scene.index).padStart(2, '0')}</Button>
          </article>)}
        </div>
      </div>}
      {view === 'guide' && <div className="max-h-[480px] overflow-y-auto">
        {plan.scenes.map((scene) => <details key={scene.clipId} className="border-t border-line py-3">
          <summary className="cursor-pointer text-sm font-semibold"><span className="mr-2 font-mono text-accent">{String(scene.index).padStart(2, '0')} · {scene.timestamp}</span>{scene.title}{!flowReady(scene, plan.mode) && <span className="ml-2 text-xs text-muted">Prompt belum siap</span>}</summary>
          <div className="mt-3 flex flex-col gap-3"><p className="whitespace-pre-wrap text-sm">{scene.narration}</p>
            {video && <>
              <p className="text-xs text-muted">Gambar acuan / nama video: {flowAssetName(scene)} · durasi adegan {((scene.endMs - scene.startMs) / 1000).toFixed(1)} detik</p>
              <label className="flex flex-col gap-2 text-xs font-semibold">Arahan gerak adegan
                <textarea aria-label={`Arahan gerak adegan ${scene.index}`} value={scene.motion} disabled={busy || saving} onChange={(event) => updateClip(scene.clipId, { videoPrompt: event.target.value })} rows={3} placeholder="Contoh: tokoh menoleh ke pintu, lalu mundur satu langkah. Kamera tetap stabil." className="w-full rounded-lg border border-line-2 bg-paper p-3 text-sm font-normal" />
              </label>
              <p className="text-xs text-muted">Arahan ini ikut dipakai sebagai prompt video klip. Isi gerakan yang terlihat dan sesuai cerita.</p>
            </>}
            {flowReady(scene, plan.mode) && <><pre className="whitespace-pre-wrap break-words rounded-lg bg-paper p-3 text-xs leading-relaxed text-ink-2">{flowPrompt(scene, plan.mode)}</pre>
              <Button size="sm" className="self-start" icon={<Copy className="size-4" />} onClick={() => void copy(() => flowPrompt(scene, plan.mode))}>Salin prompt {video ? 'video ' : ''}{String(scene.index).padStart(2, '0')}</Button></>}
          </div>
        </details>)}
      </div>}
    </section>
  )
}
