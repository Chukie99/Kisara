# Brainstorm ide dan teks animasi

## Memakai fitur

1. Buka Tulis ide sendiri, lalu Belum punya ide? Pilih topik. Finance sudah tersedia bersama niche lain.
2. Pilih niche, isi arahan tambahan bila perlu, lalu Cari 6 sudut pembahasan. Setiap kandidat berisi judul, sudut, hook, sinopsis, alasan menarik dan hal yang perlu diriset. Cari sudut lain mengirim judul sebelumnya agar tidak diulang. Draf baru berubah setelah Pakai ide ini; hook dan catatan riset ikut ke brief proyek.
3. Buat atau impor gambar Flow dan selesaikan suara. Di Edit & ekspor, buka Overlay, tambah Teks, pilih Pudar, Membesar atau Naik perlahan, lalu atur ukuran, posisi dan waktu. Caption tetap terpisah.
4. Tambah angka berjalan menyediakan label serta nilai awal/akhir, durasi hitung, awalan dan akhiran. Bisa naik atau turun. Nilai awal/akhir default nol supaya tidak mengarang nominal. Isi sendiri dari naskah yang sudah ditinjau. Kartu nominal biasa juga dapat dibuat dengan teks beberapa baris.
5. Gerak kamera tambahan: Dekati lalu tahan, Buka lalu tahan, dan Lintasan melengkung. Tersedia pada pilihan gerak kamera yang memakai daftar bersama.

## Batas perilaku

Brainstorm memakai model penulis, bukan riset web atau sumber terverifikasi. Tidak menjanjikan tren terkini, eksklusivitas, hasil penonton atau kebenaran otomatis. Enam judul harus berbeda dan lengkap; error mempertahankan draf. Daftar pemeriksaan adalah rencana riset, bukan bukti. Finance memakai mode faktual; horor dan cerita kehidupan memakai fiksi. Tidak otomatis menyatakan semua niche adalah kisah nyata.

Teks dan angka adalah lapisan editor di atas gambar; tidak perlu digambar ke piksel oleh Flow. Waktu masih diatur manual pada timeline. Bukan pelacakan objek, panah otomatis atau kalkulasi seluruh transaksi. Jika suara, urutan atau durasi berubah, periksa waktu overlay lagi. Angka dapat dipakai untuk saldo, harga, persentase atau jumlah melalui awalan/akhiran; jangan menampilkan angka simulasi sebagai fakta.

Tidak ada migrasi kolom klip. animation, animationSec dan counter opsional disimpan dalam JSON editor.overlays; overlay lama tetap diam. Pemotongan counter menyimpan offset agar angka bagian kedua tidak kembali ke awal. Memindah seluruh overlay memindahkan waktu mulainya seperti overlay biasa.

## Pratinjau dan ekspor

shared/overlays.ts menghitung frame teks, opasitas, ukuran, perpindahan dan pemformatan angka di satu tempat. Angka dan animasi memakai resolusi waktu 30 fps, termasuk saat video 60 fps. Ekspor ASS memakai segmen bersama; bagian diam yang panjang digabung agar tidak menghasilkan ribuan baris yang sama. Counter dibatasi durasi hitung 0,1–10 detik, dua desimal dan rentang nilai ±1 triliun. Preset kamera baru memiliki rumus preview dan perspektif FFmpeg dalam shared/motion.ts.

Animasi alpha tidak boleh mengaktifkan outline kotak: ASS OvBox tetap memakai outline transparan. Pengujian MP4 menemukan artefak garis hitam ini dan koreksinya diperiksa melalui ekspor ulang.

## Verifikasi

- npm run typecheck dan npm run build.
- node tools/check-engagement.cjs: frame preview/segmen ekspor, angka turun dan negatif, seek, pemotongan counter, overlay statis lama, batas kamera dan hold, enam ide, mode serta validasi respons (AI fixture).
- Regresi tools/check-comprehension.cjs dan tmp/bugcheck/i2v-story-checks.cjs lulus.
- Electron profil sementara: brainstorming menampilkan enam kandidat, mempertahankan draf sebelum memilih dan menyimpan mode/catatan. Log brainstorm-clean.log dan screenshot brainstorm-ui.png.
- Electron editor: kontrol angka dan animasi, angka berubah ketika play, kartu muncul. Log engagement-ui-v2.log (bagian animasi); percobaan brainstorming pada run ini gagal karena server fixture habis waktu, lalu diuji terpisah. Screenshot counter-ui.png dan card-ui.png diperiksa.
- MP4 demo memakai gambar/audio sintetis dan tiga preset kamera baru, counter, kartu nominal dan teks naik; full decode H264/AAC serta cuplikan frame diperiksa. Ekspor akhir tercatat di engagement-final-export.log. Ini pengujian fungsi, bukan contoh kualitas konten sebenarnya.
