import { ScriptReviewPanel } from './ScriptReviewPanel'
import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Bot, Copy, Download, MoreHorizontal, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react'
import { DURATIONS, TTS_WORDS_PER_SECOND, llmName } from '@shared/models'
import { estimateNarrationMs, needsVisual, wordCount } from '@shared/script'
import { VOICE_TAGS, VOICE_DELIVERIES, narrationSpeed, stripVoiceTags } from '@shared/speech'
import type { Clip, LlmProvider, ScriptProgress } from '@shared/types'
import { AutoTextarea } from '../../components/AutoTextarea'
import { Select } from '../../components/Select'
import { Badge, Button, IconButton, Menu, confirmDialog, cx, inputCls } from '../../components/ui'
import { clipNumber, errorText, mmss } from '../../lib/format'
import { useApp } from '../../store/app'
import { useProject } from '../../store/project'
import { sceneSpans } from '@shared/flow'
import { FlowPanel } from './FlowPanel'

/** A thin gap between scenes that offers to insert one there. */
function InsertGap({ onInsert }: { onInsert: () => void }) {
  return (
    <div className="group relative flex h-6 items-center justify-center">
      <span className="absolute inset-x-6 top-1/2 border-t border-dashed border-line-2 opacity-0 transition-opacity group-hover:opacity-100" />
      <button
        type="button"
        onClick={onInsert}
        className="relative inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-line-3 bg-paper px-2.5 text-xs font-medium text-ink-2 opacity-0 transition-opacity hover:border-ink-2 hover:text-ink focus:opacity-100 group-hover:opacity-100"
      >
        <Plus className="size-3.5" />
        Sisipkan adegan
      </button>
    </div>
  )
}

function SceneCard({ clip, index, total, timestamp, onInsert }: { clip: Clip; index: number; total: number; timestamp: string; onInsert: () => void }) {
  const { project, assets, updateClip, moveClip, removeClip } = useProject()
  const image = clip.imageAssetId ? assets[clip.imageAssetId] : null
  const voice = clip.audioAssetId ? assets[clip.audioAssetId] : null
  const stale = !!clip.visualPrompt.trim() && needsVisual(clip)
  const voiceOld = !!voice && (voice.prompt ?? '').trim() !== clip.narration.trim()
  const words = wordCount(clip.narration)
  // A slow narrator needs more time for the same line, so the estimate follows the project's voice service.
  const wps = project ? TTS_WORDS_PER_SECOND[project.ttsProvider] : undefined

  // Until it is voiced, a scene's length follows its word count.
  const setNarration = (narration: string): void =>
    updateClip(clip.id, clip.audioAssetId ? { narration } : { narration, durationMs: estimateNarrationMs(narration, wps) })

  /** Puts a vocal tag at the cursor (or the end), with single spaces around it. */
  const insertTag = (tag: string): void => {
    const el = document.getElementById(`scene-${clip.id}-narration`) as HTMLTextAreaElement | null
    const text = clip.narration
    const at = el && document.activeElement === el ? el.selectionStart : text.length
    const before = text.slice(0, at).replace(/\s+$/, '')
    const after = text.slice(at).replace(/^\s+/, '')
    const head = `${before}${before ? ' ' : ''}<${tag}>`
    setNarration(`${head}${after ? ' ' : ''}${after}`)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(head.length + 1, head.length + 1)
    })
  }

  const remove = async (): Promise<void> => {
    const hasWork = !!(clip.imageAssetId || clip.audioAssetId || clip.story.trim() || clip.narration.trim())
    if (hasWork) {
      const ok = await confirmDialog({
        title: `Hapus adegan ${clipNumber(index)}?`,
        body: 'Adegan ini beserta naskahnya dilepas dari cerita. Gambar dan suaranya tetap tersimpan di riwayat proyek.',
        confirm: 'Hapus adegan',
        danger: true
      })
      if (!ok) return
    }
    removeClip(clip.id)
  }

  return (
    <article id={`scene-${clip.id}`} className="flex gap-4 rounded-2xl border border-line bg-surface p-4 transition-colors focus-within:border-ink-2">
      <div className="flex w-9 shrink-0 flex-col items-center gap-1 pt-1.5">
        <span className="rounded-md bg-ink px-[7px] py-0.5 font-mono text-xs text-paper">{clipNumber(index)}</span>
        <IconButton label="Pindah ke atas" size={30} className="border-transparent bg-transparent" disabled={index === 0} onClick={() => moveClip(clip.id, -1)}>
          <ArrowUp className="size-4" />
        </IconButton>
        <IconButton
          label="Pindah ke bawah"
          size={30}
          className="border-transparent bg-transparent"
          disabled={index === total - 1}
          onClick={() => moveClip(clip.id, 1)}
        >
          <ArrowDown className="size-4" />
        </IconButton>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <input
            value={clip.title}
            onChange={(e) => updateClip(clip.id, { title: e.target.value })}
            aria-label={`Judul adegan ${index + 1}`}
            placeholder="Judul adegan"
            className="-ml-1 min-w-0 flex-1 rounded-md bg-transparent px-1 font-display text-lg font-bold outline-none hover:bg-sand focus:bg-sand"
          />
          {stale && <Badge tone="warn">Visual perlu diperbarui</Badge>}
          {voiceOld && <Badge tone="warn">Suara perlu dibuat ulang</Badge>}
          <Menu
            trigger={(open) => (
              <IconButton label="Opsi adegan" size={34} onClick={open}>
                <MoreHorizontal className="size-4" />
              </IconButton>
            )}
            items={[
              { label: 'Sisipkan adegan setelah ini', icon: <Plus className="size-4" />, run: onInsert },
              { label: 'Hapus adegan', icon: <Trash2 className="size-4" />, danger: true, run: () => void remove() }
            ]}
          />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-2">Alur adegan</span>
          <AutoTextarea
            id={`scene-${clip.id}-story`}
            minRows={2}
            value={clip.story}
            onChange={(e) => updateClip(clip.id, { story: e.target.value })}
            placeholder="Apa yang terjadi di adegan ini?"
            className={cx(inputCls, 'py-2 text-sm leading-relaxed')}
          />
        </label>

        <label className="group/narr flex flex-col gap-1">
          <span className="flex items-center gap-2 text-xs font-semibold text-ink-2">
            Narasi & dialog
            <span className="font-mono text-accent">{timestamp}</span>
            <span className="font-normal text-muted">
              {words} kata · ± {Math.round(estimateNarrationMs(clip.narration, wps) / 1000)} detik
            </span>
          </span>
          <AutoTextarea
            id={`scene-${clip.id}-narration`}
            minRows={2}
            value={clip.narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder={'Narasi dan dialog singkat, misalnya: Ia berbisik, “Jangan buka pintunya.”'}
            className={cx(inputCls, 'py-2 text-[15px] leading-relaxed')}
          />
          {/* Vocal tags steer the voice's delivery; captions leave them out. Shown while writing. */}
          <span className="hidden flex-wrap items-center gap-1 group-focus-within/narr:flex">
            <span className="mr-0.5 text-[11.5px] text-muted">Ekspresi suara:</span>
            {VOICE_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertTag(t)}
                className="h-6 rounded-full border border-line-2 bg-paper px-2 font-mono text-[11px] text-ink-2 hover:border-ink-2 hover:text-ink"
              >
                &lt;{t}&gt;
              </button>
            ))}
          </span>
        </label>
      </div>

      {image && (
        <img src={image.url} alt="" draggable={false} className="aspect-video w-[132px] shrink-0 self-start rounded-lg border border-line object-cover" />
      )}
    </article>
  )
}

/** Step 2: read and shape the scene-by-scene script before any pictures are made. */
export function ScriptStep() {
  const { project, clips, addClip, updateProject, updateEditor, flush, load } = useProject()
  const { toast, go } = useApp()
  const [busy, setBusy] = useState<'missing' | 'all' | null>(null)
  const [writer, setWriter] = useState<{ provider: LlmProvider; model: string } | null>(null)
  const [scriptView, setScriptView] = useState<'read' | 'scenes' | 'flow'>('read')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [refining, setRefining] = useState(false)
  const [visualProgress, setVisualProgress] = useState<ScriptProgress | null>(null)
  const ownRequest = useRef(false)

  useEffect(() => {
    if (!project) return
    const id = project.id
    let disposed = false
    let received = false
    let followedRunning = false
    setVisualProgress(null)
    const accept = (state: ScriptProgress | null) => {
      if (disposed || state?.projectId !== id) return
      setVisualProgress(state)
      if (state.status === 'running') {
        followedRunning = true
        setScriptView('flow')
        setBusy((current) => current ?? 'missing')
      }
      else if (!ownRequest.current) {
        setBusy(null)
        if (state.status === 'done' && followedRunning) void window.api.projects.get(id).then((bundle) => {
          if (!disposed && useProject.getState().project?.id === id) {
            load(bundle)
            updateProject({ step: 2 })
          }
        }).catch((e) => { if (!disposed) toast('error', errorText(e)) })
      }
    }
    const off = window.api.on.visualProgress((state) => { if (state.projectId === id) { received = true; accept(state) } })
    void window.api.story.visualStatus(id).then((state) => { if (!received) accept(state) }).catch(() => {})
    return () => { disposed = true; off() }
  }, [project?.id, load, updateProject, toast])

  useEffect(() => {
    void window.api.settings.get().then((s) => setWriter({ provider: s.llmProvider, model: s.llmModels[s.llmProvider] }))
  }, [])

  // A freshly inserted scene scrolls into view with its story field ready for typing.
  useEffect(() => {
    if (!focusId) return
    document.getElementById(`scene-${focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    document.getElementById(`scene-${focusId}-story`)?.focus()
    setFocusId(null)
  }, [focusId])

  if (!project) return null

  const insert = (afterId: string | null): void => { setScriptView('scenes'); setFocusId(addClip(afterId)) }
  const totalMs = clips.reduce((n, c) => n + c.durationMs, 0)
  const spans = sceneSpans(clips)
  const planned = clips.some((c) => c.visualPrompt.trim())
  const stale = clips.filter(needsVisual).length
  const target = DURATIONS.find((d) => d.sec === project.durationSec)?.label ?? `${project.durationSec} detik`

  const openSettings = async (): Promise<void> => {
    try { await flush(); go({ name: 'settings', back: { name: 'project', id: project.id } }) } catch (e) { toast('error', errorText(e)) }
  }

  const makeVisuals = async (mode: 'missing' | 'all'): Promise<void> => {
    if (ownRequest.current || busy) return
    if (mode === 'all') {
      const ok = await confirmDialog({
        title: 'Susun ulang semua visual?',
        body: 'AI menulis ulang prompt gambar, gerak kamera, dan transisi semua adegan. Gambar yang sudah dibuat tetap terpasang sampai kamu membuatnya ulang.',
        confirm: 'Susun ulang'
      })
      if (!ok) return
    }
    ownRequest.current = true
    setScriptView('flow')
    setBusy(mode)
    setVisualProgress({ projectId: project.id, status: 'running', completed: 0, total: mode === 'all' ? clips.length : stale, message: 'Menyiapkan permintaan ke AI penulis.' })
    let submitted = false
    try {
      await flush()
      submitted = true
      const bundle = await window.api.story.visuals(project.id, mode)
      if (useProject.getState().project?.id !== project.id) return
      load(bundle)
      updateProject({ step: 2 })
      toast('success', 'Prompt siap di panel Google Flow. Salin atau ekspor, atau lanjutkan ke storyboard.')
    } catch (e) {
      if (useProject.getState().project?.id !== project.id) return
      const state = submitted ? await window.api.story.visualStatus(project.id).catch(() => null) : null
      setVisualProgress(state?.status !== 'running' && state ? state : { projectId: project.id, status: 'failed', completed: 0, total: clips.length, message: errorText(e) })
      if (state?.status !== 'canceled') toast('error', errorText(e))
    } finally {
      ownRequest.current = false
      setBusy(null)
    }
  }

  const exportNarration = async (format: 'txt' | 'docx'): Promise<void> => {
    try { await flush(); const file = await window.api.story.exportFlow(project.id, format, { kind: 'narration' }); if (file) toast('success', 'Narasi tersimpan.') }
    catch (error) { toast('error', errorText(error)) }
  }

  const refine = async (): Promise<void> => {
    setRefining(true)
    try {
      await flush()
      const bundle = await window.api.story.refineScript(project.id)
      if (useProject.getState().project?.id !== project.id) return
      load(bundle)
      toast('success', 'Naskah dan dialog diperbarui. Tinjau hasilnya, lalu buat ulang visual dan suara yang berubah.')
    } catch (e) { toast('error', errorText(e)) }
    finally { setRefining(false) }
  }

  if (!clips.length)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <h2 className="font-display text-3xl font-bold">Naskah masih kosong</h2>
        <p className="max-w-md text-ink-2">Tulis idenya di langkah Ide cerita lalu klik Susun naskah, atau tulis adegannya sendiri.</p>
        <div className="flex gap-2.5">
          <Button onClick={() => updateProject({ step: 1 })}>Ke Ide cerita</Button>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => insert(null)}>
            Tulis adegan pertama
          </Button>
        </div>
      </div>
    )

  return (
    <div className="relative h-full">
      <div className="scroll-thin h-full overflow-y-auto pb-32">
        <div className="mx-auto flex max-w-[940px] flex-col gap-4 px-10 pt-6">
          <div>
            <p className="text-[13px] font-semibold text-accent">Langkah 2 dari 4</p>
            <h1 className="mt-1.5 font-display text-[30px] font-bold leading-tight tracking-[-0.02em]">Naskah</h1>
            <p className="mt-2 text-sm text-ink-2">
              Baca narasi lengkap dulu. Pilih Edit per adegan untuk mengubah isi, lalu Prompt Google Flow untuk menyiapkan visual.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <Button size="sm" icon={<Sparkles className="size-4" />} loading={refining} disabled={!!busy} onClick={() => void refine()}>Perbaiki naskah & dialog</Button>
            <span className="rounded-full border border-line-2 bg-surface px-3 py-1.5 font-semibold">{clips.length} adegan</span>
            <span className="rounded-full border border-line-2 bg-surface px-3 py-1.5">± {mmss(totalMs)} narasi</span>
            <span className="rounded-full border border-line-2 bg-surface px-3 py-1.5 text-ink-2">Target {target}</span>
          </div>

          {project.synopsis.trim() && (
            <div className="flex items-start gap-3 rounded-xl bg-sand px-4 py-3 text-[13px] text-ink-2">
              <span className="shrink-0 font-semibold text-ink">Ide awal</span>
              <span className="line-clamp-2 flex-1">{project.synopsis}</span>
              <button type="button" onClick={() => updateProject({ step: 1 })} className="shrink-0 font-semibold text-accent-dark hover:underline">
                Ubah ide
              </button>
            </div>
          )}

          <ScriptReviewPanel onScene={id => { setScriptView('scenes'); setFocusId(id) }} />
          <nav aria-label="Bagian naskah" className="flex flex-wrap gap-2">{([{id:'read',label:'Baca naskah'},{id:'scenes',label:'Edit per adegan'},{id:'flow',label:'Prompt Google Flow'}] as const).map(tab => <Button key={tab.id} variant={scriptView === tab.id ? 'accent' : 'secondary'} aria-pressed={scriptView === tab.id} onClick={() => setScriptView(tab.id)}>{tab.label}</Button>)}</nav>
          {scriptView === 'read' && <section aria-label="Narasi lengkap" className="rounded-xl border border-line bg-surface p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2"><h2 className="mr-auto text-lg font-semibold">Narasi lengkap</h2>
              <Button size="sm" icon={<Copy className="size-4" />} onClick={() => void window.api.app.copyText(clips.map(c => stripVoiceTags(c.narration).trim()).join('\n\n')).then(() => toast('success','Narasi lengkap disalin.')).catch(e => toast('error',errorText(e)))}>Salin narasi</Button>
              {(['txt','docx'] as const).map(format => <Button key={format} size="sm" icon={<Download className="size-4" />} onClick={() => void exportNarration(format)}>Ekspor {format.toUpperCase()}</Button>)}
            </div><p className="mb-5 text-xs text-muted">Waktu masih perkiraan sampai suara dibuat. Nomor dan waktu tidak ikut dibacakan.</p>
            <div className="flex flex-col gap-5">{clips.map((clip,i) => <div key={clip.id}><p className="mb-1 font-mono text-xs text-muted">{String(i+1).padStart(3,'0')} · {spans[i].timestamp}</p><p className="whitespace-pre-wrap text-[16px] leading-8">{stripVoiceTags(clip.narration).trim()}</p></div>)}</div>
          </section>}
          <div hidden={scriptView !== 'flow'}>
          <FlowPanel busy={!!busy || refining} progress={visualProgress} onPrepare={() => void makeVisuals('missing')} />          </div>
          <div hidden={scriptView !== 'scenes'}>
          <div className="flex flex-col">
            {clips.map((c, i) => (
              <div key={c.id}>
                {i > 0 && <InsertGap onInsert={() => insert(clips[i - 1].id)} />}
                <SceneCard clip={c} index={i} total={clips.length} timestamp={spans[i].timestamp} onInsert={() => insert(c.id)} />
              </div>
            ))}
            <button
              type="button"
              onClick={() => insert(clips[clips.length - 1]?.id ?? null)}
              className="mt-3 flex h-12 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-line-3 text-sm font-medium text-ink-2 hover:border-ink-2 hover:text-ink"
            >
              <Plus className="size-4" />
              Tambah adegan
            </button>
          </div>
          </div>
          <details className="rounded-xl border border-line bg-surface p-4" aria-label="Pengaturan pembawaan suara"><summary className="cursor-pointer text-sm font-medium">Atur tempo dan pembawaan suara</summary><div className="mt-3">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Arahan narator</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{project.editor.storyBrief?.fictional === false ? 'Periksa kejelasan istilah, contoh dan kesimpulan sebelum membuat suara.' : 'Satu narator memainkan dialog yang sudah tertulis di naskah. Periksa percakapan dan akhir cerita sebelum membuat suara.'}</p>
              <p className="mt-1 text-xs text-muted">{project.ttsProvider === 'f5-local' ? 'F5 lokal memakai suara tersimpan di studio Indonesia. Atur tempo di sini; tag emosi Gemini tidak digunakan.' : project.ttsProvider === 'f5-hf' ? 'F5 mengikuti sampel referensi di Hugging Face; arahan emosi di sini tidak mengubah model F5.' : project.ttsProvider === 'supertonic' ? 'Supertonic mengikuti preset studio lokal; arahan ini berlaku untuk Gemini dan ElevenLabs.' : 'Gemini mengikuti arahan gaya; ElevenLabs mengikuti model, suara, dan tag ekspresi yang didukung.'}</p>
            </div>
            {(project.ttsProvider === 'supertonic' || project.ttsProvider === 'f5-local') ? (
              <div className="flex min-w-[220px] flex-col gap-2">
                <p className="text-xs font-semibold">Tempo narasi lokal</p>
                <Select label="Tempo narasi lokal" value={String(narrationSpeed(project.editor.narrationSpeed))} onChange={(value) => updateEditor({ narrationSpeed: Number(value) })} options={[
                  { value: '0.8', label: '0,80× · Lebih pelan' },
                  { value: '0.9', label: '0,90× · Santai (awal)' },
                  { value: '1', label: '1,00× · Tempo studio' },
                  { value: '1.1', label: '1,10× · Lebih cepat' }
                ]} />
                <p className="max-w-[280px] text-xs text-muted">Nada suara tetap. Setelah mengubah tempo, buat ulang narasi agar durasi dan caption ikut menyesuaikan.</p>
              </div>
            ) : <Select label="Pembawaan narator" value={project.editor.voiceDelivery ?? 'dramatic'} onChange={(voiceDelivery) => updateEditor({ voiceDelivery })} options={VOICE_DELIVERIES.map((d) => ({ value: d.id, label: d.label }))} />}
          </div>

          </div></details>
        </div>
      </div>

      <footer className="absolute inset-x-0 bottom-0 flex h-[84px] items-center gap-3 border-t border-line bg-surface px-14">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold">
            {clips.length} adegan · ± {mmss(totalMs)}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <Bot className="size-3.5" />
            Visual disusun oleh {writer ? `${llmName(writer.provider)} · ` : ''}
            <span className={cx('font-mono', writer && !writer.model && 'text-accent-dark')}>{writer ? writer.model || 'model belum dipilih' : '…'}</span>
            <button type="button" onClick={() => void openSettings()} className="font-semibold text-accent-dark hover:underline">
              Ganti
            </button>
          </span>
        </div>
        <div className="flex-1" />
        <Button size="lg" disabled={!!busy} onClick={() => updateProject({ step: 1 })}>
          Kembali ke ide
        </Button>
        {!planned ? (
          <Button variant="primary" size="lg" className="h-[50px]" loading={busy === 'missing'} icon={!busy && <Sparkles className="size-[18px]" />} onClick={() => void makeVisuals('missing')}>
            Susun prompt visual
          </Button>
        ) : stale > 0 ? (
          <>
            <Button size="lg" disabled={!!busy} onClick={() => updateProject({ step: 3 })}>
              Ke storyboard
            </Button>
            <Button variant="primary" size="lg" className="h-[50px]" loading={busy === 'missing'} icon={!busy && <Sparkles className="size-[18px]" />} onClick={() => void makeVisuals('missing')}>
              Perbarui visual ({stale} adegan)
            </Button>
          </>
        ) : (
          <>
            {scriptView === 'flow' && (
            <Button size="lg" disabled={!!busy} loading={busy === 'all'} icon={busy !== 'all' && <RefreshCw className="size-[17px]" />} onClick={() => void makeVisuals('all')}>
              Susun ulang visual
            </Button>
            )}
            <Button
              variant="primary"
              size="lg"
              className="h-[50px]"
              disabled={!!busy}
              onClick={() => updateProject({ step: 3, status: project.status === 'draft' || project.status === 'script' ? 'storyboard' : project.status })}
            >
              Lanjut ke visual & suara
              <ArrowRight className="size-[18px]" />
            </Button>
          </>
        )}
      </footer>
    </div>
  )
}
