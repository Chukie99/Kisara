# Pemeriksaan Google Flow — 30 Oktober 2026

## Hasil yang terbukti

- Pengguna membuktikan generasi manual berhasil melalui halaman Flow pada profil Judi.
- Permintaan Flow2API terakhir yang tercatat (request_logs id 6, akun 1) gagal dengan PUBLIC_ERROR_UNUSUAL_ACTIVITY pada RPC ogiZ0b. Ini bukan hasil gambar kosong dan bukan bukti kuota habis.
- Backend terpasang berbasis commit 1bcb9275d154c330d29cac3ba836a13393ff49c7 (26 Oktober). Pemeriksaan origin/main menemukan b410e373d4e90772a31ce8d33b5a5e3172c6ca28; perbedaannya hanya halaman tes, terjemahan, dan tes halaman tersebut. Tidak ada perbaikan jalur generasi yang bisa diterapkan dari update ini. Working tree backend tidak di-reset atau di-upgrade secara membabi buta.
- Proxy permintaan dan proxy unduhan backend nonaktif. Tidak ada perubahan jaringan/VPN pengguna.
- Saat melanjutkan pekerjaan, backend lokal mati. Peluncur berhasil menyalakannya. Pemeriksaan API kemudian menunjukkan empat akun, tetapi belum ada worker tersambung. Tidak ada permintaan generasi Google baru yang dikirim dalam pemeriksaan ini.

## Sumber utama dan batas kesimpulan

1. [Flow2API issue 190](https://github.com/TheSmallHanCat/flow2api/issues/190): laporan manual UI berhasil tetapi RPC gagal; jawaban pengelola 26 Oktober menyatakan mendapatkan token CAPTCHA belum membuktikan Google menerima generasi dan metode browser lokal saat ini kurang andal. Saran layanan pihak ketiga bukan bukti solusi gratis yang stabil dan tidak dipasang.
2. [Google Flow Help](https://support.google.com/flow/answer/16353333?hl=en): penanganan unusual activity mencakup menunggu beberapa menit dan menonaktifkan VPN/proxy. Ini panduan umum, bukan jaminan backend pihak ketiga diterima.
3. De-Story lokal menggunakan endpoint Flow2API yang sama. Runtime Python/backend yang dipaketkan tidak tersedia pada checkout F:/De-Story; keberhasilan generasi riil tidak dapat disimpulkan dari kesiapan server atau dokumentasinya.

Kesimpulan: belum ada perbaikan gratis yang terverifikasi mengubah penolakan ini menjadi keberhasilan generasi pada akun pengguna. Jangan mengklaim integrasi produksi siap hanya dari koneksi, build, atau media sintetis. Jangan mengganti akun, token, IP, atau menyuntikkan CAPTCHA untuk menghindari penolakan Google.

## Perubahan Kisara

- Penolakan unusual activity menyimpan jeda lokal per endpoint dalam flow-generation-state.json di folder data aplikasi, tanpa API key atau cookie. Restart tidak menghapus jeda.
- Generate dan preflight massal berhenti sebelum pengiriman saat dijeda.
- Pengaturan menampilkan alasan jeda dan tombol untuk mengizinkan tepat satu percobaan setelah pengguna memeriksa Flow langsung. Tombol tidak memulai generasi.
- Percobaan gagal tetap dijeda, termasuk timeout/koneksi/media gagal. Tidak ada failover kuota otomatis untuk percobaan ini. Percobaan sukses menghapus jeda hanya setelah media diperoleh; penolakan Google baru menjeda lagi.
- Kode unusual activity dikecualikan dari klasifikasi kuota baik di klien maupun kebijakan backend.

## Verifikasi

- Typecheck dan build lolos.
- Klien sintetis menguji pause persisten, nol POST saat dijeda, satu POST setelah izin eksplisit, gagal tetap pause, sukses membuka pause, serta regresi SSE/media/aspect/cancel/quota.
- Electron sungguhan dengan data sementara menguji generate gagal, preflight massal diblokir, UI pause, izin satu percobaan, dan gagal kembali pause. Tepat dua POST ke server sintetis: permintaan pertama dan satu percobaan yang sengaja diizinkan.
- Electron ditutup dan dibuka ulang pada data uji yang sama: pause masih aktif; preflight massal tidak menambah POST. Screenshot diperiksa di tmp/bugcheck/flow-guard-paused.png.
- Semua generasi dalam verifikasi ini sintetis. Target satu gambar Google masuk ke Kisara belum tercapai.

## Perbaikan EPIPE pada harness
Dialog EPIPE dari stack seedDemo menunjuk execFileSync pada generator gambar FFmpeg uji. Semua proses sinkron harness kini memakai stdio eksplisit (stdin ignore, stdout/stderr pipe) dan batas waktu; stderr child tidak diteruskan ke pipe peluncur yang mungkin telah tertutup. Kegagalan child tetap dilempar, bukan disembunyikan. Harness juga mensyaratkan STUDIO_USER_DATA yang cocok dengan profil aktif dan menolak folder pustaka utama yang dikenal. Uji regresi mencakup parent stderr yang sengaja melempar EPIPE pada child sukses maupun gagal; native Electron berhasil membuat empat klip dengan gambar/audio lengkap tanpa error pipe. Data pengujian berada di tmp/bugcheck/harness-epipe-data.

## Tes Google nyata setelah worker 1.0.2
Worker akun-1 tersambung setelah halaman opsi dimuat ulang. Satu job gambar dikirim melalui IPC Kisara di profil uji terpisah, menggunakan konfigurasi server lokal melalui connectFlowLocal (kunci hanya di penyimpanan terenkripsi profil uji). Request server id 7 memilih akun 1 dan kembali ditolak PUBLIC_ERROR_UNUSUAL_ACTIVITY pada RPC ogiZ0b. Tidak ada retry, tidak ada pergantian akun, dan tidak ada aset Flow baru. Aset demo lama tetap utuh; tidak dihitung sebagai keberhasilan Google. Endpoint produksi juga diberi jeda lokal setelah penolakan terverifikasi ini agar percobaan massal tidak langsung mengulangi kegagalan. Perubahan ini hanya pada berkas status jeda, bukan database/proyek pengguna. Log hasil aman: tmp/bugcheck/flow-live-single.log.
