import type { EditorSettings, SourceOptions } from '@shared/types'
import { Select } from './Select'
import { inputCls } from './ui'

export function SourceEditor({ value, onChange, disabled }: { value: SourceOptions; onChange: (value: SourceOptions) => void; disabled: boolean }): React.JSX.Element {
  return <div className="flex w-full flex-col gap-3">
    <Select label="Cara mengolah sumber" value={value.mode} onChange={(mode) => onChange({ ...value, mode })} disabled={disabled} options={[{value: 'factual', label: 'Edukasi / faktual — bahasa sederhana'}, {value: 'fiction', label: 'Adaptasi fiksi — cerita baru'}]} />
    <p className="text-xs leading-relaxed text-muted">{value.mode === 'factual' ? 'Untuk finance dan edukasi: pertahankan fakta, jelaskan istilah, pisahkan opini dan simulasi. Sumber tetap perlu diperiksa.' : 'Untuk cerita rekaan: kembangkan premis menjadi fiksi dengan nama, tempat, dan detail baru.'} Pilihan ini dipakai saat kamu menekan Ambil ide.</p>
    <details className="rounded-xl border border-line px-3 py-2.5" aria-label="Arahan tambahan">
      <summary className="cursor-pointer text-sm font-medium">Arahan tambahan <span className="ml-2 text-xs font-normal text-muted">Opsional · audiens, sudut pembahasan, dan contoh</span></summary>
      <div className="mt-3 flex flex-col gap-3">
    <label className="flex flex-col gap-1 text-xs">Target penonton<input aria-label="Target penonton" maxLength={300} disabled={disabled} className={inputCls + ' h-11 px-3'} value={value.audience} onChange={e => onChange({...value, audience:e.target.value})} /></label>
    <label className="flex flex-col gap-1 text-xs">Sudut pembahasan kamu<input aria-label="Sudut pembahasan kamu" maxLength={1000} disabled={disabled} className={inputCls + ' h-11 px-3'} placeholder="Misalnya: mengapa gaji naik tetapi tabungan tidak bertambah?" value={value.angle} onChange={e => onChange({...value, angle:e.target.value})} /></label>
    <label className="flex flex-col gap-1 text-xs">Tambahan dari kamu<textarea aria-label="Tambahan dari kamu" maxLength={2000} rows={2} disabled={disabled} className={inputCls + ' min-h-20 px-3 py-2'} placeholder="Pengalaman, contoh, pertanyaan, atau sumber pendukung. Tandai jika hanya ilustrasi." value={value.contribution} onChange={e => onChange({...value, contribution:e.target.value})} /></label>
    <p className="text-xs text-muted">Sumber dan arahan yang sama bisa menghasilkan pembahasan mirip. Aplikasi tidak menjamin konten eksklusif.</p>
      </div>
    </details>

  </div>
}

export function SourceReview({ brief }: { brief?: EditorSettings['storyBrief'] }): React.JSX.Element | null {
  if (!brief) return null
  return <section aria-label="Jenis dan catatan sumber" className="flex flex-col gap-2 rounded-xl border border-line p-3 text-sm">
    <strong>Materi proyek: {brief.fictional ? 'Adaptasi fiksi' : 'Edukasi / faktual'}</strong>
    {!brief.fictional && <p className="text-xs text-muted">AI menyusun ulang pembahasan dari materi yang dibaca, bukan memverifikasi kebenarannya secara mandiri.</p>}
    {!!brief.sourceNotes?.length && <details><summary className="cursor-pointer">Catatan sumber — belum diverifikasi</summary><ul className="mt-2 list-disc space-y-1 pl-5">{brief.sourceNotes.map((note,i)=><li key={i}>{note}</li>)}</ul></details>}
    {!!brief.reviewNotes?.length && <details open><summary className="cursor-pointer">Perlu kamu periksa sebelum produksi</summary><ul className="mt-2 list-disc space-y-1 pl-5">{brief.reviewNotes.map((note,i)=><li key={i}>{note}</li>)}</ul></details>}
  </section>
}
