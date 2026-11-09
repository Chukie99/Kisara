import type { FlowBrowserInspection } from './production'

export interface FlowReadiness {
  state: 'ready' | 'blocked' | 'busy' | 'draft' | 'unavailable' | 'unknown'
  label: string
  detail: string
}

/** A live socket is transport evidence only; the composer must be readable before sending. */
export function flowReadiness(value: FlowBrowserInspection): FlowReadiness {
  if (value.blocked) return { state: 'blocked', label: 'Dibatasi Google', detail: 'Periksa pembatasan di Chrome. Generasi tidak dijalankan dan akun tidak diganti otomatis.' }
  if (!value.projectOpen) return { state: 'unavailable', label: 'Proyek belum terbuka', detail: 'Buka tepat satu proyek Flow pada profil Chrome akun ini.' }
  const page = value.composer
  if (!page) return { state: 'unknown', label: 'Halaman belum terverifikasi', detail: 'Perbarui server Flow2API agar kesiapan kotak prompt dapat diperiksa.' }
  if (!page.online) return { state: 'unavailable', label: 'Chrome sedang offline', detail: 'Periksa koneksi internet pada profil akun ini.' }
  if (page.busy) return { state: 'busy', label: 'Flow sedang bekerja', detail: 'Tunggu hasil generasi yang masih berjalan di akun ini.' }
  if (page.editors !== 1 || page.submitCount !== 1) return { state: 'unavailable', label: 'Kotak prompt belum siap', detail: 'Buka proyek Flow dan tutup menu atau selesaikan dialog yang menutupi kotak prompt.' }
  if (page.draftLength > 0) return { state: 'draft', label: 'Ada draft di Flow', detail: 'Simpan atau kosongkan draft sendiri di Chrome agar tidak tertimpa.' }
  return { state: 'ready', label: 'Siap menerima prompt', detail: 'Proyek dan kotak prompt terbaca. Kuota diperiksa saat mengirim gambar.' }
}
