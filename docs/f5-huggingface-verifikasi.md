# Verifikasi F5 Hugging Face

## Implementasi

- Provider `f5-hf` terpisah dari provider gambar. Settings menyimpan Space, endpoint, transkrip,
  basename referensi WAV dan revision ID; token memakai penyimpanan Hugging Face terenkripsi yang sudah ada.
- Referensi dipilih melalui dialog lokal, ukuran maksimal 20 MB, durasi 3–15 detik dan dinormalisasi WAV.
  Sumber tidak dipindah. Memilih file, menyimpan setting dan tes API tidak mengunggah sampel.
- Kontrak Gradio diperiksa sebelum upload. Narasi dikirim saat job dimulai; tag TTS dibersihkan. Teks
  dibagi maksimal 600 karakter, mendahulukan batas kalimat/katanya tanpa menghilangkan bagian naskah.
- Hanya event complete diterima. Download dibatasi ukuran/domain, token hanya pada origin Space,
  redirect CDN tidak membawa token. Audio rusak/HTML ditolak FFmpeg. Temp file dibersihkan.
- Job F5 memakai antrean Hugging Face serial. WAV memakai sliceTake/caption/timeline/ekspor bersama.
  Referensi, pilihan suara atau naskah yang berubah menghentikan penerapan hasil lama.
- Pemilih default TTS, suara proyek, label Storyboard, arahan TTS dan fingerprint mengenali F5.
  Preset emosi Gemini tidak dianggap sebagai kontrol F5.

## Sumber publik yang diperiksa

Metadata dan source Space `fdrm/masbro-voice` diperiksa tanpa token atau konten pengguna pada 23 Oktober
2026. Space berstatus Running saat pemeriksaan, memakai CPU dan checkpoint
`Eempostor/F5-TTS-INDO-FINETUNE-V2`; kontrak aktual `/infer` menerima ref_audio_orig, ref_text, gen_text,
speed. Kontrak disimpan sebagai fixture pengujian. Tiga Space Indo lain yang diperiksa berstatus paused
atau runtime_error. Tidak ada permintaan inferensi sungguhan memakai suara pengguna.

Model Indo V2 berlisensi CC BY-NC 4.0; lisensi Apache pada antarmuka Space tidak menggantikan lisensi bobot.
Pengaturan menampilkan sumber/lisensi dan menjelaskan bahwa sampel serta narasi dikirim ke pengelola Space.

## Hasil pengujian

- Typecheck dan build berhasil.
- `tmp/bugcheck/f5-service-checks.cjs`: referensi sintetis, skema API aktual, pemecahan teks panjang,
  SSE complete, WAV asli/FFmpeg, batas token pada CDN, penolakan URL asing/HTML, sanitasi error kuota,
  pembatalan, reference guard dan pembersihan temp lolos. HTTP memakai mock, tanpa kunci/suara pengguna.
- Regresi production (18 checks), Hugging Face gambar/antrean, naskah/refinement, arahan narasi dan
  Flow/TXT/DOCX/86 adegan lolos.
- Harness `f5-ui-v3.log` memakai profil sementara, referensi nada dan Windows SAPI sebagai hasil HTTP
  tiruan. Import sampel, perubahan revision saat transkrip diganti, katalog suara, tes Space, default
  provider di Home dan satu take yang dipotong menjadi empat klip/caption/fingerprint lolos. Screenshot
  pengaturan pada 1180×900 dan timeline diperiksa. Ekspor MP4 selesai.
- `tmp/bugcheck/f5-export/demo-export-2.mp4`: 25,23 detik, H.264 1920×1080 30 fps, AAC 48 kHz stereo.
  Semua stream didekode FFmpeg tanpa error; frame/caption diperiksa. Ini membuktikan jalur audio ke
  ekspor, bukan mutu atau kemiripan suara F5 asli.

Untuk uji kualitas, pengguna perlu memilih referensi yang diizinkan dan menjalankan naskah pendek lewat
Space sebenarnya. Ketersediaan, kuota, kecepatan CPU dan mutu hasil Space publik tidak dijamin oleh tes ini.
