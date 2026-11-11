import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Plus, Trash2, Pencil } from 'lucide-react'
import { VISUAL_STYLES, getStyle, makeCustomStyle, type StyleCategory } from '@shared/styles'
import type { AppSettings } from '@shared/types'
import { FlowStyleReference } from './FlowStyleReference'
import { Popover } from './Popover'
import { StyleSwatch } from './StyleArt'
import { Button, cx, inputCls } from './ui'
import { useApp } from '../store/app'
import { errorText } from '../lib/format'

const CATEGORY_LABEL: Record<StyleCategory, string> = { '2d': '2D', '3d': '3D', realistis: 'Realistis' }
const COLUMNS = 8

/** A pill that opens every visual style as a grid of square previews, so the look is clear before picking. */
export function StyleMenu({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [preview, setPreview] = useState('')
  const [stylePreviews, setStylePreviews] = useState<Record<string, string>>({})
  const [showFlowReference, setShowFlowReference] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [customBusy, setCustomBusy] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)
  const [peek, setPeek] = useState<string | null>(null)
  const toast = useApp(s => s.toast)
  const customStyles = useMemo(() => (settings?.customVisualStyles ?? []).map(s => makeCustomStyle(s.name, s.prompt, s.reference)), [settings])
  const allStyles = useMemo(() => [...VISUAL_STYLES, ...customStyles], [customStyles])
  const current = getStyle(value)
  const trigger = useRef<HTMLButtonElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const shown = getStyle(peek ?? value)

  useEffect(() => {
    if (!open) return
    void window.api.settings.get().then(setSettings).catch(e => toast('error', errorText(e)))
  }, [open])

  useEffect(() => {
    if (!open) return
    let alive = true
    const entries = settings?.customVisualStyles ?? []
    void Promise.all(entries.filter(s => s.reference).map(async s => {
      try { return [s.id, await window.api.settings.customStylePreview(s.reference!)] as const }
      catch { return null }
    })).then(results => { if (alive) setStylePreviews(Object.fromEntries(results.filter((x): x is readonly [string, string] => x !== null))) })
    return () => { alive = false }
  }, [open, settings])

  useEffect(() => {
    if (!open) return
    setPeek(null)
    // Start keyboard navigation on the chosen style.
    const id = requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
    return () => cancelAnimationFrame(id)
  }, [open])

  const pick = (id: string): void => {
    onChange(id)
    setOpen(false)
    trigger.current?.focus()
  }

  const saveCustom = async (): Promise<void> => {
    if (customBusy || !settings) return
    const name = customName.trim(), prompt = customPrompt.trim()
    if (!name || !prompt) { setCustomError('Nama dan deskripsi gaya wajib diisi.'); return }
    setCustomBusy(true); setCustomError(null)
    try {
      const style = makeCustomStyle(name, prompt, reference || undefined)
      const next = await window.api.settings.set({ customVisualStyles: [...((await window.api.settings.get()).customVisualStyles ?? []).filter(s => s.id !== style.id && s.id !== editing), { id: style.id, name, prompt, reference: reference || undefined }] })
      setSettings(next); resetForm(); onChange(style.id); toast('success', `Gaya “${name}” disimpan.`)
    } catch (e) { setCustomError(errorText(e)) }
    finally { setCustomBusy(false) }
  }

  const removeCustom = async (id: string): Promise<void> => {
    if (!settings || customBusy) return
    if (!window.confirm('Hapus preset ini dari daftar? Proyek yang sudah memakai gaya ini tetap menyimpan salinannya.')) return
    setCustomBusy(true)
    try {
      const next = await window.api.settings.set({ customVisualStyles: ((await window.api.settings.get()).customVisualStyles ?? []).filter(s => s.id !== id) })
      setSettings(next)
      if (editing === id) resetForm()
      setPeek(null)
      toast('success', 'Gaya custom dihapus.')
    } catch (e) { toast('error', errorText(e)) }
    finally { setCustomBusy(false) }
  }

  const resetForm = (): void => {
    setEditing(null); setCustomName(''); setCustomPrompt(''); setReference(''); setPreview(''); setCustomError(null)
  }

  const editCustom = async (id: string): Promise<void> => {
    const style = settings?.customVisualStyles.find(s => s.id === id)
    if (!style || customBusy) return
    setEditing(id); setCustomName(style.name); setCustomPrompt(style.prompt); setReference(style.reference || ''); setPreview(''); setCustomError(null)
    setCustomBusy(true)
    try { if (style.reference) setPreview(await window.api.settings.customStylePreview(style.reference)) }
    catch (e) { setCustomError(errorText(e)) }
    finally { setCustomBusy(false) }
  }

  const uploadReference = async (): Promise<void> => {
    if (customBusy) return
    setCustomBusy(true); setCustomError(null)
    try {
      const result = await window.api.settings.importCustomStyleReference()
      if (result) { setReference(result.reference); setPreview(result.preview) }
    } catch (e) { setCustomError(errorText(e)) }
    finally { setCustomBusy(false) }
  }

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const move = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUMNS, ArrowUp: -COLUMNS }[e.key]
    if (!move) return
    e.preventDefault()
    const tiles = [...(grid.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])]
    const at = tiles.indexOf(document.activeElement as HTMLElement)
    tiles[Math.min(tiles.length - 1, Math.max(0, at + move))]?.focus()
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Gaya visual: ${current.name}`}
        onClick={() => setOpen(!open)}
        className={cx(
          'inline-flex h-10 min-w-0 items-center gap-2 rounded-full border bg-paper pl-3.5 pr-3 text-sm font-medium transition-colors',
          open ? 'border-ink' : 'border-line-2 hover:border-ink-2'
        )}
      >
        <StyleSwatch styleId={value} className="-ml-1.5 size-7 shrink-0 rounded-full border border-ink/20" iconSize={14} />
        <span className="truncate">{current.name}</span>
        <ChevronDown className={cx('size-3.5 shrink-0 text-ink-2 transition-transform', open && 'rotate-180')} />
      </button>

      <Popover
        anchor={trigger}
        open={open}
        onClose={(why) => {
          setOpen(false)
          if (why === 'escape') trigger.current?.focus()
        }}
        width={880} maxHeight={520} label="Pilih gaya visual">
        <div className="flex shrink-0 items-end gap-4 border-b border-line px-4 pb-3 pt-3.5">
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold">Gaya visual</span>
            <span className="text-xs text-muted">Dipakai untuk semua gambar dan lembar karakter di proyek ini.</span>
          </div>
          <div className="flex-1" />
          <span className="truncate text-right text-[13px] text-ink-2">
            <span className="font-semibold text-ink">{shown.name}</span> · cocok untuk {shown.niche.toLowerCase()}
          </span>
        </div>
        <button type="button" className="mx-4 mt-3 flex items-center justify-between rounded-lg border border-line bg-sand/40 px-3 py-2 text-left text-xs text-ink-2" onClick={() => setShowFlowReference(v => !v)}>
          <span><strong className="text-ink">Referensi Flow tersimpan</strong> · gambar global lama untuk Flow</span><span>{showFlowReference ? 'Sembunyikan' : 'Tampilkan'}</span>
        </button>
        {showFlowReference && <FlowStyleReference />}
        <section className="flex shrink-0 flex-col gap-2 border-b border-line bg-sand/50 px-4 py-3" aria-label="Tambah gaya visual custom">
          <div className="flex items-center gap-2"><Plus className="size-4" /><strong className="text-sm">{editing ? 'Edit gaya visual' : 'Tambah gaya visual kamu'}</strong><span className="text-xs text-muted">Tersimpan dan bisa dipakai lagi.</span></div>
          <div className="flex gap-2">
            <input className={cx(inputCls, 'w-44')} value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="Nama gaya" aria-label="Nama gaya custom" />
            <textarea rows={2} maxLength={4000} className={cx(inputCls, 'min-w-0 flex-1')} value={customPrompt} onChange={e=>setCustomPrompt(e.target.value)} placeholder="Contoh: ilustrasi horor 2D gelap, garis kasar, warna merah kusam…" aria-label="Deskripsi gaya custom" />
            <Button size="sm" variant="primary" loading={customBusy} disabled={!settings || customBusy} onClick={()=>void saveCustom()}>{editing ? 'Simpan perubahan' : 'Tambahkan'}</Button>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={customBusy} onClick={()=>void uploadReference()}>Upload gambar contoh (opsional)</Button>
            {preview && <img src={preview} alt="Contoh gaya custom" className="size-10 rounded object-cover" />}
            {reference && <Button size="sm" disabled={customBusy} onClick={()=>{setReference('');setPreview('')}}>Hapus gambar contoh</Button>}
            {(editing || customName || customPrompt || reference) && <Button size="sm" disabled={customBusy} onClick={resetForm}>Batal</Button>}
          </div>
          {customError && <p role="alert" className="text-xs text-bad-ink">{customError}</p>}
        </section>
        <div
          ref={grid}
          role="radiogroup"
          aria-label="Gaya visual"
          onKeyDown={onGridKey}
          onMouseLeave={() => setPeek(null)}
          className="scroll-thin grid min-h-0 gap-x-2.5 gap-y-3 overflow-y-auto p-3.5"
          style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}
        >
          {allStyles.map((s) => {
            const on = s.id === value
            const custom = s.id.startsWith('custom:')
            return (
              <div key={s.id} className="group relative flex flex-col gap-1.5 rounded-xl text-left outline-none">
              <button
                type="button"
                role="radio"
                aria-checked={on}
                title={`${s.name} · ${s.niche}`}
                onClick={() => pick(s.id)}
                onMouseEnter={() => setPeek(s.id)}
                onFocus={() => setPeek(s.id)}
                className="flex flex-col gap-1.5 text-left outline-none"
              >
                <span
                  className={cx(
                    'relative block aspect-square w-full overflow-hidden rounded-[11px] bg-sand transition-shadow',
                    on ? 'border-2 border-accent shadow-ink' : 'border border-line group-hover:border-ink-2 group-focus-visible:border-ink'
                  )}
                >
                  {stylePreviews[s.id] ? <img src={stylePreviews[s.id]} alt={`Contoh ${s.name}`} className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.07]" /> : <StyleSwatch styleId={s.id} className="size-full transition-transform duration-500 ease-out group-hover:scale-[1.07]" iconSize={24} />}
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-ink/75 px-1.5 py-px text-[10px] font-semibold text-paper">
                    {CATEGORY_LABEL[s.category]}
                  </span>
                  {on && (
                    <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full border-[1.5px] border-ink bg-accent text-white">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className={cx('line-clamp-2 px-0.5 text-[12.5px] leading-tight', on ? 'font-bold text-ink' : 'font-semibold text-ink-2 group-hover:text-ink')}>
                  {s.name}
                </span>
              </button>
              {custom && <button type="button" disabled={customBusy} aria-label={`Edit ${s.name}`} onClick={()=>void editCustom(s.id)} className="absolute left-1 bottom-6 z-10 rounded bg-paper p-1"><Pencil className="size-3.5" /></button>}
              {custom && <button disabled={customBusy} type="button" title="Hapus gaya custom" aria-label={`Hapus ${s.name}`} onClick={()=>void removeCustom(s.id)} className="absolute right-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full bg-bad-ink text-white shadow-sm"><Trash2 className="size-3.5" /></button>}
              </div>
            )
          })}
        </div>
      </Popover>
    </>
  )
}
