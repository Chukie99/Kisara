import { SourceEditor, SourceReview } from '../../components/SourceEditor'
import { DEFAULT_SOURCE_OPTIONS } from '@shared/sourceOptions'
import type { SourceOptions } from '@shared/types'
import { StoryPacing } from '../../components/StoryPacing'
import { useEffect, useRef, useState } from 'react'
import { Bot, Clapperboard, Link2, Play, Sparkles, Square } from 'lucide-react'
import { DURATIONS, LANGUAGES, clipCountFor, defaultVoiceFor, llmName } from '@shared/models'
import { getStyle } from '@shared/styles'
import type { AppSettings, ImageProvider, KeyStatus, KeyTestResult, LlmProvider, ScriptProgress, TtsProvider, VoiceOption } from '@shared/types'
import { Select } from '../../components/Select'
import { StylePicker } from '../../components/StylePicker'
import { Button, Chip, Field, Segmented, confirmDialog, cx, inputCls } from '../../components/ui'
import { errorText } from '../../lib/format'
import { geminiPreview } from '../../lib/voicePreviews'
import { TTS_NAMES, TTS_ORDER, ttsReadiness, usableTts } from '../../lib/keys'
import { useApp } from '../../store/app'
import { useProject } from '../../store/project'
import { ModelSection } from './ModelSection'

/** One sample plays at a time, from the list rows or the button beside the picker. */
function usePreviewPlayer(): { playing: string | null; toggle: (id: string, url: string) => void } {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState<string | null>(null)
  useEffect(() => () => audio.current?.pause(), [])
  return {
    playing,
    toggle: (id, url) => {
      audio.current?.pause()
      if (playing === id) return setPlaying(null)
      const a = new Audio(url)
      a.onended = () => setPlaying(null)
      audio.current = a
      setPlaying(id)
      void a.play().catch(() => setPlaying(null))
    }
  }
}

function VoicePicker({ provider, value, onChange }: { provider: TtsProvider; value: string; onChange: (v: string) => void }) {
  const [voices, setVoices] = useState<VoiceOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const player = usePreviewPlayer()

  useEffect(() => {
    let active = true
    setVoices(null)
    setError(null)
    window.api.settings
      .voices(provider)
      .then((list) => {
        if (!active) return
        // Gemini samples ship with the app; ElevenLabs sends its own preview links.
        const v = provider === 'gemini' ? list.map((x) => ({ ...x, previewUrl: x.previewUrl ?? geminiPreview(x.id, x.name) })) : list
        setVoices(v)
        if (!v.some((x) => x.id === value) && v[0]) {
          const sameLocalVoice = provider === 'f5-local' ? v.find((x) => x.id.split(':')[0] === value.split(':')[0]) : undefined
          onChange((sameLocalVoice ?? v[0]).id)
        }
      })
      .catch((e) => { if (active) setError(errorText(e)) })
    return () => { active = false }
  }, [provider])

  const urlOf = (id: string): string | null => voices?.find((v) => v.id === id)?.previewUrl ?? null
  const current = voices?.find((v) => v.id === value)

  const playButton = (id: string, size: 'row' | 'field') => {
    const url = urlOf(id)
    if (!url) return null
    const on = player.playing === id
    return (
      <button
        type="button"
        aria-label={on ? 'Hentikan contoh suara' : 'Dengarkan contoh suara'}
        title={on ? 'Hentikan' : 'Dengarkan contoh'}
        onClick={() => player.toggle(id, url)}
        className={cx(
          'flex shrink-0 items-center justify-center rounded-full border transition-colors',
          size === 'row' ? 'size-7' : 'size-12 rounded-xl',
          on ? 'border-accent bg-accent text-white' : 'border-line-2 bg-surface text-ink hover:border-ink-2'
        )}
      >
        {on ? <Square className="size-3.5" fill="currentColor" /> : <Play className="ml-px size-3.5" fill="currentColor" />}
      </button>
    )
  }

  if (error) return <p className="flex h-12 flex-1 items-center rounded-xl bg-bad-soft px-3.5 text-[13px] text-bad-ink">{error}</p>
  return (
    <>
      <Select
        label="Suara narator"
        size="lg"
        value={value}
        onChange={onChange}
        disabled={!voices}
        className="flex-1"
        menuWidth={380}
        renderAction={(o) => playButton(o.value, 'row')}
        options={
          voices
            ? voices.map((v) =>
                // Gemini tones are short; ElevenLabs labels are longer, so they go on a second line.
                provider === 'gemini' ? { value: v.id, label: v.name, hint: v.description || undefined } : { value: v.id, label: v.name, note: v.description || undefined }
              )
            : [{ value, label: 'Memuat daftar suara…' }]
        }
      />
      {current && playButton(current.id, 'field')}
    </>
  )
}

export function IdeaStep() {
  const { project, clips, updateProject, updateEditor, flush, load } = useProject()
  const { toast, go } = useApp()
  const [busy, setBusy] = useState(false)
  const [scriptProgress, setScriptProgress] = useState<ScriptProgress | null>(null)
  const [scriptError, setScriptError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const ownRequest = useRef(false)
  const [writer, setWriter] = useState<{ provider: LlmProvider; model: string } | null>(null)
  const [keys, setKeys] = useState<KeyStatus[]>([])
  const [ttsSettings, setTtsSettings] = useState<AppSettings | null>(null)
  const [f5Local, setF5Local] = useState<KeyTestResult | null>(null)
  const [supertonic, setSupertonic] = useState<KeyTestResult | null>(null)
  const [imageProvider, setImageProvider] = useState<ImageProvider | null>(null)
  // "From a YouTube link": the video is read for its words, then distilled into a fresh idea.
  const [sourceInput, setSourceInput] = useState<SourceOptions>({ ...DEFAULT_SOURCE_OPTIONS })
  const [link, setLink] = useState('')
  const [busyLink, setBusyLink] = useState(false)
  const [linkNote, setLinkNote] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  useEffect(() => {
    setSourceInput(project?.editor.storyBrief?.sourceOptions ?? { ...DEFAULT_SOURCE_OPTIONS, mode: project?.editor.storyBrief?.fictional ? 'fiction' : 'factual' })
  }, [project?.id])
  const [ytdlp, setYtdlp] = useState<{ ready: boolean; version: string | null } | null>(null)

  useEffect(() => {
    const id = project?.id
    if (!id) return
    setScriptProgress(null); setScriptError(null)
    let receivedEvent = false
    const update = (state: ScriptProgress) => {
      if (state.projectId !== id) return
      setScriptProgress(state)
      setBusy(state.status === 'running')
      if (state.status === 'failed') setScriptError(state.message)
      else setScriptError(null)
    }
    const stop = window.api.on.scriptProgress((state) => {
      if (state.projectId !== id) return
      receivedEvent = true
      update(state)
      if (state.status === 'done' && !ownRequest.current) {
        void window.api.projects.get(id).then((bundle) => {
          if (useProject.getState().project?.id === id) load(bundle)
        }).catch((error) => setScriptError(errorText(error)))
      }
    })
    void window.api.story.scriptStatus(id).then((state) => { if (state && !receivedEvent) update(state) }).catch(() => {})
    return stop
  }, [project?.id])

  useEffect(() => {
    if (!busy) return
    setElapsed(0)
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [busy])

  useEffect(() => {
    void window.api.settings.get().then((s) => {
      setWriter({ provider: s.llmProvider, model: s.llmModels[s.llmProvider] })
      setImageProvider(s.imageProvider)
      setTtsSettings(s)
    })
    void window.api.settings.keys().then(setKeys)
    void window.api.settings.supertonicStatus().then(setSupertonic)
    void window.api.settings.testF5Local().then(setF5Local).catch(() => setF5Local({ ok: false, message: 'F5 lokal belum tersambung' }))
    void window.api.story.youtubeStatus().then(setYtdlp).catch(() => {})
  }, [])

  // Before any narration exists, move to a narrator service that is ready to use.
  const hasVoice = clips.some((c) => c.audioAssetId)
  useEffect(() => {
    if (!project || !keys.length || !ttsSettings || hasVoice || (project.ttsProvider === 'f5-local' && !f5Local)) return
    const use = usableTts(project.ttsProvider, keys, supertonic, ttsSettings, f5Local)
    if (use !== project.ttsProvider) updateProject({ ttsProvider: use, ttsVoice: defaultVoiceFor(use) })
  }, [keys, supertonic, ttsSettings, f5Local, project?.id])

  if (!project) return null
  const ready = ttsReadiness(keys, supertonic, ttsSettings, f5Local)
  const blocked = keys.length ? TTS_ORDER.filter((p) => !ready[p].ok) : []
  const openSettings = async (): Promise<void> => {
    await flush()
    go({ name: 'settings', back: { name: 'project', id: project.id } })
  }

  const clipCount = clipCountFor(project.durationSec)
  const perClip = Math.round(project.durationSec / clipCount)
  const targetDuration = DURATIONS.find((duration) => duration.sec === project.durationSec)?.label ?? `${Math.round(project.durationSec / 60 * 10) / 10} menit`

  const compose = async (): Promise<void> => {
    if (ownRequest.current) return
    if (!project.synopsis.trim()) {
      toast('error', 'Tulis ide cerita atau sinopsis dulu.')
      return
    }
    if (clips.length) {
      const ok = await confirmDialog({
        title: 'Susun ulang naskah?',
        body: `Proyek ini sudah punya ${clips.length} adegan. Menyusun ulang akan mengganti semua adegan beserta naskahnya. Pemeran tetap ada, sedangkan gambar dan suara lama tersimpan di riwayat tapi tidak lagi terpasang.`,
        confirm: 'Susun ulang'
      })
      if (!ok) return
    }
    setBusy(true)
    setScriptError(null)
    ownRequest.current = true
    try {
      await flush()
      const bundle = await window.api.story.script(project.id)
      if (useProject.getState().project?.id !== project.id) return
      load(bundle)
      toast('success', `${bundle.clips.length} adegan siap. Baca dan rapikan naskahnya dulu.`)
    } catch (e) {
      const message = errorText(e)
      if (!/dibatalkan/i.test(message)) { setScriptError(message); toast('error', message) }
    } finally {
      ownRequest.current = false
      setBusy(false)
    }
  }

  /**
   * Reads a YouTube video and fills the idea box from it. The video's own words are only the raw material:
   * what lands in the box is a fresh synopsis the writer then reviews and edits like any other idea.
   */
  const fromVideo = async (): Promise<void> => {
    const url = link.trim()
    if (!url || busyLink) return
    setBusyLink(true)
    setLinkNote(null)
    setLinkError(null)
    try {
      await flush()
      const idea = await window.api.story.fromVideo(url, project.language, sourceInput)
      const current = useProject.getState().project
      if (current?.id !== project.id) return
      if (current.synopsis !== project.synopsis || current.title !== project.title || current.language !== project.language) throw new Error('Ide atau bahasa berubah saat podcast dipelajari. Hasil belum diterapkan agar edit kamu tetap aman.')
      updateProject({ synopsis: idea.synopsis, title: idea.title })
      updateEditor({ storyBrief: { idea: idea.idea, fictional: idea.fictional ?? sourceInput.mode === 'fiction', sourceTitle: idea.videoTitle, sourceOptions: idea.sourceOptions ?? sourceInput, sourceNotes: idea.sourceNotes, reviewNotes: idea.reviewNotes, pacing: idea.pacing } })
      const mins = Math.round(idea.durationSec / 60)
      const how = idea.transcriptSource === 'text' ? 'dibaca dari teks kamu' : idea.transcriptSource === 'whisper' ? 'disalin dari suaranya' : 'dibaca dari caption YouTube'
      const parts = idea.chunks > 1 ? `, dianalisis dalam ${idea.chunks} bagian` : ''
      setLinkNote(
        `Materi ${how}: ${idea.transcriptChars.toLocaleString('id-ID')} karakter${mins ? ` dari video ${mins} menit` : ''}${parts}.` +
          (idea.partial ? ' Hanya bagian awalnya, karena videonya tidak punya caption.' : '') +
          ` Sumber: "${idea.videoTitle}" · ${idea.uploader}. Baca ulang sinopsisnya sebelum lanjut.`
      )
      if (idea.transcriptSource !== 'text') setYtdlp((v) => v ?? { ready: true, version: null })
      toast('success', 'Ide dari video sudah masuk ke kotak sinopsis.')
      setLink('')
    } catch (e) {
      if (useProject.getState().project?.id !== project.id) return
      setLinkError(errorText(e))
      toast('error', errorText(e))
    } finally {
      setBusyLink(false)
    }
  }

  return (
    <div className="relative h-full">
      <div className="scroll-thin h-full overflow-y-auto pb-28">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 px-8 min-[1500px]:grid-cols-[minmax(0,1fr)_360px] pt-8">
          <div className="flex flex-col gap-[22px]">
            <div>
              <p className="text-[13px] font-semibold text-accent">Langkah 1 dari 4</p>
              <h1 className="mt-1.5 font-display text-[40px] font-bold leading-tight tracking-[-0.02em]">Tinjau ide & durasi</h1>
              <p className="mt-2 text-[15px] text-ink-2">
                {sourceInput.mode === 'factual' ? 'Tentukan topik, target penonton, dan hal yang ingin kamu jelaskan. Tinjau fakta dan susunan pembahasannya sebelum menulis naskah.' : 'Sebut tokoh, tempat, dan akhir ceritanya. Makin jelas, makin rapi susunan klip dari AI.'}
              </p>
            </div>

            {(busy || scriptProgress || scriptError) && <section aria-label="Status penyusunan naskah" role={scriptError ? 'alert' : 'status'} className={cx('flex flex-col gap-3 rounded-xl border p-4', scriptError ? 'border-bad-ink bg-bad-soft' : 'border-line bg-surface')}>
              <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{busy ? 'AI penulis sedang bekerja' : scriptError ? 'Naskah belum selesai' : scriptProgress?.status === 'canceled' ? 'Penyusunan dibatalkan' : 'Status naskah'}</h2>{busy && <span className="font-mono text-xs text-muted">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>}</div>
              <p className="text-sm leading-relaxed">{scriptError ?? scriptProgress?.message ?? 'Menghubungi model penulis…'}</p>
              {busy && <><progress aria-label="Adegan selesai" value={scriptProgress?.completed ?? 0} max={scriptProgress?.total || clipCount} className="h-2 w-full accent-accent" /><p className="text-xs text-muted">{scriptProgress?.completed ?? 0} / {scriptProgress?.total || clipCount} adegan. Hugging Face dan Cloudflare tidak dipakai saat menyusun naskah.</p><Button size="sm" className="self-start" onClick={() => void window.api.story.cancelScript(project.id).catch((error) => setScriptError(errorText(error)))}>Batalkan penyusunan</Button></>}
            </section>}

            <details className="rounded-xl border border-line bg-surface p-4" aria-label="Bahan sumber proyek" open={project.synopsis.trim() ? undefined : true}>
              <summary className="cursor-pointer font-medium">{project.synopsis.trim() ? 'Ganti atau pelajari ulang bahan sumber' : 'Mulai dari YouTube atau transkrip'}</summary>
              <div className="mt-3">
            <div className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-line-2 bg-sand/50 px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <Clapperboard className="size-4 text-accent-dark" />
                  Materi dari YouTube atau transkrip
                </span>
                <span className="text-xs text-muted">edukasi, dokumenter, atau cerita</span>
                {ytdlp && (
                  <span className="ml-auto text-xs text-muted">{ytdlp.ready ? `yt-dlp ${ytdlp.version ?? ''}`.trim() : 'yt-dlp diunduh otomatis saat dipakai'}</span>
                )}
              </div>
              <SourceEditor value={sourceInput} onChange={setSourceInput} disabled={busyLink || busy} />
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                  <textarea rows={2}
                    value={link}
                    disabled={busyLink}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="Tempel link YouTube atau transkrip podcast…"
                    spellCheck={false}
                    aria-label="Podcast atau transkrip"
                    className={cx(inputCls, 'min-h-16 resize-y pl-9 text-sm')}
                  />
                </div>
                <Button variant="accent" size="md" className="h-11" loading={busyLink} disabled={!link.trim()} onClick={() => void fromVideo()}>
                  Ambil ide
                </Button>
              </div>
              <p className="text-xs leading-relaxed text-muted">
                Kisara mengolah materi sesuai pilihan faktual atau fiksi di atas. Tinjau judul, ide, serta sinopsis sebelum menyusun naskah.
              </p>
              {busyLink && <p role="status" className="text-xs leading-relaxed text-muted">Sedang membaca materi sumber dan meminta AI menyusun ide. Link YouTube perlu mengambil caption terlebih dulu; proses ini bisa beberapa menit.</p>}
              {linkError && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm leading-relaxed text-bad-ink"><strong>Ide belum berhasil diambil.</strong> {linkError} <button type="button" className="ml-2 font-semibold underline" onClick={() => void openSettings()}>Periksa model / tes menulis</button></p>}
              {linkNote && (
                <p className="rounded-xl bg-accent-soft px-3 py-2 text-xs leading-relaxed text-accent-dark">{linkNote}</p>
              )}
            </div>

              </div>
            </details>

            <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-ink bg-surface px-[18px] pb-3 pt-4 shadow-ink-md">
              {project.editor.storyBrief && <label className="flex flex-col gap-1 rounded-lg bg-accent-soft p-3 text-sm text-accent-dark">{project.editor.storyBrief.fictional ? 'Ide fiksi' : 'Ide pembahasan'}<textarea aria-label="Ide pembahasan" rows={2} className="resize-y bg-transparent outline-none" value={project.editor.storyBrief.idea} onChange={(e) => updateEditor({ storyBrief: { ...project.editor.storyBrief!, idea: e.target.value } })} /></label>}
              <label htmlFor="sinopsis" className="text-[13px] font-semibold text-ink-2">
                Ringkasan pembahasan atau sinopsis
              </label>
              <textarea
                id="sinopsis"
                rows={5}
                value={project.synopsis}
                maxLength={4000}
                onChange={(e) => updateProject({ synopsis: e.target.value })}
                placeholder="Tahun 1336 di istana Majapahit. Gajah Mada bersumpah tidak akan menikmati palapa sebelum Nusantara bersatu…"
                className="resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted/70"
              />
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Tips: tulis juga suasana yang kamu mau, misalnya tegang, lucu, atau haru.</span>
                <span className="font-mono">{project.synopsis.length.toLocaleString('id-ID')} / 4.000</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <SourceReview brief={project.editor.storyBrief} />
              <StoryPacing brief={project.editor.storyBrief} synopsis={project.synopsis} duration={project.durationSec} onDuration={(durationSec) => updateProject({ durationSec })} />
              <span className="text-sm font-semibold">Durasi video</span>
              <div className="flex flex-wrap gap-2">
                {(DURATIONS.some(d => d.sec === project.durationSec) ? DURATIONS : [...DURATIONS, { sec: project.durationSec, label: targetDuration }].sort((a,b) => a.sec-b.sec)).map((d) => (
                  <Chip key={d.sec} on={project.durationSec === d.sec} onClick={() => updateProject({ durationSec: d.sec })} className="h-10 px-4">
                    {d.label}
                  </Chip>
                ))}
              </div>
              <span className="text-[13px] text-muted">
                Sekitar {clipCount} klip, masing-masing kurang lebih {perClip} detik. Durasi akhir mengikuti panjang suara narasi.
              </span>
            </div>

            <details className="rounded-xl border border-line bg-surface p-4" aria-label="Pengaturan lanjutan proyek"><summary className="cursor-pointer text-sm font-semibold">Pengaturan tambahan <span className="font-normal text-muted">· bahasa, format, suara, dan model</span></summary><div className="mt-4 flex flex-col gap-5">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-5">
              <Field label="Bahasa naskah dan suara">
                <Select
                  label="Bahasa naskah dan suara"
                  size="lg"
                  value={project.language}
                  onChange={(v) => updateProject({ language: v })}
                  options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                />
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Format</span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: '16:9', label: '16:9', sub: 'YouTube', w: 26, h: 15 },
                      { id: '9:16', label: '9:16', sub: 'Shorts, Reels, TikTok', w: 13, h: 22 }
                    ] as const
                  ).map((f) => {
                    const on = project.aspectRatio === f.id
                    return (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => updateProject({ aspectRatio: f.id })}
                        className={cx(
                          'flex h-12 items-center gap-2.5 rounded-xl px-3 text-left',
                          on ? 'border-2 border-accent bg-accent-soft' : 'border border-line-2 bg-surface hover:border-ink-2'
                        )}
                      >
                        <span className="flex w-[26px] justify-center">
                          <span className="rounded-[3px] border-[1.8px] border-ink" style={{ width: f.w, height: f.h }} />
                        </span>
                        <span className="flex flex-col leading-tight">
                          <span className="text-sm font-semibold">{f.label}</span>
                          <span className="text-xs text-ink-2">{f.sub}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Suara narator</span>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  value={project.ttsProvider}
                  onChange={(v) => updateProject({ ttsProvider: v, ttsVoice: defaultVoiceFor(v) })}
                  options={TTS_ORDER.map((p) => ({
                    id: p,
                    label: TTS_NAMES[p],
                    disabled: blocked.includes(p),
                    title: ready[p].reason ?? undefined
                  }))}
                />
                <VoicePicker provider={project.ttsProvider} value={project.ttsVoice} onChange={(v) => updateProject({ ttsVoice: v })} />
              </div>
              {blocked.length > 0 && (
                <span className="text-[13px] text-muted">
                  {blocked.length === TTS_ORDER.length
                    ? 'Belum ada layanan suara narator yang siap, jadi suara belum bisa dibuat.'
                    : `${ready[blocked[0]].reason}, jadi ${TTS_NAMES[blocked[0]]} belum bisa dipilih.`}{' '}
                  <button type="button" onClick={() => void openSettings()} className="font-semibold text-accent-dark hover:underline">
                    Atur di Pengaturan
                  </button>
                </span>
              )}
            </div>

            {imageProvider && imageProvider !== 'higgsfield' && (
              <p className="rounded-xl border border-line-2 bg-surface px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2">
                Gambar klip dibuat oleh{' '}
                <strong className="text-ink">{imageProvider === 'cloudflare' ? 'Cloudflare Workers AI' : 'Space Hugging Face'}</strong> (gratis), memakai pengaturan di halaman
                Pengaturan. Pilihan model gambar Higgsfield di bawah tidak dipakai selama layanan itu aktif.
              </p>
            )}

            <ModelSection
              project={project}
              clipCount={clipCount}
              perClip={perClip}
              onChange={(patch) => {
                updateProject(patch)
                // New projects start with the models picked last; resolution stays with this project.
                if (!('videoResolution' in patch)) void window.api.settings.set(patch)
              }}
            />
            </div></details>
          </div>

          <aside className="flex flex-col gap-3.5 self-start rounded-[18px] border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-[22px] font-bold">Gaya visual</h2>
              <span className="text-[13px] text-muted">{getStyle(project.styleId).name}</span>
            </div>
            <p className="-mt-1.5 text-[13px] text-ink-2">Dipakai untuk semua gambar di proyek ini, termasuk lembar karakter.</p>
            <details aria-label="Pilihan gaya visual"><summary className="cursor-pointer text-sm font-medium text-accent-dark">Ubah gaya visual</summary><div className="mt-3"><StylePicker value={project.styleId} onChange={(id) => updateProject({ styleId: id })} /></div></details>
          </aside>
        </div>
      </div>

      <footer className="absolute inset-x-0 bottom-0 flex h-[84px] items-center gap-4 border-t border-line bg-surface px-14">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold">
            {busy ? `${scriptProgress?.completed ?? 0} / ${scriptProgress?.total || clipCount} adegan · AI penulis` : `± ${clipCount} adegan · target ${targetDuration}`}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            <Bot className="size-3.5" />
            AI penulis: {writer ? `${llmName(writer.provider)} · ` : ''}
            <span className={cx('font-mono', writer && !writer.model && 'text-accent-dark')}>{writer ? writer.model || 'model belum dipilih' : '…'}</span>
            <button type="button" onClick={() => void openSettings()} className="font-semibold text-accent-dark hover:underline">
              Ganti
            </button>
          </span>
        </div>
        <div className="flex-1" />
        {clips.length > 0 && !busy && (
          <Button size="lg" onClick={() => updateProject({ step: 2 })}>
            Lihat naskah
          </Button>
        )}
        <Button variant="primary" size="lg" className="h-[50px]" loading={busy} icon={!busy && <Sparkles className="size-[18px]" />} onClick={() => void compose()}>
          {busy ? 'Menyusun naskah…' : clips.length ? 'Susun ulang naskah' : 'Susun naskah'}
        </Button>
      </footer>
    </div>
  )
}
