import type { EditorSettings } from '@shared/types'
import { currentPacing, pacingSeconds } from '@shared/storyPacing'
import { Button } from './ui'

export function StoryPacing({ brief, synopsis, duration, onDuration }: { brief?: EditorSettings['storyBrief']; synopsis: string; duration: number; onDuration: (seconds: number) => void }): React.JSX.Element | null {
  if (!brief?.pacing) return null
  const pacing = currentPacing(brief.pacing, synopsis, brief.idea)
  if (!pacing) return <p role="status" className="rounded-xl border border-line p-3 text-sm text-muted">Ide atau sinopsis berubah. Saran durasi sebelumnya sudah tidak berlaku; ambil ide ulang untuk menilai alur terbaru.</p>
  const seconds = pacingSeconds(pacing)
  const factual = brief.fictional === false
  return <section aria-label="Saran durasi cerita" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
    <h3 className="font-semibold">{pacing.partial ? 'Alur sumber belum terbaca lengkap' : 'Saran durasi berdasarkan alur'}</h3>
    {pacing.partial ? <p>Transkrip hanya mencakup bagian awal. Lengkapi transkrip sampai akhir sebelum menilai durasi seluruh cerita.</p> : <>
      <p>Perkiraan AI: <strong>{seconds / 60} menit</strong>, {factual ? 'termasuk ruang untuk penjelasan istilah, contoh, batasan, dan jeda.' : 'termasuk ruang untuk reaksi, dialog, dan jeda.'} Durasi akhir mengikuti pembawaan narator.</p>
      <p className="text-ink-2">{pacing.reason}</p>
      {duration < seconds && <p role="status" className="rounded-lg bg-sun-soft p-3 text-sun-ink">Pilihan {Math.round(duration / 60 * 10) / 10} menit lebih pendek dari saran alur. {factual ? 'Ada risiko hubungan antar konsep atau batasan penting terlewat.' : 'Ada risiko sebab-akibat atau suasana terasa melompat.'} Kamu tetap bisa memilihnya; penulis akan mengurangi pengulangan dan detail sampingan.</p>}
      {duration > seconds && <p className="text-muted">Target kamu lebih panjang dari saran. Penulis tetap diminta menghindari pengulangan dan adegan pengisi.</p>}
      <Button size="sm" className="self-start" disabled={duration === seconds} onClick={() => onDuration(seconds)}>{duration === seconds ? 'Durasi saran dipakai' : 'Pakai saran ' + seconds / 60 + ' menit'}</Button>
    </>}
    <details><summary className="cursor-pointer font-medium">{factual ? 'Urutan pembahasan penting' : 'Alur yang perlu dipertahankan'} ({pacing.beats.length} bagian)</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-ink-2">{pacing.beats.map((beat, i) => <li key={i}>{beat.event}</li>)}</ol></details>
    <p className="text-xs text-muted">Penilaian untuk ide hasil pengolahan ini, bukan jaminan kualitas atau ukuran dari panjang video sumber.</p>
  </section>
}
