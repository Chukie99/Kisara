# Tempo narasi lokal

Untuk penggunaan tanpa API berbayar, pilih Supertonic di langkah Ide cerita. Di Naskah tersedia Tempo narasi lokal: 0,80 / 0,90 / 1,00 / 1,10. Angka adalah pengali terhadap hasil preset studio, bukan kata per menit absolut. Awal 0,90. Setelah mengubah tempo, buat ulang narasi di Storyboard.

Service lokal mengubah tempo tanpa mengubah pitch, sebelum Whisper/alignment dan pemotongan adegan. File hasil disimpan sehingga pratinjau dan ekspor mendengar waveform yang sama. Mengubah tempo tidak membuat model otomatis lebih ekspresif; kualitas harus dinilai dari hasil suara.

Verifikasi: typecheck/build lulus; quality-checks dan 18 production regression checks lulus. Uji service dengan jembatan tiruan dan FFmpeg sungguhan mengubah tone 4 detik menjadi 4,44 detik pada 0,90, frekuensi tetap sekitar 440 Hz; mencakup cleanup, pembatalan awal dan fingerprint. Sampel suara asli Supertonic-3 berhasil disintesis offline memakai studio pengguna (tanpa mengubah berkas studio), keluaran hanya di workspace tmp/samples. Dua versi sampel 0,90 dan 0,80 dibuat untuk penilaian pendengaran pengguna. Tidak ada proyek/kunci pengguna yang diubah, dan tidak ada data dikirim ke API.
