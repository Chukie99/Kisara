# Changelog

Semua perubahan penting dicatat di sini. Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/),
dan nomor versi mengikuti [Semantic Versioning](https://semver.org/lang/id/): **mayor** untuk perubahan yang merusak
data atau alur lama, **minor** untuk fitur baru, **patch** untuk perbaikan.

Cara menaikkan versi ada di [docs/pengembangan.md](docs/pengembangan.md#versi-dan-rilis).

## [Belum dirilis]

### Perubahan
- Pemeriksaan naskah lokal dan tinjauan AI opsional dengan kutipan adegan, laporan tersimpan dan invalidasi setelah edit.
- Impor hasil Flow massal: pasangan nomor/manual, pencegahan duplikat, izin penggantian, riwayat aset, normalisasi MP4, validasi paket dan pembatalan.
- Draf Home tetap ada selama sesi saat kembali dari Pengaturan; error ambil ide memiliki pintasan tes model.
- Alur desktop lebih ringkas: mulai dari sumber atau ide sendiri, arahan/pengaturan tambahan bisa dibuka, narasi lengkap menjadi tampilan awal dengan salin/ekspor, tab edit/Flow terpisah, serta generasi massal di Alat lainnya.
- Pengolahan sumber kini membedakan edukasi/faktual dan adaptasi fiksi, dengan bahasa sederhana, arahan kreator, catatan sumber serta pemeriksaan sebelum produksi; naskah finance tidak lagi dipaksa menjadi cerita fiksi.
- F5 Indonesia lokal tersambung lewat API studio, memakai suara tersimpan tanpa upload ulang, dengan pemilihan suara, tempo, antrean serial, status proses, caption dan ekspor MP4.
- Google Flow memiliki pilihan Text to Image dan Image to Video, arahan gerak per adegan yang dapat diedit, salin/ekspor TXT/DOCX serta paket 10 video dengan pasangan gambar acuan dan nama Indonesia.
- Paket Flow meminta nama aset berurutan seperti `001 - Judul Indonesia`, dengan daftar pasangan gambar–timestamp–narasi yang bisa disalin atau diekspor. Preset Kartun Indonesia sederhana dapat diterapkan pada prompt yang sudah ada tanpa generasi AI baru.
- Panel Flow menambahkan paket prompt per 10 adegan untuk dicoba di Agent, dengan salin/ekspor TXT/DOCX dan penomoran global. Narasi tersedia sebagai satu paragraf per adegan, salin per paragraf/utuh serta ekspor terpisah sebelum visual siap.
- Podcast / transkrip menjadi judul, ide fiksi dan sinopsis yang bisa ditinjau sebelum produksi; nama dan detail sumber diarahkan untuk dibangun ulang.
- Naskah memiliki timestamp per adegan; panel Google Flow menyediakan prompt bergaya visual proyek, salin per adegan, serta ekspor TXT/DOCX tanpa membuat gambar di Kisara.
- Cerita panjang dikembangkan bertahap, dengan nomor visual yang divalidasi dan perlindungan edit selama AI bekerja.
- Nama aplikasi, logo, judul jendela, installer, shortcut, dokumentasi dan alat pendamping menjadi Kisara. Kredit dan tautan promosi lama dihapus; profil data lama tetap didukung.
- Tema studio gelap slate/biru, navigasi pustaka proyek, tab langkah produksi, dan tata letak editor diperbarui.
- Naskah diarahkan ke hook, petunjuk, konflik, dan pengungkapan akhir yang didukung materi sumber.
- Adaptasi podcast mempertahankan makna dialog untuk ditulis ulang dan dimainkan satu narator.
- Pembawaan Gemini/ElevenLabs dapat dipilih; tag ekspresi diperluas dan dibersihkan untuk Supertonic.
- Panel Efek: saran AI per adegan, pencarian CC0 Freesound, dengarkan, pilih posisi dan atur volume.
- Efek tersambung ke pratinjau, timeline, ekspor, dan file catatan sumber audio. Token Freesound dapat diatur di Pengaturan.
- Duplikasi proyek memetakan ulang aset musik, overlay, efek, dan referensi adegan.

### Perbaikan
- Kelompok prompt tervalidasi disimpan atomik ke disk dan bisa dilanjutkan setelah buka ulang. Cache rusak atau tidak cocok dengan naskah diabaikan.
- Kegagalan autosave menghentikan AI/ekspor/navigasi; penyelesaian simpan atau cleanup proyek lama tidak lagi mengubah status proyek yang baru dimuat.
- Endpoint custom meminta JSON tanpa flag format terlebih dahulu. Error provider bertingkat ditampilkan ringkas; penolakan HTTP 400 generik tidak lagi diulang sebagai kegagalan format.
- Timeout visual dapat mengecil dari 6 ke 3 lalu 1 adegan. Konteks permintaan diringkas tanpa memotong narasi adegan yang diminta; timeout satu adegan menunjukkan nomor yang gagal dan jumlah hasil sementara.
- Prompt visual panjang memakai kelompok lebih kecil, perbaikan adegan yang kurang, dan dapat dilanjutkan setelah gagal selama aplikasi terbuka. Panel menampilkan progres, error menetap dan pembatalan; nomor adegan tetap divalidasi sebelum semua prompt diterapkan.
- Naskah 10 menit menerima kerangka yang lebih ringkas daripada daftar gambar; bagian adegan yang kurang dicoba ulang tanpa membuang bagian selesai.
- Progres AI penulis, pesan error menetap, pembatalan dan pencegahan permintaan naskah ganda ditambahkan. Skema juga ditulis dalam instruksi untuk proxy custom yang mengabaikan response_format.
- Instalasi memeriksa biner SQLite Node-API, menggantikan rebuild Electron yang tidak diperlukan dan gagal tanpa Python.
- Permintaan gambar dan potret Hugging Face memakai antrean satu per satu, termasuk saat tombol batch dipakai.
- WebP dinormalisasi ke PNG pada impor dan hasil penyedia gambar; respons Gradio hanya mengambil hasil selesai, mendukung URL relatif, dan membatasi waktu tunggu.
- Token Hugging Face hanya disertakan pada unduhan dari origin Space yang dipakai.
- Pemetaan pemeran menerima alias gelar/nama peran dan memulihkan tautan klip lama; prompt pendek menyisakan identitas setiap tokoh, pakaian, dan framing.
- Pemeriksaan gambar kosong/hitam diterapkan sebelum aktivasi dan ekspor; job produksi gagal menghentikan alur dengan pesan yang jelas.
- Dialog terstruktur masuk ke teks TTS/caption. Naskah lama bisa diperbaiki dan adegan berulang dipangkas tanpa menghapus riwayat aset.
- Efek otomatis kini benar-benar dipasang setelah narasi dan dalam "Kerjakan semua", dengan efek sintetis bawaan saat Freesound tidak tersedia.
- Efek otomatis mengikuti durasi adegan dan tidak digandakan; narasi yang berubah dibuat ulang dalam mode belum lengkap.
- Sinkronisasi Whisper mempertahankan caption yang sudah diedit atau dihapus manual, termasuk edit saat
  sinkronisasi sedang berjalan. Panel caption dan jumlah klip yang selesai mengikuti hasil sebenarnya.

## [1.0.0] - 2026-10-02

Rilis pertama aplikasi.

### Alur produksi
- Empat langkah: **Ide cerita → Naskah → Storyboard → Editor**, tersimpan otomatis di database lokal.
- Penyusun cerita memakai Gemini, OpenRouter, Groq, atau endpoint custom yang kompatibel dengan OpenAI. Daftar
  modelnya diambil langsung dari penyedia.
- Naskah bisa diubah, ditambah, dihapus, dan diurutkan ulang. Narasi boleh memuat tag ekspresi suara.
- Rencana visual dibuat dari naskah final: prompt gambar berlabel (dunia dan era, aksi, baju per adegan, hal yang
  harus dihindari), pemeran beserta lembar karakter, gerak kamera, transisi, dan arahan gerak video.
- 14 model gambar dan 34 model video Higgsfield, dengan perkiraan kredit dari endpoint `estimate`. Resolusi video
  bisa dipilih per proyek.
- Narasi dibuat dalam satu rekaman utuh (Gemini TTS atau ElevenLabs), lalu dipotong otomatis per adegan.
- Caption akurat dengan Whisper lokal (mode DTW). Klip lama bisa disinkronkan ulang dari tab Caption.
- Panel Musik bisa membuat prompt musik latar untuk Suno atau AI musik lain.

### Editor
- Pratinjau langsung dengan gerak kamera, transisi, caption karaoke, musik latar, dan overlay (logo, watermark,
  teks) yang bisa digeser di pratinjau.
- Timeline seperti editor video:
  - tarik tepi klip untuk mengatur panjangnya (video tidak bisa melebihi panjang aslinya);
  - geser dan potong suara, caption, musik, dan overlay;
  - **Potong** (S atau Ctrl+B) dan **Hapus** (Delete);
  - snap ke playhead dan sambungan;
  - overlay bertumpuk di baris masing-masing.
- Transisi diatur per sambungan dari tombol di antara klip. Panelnya punya pratinjau yang diputar berulang, durasi
  0,2–2 detik, dan tombol terapkan ke semua.
- Gerak kamera bisa diatur untuk klip gambar maupun video. Pratinjaunya diputar tanpa menggeser playhead.
- Caption:
  - 4 gaya dan pilihan tanpa caption;
  - 15 font (4 tegas, 9 kartun/komik, 2 tulisan tangan/elegan) dengan contoh di daftar;
  - ukuran, posisi, warna, dan kotak latar rounded;
  - teksnya bisa diedit langsung dan tersimpan otomatis.
- Suara: volume per klip dan volume narasi. Musik: volume, otomatis mengecil saat narasi, dipotong, dan digeser.

### Ekspor
- MP4 dirender dengan FFmpeg di komputer pengguna. Hasilnya sama dengan pratinjau karena aturan gerak, transisi,
  caption, dan potongan suara dipakai bersama (`src/shared/`).
- Gerak kamera halus memakai filter `perspective`. Caption memakai libass dengan kotak rounded, dan ukurannya
  sama dengan pratinjau.
- Proyek bisa diekspor berulang kali setelah diedit.

### Lainnya
- Kunci API milik pengguna (BYOK), disimpan terenkripsi dengan DPAPI Windows (`safeStorage`).
- Halaman Tentang aplikasi menampilkan versi dan informasi komponen.
- Salinan siap jalan dengan skrip START untuk Windows dan macOS.
- Dokumentasi pengembang: [AGENTS.md](AGENTS.md) dan folder [docs/](docs/README.md).

### Batasan yang diketahui
Lihat [docs/masalah-diketahui.md](docs/masalah-diketahui.md). Yang paling terasa:
- gerak kamera di atas video masih bergetar di pratinjau (hasil ekspor halus);
- belum ada undo/redo;
- Whisper dan installer baru tersedia untuk Windows.
# Perbaikan pembacaan podcast YouTube

- Error caption dan unduhan audio kini ditampilkan, termasuk timeout; tidak lagi diteruskan diam-diam ke transkripsi panjang.
- Mendukung normalisasi link mobile, Shorts, live, embed dan youtu.be; caption pendek tetap bisa dibaca.
- Mengaktifkan runtime Node bawaan Electron untuk yt-dlp yang mendukungnya, serta mengabaikan config global.
- Ambil ide menampilkan status dan error yang menetap, menyediakan retry, serta menjaga edit sinopsis saat AI berjalan.

# Pemulihan prompt saat server AI bermasalah

- Prompt visual mencoba ulang HTTP 500/502/503 maksimal dua kali per proses, dengan jeda 2 dan 5 detik serta status terlihat.
- Pembatalan menghentikan jeda; hasil yang sudah selesai tetap tersimpan. Error 400, autentikasi dan 429 tidak dicoba ulang otomatis oleh jalur ini.

# Tes menulis untuk AI penulis

- Pengaturan menyediakan Tes menulis dengan prompt contoh tetap dan hasil menetap, terpisah dari tes daftar model.
- Tes koneksi custom/Groq menghormati alamat dan kunci yang diberikan, serta menjelaskan bahwa kemampuan generate belum diuji.

# Narasi mengikuti jenis cerita

- Memperkuat arahan penulis untuk horor, misteri, drama, aksi, komedi dan materi faktual sesuai sinopsis, dengan ritme serta dialog yang mengalir.
- Menghapus aturan satu baris per gambar dan kewajiban setiap kalimat mendeskripsikan gambar; hook, antisipasi dan pengungkapan mengikuti alur.
- Membawa enam bagian terakhir termasuk dialog ke permintaan lanjutan, serta menjaga edit sumber selama perbaikan naskah.

# F5-TTS melalui Hugging Face

- Menambah pilihan F5-TTS dengan Space/endpoint terpisah, token Hugging Face bersama, sampel lokal dan transkrip referensi.
- Menambah tes kontrak Space tanpa upload suara; pembacaan audio dilakukan saat membuat narasi, dengan antrean serial dan pembatalan.
- Hasil WAV memakai jalur timeline/caption/ekspor yang sama. ID referensi berubah saat setting atau sampel diganti.
- Pengaturan menjelaskan pengiriman sampel ke Space serta lisensi nonkomersial checkpoint F5 Indo bawaan.

