# Pemulihan penyusunan naskah

Timeout per permintaan AI tetap tiga menit; ini batas respons, bukan bukti kuota habis. Penyebab di layanan penulis masih mungkin terjadi.

Naskah panjang kini memakai kelompok empat adegan dan script-draft.json di folder proyek. Kerangka, prefix bernomor, dan draf lengkap sebelum review ditulis melalui file sementara lalu rename. Respons gagal tidak menghapus kelompok sebelumnya. Klik Susun naskah lagi untuk meneruskan jika ide dan pengaturan sama; aplikasi boleh ditutup dan dibuka kembali. Mengubah input membuat draf tidak cocok dan memulai rencana baru. Model penulis dapat diganti untuk melanjutkan bagian tersisa, dengan review seluruh naskah tetap wajib.

Hanya hasil lengkap yang lolos pemeriksaan masuk transaksi SQLite. Kegagalan, cancel dan perubahan input selama proses mempertahankan naskah proyek sebelumnya. File yang rusak, terlalu besar atau prefix tidak berurutan ditolak. Draf dihapus setelah commit. Tidak ada migrasi DB atau perubahan narasi/audio yang sudah dibuat.

Versi sebelumnya tidak memiliki checkpoint naskah; adegan dari percobaan lama yang sudah berhenti tidak dapat dipulihkan lewat perbaikan ini.

Verifikasi: tools/check-script-resume.cjs mensimulasikan kegagalan 32/39, reload modul, penyusunan bagian 33–39 saja, timeout review, invalidasi edit/korupsi, cancel, dan penghapusan sesudah commit. tools/check-content-format.cjs dan tools/check-comprehension.cjs menguji regresi. Electron profil sementara resume-fixed-userdata benar-benar dihentikan setelah gagal, kemudian dijalankan ulang untuk menyelesaikan 39 adegan; log resume-fixed-first.log dan resume-fixed-second.log; resume-requests.log membuktikan OUTLINE dan adegan 1–32 tidak diulang setelah restart, screenshot resume-failed.png dan resume-done.png. Seluruh isi dan layanan uji sintetis di loopback; tidak menilai kualitas model pengguna.

Percobaan UI awal memakai provider suara yang otomatis berubah menjadi layanan siap pakai, sehingga fingerprint membatalkan draf dan proses dimulai ulang. Uji akhir memakai provider tetap dan memeriksa daftar permintaan, bukan hanya jumlah adegan yang selesai.

## Respons pemeriksaan tidak valid

Instruksi pemeriksa kini terpisah dari instruksi penulis. Sistem meminta ulang sekali jika respons bukan objek issues yang valid atau kutipannya tidak cocok. Dua respons invalid tetap menggagalkan penerapan, bukan diloloskan sebagai tidak ada masalah. Checkpoint lengkap tetap tersedia. Unit test mencakup respons scenes, objek kosong, null dan nomor asing yang kemudian valid, serta respons invalid permanen yang berhenti setelah dua percobaan.

Electron review-userdata: dua respons pemeriksaan salah format menahan draf 39/39; setelah restart, respons pertama kembali salah dan percobaan otomatis kedua valid. Audit review-requests.log memastikan hanya satu outline dan sepuluh kelompok adegan dibuat untuk seluruh dua sesi; empat permintaan review, tanpa penulisan ulang. Log review-first.log / review-second.log dan screenshot review-failed.png / review-done.png. Ini model sintetis, bukan bukti model pengguna selalu patuh.

## Hasil perbaikan bertahap

Dua putaran perbaikan otomatis menggantikan batas satu putaran. Kelompok valid langsung disimpan ke script-draft.json sebelum permintaan berikutnya; jika review lanjutan gagal, klik ulang memakai tulisan terbaru. Hasil lama tidak lagi diulang pada setiap klik. Tes check-comprehension mencakup definisi lalu contoh yang diperbaiki pada dua putaran. Tes check-script-resume menyimulasikan timeout setelah perbaikan dan membuktikan perbaikan tersimpan serta dipakai setelah reload modul. Temuan yang belum selesai tidak dianggap lulus.

Uji Electron repair-ui-userdata memakai tombol Susun naskah yang sebenarnya: dua temuan bertahap, dua perbaikan, lalu review ketiga valid. UI pindah ke Naskah (step 2), 39 adegan, dan teks perbaikan kedua tersimpan. Log repair-ui.log, audit repair-requests.log, screenshot repair-step-two.png. Layanan suara/gambar tidak dikonfigurasi pada profil uji; tidak dipakai menulis naskah.

## Membuka draf lengkap saat pemeriksaan AI gagal

Jika semua adegan sudah tersimpan tetapi pemeriksaan/perbaikan alur AI gagal, langkah Ide menawarkan **Buka draf untuk ditinjau**. Ini pilihan eksplisit pengguna, bukan kelulusan pemeriksaan otomatis. Alur Susun naskah tetap menjalankan pemeriksaan dan perbaikan seperti semula.

Pemulihan memverifikasi fingerprint ide, pengaturan, dan naskah lama sebelum mengganti klip. Draf parsial, rusak, kedaluwarsa, atau tidak sesuai kerangka ditolak tanpa panggilan AI atau perubahan naskah. Draf lengkap yang cocok dibuka di langkah Naskah dengan penanda **Pemeriksaan AI belum selesai**. Panel Periksa naskah tetap menyediakan pemeriksaan lokal dan Minta tinjauan AI. Jika sudah ada naskah terpasang, UI meminta konfirmasi penggantian terlebih dahulu.

Setelah restart, status pemulihan dapat dibentuk kembali dari checkpoint disk; tidak bergantung pada status run dalam memori. Checkpoint asli pengguna tidak diedit langsung oleh perbaikan aplikasi ini. Buka draf menggunakan IPC normal dan pemeriksaan versi yang sama.

Validasi: uji resume membuktikan pemulihan tidak mengirim request LLM, memberi penanda review tertunda, dan menolak draf tidak cocok. Uji comprehension tetap menjaga pemeriksaan ketat pada jalur normal. Uji Electron dengan profil sintetis meliputi gagal review, restart, tombol pemulihan, dan perpindahan ke langkah 2 dengan peringatan review belum selesai.

Membuka proyek pada langkah Ide tidak lagi mengganti layanan TTS secara otomatis berdasarkan kesiapan saat itu. Pilihan narator tersimpan dipertahankan; pengguna tetap dapat menggantinya sendiri. Pergantian otomatis sebelumnya dapat mengubah fingerprint draf hanya karena proyek dibuka dan menghalangi pemulihan yang seharusnya valid.
