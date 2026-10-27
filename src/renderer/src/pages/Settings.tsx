import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  FolderOpen,
  Image as ImageIcon,
  Info,
  KeyRound,
  Mic,
  SlidersHorizontal,
  Trash2
} from 'lucide-react'
import { HF_IMAGE_MODELS, HF_VIDEO_MODELS } from '@shared/higgsfield'
import { CLOUDFLARE_IMAGE_MODELS, LANGUAGES, LLM_PROVIDERS, SUPER_PRESETS } from '@shared/models'
import type { ApiProvider, AppSettings, ImageProvider, KeyStatus, KeyTestResult, LlmProvider, TtsProvider } from '@shared/types'
import { Logo } from '../components/Logo'
import { ModelPicker } from '../components/ModelPicker'
import { ProviderLogo, type ProviderLogoId } from '../components/ProviderLogo'
import { Select } from '../components/Select'
import { AboutSection } from './AboutSection'
import { WhisperSection } from './WhisperSection'
import { applyDensity } from '../App'
import { Badge, Button, Field, IconButton, confirmDialog, cx, inputCls } from '../components/ui'
import { errorText, relativeTime } from '../lib/format'
import { useModels } from '../lib/useModels'
import { useApp } from '../store/app'

type Tab = 'services' | 'general' | 'about'

interface ProviderOption<T extends string> {
  id: T
  name: string
  note: string
  logo: ProviderLogoId
  status?: KeyStatus
  localStatus?: KeyTestResult | null
}

function StatusBadge({ status, localStatus }: { status?: KeyStatus; localStatus?: KeyTestResult | null }) {
  if (localStatus !== undefined) return <Badge tone={localStatus?.ok ? 'ok' : 'draft'}>{localStatus?.ok ? 'Siap' : localStatus ? 'Belum tersambung' : 'Belum dites'}</Badge>
  if (!status?.configured) return <Badge tone="draft">Belum diatur</Badge>
  if (status.lastOk === false) return <Badge tone="bad">Gagal terhubung</Badge>
  if (status.lastOk)
    return (
      <Badge tone="ok">
        <Check className="size-3" strokeWidth={3} />
        Terhubung
      </Badge>
    )
  return <Badge tone="info">Tersimpan</Badge>
}

/** One dropdown to choose which provider a section uses; only that provider's settings are shown below it. */
function ProviderSelect<T extends string>({ value, options, onChange }: { value: T; options: ProviderOption<T>[]; onChange: (id: T) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  const cur = options.find((o) => o.id === value) ?? options[0]
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cx(
          'flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-ink bg-surface px-4 py-3 text-left transition-shadow',
          open ? 'shadow-none' : 'shadow-ink hover:shadow-ink-md'
        )}
      >
        <ProviderLogo id={cur.logo} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-bold">{cur.name}</span>
          <span className="truncate text-[13px] text-ink-2">{cur.note}</span>
        </span>
        <StatusBadge status={cur.status} localStatus={cur.localStatus} />
        <ChevronDown className={cx('size-5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="listbox" className="absolute inset-x-0 top-full z-40 mt-1.5 flex flex-col gap-0.5 rounded-2xl border-[1.5px] border-ink bg-surface p-1.5 shadow-ink-lg">
          {options.map((o) => {
            const on = o.id === value
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  setOpen(false)
                  if (!on) onChange(o.id)
                }}
                className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left', on ? 'bg-accent-soft' : 'hover:bg-sand')}
              >
                <ProviderLogo id={o.logo} size={36} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-semibold">{o.name}</span>
                  <span className="truncate text-[13px] text-ink-2">{o.note}</span>
                </span>
                <StatusBadge status={o.status} localStatus={o.localStatus} />
                <span className="flex size-5 shrink-0 items-center justify-center">{on && <Check className="size-4 text-accent" strokeWidth={2.6} />}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** API key field(s) with save, test and delete. The custom endpoint also takes a base URL. */
function KeyForm({
  provider,
  name,
  status,
  label = 'API key',
  placeholder = 'Tempel API key',
  hint,
  help,
  link,
  linkLabel,
  customUrl,
  onChanged,
  onSaved
}: {
  provider: ApiProvider
  name: string
  status?: KeyStatus
  label?: string
  placeholder?: string
  hint?: ReactNode
  help: string
  link: string | null
  linkLabel: string
  customUrl?: string
  onChanged: () => void
  onSaved?: (r: KeyTestResult) => void
}) {
  const { toast } = useApp()
  const configured = !!status?.configured
  const isCustom = provider === 'custom'
  const preview = status?.preview ?? null
  const [editing, setEditing] = useState(!preview)
  const [key, setKey] = useState('')
  const [url, setUrl] = useState(customUrl ?? '')
  const [revealed, setRevealed] = useState<string | null>(null)
  const [showTyped, setShowTyped] = useState(false)
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)

  // A newly saved or removed key puts the field back in its resting state.
  useEffect(() => {
    setEditing(!preview)
    setKey('')
    setRevealed(null)
  }, [preview])

  // The stored key is shown masked; the custom endpoint keeps an editable (optional) key field.
  const showStored = !isCustom && !editing && !!preview
  const urlChanged = isCustom && url.trim() !== (customUrl ?? '').trim()
  const canSave = isCustom ? !!url.trim() && (urlChanged || !!key.trim() || !configured) : !showStored && !!key.trim()
  // A pasted key only counts once it is saved; Enter saves it too.
  const unsaved = !isCustom && !showStored && !!key.trim() && busy !== 'save'
  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter' || !canSave || busy) return
    e.preventDefault()
    void save()
  }

  const save = async (): Promise<void> => {
    setBusy('save')
    try {
      const r = isCustom ? await window.api.settings.setCustom(url, key) : await window.api.settings.setKey(provider, key)
      toast(r.ok ? 'success' : 'error', `${name}: ${r.message}`)
      setKey('')
      setEditing(false)
      onChanged()
      onSaved?.(r)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const toggleEye = async (): Promise<void> => {
    if (!showStored) {
      setShowTyped(!showTyped)
      return
    }
    setRevealed(revealed ? null : await window.api.settings.revealKey(provider))
  }
  const visible = showStored ? !!revealed : showTyped

  const test = async (): Promise<void> => {
    setBusy('test')
    try {
      const r = await window.api.settings.testKey(provider)
      toast(r.ok ? 'success' : 'error', `${name}: ${r.message}`)
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const clear = async (): Promise<void> => {
    const ok = await confirmDialog({
      title: `Hapus ${isCustom ? 'endpoint' : 'kunci'} ${name}?`,
      body: 'Data ini akan dihapus dari komputer ini. Kamu bisa menambahkannya lagi kapan saja.',
      confirm: 'Hapus',
      danger: true
    })
    if (!ok) return
    await window.api.settings.clearKey(provider)
    setUrl('')
    onChanged()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        {isCustom && (
          <Field label="Alamat endpoint (base URL)" className="flex-[1.3]">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={onEnter}
              placeholder="http://localhost:11434/v1"
              spellCheck={false}
              className={cx(inputCls, 'h-11 font-mono text-sm')}
            />
          </Field>
        )}
        <Field label={isCustom ? 'API key (opsional)' : label} className="flex-1">
          <div className="relative">
            {showStored ? (
              <input
                readOnly
                value={revealed ?? preview ?? ''}
                aria-label={`${label} tersimpan`}
                className={cx(inputCls, 'h-11 cursor-default bg-paper pr-11 font-mono text-sm')}
              />
            ) : (
              <input
                type={showTyped ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                autoFocus={!isCustom && !!preview}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={onEnter}
                placeholder={
                  isCustom ? (preview ? `Tersimpan (${preview}) · isi untuk mengganti` : 'Kosongkan untuk server lokal') : placeholder
                }
                className={cx(inputCls, 'h-11 pr-11')}
              />
            )}
            {(showStored || key.length > 0) && (
              <button
                type="button"
                aria-label={visible ? 'Sembunyikan kunci' : 'Tampilkan kunci'}
                title={visible ? 'Sembunyikan kunci' : 'Tampilkan kunci'}
                onClick={() => void toggleEye()}
                className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-sand hover:text-ink"
              >
                {visible ? <EyeOff className="size-[17px]" /> : <Eye className="size-[17px]" />}
              </button>
            )}
          </div>
        </Field>
        {showStored ? (
          <Button
            className="h-11"
            onClick={() => {
              setEditing(true)
              setRevealed(null)
            }}
          >
            Ganti
          </Button>
        ) : (
          <Button variant="accent" className="h-11" disabled={!canSave} loading={busy === 'save'} onClick={() => void save()}>
            Simpan dan tes
          </Button>
        )}
        {!isCustom && editing && !!preview && (
          <Button
            variant="ghost"
            className="h-11"
            onClick={() => {
              setEditing(false)
              setKey('')
            }}
          >
            Batal
          </Button>
        )}
        {configured && (
          <>
            <Button className="h-11" loading={busy === 'test'} onClick={() => void test()}>
              Tes
            </Button>
            <IconButton label={`Hapus ${name}`} size={44} className="text-bad-ink" onClick={() => void clear()}>
              <Trash2 className="size-[18px]" />
            </IconButton>
          </>
        )}
      </div>
      {unsaved && <p className="-mt-1 text-[13px] font-semibold text-accent-dark">Kunci belum tersimpan. Tekan Enter atau klik Simpan dan tes.</p>}
      {hint && <p className="-mt-1 text-[13px] text-ink-2">{hint}</p>}
      <div className="flex items-center gap-2 text-[13px] text-ink-2">
        <span className={cx('flex-1', configured && status?.lastOk === false && 'text-bad-ink')}>
          {configured && status?.lastMessage
            ? `${status.lastMessage}${status.checkedAt && !status.unreadable ? ` · dicek ${relativeTime(status.checkedAt)}` : ''}`
            : help}
        </span>
        {link && (
          <button
            type="button"
            onClick={() => void window.api.app.openExternal(link)}
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent-dark hover:underline"
          >
            {linkLabel}
            <ExternalLink className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-5 py-[18px]">{children}</section>
}

function SectionTitle({ icon, title, sub }: { icon: ReactNode; title: string; sub: ReactNode }) {
  return (
    <div className="mt-5 flex items-start gap-3">
      <span className="mt-1 text-ink">{icon}</span>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px] font-bold leading-tight">{title}</h2>
        <p className="text-sm text-ink-2">{sub}</p>
      </div>
    </div>
  )
}

function LlmSection({ settings, statusOf, onChanged, onSettings }: { settings: AppSettings; statusOf: (p: ApiProvider) => KeyStatus | undefined; onChanged: () => void; onSettings: (s: AppSettings) => void }) {
  const { toast } = useApp()
  const provider = settings.llmProvider
  const spec = LLM_PROVIDERS.find((p) => p.id === provider)!
  const status = statusOf(provider)
  const configured = !!status?.configured
  const [openPicker, setOpenPicker] = useState(false)
  const models = useModels(provider, configured && status?.lastOk !== false, provider === 'custom' ? settings.customBaseUrl : '')
  const model = settings.llmModels[provider]
  const selected = models.models.find((m) => m.id === model)
  const [writerBusy, setWriterBusy] = useState(false)
  const [writerResult, setWriterResult] = useState<(KeyTestResult & { identity: string }) | null>(null)
  const identity = `${provider}:${model}:${settings.customBaseUrl}`
  const activeWriter = useRef(identity)
  activeWriter.current = identity
  const checkWriter = async (): Promise<void> => {
    if (writerBusy) return
    setWriterBusy(true)
    setWriterResult(null)
    try {
      const result = await window.api.settings.testWriter()
      if (activeWriter.current === identity) setWriterResult({ ...result, identity })
    } catch (error) {
      if (activeWriter.current === identity) setWriterResult({ ok: false, message: errorText(error), identity })
    } finally {
      setWriterBusy(false)
    }
  }

  const options: ProviderOption<LlmProvider>[] = LLM_PROVIDERS.map((p) => ({
    id: p.id,
    name: p.name,
    note: p.note,
    logo: p.id,
    status: statusOf(p.id)
  }))

  return (
    <>
      <SectionTitle
        icon={<Cpu className="size-5" />}
        title="Penyusun cerita (AI LLM)"
        sub="Pilih satu penyedia untuk menyusun klip, naskah, dan pemeran. Hanya penyedia yang dipilih yang dipakai."
      />
      <ProviderSelect
        value={provider}
        options={options}
        onChange={async (id) => {
          setOpenPicker(false)
          onSettings(await window.api.settings.set({ llmProvider: id }))
        }}
      />
      <Card key={provider}>
        <KeyForm
          provider={provider}
          name={spec.name}
          status={status}
          help={provider === 'custom' ? 'Contoh: http://localhost:11434/v1 untuk Ollama, http://localhost:1234/v1 untuk LM Studio, https://api.x.ai/v1 untuk Grok.' : 'Setelah kunci disimpan, daftar model diambil langsung dari penyedianya.'}
          hint={provider === 'gemini' && settings.defaultTtsProvider === 'gemini' ? 'Kunci ini dipakai bersama untuk suara narator Gemini TTS.' : undefined}
          link={spec.link}
          linkLabel={spec.linkLabel}
          customUrl={settings.customBaseUrl}
          onChanged={onChanged}
          onSaved={async (r) => {
            if (!r.ok) return
            onSettings(await window.api.settings.get())
            if (configured) void models.refresh()
            if (!model) setOpenPicker(true)
          }}
        />
        {configured && status?.lastOk !== false && (
          <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-4">
            <span className="text-sm font-semibold">Model untuk menyusun cerita</span>
            <ModelPicker
              value={model}
              models={models.models}
              loading={models.loading}
              error={models.error}
              fetchedAt={models.fetchedAt}
              onChange={async (id) => {
                setOpenPicker(false)
                onSettings(await window.api.settings.set({ llmModels: { ...settings.llmModels, [provider]: id } }))
                toast('success', `Cerita akan disusun oleh ${spec.name} · ${id}`)
              }}
              onRefresh={() => void models.refresh()}
              allowCustom={provider === 'custom'}
              defaultOpen={openPicker}
              placeholder="Pilih model dari daftar"
            />
            {selected?.description && <p className="line-clamp-2 text-[13px] text-muted">{selected.description}</p>}
            <p className="text-xs leading-relaxed text-muted">Status Terhubung memeriksa akses layanan, bukan keberhasilan model menulis naskah. Tes menulis mengirim teks contoh pendek, tanpa isi proyek kamu.</p>
            <Button className="self-start" loading={writerBusy} disabled={!model} onClick={() => void checkWriter()}>Tes menulis</Button>
            {writerResult?.identity === identity && <p role={writerResult.ok ? 'status' : 'alert'} className={cx('rounded-lg p-3 text-sm leading-relaxed', writerResult.ok ? 'bg-accent-soft text-accent-dark' : 'bg-bad-soft text-bad-ink')}>{writerResult.message}</p>}
            {selected && provider === 'openrouter' && !selected.tags.includes('JSON') && (
              <p className="text-[13px] text-sun-ink">
                Model ini tidak mendukung output JSON terstruktur. Aplikasi tetap mencoba, tapi model berlabel JSON biasanya lebih stabil.
              </p>
            )}
          </div>
        )}
      </Card>
    </>
  )
}

function TtsSection({ settings, statusOf, onChanged, onSettings }: { settings: AppSettings; statusOf: (p: ApiProvider) => KeyStatus | undefined; onChanged: () => void; onSettings: (s: AppSettings) => void }) {
  const [localStatus, setLocalStatus] = useState<KeyTestResult | null>(null)
  const provider = settings.defaultTtsProvider
  const status = provider === 'supertonic' || provider === 'f5-hf' || provider === 'f5-local' ? undefined : statusOf(provider)
  const ready = !!status?.configured && status.lastOk !== false
  const models = useModels(provider === 'gemini' ? 'gemini-tts' : 'elevenlabs', ready)
  const options: ProviderOption<TtsProvider>[] = [
    { id: 'f5-local', name: 'F5-TTS lokal · Indonesia', note: 'Pakai suara yang sudah tersimpan di studio F5 di komputermu.', logo: 'supertonic', localStatus },
    { id: 'f5-hf', name: 'F5-TTS · Hugging Face', note: 'Narasi mengikuti sampel suara melalui Space F5 pilihanmu.', logo: 'huggingface', status: { provider: 'huggingface', configured: !!settings.f5Reference && !!settings.f5RefText.trim(), lastOk: null, lastMessage: null, checkedAt: null, preview: null, unreadable: false } },
    {
      id: 'gemini',
      name: 'Gemini TTS',
      note: 'Suara Google Gemini, 30 pilihan suara, mendukung bahasa Indonesia.',
      logo: 'gemini',
      status: statusOf('gemini')
    },
    {
      id: 'elevenlabs',
      name: 'ElevenLabs',
      note: 'Suara sangat natural dengan waktu kata yang presisi untuk caption karaoke.',
      logo: 'elevenlabs',
      status: statusOf('elevenlabs')
    },
    {
      id: 'supertonic',
      name: 'Supertonic (lokal)',
      note: 'TTS offline dari komputermu sendiri: tanpa kunci API dan tanpa kuota.',
      logo: 'supertonic'
    }
  ]
  const value = provider === 'gemini' ? settings.geminiTtsModel : settings.elevenModel
  return (
    <>
      <SectionTitle
        icon={<Mic className="size-5" />}
        title="Suara narator (TTS)"
        sub="Penyedia suara bawaan untuk proyek baru. Setiap proyek tetap bisa memilih sendiri di langkah Ide cerita."
      />
      <ProviderSelect value={provider} options={options} onChange={async (id) => onSettings(await window.api.settings.set({ defaultTtsProvider: id }))} />
      {provider === 'f5-local' ? <F5LocalCard settings={settings} onSettings={onSettings} onStatus={setLocalStatus} /> : provider === 'f5-hf' ? <F5Card key="f5-hf" settings={settings} onSettings={onSettings} /> : provider === 'supertonic' ? (
        <SupertonicCard settings={settings} onSettings={onSettings} />
      ) : (
        <Card key={provider}>
          <KeyForm
            provider={provider}
            name={provider === 'gemini' ? 'Google Gemini' : 'ElevenLabs'}
            status={status}
            help={provider === 'gemini' ? 'Kunci Gemini dari Google AI Studio.' : 'Kunci API dari akun ElevenLabs.'}
            hint={provider === 'gemini' && settings.llmProvider === 'gemini' ? 'Kunci ini dipakai bersama dengan penyusun cerita Gemini.' : undefined}
            link={provider === 'gemini' ? 'https://aistudio.google.com/apikey' : 'https://elevenlabs.io/app/settings/api-keys'}
            linkLabel={provider === 'gemini' ? 'Buat kunci di Google AI Studio' : 'Buat kunci di ElevenLabs'}
            onChanged={onChanged}
            onSaved={(r) => r.ok && void models.refresh()}
          />
          {ready && (
            <div className="flex flex-col gap-1.5 border-t border-dashed border-line pt-4">
              <span className="text-sm font-semibold">Model suara</span>
              <ModelPicker
                value={value}
                models={models.models}
                loading={models.loading}
                error={models.error}
                fetchedAt={models.fetchedAt}
                onChange={async (id) => onSettings(await window.api.settings.set(provider === 'gemini' ? { geminiTtsModel: id } : { elevenModel: id }))}
                onRefresh={() => void models.refresh()}
              />
            </div>
          )}
        </Card>
      )}
    </>
  )
}

/** Keep local voice references in the user's existing studio rather than importing them again. */
function F5LocalCard({ settings, onSettings, onStatus }: { settings: AppSettings; onSettings: (s: AppSettings) => void; onStatus: (result: KeyTestResult | null) => void }) {
  const [url, setUrl] = useState(settings.f5LocalUrl)
  const [result, setResult] = useState<KeyTestResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [voices, setVoices] = useState<string[]>([])
  useEffect(() => {
    let active = true
    void window.api.settings.testF5Local(settings.f5LocalUrl).then((value) => { if (active) onStatus(value) })
    return () => { active = false }
  }, [settings.f5LocalUrl])
  const check = async () => {
    setBusy(true); setResult(null); setVoices([])
    try {
      const tested = await window.api.settings.testF5Local(url)
      setResult(tested); onStatus(tested)
      if (tested.ok) {
        onSettings(await window.api.settings.set({ f5LocalUrl: url.trim() }))
        setVoices((await window.api.settings.voices('f5-local')).map((voice) => voice.name))
      }
    } catch (error) { const failed = { ok: false, message: errorText(error) }; setResult(failed); onStatus(failed) }
    finally { setBusy(false) }
  }
  return <Card>
    <h3 className="font-semibold">Sambungan F5 Indonesia lokal</h3>
    <p className="text-sm leading-relaxed text-ink-2">Jalankan launch.bat di folder F5-TTS-Project dulu dan biarkan studio tetap terbuka. Kisara memakai model serta suara yang sudah tersimpan di sana; tidak perlu upload sampel lagi.</p>
    <label className="flex flex-col gap-2 text-sm font-semibold">Alamat studio lokal
      <input aria-label="Alamat F5 lokal" className={`${inputCls} h-11 font-mono text-sm`} value={url} disabled={busy} onChange={(event) => { setUrl(event.target.value); setResult(null); setVoices([]) }} />
    </label>
    <Button className="self-start" loading={busy} onClick={() => void check()}>Simpan dan tes F5 lokal</Button>
    {result && <p role={result.ok ? 'status' : 'alert'} className={cx('rounded-lg p-3 text-sm', result.ok ? 'bg-accent-soft text-accent-dark' : 'bg-bad-soft text-bad-ink')}>{result.message}</p>}
    {!!voices.length && <p className="text-sm">Suara tersedia: {voices.join(', ')}. Pilih suara di langkah Ide cerita pada proyek.</p>}
    <p className="text-xs leading-relaxed text-muted">Tanpa kunci API dan tanpa server publik. CPU bisa memerlukan beberapa menit per bagian. Tempo dapat diatur di Naskah. Pembatalan di Kisara menghentikan penantian; tugas yang sudah dikirim bisa tetap berjalan di studio lokal.</p>
  </Card>
}

function F5Card({ settings, onSettings }: { settings: AppSettings; onSettings: (s: AppSettings) => void }) {
  const [space, setSpace] = useState(settings.f5Space)
  const [endpoint, setEndpoint] = useState(settings.f5Endpoint)
  const [text, setText] = useState(settings.f5RefText)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<KeyTestResult | null>(null)
  const dirty = space.trim() !== settings.f5Space || endpoint.trim() !== settings.f5Endpoint || text.trim() !== settings.f5RefText || !!token.trim()
  const act = async (kind: 'save' | 'pick' | 'test'): Promise<void> => {
    setBusy(true); setResult(null)
    try {
      if (kind === 'test') setResult(await window.api.settings.testF5())
      else {
        const saved = kind === 'pick' ? await window.api.settings.pickF5Reference() : await window.api.settings.setF5({ space, endpoint, refText: text, token })
        if (saved) { onSettings(saved); if (kind === 'save') setToken(''); setResult({ ok: true, message: kind === 'pick' ? 'Sampel disalin ke Kisara. Belum dikirim ke Hugging Face.' : 'Pengaturan F5 tersimpan. Pilih F5 dan referensi terbaru di langkah Ide cerita.' }) }
      }
    } catch (error) { setResult({ ok: false, message: errorText(error) }) }
    finally { setBusy(false) }
  }
  return <Card>
    <h3 className="text-base font-semibold">F5-TTS melalui Hugging Face</h3>
    <p className="text-sm leading-relaxed text-ink-2">Gunakan suaramu atau referensi yang boleh kamu gunakan. Pilih rekaman bersih 3–15 detik tanpa musik, lalu tulis ucapan persisnya. Sampel dan narasi dikirim ke pengelola Space yang kamu pilih saat membuat suara.</p>
    <p className="rounded-lg bg-sand p-3 text-xs leading-relaxed text-muted">Space bawaan fdrm/masbro-voice memakai F5 Indo V2, berjalan di CPU dan bisa lambat. Checkpoint tersebut berlisensi CC BY-NC (nonkomersial). Untuk konten monetisasi, gunakan checkpoint atau izin yang sesuai.</p>
    <button type="button" className="self-start text-xs text-accent-dark hover:underline" onClick={() => void window.api.app.openExternal('https://huggingface.co/Eempostor/F5-TTS-INDO-FINETUNE-V2')}>Lihat model dan lisensinya</button>
    <Field label="Space F5 (pengguna/nama-space)"><input aria-label="Space F5" className={cx(inputCls, 'h-11')} value={space} disabled={busy} onChange={(e) => { setSpace(e.target.value); setResult(null) }} /></Field>
    <Field label="Endpoint API"><input aria-label="Endpoint F5" className={cx(inputCls, 'h-11')} value={endpoint} disabled={busy} onChange={(e) => { setEndpoint(e.target.value); setResult(null) }} /></Field>
    <Field label="Token Hugging Face (opsional, berbagi dengan gambar)"><input aria-label="Token F5 Hugging Face" type="password" autoComplete="off" className={cx(inputCls, 'h-11')} placeholder="Kosongkan untuk memakai token yang sudah tersimpan" value={token} disabled={busy} onChange={(e) => setToken(e.target.value)} /></Field>
    <div className="flex flex-wrap items-center gap-3"><Button disabled={busy} onClick={() => void act('pick')}>Pilih sampel suara</Button><span className="min-w-0 break-all text-sm text-muted">{settings.f5ReferenceName || 'Belum ada sampel'}</span></div>
    <Field label="Teks persis dari sampel"><textarea aria-label="Transkrip sampel F5" rows={3} maxLength={3000} className={inputCls} value={text} disabled={busy} onChange={(e) => { setText(e.target.value); setResult(null) }} placeholder="Tulis semua kata yang terdengar di sampel suara…" /></Field>
    <div className="flex flex-wrap gap-2"><Button variant="primary" loading={busy} disabled={!space.trim() || !endpoint.trim()} onClick={() => void act('save')}>Simpan F5</Button><Button disabled={busy || dirty} onClick={() => void act('test')}>Tes Space F5</Button></div>
    <p className="text-xs leading-relaxed text-muted">Tes Space hanya memeriksa API, tanpa mengirim rekaman. Setelah lengkap, pilih F5-TTS di proyek lalu Buat suara narasi. Kamu bisa membatalkan antreannya. Gaya baca mengikuti sampel; preset emosi Gemini tidak berlaku untuk F5.</p>
    {result && <p role={result.ok ? 'status' : 'alert'} className={cx('rounded-lg p-3 text-sm', result.ok ? 'bg-accent-soft text-accent-dark' : 'bg-bad-soft text-bad-ink')}>{result.message}</p>}
  </Card>
}

function SupertonicCard({ settings, onSettings }: { settings: AppSettings; onSettings: (s: AppSettings) => void }) {
  const [status, setStatus] = useState<KeyTestResult | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void window.api.settings.supertonicStatus().then(setStatus)
  }, [settings.supertonicDir])

  const pick = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await window.api.settings.pickSupertonicDir()
      if (next) onSettings(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <ProviderLogo id="supertonic" />
        <div className="flex flex-1 flex-col">
          <span className="text-base font-bold">Supertonic (lokal)</span>
          <span className="text-[13px] text-ink-2">Narasi offline dari folder Nightmare TTS Studio di komputermu.</span>
        </div>
        <Badge tone={status?.ok ? 'ok' : 'draft'}>{status?.ok ? 'Siap' : 'Belum siap'}</Badge>
      </div>
      <div className="flex flex-col gap-4 border-t border-dashed border-line pt-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Folder Supertonic</span>
          <div className="flex items-center gap-2">
            <span className={cx(inputCls, 'flex h-11 min-w-0 flex-1 items-center truncate bg-paper font-mono text-[13px] text-ink-2')}>
              {settings.supertonicDir || 'Belum dipilih'}
            </span>
            <Button variant="ghost" className="h-11 shrink-0" loading={busy} onClick={() => void pick()}>
              Pilih folder
            </Button>
          </div>
          <span className={cx('text-[13px]', status?.ok ? 'text-ok-ink' : 'text-bad-ink')}>{status?.message ?? 'Memeriksa…'}</span>
          <span className="text-[13px] text-muted">
            Folder ini harus berisi skrip penghubung TTS dan subfolder <span className="font-mono">.venv</span>. Skrip instalasi lama tetap didukung.
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Gaya penyampaian</span>
          <Select
            label="Gaya penyampaian Supertonic"
            value={settings.supertonicPreset}
            onChange={(v) => void window.api.settings.set({ supertonicPreset: v }).then(onSettings)}
            options={SUPER_PRESETS.map((p) => ({ value: p.id, label: p.name, hint: p.note }))}
          />
        </div>
      </div>
    </Card>
  )
}

function ImagesSection({ settings, statusOf, onChanged, onSettings }: { settings: AppSettings; statusOf: (p: ApiProvider) => KeyStatus | undefined; onChanged: () => void; onSettings: (s: AppSettings) => void }) {
  const provider = settings.imageProvider
  const options: ProviderOption<ImageProvider>[] = [
    {
      id: 'higgsfield',
      name: 'Higgsfield',
      note: 'Model gambar dan video paling lengkap, memakai kredit akunmu.',
      logo: 'higgsfield',
      status: statusOf('higgsfield')
    },
    {
      id: 'cloudflare',
      name: 'Cloudflare Workers AI',
      note: 'Gratis 10.000 neurons/hari (± 170 gambar), tanpa kartu kredit. Hanya gambar, tanpa video.',
      logo: 'cloudflare',
      status: statusOf('cloudflare')
    },
    {
      id: 'huggingface',
      name: 'Hugging Face Space',
      note: 'Space milikmu sendiri di ZeroGPU: FLUX penuh, gratis. Perlu bikin Space dulu.',
      logo: 'huggingface',
      status: statusOf('huggingface')
    }
  ]
  return (
    <>
      <SectionTitle
        icon={<ImageIcon className="size-5" />}
        title="Gambar dan video"
        sub="Pilih layanan yang menggambar klip. Video AI selalu lewat Higgsfield, atau impor video buatan sendiri dari langkah Storyboard."
      />
      <ProviderSelect value={provider} options={options} onChange={async (id) => onSettings(await window.api.settings.set({ imageProvider: id }))} />
      {provider === 'cloudflare' ? (
        <CloudflareCard settings={settings} status={statusOf('cloudflare')} onChanged={onChanged} onSettings={onSettings} />
      ) : provider === 'huggingface' ? (
        <HuggingFaceCard settings={settings} status={statusOf('huggingface')} onChanged={onChanged} />
      ) : (
        <Card>
          <div className="flex items-center gap-3">
            <ProviderLogo id="higgsfield" />
            <div className="flex flex-1 flex-col">
              <span className="text-base font-bold">Higgsfield</span>
              <span className="text-[13px] text-ink-2">GPT Image 2.5, Kling, Seedance, dan model lain dari akun Higgsfield kamu</span>
            </div>
            <StatusBadge status={statusOf('higgsfield')} />
          </div>
          <KeyForm
            provider="higgsfield"
            name="Higgsfield"
            status={statusOf('higgsfield')}
            placeholder="Tempel hasil tombol Copy API key"
            hint={
              <>
                Di console Higgsfield, buka API Keys lalu klik <strong className="text-ink">Copy API key</strong> dan tempel di sini. Formatnya{' '}
                <code className="rounded bg-sand px-1 font-mono text-xs">KEY_ID:KEY_SECRET</code>. Kalau kamu memegang Key ID dan Secret terpisah, gabungkan
                dengan titik dua.
              </>
            }
            help="Kunci dicek dengan permintaan estimasi biaya, tanpa memakai kredit."
            link="https://higgsfield.ai"
            linkLabel="Buka console Higgsfield"
            onChanged={onChanged}
          />
          <p className="flex items-start gap-2.5 border-t border-dashed border-line pt-4 text-[13px] leading-relaxed text-ink-2">
            <Film className="mt-0.5 size-4 shrink-0" />
            <span>
              Semua {HF_IMAGE_MODELS.length} model gambar dan {HF_VIDEO_MODELS.length} model video Higgsfield bisa dipakai. Modelnya dipilih per proyek
              di langkah <strong className="text-ink">Ide cerita</strong>, bagian Model AI.
            </span>
          </p>
        </Card>
      )}
    </>
  )
}

/** Cloudflare needs an account id beside its token, so it gets its own form instead of the shared KeyForm. */
function CloudflareCard({ settings, status, onChanged, onSettings }: { settings: AppSettings; status?: KeyStatus; onChanged: () => void; onSettings: (s: AppSettings) => void }) {
  const { toast } = useApp()
  const [account, setAccount] = useState(settings.cloudflareAccountId)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)
  const [result, setResult] = useState<KeyTestResult | null>(null)
  const configured = !!status?.configured

  useEffect(() => {
    setAccount(settings.cloudflareAccountId)
  }, [settings.cloudflareAccountId])

  const run = async (mode: 'save' | 'test'): Promise<void> => {
    setBusy(mode)
    try {
      const r = mode === 'save' ? await window.api.settings.setCloudflare(account, key) : await window.api.settings.testKey('cloudflare')
      setResult(r)
      if (mode === 'save') setKey('')
      onChanged()
      toast(r.ok ? 'success' : 'error', r.message)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <ProviderLogo id="cloudflare" />
        <div className="flex flex-1 flex-col">
          <span className="text-base font-bold">Cloudflare Workers AI</span>
          <span className="text-[13px] text-ink-2">Gratis 10.000 neurons/hari (± 170 gambar) tanpa kartu kredit</span>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="flex flex-col gap-4 border-t border-dashed border-line pt-4">
        <Field label="Account ID Cloudflare">
          <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Tempel Account ID" className={cx(inputCls, 'h-11 font-mono text-sm')} />
        </Field>
        <Field label="API token">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={configured ? 'Tersimpan · isi untuk mengganti' : 'Tempel API token'}
            className={cx(inputCls, 'h-11 font-mono text-sm')}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="accent" className="h-11" loading={busy === 'save'} disabled={!account.trim() || (!configured && !key.trim())} onClick={() => void run('save')}>
            Simpan dan tes
          </Button>
          <Button variant="ghost" className="h-11" loading={busy === 'test'} disabled={!configured} onClick={() => void run('test')}>
            Tes
          </Button>
          {result && <span className={cx('text-[13px]', result.ok ? 'text-ok-ink' : 'text-bad-ink')}>{result.message}</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Model gambar</span>
          <Select
            label="Model gambar Cloudflare"
            value={settings.cloudflareModel}
            onChange={(v) => void window.api.settings.set({ cloudflareModel: v }).then(onSettings)}
            options={CLOUDFLARE_IMAGE_MODELS.map((m) => ({ value: m.id, label: m.name, hint: m.note }))}
          />
        </div>
        <span className="text-[13px] leading-relaxed text-muted">
          Buat token di Cloudflare dashboard → <strong className="text-ink-2">My Profile → API Tokens</strong> dengan izin <span className="font-mono">Workers AI</span>. Account ID ada di
          halaman <strong className="text-ink-2">Workers &amp; Pages</strong>. Kuota gratis direset tiap 00:00 UTC.
        </span>
      </div>
    </Card>
  )
}

/** A Space is named rather than keyed, so it gets its own small form like Cloudflare. */
function HuggingFaceCard({ settings, status, onChanged }: { settings: AppSettings; status?: KeyStatus; onChanged: () => void }) {
  const { toast } = useApp()
  const [space, setSpace] = useState(settings.hfSpace)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState<'save' | 'test' | null>(null)
  const [result, setResult] = useState<KeyTestResult | null>(null)
  const saved = !!settings.hfSpace.trim()

  useEffect(() => {
    setSpace(settings.hfSpace)
  }, [settings.hfSpace])

  const run = async (mode: 'save' | 'test'): Promise<void> => {
    setBusy(mode)
    try {
      const r = mode === 'save' ? await window.api.settings.setHuggingFace(space, key) : await window.api.settings.testKey('huggingface')
      setResult(r)
      if (mode === 'save') setKey('')
      onChanged()
      toast(r.ok ? 'success' : 'error', r.message)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <ProviderLogo id="huggingface" />
        <div className="flex flex-1 flex-col">
          <span className="text-base font-bold">Hugging Face Space</span>
          <span className="text-[13px] text-ink-2">Space milikmu sendiri di ZeroGPU: FLUX.1 penuh, gratis tanpa kredit</span>
        </div>
        <Badge tone={result?.ok ? 'ok' : saved ? 'info' : 'draft'}>{result?.ok ? 'Terhubung' : saved ? 'Tersimpan' : 'Belum diatur'}</Badge>
      </div>
      <div className="flex flex-col gap-4 border-t border-dashed border-line pt-4">
        <Field label="Nama Space">
          <input value={space} onChange={(e) => setSpace(e.target.value)} placeholder="pengguna/kisara-image" className={cx(inputCls, 'h-11 font-mono text-sm')} />
        </Field>
        <Field label="Token Hugging Face (opsional)" hint="Hanya perlu kalau Space-nya private.">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={status?.configured ? 'Tersimpan · isi untuk mengganti' : 'Tempel token'}
            className={cx(inputCls, 'h-11 font-mono text-sm')}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="accent" className="h-11" loading={busy === 'save'} disabled={!space.trim()} onClick={() => void run('save')}>
            Simpan dan tes
          </Button>
          <Button variant="ghost" className="h-11" loading={busy === 'test'} disabled={!saved} onClick={() => void run('test')}>
            Tes
          </Button>
          {result && <span className={cx('text-[13px]', result.ok ? 'text-ok-ink' : 'text-bad-ink')}>{result.message}</span>}
        </div>
        <span className="text-[13px] leading-relaxed text-muted">
          Bikin Space baru di <strong className="text-ink-2">huggingface.co/new-space</strong> dengan SDK <span className="font-mono">Gradio</span>, set hardware-nya ke{' '}
          <strong className="text-ink-2">ZeroGPU</strong>, lalu unggah tiga file dari folder <span className="font-mono">tools/hf-space</span> di proyek ini:{' '}
          <span className="font-mono">app.py</span>, <span className="font-mono">requirements.txt</span>, <span className="font-mono">README.md</span>. Tunggu sampai
          statusnya <strong className="text-ink-2">Running</strong> sebelum menekan Tes.
        </span>
      </div>
    </Card>
  )
}

export function Settings() {
  const { go, route } = useApp()
  const back = route.name === 'settings' && route.back ? route.back : ({ name: 'home' } as const)
  const [tab, setTab] = useState<Tab>('services')
  const [keys, setKeys] = useState<KeyStatus[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [folder, setFolder] = useState('')

  const reload = (): void => {
    void window.api.settings.keys().then(setKeys)
    void window.api.settings.get().then(setSettings)
  }
  useEffect(() => {
    reload()
    void window.api.exporter.defaultFolder().then(setFolder)
  }, [])

  const statusOf = (p: ApiProvider): KeyStatus | undefined => keys.find((k) => k.provider === p)

  const NAV: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'services', label: 'Layanan AI dan kunci', icon: <KeyRound className="size-[18px]" /> },
    { id: 'general', label: 'Umum', icon: <SlidersHorizontal className="size-[18px]" /> },
    { id: 'about', label: 'Tentang aplikasi', icon: <Info className="size-[18px]" /> }
  ]

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-[68px] shrink-0 items-center gap-3.5 border-b border-line bg-surface px-8">
        <button type="button" onClick={() => go({ name: 'home' })}>
          <Logo />
        </button>
        <span className="text-xl text-line-3">/</span>
        <span className="font-semibold">Pengaturan</span>
        <div className="flex-1" />
        <Button icon={<ArrowLeft className="size-[18px]" />} onClick={() => go(back)}>
          {back.name === 'project' ? 'Kembali ke proyek' : 'Kembali ke beranda'}
        </Button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Bagian pengaturan" className="flex flex-col gap-1 border-r border-line pl-6 pr-4 pt-7">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              aria-current={tab === n.id ? 'page' : undefined}
              onClick={() => setTab(n.id)}
              className={cx(
                'flex h-11 items-center gap-3 rounded-xl px-3.5 text-left text-[15px]',
                tab === n.id ? 'bg-ink font-semibold text-paper' : 'font-medium text-ink hover:bg-sand'
              )}
            >
              {n.icon}
              {n.label}
            </button>
          ))}
        </nav>
        <main className="scroll-thin overflow-y-auto">
          <div className="flex max-w-[900px] flex-col gap-3.5 px-14 pb-24 pt-8">
            {tab === 'services' && settings && (
              <>
                <div>
                  <h1 className="font-display text-[34px] font-bold tracking-[-0.015em]">Layanan AI dan kunci</h1>
                  <p className="mt-2 max-w-[700px] text-[15px] text-ink-2">
                    Kisara memakai akun layanan milikmu sendiri. Kunci disimpan terenkripsi di komputer ini dan hanya dikirim langsung ke
                    layanan yang bersangkutan.
                  </p>
                </div>
                <LlmSection settings={settings} statusOf={statusOf} onChanged={reload} onSettings={setSettings} />
                <TtsSection settings={settings} statusOf={statusOf} onChanged={reload} onSettings={setSettings} />
                <ImagesSection settings={settings} statusOf={statusOf} onChanged={reload} onSettings={setSettings} />
                <WhisperSection settings={settings} onSettings={setSettings} />
                <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
                  <SectionTitle icon={<Mic className="size-5" />} title="Efek suara · Freesound" sub="Cari efek CC0 dari panel Efek di editor. Token tersimpan terenkripsi." />
                  <KeyForm provider="freesound" name="Freesound" status={statusOf('freesound')} label="Token Freesound" placeholder="Tempel token API Freesound" help="Lisensi setiap file berbeda dengan izin penggunaan API. Untuk aplikasi atau penggunaan API komersial, periksa perjanjian Freesound/UPF." link="https://freesound.org/apiv2/apply/" linkLabel="Kelola token Freesound" onChanged={reload} />
                  <button type="button" onClick={() => void window.api.app.openExternal('https://freesound.org/help/tos_api/')} className="self-start text-xs text-accent-dark hover:underline">Ketentuan penggunaan API Freesound</button>
                </section>
              </>
            )}

            {tab === 'general' && settings && (
              <>
                <div>
                  <h1 className="font-display text-[34px] font-bold tracking-[-0.015em]">Umum</h1>
                  <p className="mt-2 text-[15px] text-ink-2">Pilihan bawaan untuk proyek baru.</p>
                </div>
                <section className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6">
                  <Field label="Kepadatan tampilan" hint="Padat memperkecil semua jarak supaya lebih banyak muat di satu layar.">
                    <Select
                      label="Kepadatan tampilan"
                      value={settings.density}
                      onChange={async (v) => {
                        applyDensity(v)
                        setSettings(await window.api.settings.set({ density: v }))
                      }}
                      options={[
                        { value: 'nyaman', label: 'Nyaman' },
                        { value: 'padat', label: 'Padat' }
                      ]}
                      className="max-w-[320px]"
                    />
                  </Field>
                  <Field label="Bahasa default naskah dan suara">
                    <Select
                      label="Bahasa default naskah dan suara"
                      value={settings.defaultLanguage}
                      onChange={async (v) => setSettings(await window.api.settings.set({ defaultLanguage: v }))}
                      options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
                      className="max-w-[320px]"
                    />
                  </Field>
                  <Field label="Folder ekspor">
                    <div className="flex gap-2">
                      <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-sand px-3.5 font-mono text-[13px]">
                        <FolderOpen className="size-[17px] shrink-0 text-ink-2" />
                        <span className="truncate">{folder}</span>
                      </div>
                      <Button
                        className="h-11"
                        onClick={async () => {
                          const f = await window.api.exporter.pickFolder()
                          if (f) setFolder(f)
                        }}
                      >
                        Ganti folder
                      </Button>
                    </div>
                  </Field>
                </section>
              </>
            )}

            {tab === 'about' && <AboutSection />}
          </div>
        </main>
      </div>
    </div>
  )
}
