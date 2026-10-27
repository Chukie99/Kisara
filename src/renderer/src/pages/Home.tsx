import { SourceEditor, SourceReview } from '../components/SourceEditor'
import { DEFAULT_SOURCE_OPTIONS } from '@shared/sourceOptions'
import type { SourceOptions } from '@shared/types'
import { StoryPacing } from '../components/StoryPacing'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Clapperboard, Copy, FolderOpen, Link2, MoreHorizontal, Plus, Search, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react'
import { DURATIONS, IDEA_TOPICS, LANGUAGES, llmName } from '@shared/models'
import { getStyle } from '@shared/styles'
import type { ApiProvider, AppSettings, AspectRatio, KeyStatus, KeyTestResult, NewProjectInput, ProjectStatus, ProjectSummary, TtsProvider } from '@shared/types'
import { Logo } from '../components/Logo'
import { Select, type SelectOption } from '../components/Select'
import { StyleSwatch } from '../components/StyleArt'
import { StyleMenu } from '../components/StyleMenu'
import { Badge, Button, IconButton, Menu, confirmDialog, cx, inputCls } from '../components/ui'
import { errorText, mmss, relativeTime } from '../lib/format'
import { TTS_NAMES, TTS_ORDER, ttsReadiness, usableTts } from '../lib/keys'
import { useApp } from '../store/app'

const STATUS: Record<ProjectStatus, { label: string; tone: 'draft' | 'info' | 'warn' | 'ok' }> = {
  draft: { label: 'Draf', tone: 'draft' },
  script: { label: 'Naskah', tone: 'info' },
  storyboard: { label: 'Storyboard', tone: 'info' },
  editing: { label: 'Editing', tone: 'warn' },
  exported: { label: 'Diekspor', tone: 'ok' }
}

const FILTERS: { id: 'all' | 'draft' | 'progress' | 'exported'; label: string; match: (s: ProjectStatus) => boolean }[] = [
  { id: 'all', label: 'Semua', match: () => true },
  { id: 'draft', label: 'Draf', match: (s) => s === 'draft' },
  { id: 'progress', label: 'Dalam proses', match: (s) => s === 'script' || s === 'storyboard' || s === 'editing' },
  { id: 'exported', label: 'Diekspor', match: (s) => s === 'exported' }
]

/** "a, b dan c" */
function joinList(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} dan ${items[items.length - 1]}`
}

const ASPECTS: SelectOption<AspectRatio>[] = [
  { value: '16:9', label: '16:9 · YouTube', icon: <span className="block h-[10px] w-[17px] rounded-[2px] border-[1.5px] border-ink" /> },
  { value: '9:16', label: '9:16 · Shorts', icon: <span className="mx-[3px] block h-[16px] w-[10px] rounded-[2px] border-[1.5px] border-ink" /> }
]

interface HomeDraft {
  title: string; synopsis: string; brief: NewProjectInput['storyBrief']; durationSec: number; language: string
  aspectRatio: AspectRatio; styleId: string; tts: TtsProvider; entryMode: 'source' | 'manual'; showSource: boolean
  sourceInput: SourceOptions; link: string; linkNote: string | null; linkError: string | null
}
// Keep an unfinished draft across Settings navigation, without storing source material in browser storage.
let homeDraft: HomeDraft | null = null

export function Home() {
  const initialDraft = useRef(homeDraft).current
  const rememberDraft = useRef(true)
  const { go, toast } = useApp()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [keys, setKeys] = useState<KeyStatus[]>([])
  const [f5Local, setF5Local] = useState<KeyTestResult | null>(null)
  const [supertonic, setSupertonic] = useState<KeyTestResult | null>(null)
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [query, setQuery] = useState('')
  const [synopsis, setSynopsis] = useState(initialDraft?.synopsis ?? '')
  const [title, setTitle] = useState(initialDraft?.title ?? '')
  const [entryMode, setEntryMode] = useState<'source' | 'manual'>(initialDraft?.entryMode ?? 'source')
  const [showSource, setShowSource] = useState(initialDraft?.showSource ?? false)
  const [brief, setBrief] = useState<NewProjectInput['storyBrief']>(initialDraft?.brief)
  const [durationSec, setDurationSec] = useState(initialDraft?.durationSec ?? 60)
  const [language, setLanguage] = useState(initialDraft?.language ?? 'id')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(initialDraft?.aspectRatio ?? '16:9')
  const [styleId, setStyleId] = useState(initialDraft?.styleId ?? 'stickman')
  const [tts, setTts] = useState<TtsProvider>(initialDraft?.tts ?? 'gemini')
  const [creating, setCreating] = useState(false)
  const [ideaBusy, setIdeaBusy] = useState(false)
  // "From a YouTube link": the video is read for its words, then distilled into a fresh idea.
  const [sourceInput, setSourceInput] = useState<SourceOptions>(initialDraft?.sourceInput ?? { ...DEFAULT_SOURCE_OPTIONS })
  const [link, setLink] = useState(initialDraft?.link ?? '')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkNote, setLinkNote] = useState<string | null>(initialDraft?.linkNote ?? null)
  const [linkError, setLinkError] = useState<string | null>(initialDraft?.linkError ?? null)
  const draft = useRef({ title, synopsis, language })
  draft.current = { title, synopsis, language }
  const draftToRemember = useRef<HomeDraft | null>(null)
  draftToRemember.current = { title, synopsis, brief, durationSec, language, aspectRatio, styleId, tts, entryMode, showSource, sourceInput, link, linkNote, linkError }
  useEffect(() => () => { if (rememberDraft.current) homeDraft = draftToRemember.current }, [])

  const refresh = (): void => {
    window.api.projects
      .list()
      .then(setProjects)
      .catch((e) => toast('error', errorText(e)))
  }

  useEffect(() => {
    refresh()
    void window.api.settings.keys().then(setKeys)
    void window.api.settings.supertonicStatus().then(setSupertonic)
    void window.api.settings.testF5Local().then(setF5Local).catch(() => setF5Local({ ok: false, message: 'F5 lokal belum tersambung' }))
    void window.api.settings.get().then((s) => {
      setAppSettings(s)
      if (!initialDraft) { setTts(s.defaultTtsProvider); setLanguage(s.defaultLanguage) }
    })
  }, [])

  // Start on a narrator service that is ready to use.
  useEffect(() => {
    if (appSettings && keys.length) setTts(usableTts(initialDraft?.tts ?? appSettings.defaultTtsProvider, keys, supertonic, appSettings, f5Local))
  }, [appSettings, keys, supertonic, f5Local])

  const ttsOptions = useMemo((): SelectOption<TtsProvider>[] => {
    const ready = ttsReadiness(keys, supertonic, appSettings, f5Local)
    return TTS_ORDER.map((p) => {
      const blocked = keys.length > 0 && !ready[p].ok
      return { value: p, label: TTS_NAMES[p], disabled: blocked, note: blocked ? `${ready[p].reason}. Atur di Pengaturan.` : undefined }
    })
  }, [keys, supertonic, appSettings, f5Local])

  const setupIssues = useMemo(() => {
    if (!appSettings || !keys.length) return []
    // A key counts once it is saved and did not fail its last check.
    const ok = (p: ApiProvider): boolean => {
      const k = keys.find((x) => x.provider === p)
      return !!k?.configured && k.lastOk !== false
    }
    const issues: { what: string; blocks: string }[] = []
    // A reviewed script and external image prompts require only the writer, not image or TTS accounts.
    const llm = appSettings.llmProvider
    if (!ok(llm)) issues.push({ what: `kunci ${llmName(llm)}`, blocks: 'cerita' })
    else if (!appSettings.llmModels[llm]) issues.push({ what: `model ${llmName(llm)}`, blocks: 'cerita' })
    return issues
  }, [keys, supertonic, appSettings, f5Local])

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!
    const q = query.trim().toLowerCase()
    return (projects ?? []).filter((p) => f.match(p.status) && (!q || p.title.toLowerCase().includes(q)))
  }, [projects, filter, query])

  // Asks the model for one fresh topic in a category and drops it straight into the idea box.
  const makeIdea = async (category: string): Promise<void> => {
    setIdeaBusy(true)
    try {
      const r = await window.api.story.idea(category, language)
      setSynopsis(r.synopsis)
      setTitle(r.title)
      setBrief(undefined)
      toast('success', `Ide baru: ${r.title}`)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setIdeaBusy(false)
    }
  }

  const start = async (): Promise<void> => {
    setCreating(true)
    try {
      const b = await window.api.projects.create({ title, storyBrief: brief, synopsis, durationSec, language, aspectRatio, styleId, ttsProvider: tts })
      rememberDraft.current = false; homeDraft = null
      go({ name: 'project', id: b.project.id })
    } catch (e) {
      toast('error', errorText(e))
      setCreating(false)
    }
  }

  /**
   * Reads a YouTube video and fills the idea box from it, so a podcast or a documentary can start a project
   * without writing a synopsis by hand. The source's words are only the raw material; what lands in the box
   * is a fresh synopsis the user then edits like any other idea.
   */
  const fromVideo = async (): Promise<void> => {
    const url = link.trim()
    if (!url || linkBusy) return
    setLinkBusy(true)
    setLinkNote(null)
    setLinkError(null)
    try {
      const idea = await window.api.story.fromVideo(url, language, sourceInput)
      if (draft.current.title !== title || draft.current.synopsis !== synopsis || draft.current.language !== language)
        throw new Error('Ide atau bahasa berubah saat podcast dipelajari. Hasil belum diterapkan agar edit kamu tetap aman.')
      setShowSource(false)
      setSynopsis(idea.synopsis)
      setTitle(idea.title)
      setBrief({ idea: idea.idea, fictional: idea.fictional ?? sourceInput.mode === 'fiction', sourceTitle: idea.videoTitle, sourceOptions: idea.sourceOptions ?? sourceInput, sourceNotes: idea.sourceNotes, reviewNotes: idea.reviewNotes, pacing: idea.pacing })
      const mins = Math.round(idea.durationSec / 60)
      const how = idea.transcriptSource === 'text' ? 'dibaca dari teks yang kamu tempel' : idea.transcriptSource === 'whisper' ? 'disalin dari suaranya' : 'dibaca dari caption YouTube'
      const parts = idea.chunks > 1 ? `, dianalisis dalam ${idea.chunks} bagian` : ''
      setLinkNote(
        `Materi ${how}: ${idea.transcriptChars.toLocaleString('id-ID')} karakter${mins ? ` dari video ${mins} menit` : ''}${parts}.` +
          (idea.partial ? ' Hanya bagian awalnya, karena videonya tidak punya caption.' : '') +
          ` Sumber: "${idea.videoTitle}" · ${idea.uploader}.`
      )
      toast('success', `Ide dari video: ${idea.title}`)
      setLink('')
    } catch (e) {
      setLinkError(errorText(e))
      toast('error', errorText(e))
    } finally {
      setLinkBusy(false)
    }
  }

  const remove = async (p: ProjectSummary): Promise<void> => {
    const ok = await confirmDialog({
      title: 'Hapus proyek?',
      body: `“${p.title}” beserta semua gambar, video, dan suaranya akan dihapus dari komputer ini. Tindakan ini tidak bisa dibatalkan.`,
      confirm: 'Hapus proyek',
      danger: true
    })
    if (!ok) return
    await window.api.projects.remove(p.id)
    refresh()
  }

  const duplicate = async (p: ProjectSummary): Promise<void> => {
    try {
      await window.api.projects.duplicate(p.id)
      refresh()
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <div className="grid h-full grid-cols-[200px_minmax(0,1fr)] grid-rows-[68px_minmax(0,1fr)]">
      <aside className="row-span-2 flex flex-col gap-7 border-r border-line bg-surface px-4 py-5">
        <Logo />
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => { setEntryMode('manual'); setTimeout(() => document.getElementById('ide')?.focus(), 0) }}>Cerita baru</Button>
        <nav aria-label="Pustaka proyek" className="flex flex-col gap-1">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted">Pustaka</p>
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={cx('flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-[13px]', filter === f.id ? 'bg-accent-soft font-semibold text-accent-dark' : 'text-ink-2 hover:bg-sand')}>
              {f.label}<span className="font-mono text-xs text-muted">{(projects ?? []).filter((p) => f.match(p.status)).length}</span>
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">Proyek tersimpan lokal.<br />Kamu mengendalikan hasil akhirnya.</p>
      </aside>
      <header className="flex h-[68px] shrink-0 items-center gap-6 border-b border-line bg-surface px-8">
        <label className="flex h-10 w-[360px] items-center gap-2 rounded-full border border-line bg-sand px-3.5 text-muted">
          <Search className="size-[18px]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari proyek"
            aria-label="Cari proyek"
            className="flex-1 bg-transparent text-sm text-ink outline-none"
          />
        </label>
        <div className="flex-1" />
        <Button icon={<SlidersHorizontal className="size-[18px]" />} onClick={() => go({ name: 'settings', back: { name: 'home' } })}>
          Pengaturan
          {setupIssues.length > 0 && <span className="size-2 rounded-full bg-accent" />}
        </Button>
      </header>

      <main className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-10 pb-12 pt-8">
          {setupIssues.length > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-sun bg-sun-soft px-4 py-3 text-sm text-sun-ink">
              <AlertTriangle className="size-[18px] shrink-0" />
              <span className="flex-1">
                Sebelum mulai, atur dulu {joinList(setupIssues.map((i) => i.what))} di Pengaturan. Tanpa itu,{' '}
                {joinList([...new Set(setupIssues.map((i) => i.blocks))])} belum bisa dibuat.
              </span>
              <Button size="sm" variant="secondary" onClick={() => go({ name: 'settings', back: { name: 'home' } })}>
                Atur sekarang
              </Button>
            </div>
          )}
          <div>
            <h1 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.025em]">Ruang produksi</h1>
            <p className="mt-3 text-[17px] text-ink-2">
              Masukkan bahan, tinjau ide, lalu susun naskah. Visual dan suara disiapkan setelahnya.
            </p>
          </div>
          <div aria-label="Cara memulai proyek" className="flex flex-wrap gap-2">
            <Button variant={entryMode === 'source' ? 'accent' : 'secondary'} aria-pressed={entryMode === 'source'} disabled={linkBusy} onClick={() => setEntryMode('source')}>Dari YouTube / transkrip</Button>
            <Button variant={entryMode === 'manual' ? 'accent' : 'secondary'} aria-pressed={entryMode === 'manual'} disabled={linkBusy} onClick={() => setEntryMode('manual')}>Tulis ide sendiri</Button>
          </div>
          {entryMode === 'source' && brief && <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-sm"><span>Materi sudah diolah. Tinjau ide dan durasi di bawah.</span><Button size="sm" onClick={() => setShowSource(!showSource)}>{showSource ? 'Tutup bahan sumber' : 'Ganti bahan sumber'}</Button></div>}
          {entryMode === 'source' && (!brief || showSource) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-dashed border-line-3 bg-sand/50 px-4 py-3">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <Clapperboard className="size-3.5" />
              1. Masukkan bahan kamu
            </span>
            <SourceEditor value={sourceInput} onChange={setSourceInput} disabled={linkBusy} />
            <div className="relative min-w-[260px] flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <textarea rows={2}
                value={link}
                disabled={linkBusy}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Tempel link YouTube atau teks transkrip podcast…"
                spellCheck={false}
                aria-label="Podcast atau transkrip"
                className={cx(inputCls, 'min-h-16 resize-y pl-9 text-sm')}
              />
            </div>
            <Button variant="accent" loading={linkBusy} disabled={!link.trim() || ideaBusy || creating} onClick={() => void fromVideo()}>
              Ambil ide
            </Button>
            <p className="w-full text-xs leading-relaxed text-muted">
              Link atau transkrip diolah sesuai pilihan faktual atau fiksi di atas. Tinjau judul, ide, serta sinopsis sebelum menekan Mulai. Setelah ide muncul, tinjau hasilnya di bawah lalu lanjutkan ke proyek.
            </p>
            {linkBusy && <p role="status" className="w-full text-xs leading-relaxed text-muted">Sedang membaca materi sumber dan meminta AI menyusun ide. Link YouTube perlu mengambil caption terlebih dulu; proses ini bisa beberapa menit.</p>}
            {linkError && <p role="alert" className="w-full rounded-xl bg-bad-soft px-3 py-2 text-sm leading-relaxed text-bad-ink"><strong>Ide belum berhasil diambil.</strong> {linkError} <button type="button" className="ml-2 font-semibold underline" onClick={() => go({ name: 'settings', back: { name: 'home' } })}>Periksa model / tes menulis</button></p>}
            {linkNote && <p className="w-full rounded-xl bg-accent-soft px-3 py-2 text-xs leading-relaxed text-accent-dark">{linkNote}</p>}
          </div>
          )}
          {(entryMode === 'manual' || brief) && (
          <div className="flex flex-col gap-3 rounded-xl border border-line-2 bg-surface p-5">
            <label htmlFor="ide" className="text-[13px] font-semibold text-ink-2">
              {brief ? '2. Tinjau ide hasil pengolahan' : 'Tulis ide atau sinopsis kamu'}
            </label>
            <input aria-label="Judul cerita" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul cerita" className="bg-transparent font-display text-xl font-semibold outline-none" />
            {brief && <label className="flex flex-col gap-1 rounded-lg bg-accent-soft p-3 text-sm text-accent-dark">{brief.fictional ? 'Ide fiksi' : 'Ide pembahasan'}<textarea aria-label="Ide pembahasan" rows={2} className="resize-y bg-transparent outline-none" value={brief.idea} onChange={(e) => setBrief({ ...brief, idea: e.target.value })} /></label>}
            <textarea
              id="ide"
              rows={3}
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="Contoh: Gajah Mada bersumpah tidak akan menikmati palapa sebelum Nusantara bersatu. Para menteri menertawakannya, tapi dia membuktikannya…"
              className="resize-none bg-transparent text-lg leading-relaxed outline-none placeholder:text-muted/70"
            />
            <SourceReview brief={brief} />
            <StoryPacing brief={brief} synopsis={synopsis} duration={durationSec} onDuration={setDurationSec} />
            <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3.5">
              <Select
                variant="pill"
                label="Durasi"
                value={durationSec}
                onChange={setDurationSec}
                options={(DURATIONS.some(d => d.sec === durationSec) ? DURATIONS : [...DURATIONS, { sec: durationSec, label: durationSec / 60 + ' menit' }].sort((a,b) => a.sec-b.sec)).map((d) => ({ value: d.sec, label: d.label }))}
              />
              <details className="w-full rounded-lg border border-line p-3" aria-label="Pengaturan awal proyek"><summary className="cursor-pointer text-sm">Format, gaya, bahasa, dan suara <span className="text-xs text-muted">· bisa diubah nanti</span></summary><div className="mt-3 flex flex-wrap gap-2">
              <Select
                variant="pill"
                label="Bahasa"
                value={language}
                onChange={setLanguage}
                options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                menuWidth={200}
              />
              <Select variant="pill" label="Format" value={aspectRatio} onChange={setAspectRatio} options={ASPECTS} menuWidth={200} />
              <StyleMenu value={styleId} onChange={setStyleId} />
              <Select variant="pill" label="Suara narator" value={tts} onChange={setTts} options={ttsOptions} menuWidth={280} />
              </div></details>
              <div className="flex-1" />
              <Button variant="primary" size="lg" loading={creating} disabled={linkBusy || ideaBusy || !synopsis.trim()} onClick={() => void start()}>
                Lanjut ke proyek
                <ArrowRight className="size-[18px]" />
              </Button>
            </div>
          </div>
          )}
          {entryMode === 'manual' && (
<details className="rounded-xl border border-line bg-surface p-4"><summary className="cursor-pointer text-sm font-medium">Belum punya ide? Pilih topik</summary><div className="mt-3">          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
            <span className="inline-flex items-center gap-1.5 font-medium text-ink">
              <Sparkles className="size-3.5" />
              Bikin ide:
            </span>
            {IDEA_TOPICS.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={ideaBusy || linkBusy || creating}
                title={t.note}
                onClick={() => void makeIdea(t.id)}
                className="h-9 rounded-full border border-dashed border-line-3 px-3.5 text-[13px] text-ink-2 hover:border-ink-2 hover:text-ink disabled:opacity-40"
              >
                {t.label}
              </button>
            ))}
            {ideaBusy && <span className="text-sun-ink">Menyusun ide…</span>}
          </div>

</div></details>
          )}

        </div>

        <section className="mx-auto flex max-w-[1280px] flex-col gap-[18px] px-10 pb-12 pt-4">
          <div className="flex items-center gap-4">
            <h2 className="font-display text-xl font-semibold tracking-tight">Proyek kamu</h2>
            <span className="text-xs text-muted">{visible.length} proyek</span>
          </div>

          <div className="grid grid-cols-3 gap-4 min-[1500px]:grid-cols-4">
            <button
              type="button"
              onClick={() => { setEntryMode('manual'); setTimeout(() => document.getElementById('ide')?.focus(), 0) }}
              className="flex min-h-[262px] flex-col items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-line-3 text-ink-2 hover:border-ink-2 hover:bg-surface"
            >
              <span className="flex size-[54px] items-center justify-center rounded-full border-[1.5px] border-ink bg-accent text-white shadow-ink">
                <Plus className="size-6" strokeWidth={2.2} />
              </span>
              <span className="text-base font-semibold text-ink">Proyek baru</span>
              <span className="text-[13px]">Mulai dari ide atau sinopsis</span>
            </button>

            {visible.map((p) => {
              const st = STATUS[p.status]
              return (
                <article key={p.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
                  <button type="button" onClick={() => go({ name: 'project', id: p.id })} className="text-left">
                    <div className="relative aspect-video w-full overflow-hidden border-b border-line">
                      {p.coverUrl ? (
                        <img src={p.coverUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <StyleSwatch styleId={p.styleId} className="size-full" iconSize={40} />
                      )}
                      <span className="absolute left-2.5 top-2.5 rounded-full border border-ink bg-surface px-2.5 py-[3px] text-xs font-semibold">
                        {getStyle(p.styleId).name}
                      </span>
                      {p.totalMs > 0 && (
                        <span className="absolute bottom-2.5 right-2.5 rounded-md bg-ink px-2 py-[3px] font-mono text-xs text-paper">
                          {mmss(p.totalMs)}
                        </span>
                      )}
                    </div>
                    <div className="line-clamp-2 min-h-[46px] px-4 pb-0.5 pt-3.5 text-base font-semibold leading-snug">{p.title}</div>
                  </button>
                  <div className="flex items-center gap-2 py-2 pl-4 pr-2">
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span className="truncate text-[13px] text-muted">{relativeTime(p.updatedAt)}</span>
                    <div className="flex-1" />
                    <Menu
                      trigger={(open) => (
                        <IconButton label="Opsi proyek" onClick={open} className="border-transparent" size={36}>
                          <MoreHorizontal className="size-[18px]" />
                        </IconButton>
                      )}
                      items={[
                        { label: 'Buka', icon: <FolderOpen className="size-4" />, run: () => go({ name: 'project', id: p.id }) },
                        { label: 'Duplikat', icon: <Copy className="size-4" />, run: () => void duplicate(p) },
                        { label: 'Hapus', icon: <Trash2 className="size-4" />, danger: true, run: () => void remove(p) }
                      ]}
                    />
                  </div>
                </article>
              )
            })}
          </div>
          {projects && projects.length === 0 && (
            <p className="text-sm text-muted">Belum ada proyek. Mulai dari YouTube/transkrip atau tulis ide sendiri di atas.</p>
          )}
        </section>
      </main>
    </div>
  )
}
