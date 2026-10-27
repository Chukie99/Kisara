import { useEffect, useState } from 'react'
import { LogoMark } from '../components/Logo'

/** Keep product information local; third-party licences remain visible after rebranding. */
export function AboutSection() {
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.api.app.version().then(setVersion)
  }, [])

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6 text-[15px] leading-relaxed text-ink-2">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <LogoMark size={48} />
          <div>
            <h1 className="font-display text-[34px] font-bold tracking-[-0.015em] text-ink">Kisara</h1>
            <p className="text-sm text-muted">Studio cerita & video</p>
          </div>
        </div>
        {version && <span className="rounded-full border border-line-2 px-3 py-1 font-mono text-xs text-ink">Versi {version}</span>}
      </div>
      <p>Rangkai ide, naskah, visual, dan suara menjadi video untuk YouTube atau Facebook dalam satu ruang kerja.</p>
      <div className="rounded-xl border border-line p-5">
        <h2 className="mb-4 text-base font-semibold text-ink">Mulai dari cerita kamu</h2>
        <ol className="grid gap-3 text-sm">
          <li><strong className="text-ink">01 · Ide cerita.</strong> Tentukan cerita, durasi, dan gaya visual.</li>
          <li><strong className="text-ink">02 · Naskah.</strong> Tinjau hook, alur, dan dialog sebelum produksi.</li>
          <li><strong className="text-ink">03 · Storyboard.</strong> Siapkan pemeran, gambar, serta suara narasi.</li>
          <li><strong className="text-ink">04 · Editor.</strong> Atur caption, musik, dan efek suara, lalu ekspor MP4.</li>
        </ol>
      </div>
      <p>Proyek dan aset disimpan di komputer kamu. Layanan AI memakai akun serta kunci API kamu sendiri.</p>
      <div className="border-t border-line pt-5 text-sm text-muted">
        <h2 className="mb-2 text-base font-semibold text-ink">Komponen & lisensi</h2>
        <p>
          Kisara menyertakan FFmpeg (GPL), whisper.cpp (MIT), serta font dari Google Fonts (SIL Open Font License dan Apache 2.0).
          Model Whisper Small (MIT) diunduh terpisah. Berkas lisensi ikut terpasang di folder aplikasi.
        </p>
        <p className="mt-3">
          Nama dan logo penyedia AI adalah milik pemiliknya masing-masing dan digunakan untuk menandai layanan yang terhubung.
          Ikon penyedia berasal dari LobeHub Icons (MIT).
        </p>
      </div>
    </section>
  )
}
