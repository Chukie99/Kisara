# Diagnosis model terhubung tetapi generate 502

Keluhan pengguna: endpoint lokal `http://127.0.0.1:18900/v1` terhubung dan menyediakan 26 model,
tetapi `beam-free` gagal menyusun naskah dengan 502. Status daftar model saja tidak membuktikan
keberhasilan generate. Penyebab upstream aktual belum diverifikasi pada akun pengguna.

Perbaikan:

- `testLlm` meneruskan instance koneksi yang dibuat dari alamat/kunci argumen ke pembaca daftar model
  custom/Groq. Sebelumnya pembaca membuat koneksi ulang dari settings, sehingga override tes diabaikan.
- Pesan koneksi custom/Groq menjelaskan bahwa kemampuan menulis belum diuji.
- Tombol Tes menulis di bawah model menggunakan IPC baru pada main/shared/preload. Permintaan berupa
  JSON narasi dua kalimat dari fixture kucing hilang, tanpa akses isi proyek. Timeout 90 detik. Hasil
  menetap, tombol terkunci saat sibuk, hasil untuk pilihan endpoint/model lama tidak muncul pada pilihan
  baru. Tes tidak mengubah status kunci tersimpan dan tidak mengirim output narasi mentah ke UI/log.

Verifikasi: typecheck dan build lolos. `writer-diagnostics-checks.cjs` memakai HTTP tiruan untuk memeriksa
override endpoint/key, pemilihan model, fixture JSON, respons gagal 502, JSON tak lengkap dan penyembunyian
ID/kunci. Regresi kompatibilitas 400/JSON tetap lolos. Harness `writer-ui.log` dengan profil dan kunci
palsu lolos untuk busy, daftar model terhubung tetapi generate 502, error menetap dan retry berhasil.
Screenshot UI `writer-502.png` diperiksa. Tidak ada tes provider asli atau pengiriman proyek pengguna.

Fitur diagnosis ini tidak memperbaiki server provider yang gagal. Keberhasilan dua kalimat belum menjamin
permintaan panjang berhasil. Pengguna bisa membandingkannya dengan tombol Test pada model yang sama di
aplikasi penyedia untuk mempersempit kegagalan layanan atau perbedaan permintaan.
