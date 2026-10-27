# Alur produksi

Satu proyek melewati empat langkah (`Project.step`): **1 Ide → 2 Naskah → 3 Storyboard → 4 Editor**, lalu ekspor.

```
Ide cerita ──LLM──► Naskah (adegan + narasi) ──LLM──► Rencana visual per adegan
                                                     │
            ┌────────────────────────────────────────┼─────────────────────────┐
            ▼                                         ▼                         ▼
   Lembar karakter (Higgsfield)          Gambar klip (Higgsfield)       Narasi satu rekaman (TTS)
            └────────── referensi ──────────────────►│                         │
                                                     ▼                         ▼
                                          Video AI (opsional)        Potong per adegan + Whisper
                                                     └──────────► Editor ◄─────┘
                                                                     │
                                                                  FFmpeg → MP4
```

## 1. Ide → naskah (`generateScript`, `src/main/story.ts`)

- Masukan: sinopsis, target durasi, bahasa.
- Jumlah adegan: `clipCountFor(durasi)` = sekitar satu adegan per 5,5 detik (minimal 3).
- Skema JSON keluaran: `{ title, scenes: [{ title, story, narration }] }`.
- Narasi mengikuti anggaran kata dan kecepatan penyedia TTS. Gemini/ElevenLabs boleh memakai satu dua tag ekspresi berbahasa Inggris (`<short pause>`,
  `<long pause>`, `<chuckles>`, `<sigh>`, `<gasp>`, `<whispers>`). Daftar tag: `VOICE_TAGS` di `shared/speech.ts`.
- Hasil disimpan dengan `replaceScript`. Durasi awal tiap klip diperkirakan dari jumlah kata
  (`estimateNarrationMs`: sekitar 2,6 kata per detik).

Pembuka diarahkan ke pertanyaan konkret dalam tiga detik pertama, petunjuk ditanam lebih awal, lalu konflik
dan pengungkapan akhir. Untuk materi faktual atau podcast, twist harus didukung sumber; kalau tidak ada,
gunakan penemuan yang bermakna tanpa mengarang fakta. Dialog penting diparafrasakan dan dibaca satu narator
dengan atribusi lisan serta perubahan intonasi. Ringkasan podcast mempertahankan makna percakapan dan
identitas pembicara, termasuk saat transkrip panjang diringkas bertahap. Adaptasi tetap memerlukan hak pakai sumber.

Di langkah **Naskah** pengguna boleh mengubah, menambah, menghapus, dan mengurutkan adegan.

## 2. Naskah → rencana visual (`generateVisuals`)

Skema JSON keluaran:

```
world                         satu kalimat dunia cerita (tempat, era, teknologi, siapa orangnya)
characters[]                  { name, identity (tubuh/wajah, tanpa baju), outfit (baju bawaan) }
scenes[]                      { scene, setting, action, wardrobe[{name, source: reference|custom, outfit}],
                                framing, avoid, characters[], camera, strength, motion, transition }
```

Aturan penting di system prompt (dibuat setelah gambar keluar tidak sesuai cerita):

1. Setiap adegan berdiri sendiri: dunia/planet/era selalu disebut, karena model gambar tidak membaca naskah.
2. Narasi yang umum diubah jadi momen konkret yang bisa digambar.
3. Orang disebut "human"; kata yang bisa dibaca sebagai makhluk fantasi ("Martian", "alien", "-born") dilarang.
4. Baju harus cocok dengan tempatnya; "custom" untuk baju khusus adegan, "reference" untuk baju bawaan pemeran.

`visualText()` menyusun prompt berlabel yang disimpan di `clip.visualPrompt` dan bisa diedit pengguna:

```
Setting: ...
Action: ...
Wardrobe: Leo - custom for this scene: light-blue scrubs; the teenager - custom for this scene: grey tunic
Framing: ...
Avoid: Earth landscape, aliens, spacesuits indoors
```

Mode `missing` hanya menyusun adegan yang naskahnya berubah sejak rencana terakhir (`needsVisual`); mode `all`
menyusun ulang semuanya. Pemeran lama tidak ditimpa; pemeran baru ditambahkan berdasarkan nama.

## 3. Gambar, lembar karakter, video (`src/main/generation.ts`)

- **Lembar karakter** (`sheetPrompt`): gaya + deskripsi pemeran, tampak depan/tiga perempat/samping, latar polos.
  Dibuat lebih dulu kalau model gambar menerima referensi (`maxRefs(model) > 0`).
- **Gambar klip** (`clipPrompt`): adegan dulu, lalu pemeran (tubuh dari lembar karakter, baju mengikuti baris
  `Wardrobe`), lalu gaya visual, lalu baris `Avoid` sebagai "Must not appear", lalu format frame. Lembar karakter
  dikirim sebagai gambar referensi.
- **Video AI** (`generateClipVideo`): gambar klip + `videoPrompt` (atau prompt cadangan). Setiap prompt video
  diakhiri `NO_MUSIC` ("Silent clip: no background music...") dan audio dimatikan lewat parameter kalau
  modelnya punya (`sound: off`, `generate_audio: false`). Durasi video = durasi terpendek model yang menutup
  panjang klip (`fitDuration`), resolusi dari `project.videoResolution`.
- Hasil diunduh ke folder proyek, dicatat di `assets`, lalu klip diperbarui lewat `patchClip` + `emit.clip`.

Detail API dan katalog model: [layanan-ai.md](layanan-ai.md).

## 4. Narasi (`src/main/narration.ts`)

Suara dibuat **dalam satu rekaman utuh** untuk banyak adegan sekaligus, lalu dipotong per adegan, supaya suara
dan intonasinya konsisten. (Rekaman per klip menghasilkan suara yang sedikit berbeda tiap klip.)

- **Gemini TTS**: adegan digabung dengan `<long pause>` di antaranya, per bagian maksimal sekitar 240 detik
  (`GEMINI_PART_SEC`).
- **ElevenLabs**: per bagian maksimal 2.400 karakter (`ELEVEN_PART_CHARS`), dengan `previous_text`/`next_text`
  agar intonasi bersambung. Waktu per kata datang dari API (alignment).
- **Pembawaan**: `editor.voiceDelivery` menyimpan natural/dramatis/hangat/tegang. Gemini menerima arahan gaya
  melalui metadata suara. ElevenLabs memakai pengaturan sesuai model dan tag yang didukung; respons emosinya
  tetap bergantung pada suara/model. Supertonic mengikuti preset studio lokal, bukan arahan emosi cloud;
  tag dibuang agar tidak dibaca sebagai kata dan jeda paragraf tetap dipertahankan.
- **Titik potong antar-adegan**:
  - dengan Whisper: `cutsFromWords` (`cuts.ts`) memotong di jeda yang tumpang-tindih dengan celah antara kata
    terakhir satu adegan dan kata pertama adegan berikutnya, tidak pernah di tengah kata;
  - tanpa Whisper: `chooseCuts`, pemrograman dinamis atas jeda dari `silencedetect` FFmpeg dan perkiraan posisi
    dari panjang teks.
- Setiap potongan disimpan sebagai WAV dengan `meta.words`, dan durasi klip diatur ke panjang potongannya.
  Potongan suara (`voiceInMs` dll.) direset.

## 5. Caption akurat (Whisper lokal)

- `src/main/whisper.ts` menjalankan `whisper-cli.exe` dengan model **Whisper Small** (487.601.967 byte, dicek
  SHA-256, diunduh ke `models/whisper`).
- Argumen: `-ml 1 -sow` (satu kata per segmen), `-ojf` (JSON lengkap), `-nfa -dtw small` (waktu kata dari
  DTW). **Tanpa `--prompt`**: prompt berisi naskah membuat Whisper berhalusinasi mengulang kata.
- `align.ts` mencocokkan kata **naskah** ke kata yang didengar Whisper (edit distance). Ejaan caption tetap dari
  naskah; hanya waktunya dari Whisper.
- Berjalan otomatis setelah narasi Gemini (`whisperAuto`), atau manual lewat tab Caption
  (`syncCaptions`, mode `stale`/`all`). Hasil ditandai `meta.timedBy = 'whisper-dtw'`.

## 6. Prompt musik (`generateMusicPrompt`)

LLM membuat `{ title, style, exclude, description, reason }` untuk dipakai di Suno, Udio, atau ElevenLabs Music.
Hasilnya disimpan di `editor.musicPrompt`. File musik hasil AI itu lalu dipilih lewat tab Musik.

## 7. Efek suara mengikuti cerita

`story.soundPlan` mengusulkan maksimal satu efek konkret per adegan; hasilnya disimpan di
`editor.soundPlan`. Saran tidak mengunduh audio. Pengguna mencari, mendengar, dan memilih hasil di panel
**Efek**. Pilihan ditempatkan di awal adegan atau posisi playhead, lalu waktu dan volumenya bisa diubah.
`editor.sfx` diputar pratinjau dan dicampur saat ekspor, memakai batas durasi yang sama (`shared/sound.ts`).
Daftar pembuat, lisensi, dan sumber audio ditulis sebagai `*-sumber-audio.txt` di samping MP4.

Pencarian baru dibatasi ke CC0; periksa halaman sumber karena lisensi bukan jaminan bebas klaim otomatis.
Lisensi file berbeda dari syarat penggunaan API Freesound, yang perlu diperiksa tersendiri untuk penggunaan komersial.

### Efek otomatis dan dialog yang benar-benar dibacakan

`sfx.auto` menjalankan job `sfx` yang mencari dan mengunduh audio CC0, lalu memasang track nyata. Tahap ini
juga dijalankan setelah narasi dan dari "Kerjakan semua" kecuali `editor.autoSound === false`. Tanpa token,
hasil pencarian, atau akses LLM, aksi yang dikenali dapat memakai efek sintetis bawaan (`builtinSounds.ts`):
ketukan, langkah, angin, derit, dering, lonceng, dan ketegangan. Efek yang tidak bisa dicocokkan tidak diganti
dengan suara acak. Posisi track otomatis memakai `clipId` dan `offsetSec`; `soundSpan` menghitung awal serta
akhir untuk pratinjau dan ekspor mengikuti durasi klip terbaru. Efek manual tidak ditimpa dan pemanggilan
ulang tidak menggandakan track. Pilihan otomatis dapat dimatikan di panel Efek.

Naskah AI punya `dialogue[]` per adegan: atribusi pembicara, teks, dan emosi. `composeSceneSpeech` menggabungkan
narasi dan dialog ke `Clip.narration` sebelum disimpan. Karena itu narasi, TTS, dan caption menerima dialog
yang sama, tetap dengan satu narator. Properti ini bukan kolom database baru. Supertonic menerima teks tanpa tag.

Tombol "Perbaiki naskah & dialog" menjalankan `story.refineScript`: hasil memakai nomor adegan sumber,
boleh membuang adegan berulang, dan mempertahankan ID serta aset adegan yang masih dipakai. Riwayat aset
tidak dihapus. Pemetaan tidak valid, dialog kosong, dan edit bersamaan ditolak sebelum perubahan diterapkan.
Visual yang sumbernya berubah perlu disusun ulang, lalu gambar dan narasinya dibuat ulang.

### Ketepatan prompt dan pemeriksaan gambar

Nama pemeran dipadankan melalui alias konservatif (`characters.ts`), misalnya Ari/Ustaz Ari dan
The Father/Ari's Father. Nama yang tidak dikenali dalam daftar pemeran hasil LLM ditolak; tidak dibuang
diam-diam. Adegan lama bisa dipulihkan dari nama pada Action/Wardrobe. Prompt pendek membagi anggaran
teks per tokoh serta menyisakan pakaian, aksi, lokasi, dan framing. Model tanpa referensi gambar tetap
tidak menjamin wajah identik; hasil perlu ditinjau.

Setting menyertakan dunia cerita. Perencanaan menolak penambahan es/salju ke cerita tropis yang tidak
menyebutkannya dan mengarahkan satu momen visual, tanpa balon dialog atau teks. `imageQuality.ts` menolak
gambar kosong, hitam polos, transparan, atau tidak terbaca saat generate, impor, pemilihan versi, dan
ekspor. Pemeriksaan piksel ini bukan OCR atau pemeriksaan identitas: tulisan dan wajah yang keliru masih
harus diperiksa manusia. "Kerjakan semua" memeriksa status job; job gagal tidak lagi dianggap selesai.

`visualSourceOf` juga memakai versi aturan serta alur dan dialog yang diucapkan; rencana AI lama disusun
ulang sekali agar aturan iklim dan kontinuitas baru benar-benar digunakan. Aset AI menyimpan
`meta.imageFingerprint` (versi aturan, prompt visual, gaya, rasio, identitas pemeran)
dan audio menyimpan `meta.speechFingerprint` (penyedia, suara, pembawaan). Aturan bersama mendeteksi hasil
basi di main dan renderer. Hasil AI lama tanpa penanda diperbarui sekali agar perbaikan prompt benar-benar
dipakai; gambar impor lokal dipertahankan. Pipeline menerbitkan bundle rencana sebelum job berjalan supaya
autosave renderer tidak menulis kembali prompt lama, lalu mengembalikan bundle terbaru saat selesai.

## Menambah atau mengubah prompt

- Prompt LLM ada di `story.ts`; prompt gambar dan video di `generation.ts`.
- Skema JSON harus memenuhi mode strict OpenAI (semua properti `required`, `additionalProperties: false`) dan
  tetap bisa dipakai Gemini.
- Uji dengan beberapa ide nyata. Kalau model gambar salah tafsir, perbaiki aturan di system prompt (umum),
  jangan menambal satu kasus.
