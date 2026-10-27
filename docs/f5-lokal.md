# F5 Indonesia lokal

Kisara menyediakan provider f5-local untuk F5 Indo Studio milik pengguna di F:/F5-TTS-Project. Studio yang diperiksa menyediakan HTTP API di http://127.0.0.1:7861, checkpoint ckpts/f5_indo/f5_tts_indo_v2.pt dan suara acek, aku serta contoh. Tidak ada berkas sumber atau referensi studio yang diubah untuk integrasi ini. Dua generasi pendek untuk verifikasi menambah output di studio.

## Penggunaan

Jalankan launch.bat milik studio dan tunggu model siap. Buka ulang Kisara setelah pembaruan main/preload, lalu Pengaturan → F5-TTS lokal → alamat http://127.0.0.1:7861 → Simpan dan tes. Di proyek lama pilih provider F5-TTS lokal dan suara yang diinginkan di Ide cerita; pengaturan global tidak mengganti proyek lama. Atur tempo di Naskah (awal 0,90; tersedia 0,80–1,10), lalu buat ulang suara narasi di Storyboard. Tidak perlu upload referensi lagi.

Tes hanya memeriksa readiness dan katalog; generasi diperlukan untuk menilai audio. Ini CPU, bukan server GPU: tes satu kalimat nyata memerlukan sekitar 2½ menit pada komputer ini. Narasi panjang jauh lebih lama. Biaya API tidak ada; lisensi checkpoint tetap mengikuti model yang dipasang di studio.

## Kontrak

GET /api/state mengembalikan model ready, max_chars, nfe dan daftar voice (id, name, transcript, duration, created). Kisara mengirim nama/deskripsi suara ke renderer; transkrip referensi tidak dikembalikan lewat katalog. ID pilihan berisi ID server + hash metadata/revisi pengaturan dan endpoint.

POST /api/generate berisi text, voice_id asli, speed, format wav dan judul unik. POST tidak dicoba ulang otomatis. GET /api/job/ID dipoll sampai done/error, lalu /files/out/FILE diunduh. URL dibatasi HTTP loopback (localhost dikanonisasi menjadi 127.0.0.1); redirect, credential URL, query/fragment/path lain dan nama hasil traversal ditolak. Tidak ada API key yang dibaca atau referensi yang diunggah. Audio dibatasi ukuran, didecode oleh FFmpeg dan dinormalisasi ke mono PCM WAV sebelum alignment/pemotongan adegan bersama.

Antrean f5-local serial terpisah mencegah dua proyek mengirim generasi CPU bersamaan dari Kisara. Batas total per take dua jam, HTTP per permintaan 15 detik; status dan waktu menunggu tampil. Pembatalan menghentikan penantian dan penerapan hasil di Kisara, tetapi server tidak memiliki endpoint cancel sehingga generasi yang sudah dikirim bisa tetap berjalan. Tidak ada retry POST otomatis yang menduplikasi tugas. Studio tidak dijalankan otomatis oleh Kisara; saat audit studio dijalankan manual sebagai proses lokal untuk pengujian.

Suara/tempo/naskah yang berubah menolak hasil lama; perubahan tempo menandai audio untuk diperbarui. Cloud emotion tags tidak dikirim ke model lokal. Mengubah konfigurasi referensi yang tampak pada API memperbarui ID suara; perubahan waveform yang tidak mengubah metadata tidak dapat dideteksi katalog API ini. Pilihan voice ID server yang sama dipertahankan saat revision ID berubah. Provider lokal yang offline tidak diam-diam diganti dengan provider lain.

## Verifikasi

- API nyata: model ready, daftar acek/aku/contoh; POST kalimat pendek menggunakan aku menghasilkan WAV.
- Klien service nyata: state → versi voice aku → POST → polling → download → FFmpeg → WAV tmp/bugcheck/f5-local-service-real.wav; generasi berhasil, tidak memakai HTTP internet. Model berjalan dari cache offline.
- f5-local-checks.cjs: server tiruan + FFmpeg sungguhan; loopback, privasi katalog, tempo asli, chunk serial tanpa kata hilang, queued/running, concat, referensi basi, loading/JSON salah/HTML/redirect/nama file tidak aman, satu POST per bagian, abort/cleanup.
- f5-local-readiness-checks.cjs: provider offline tetap dipilih; speed mengubah fingerprint; emosi cloud tidak memengaruhi fingerprint lokal.
- Dev harness f5-local-ui-v2.log: test/config UI, katalog suara, narasi empat klip lewat service + mock server/SAPI, pemotongan/caption/fingerprint/take bersama, perubahan tempo dan status audio basi, ekspor MP4. Server tiruan bukan bukti kualitas F5.
- MP4 demo 25,23 detik, H.264 1920×1080 30fps dan AAC 48kHz stereo; decode penuh FFmpeg lulus dan frame diperiksa.
- Typecheck/build serta quality, 18 production, F5 Hugging Face dan tempo lokal regressions lulus.

Proyek/kunci Kisara asli tidak diubah oleh pengujian; dev harness memakai profil terpisah. Sampel nyata dapat didengarkan di tmp/samples/f5-lokal-aku.mp3. Kemiripan suara/ekspresi perlu dinilai pengguna; keberhasilan API tidak menjamin hasil artistik.
