# Audit alur produksi — 29 Oktober 2026

Audit ini mencakup masalah yang bisa direproduksi pada naskah/pemulihan, konektor Flow dan worker, antrean, narasi, caption, serta tampilan storyboard. Ini bukan pernyataan bahwa seluruh kemungkinan bug atau layanan pihak ketiga sudah bebas masalah.

## Perbaikan

- Status akun aktif Flow sebelumnya dapat terlihat baik meski tidak ada worker yang cocok. Kini ada API status khusus dengan autentikasi, panel Pasangkan akun dan worker, dan preflight batch sebelum job dibuat. Identitas akun dipasangkan secara eksplisit; urutan akun tidak dipakai sebagai tebakan. API tidak mengirim ST, AT, cookie, password, atau API key dalam status.
- Route tidak boleh dipakai bersama akun lain, worker yang belum online tidak dapat dipasangkan, dan pemasangan tidak mengaktifkan akun yang dinonaktifkan. Semua perubahan melewati API backend dan tindakan UI pengguna.
- Port awal ekstensi worker disamakan dengan instalasi Kisara, 8765. Profil yang sudah menyimpan alamat 8000 harus dikoreksi secara eksplisit pada pengaturan ekstensi; pembaruan tidak menimpa alamat yang disimpan pengguna.
- Tombol narasi memakai label singkat. Panel status menampilkan tahap lengkap, jumlah adegan yang sudah tersimpan, progres, dan pembatalan. Whisper dapat bekerja pada satu rekaman yang belum dipotong; pada tahap itu belum ada audio per adegan meskipun suara rekaman sudah dibuat.
- Error gambar ditampilkan permanen di luar kotak pratinjau, sehingga tidak tersembunyi oleh media atau hanya muncul sebagai toast. Tombol Atur akun Flow langsung membuka pengaturan.
- Hasil narasi yang terlambat ditolak pada seluruh provider jika naskah, suara, provider, atau pengaturan yang masuk fingerprint berubah. Sebelumnya penjagaan umum hanya berlaku pada provider lokal.
- Proses FFmpeg/Whisper melepas listener abort setelah selesai; rangkaian pemotongan panjang tidak lagi menumpuk listener pada signal yang sama. Proses yang sudah dibatalkan tidak diluncurkan; ada batas waktu dan proses yang aktif dibunuh saat pembatalan.
- Metadata model aset Flow memakai rasio yang benar; hasil lembar karakter tidak dipasang jika prompt karakter berubah saat generasi.

## Validasi

- Typecheck dan build berhasil.
- Pemeriksaan comprehension, checkpoint/resume, format Short/Long, brainstorming/animasi, konektor Flow, peluncur Flow, dan kebijakan kuota lulus dengan fixture lokal.
- API setup diuji melalui FastAPI TestClient: tanpa autentikasi ditolak, data sensitif tidak disertakan, route invalid/offline/duplikat ditolak, pairing benar berhasil, akun nonaktif tetap nonaktif.
- Klien menolak worker belum siap sebelum request generasi, termasuk preflight batch. Native Electron membuktikan jumlah job tidak bertambah pada preflight yang gagal.
- Electron memakai profil sementara: status narasi 0/4, tahap Whisper dan tombol cancel tampil; cancel mengubah status job dan membersihkan banner. Error gambar tetap tersedia. Pemilihan worker dan tombol Pasangkan memperbarui indikator kesiapan dari 0 menjadi 1. Screenshot telah diperiksa.
- Alur audio nyata diuji memakai suara sintetis melalui mock F5 lokal: WAV dihasilkan, FFmpeg memotong per adegan, seluruh aset audio dan kata caption terpasang. Ini menguji pemrosesan media, bukan kualitas aksen F5.
- Subprocess nyata diuji berulang: listener abort kembali nol, pre-abort/cancel/timeout tertangani.
- Pergantian provider/voice/teks saat suara dibuat diuji untuk kelima provider dan ditolak sebelum menyimpan aset.

## Keadaan server pengguna saat audit

Server hidup, empat akun aktif, nol worker terhubung dan route akun belum dipasangkan. Generasi Google sesungguhnya belum berhasil diverifikasi. Pengguna perlu membuka profil Chrome yang memiliki worker, lalu memilih worker yang sesuai email akun di panel baru. Pairing tidak dapat ditebak secara aman dari nomor akun.

Proyek asli hanya dibaca untuk diagnosis. Saat audit dimulai narasi asli masih berjalan dan sudah memiliki 21/73 audio; proses itu tidak dihentikan. Server Flow dimulai ulang hanya setelah tidak ada job Flow aktif, tanpa mematikan proses narasi. Uji pembuatan media/antarmuka memakai profil dan proyek sintetis terpisah.
