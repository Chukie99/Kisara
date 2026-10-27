# Pengembangan

## Persiapan

- **Node.js LTS** (dikembangkan dengan Node 22) dan npm.
- Windows 10/11 x64 untuk build installer dan fitur Whisper. Aplikasi bisa jalan di macOS lewat `npm run dev`,
  tapi caption akurat (Whisper) belum tersedia di sana.
- Koneksi internet saat `npm install` (Electron mengunduh programnya sendiri; `ffmpeg-static` mengunduh FFmpeg
  sesuai OS).

```bash
npm install
npm run dev
```

`postinstall` menjalankan `tools/verify-native.cjs`, yang membuka database dalam memori untuk memeriksa
biner SQLite. `better-sqlite3` 13 menyertakan biner Node-API yang dipakai Node dan Electron, sehingga
`npmRebuild` dimatikan di konfigurasi installer. Jika nanti menambah dependensi native yang bukan Node-API,
evaluasi ulang pengaturan rebuild dan uji di Electron sebelum rilis.

Electron 44 mengunduh programnya saat pertama dipakai. Kalau `node_modules/electron/dist` kosong, jalankan
`node node_modules/electron/install.js`.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | mode pengembangan dengan hot reload renderer (main/preload dibuild ulang saat berubah) |
| `npm run typecheck` | TypeScript untuk main+preload+shared (`tsconfig.node.json`) dan renderer+shared (`tsconfig.web.json`) |
| `npm run build` | build produksi ke `out/` |
| `npm run preview` | jalankan hasil build |
| `npm run dist` | build + installer Windows NSIS ke `dist/Kisara-Setup-<versi>.exe` |

Alias impor: `@shared/*` → `src/shared/*` (semua proses), `@renderer/*` → `src/renderer/src/*`.

## Folder data saat mengembangkan

Mode pengembangan memakai folder data yang sama dengan aplikasi terpasang (profil lama yang terdeteksi,
atau `F:\Kisara` / `%APPDATA%\Kisara` untuk instalasi baru). Supaya
proyek dan kunci API asli tidak tersentuh saat bereksperimen, arahkan ke folder lain:

```powershell
$env:STUDIO_USER_DATA = "C:\temp\kisara-dev"; npm run dev
```

## Variabel lingkungan (hanya saat tidak dipaketkan)

| Variabel | Fungsi |
|---|---|
| `STUDIO_USER_DATA` | folder data alternatif |
| `STUDIO_CAPTURE_PLAN` | path file JSON rencana dev harness (lihat di bawah) |
| `STUDIO_LOG` | file untuk menampung `console` renderer dan error harness |
| `STUDIO_HF_BASE` | base URL Higgsfield tiruan (mock) supaya UI bisa diuji tanpa kredit |
| `STUDIO_WHISPER_URL` | URL model Whisper alternatif (misalnya server lokal) untuk menguji unduhan |

## Dev harness (pengujian otomatis)

Belum ada unit test. Perubahan diuji dengan menjalankan aplikasi sungguhan yang dikendalikan file JSON
(`src/main/devharness.ts`). Harness hanya aktif kalau aplikasi tidak dipaketkan dan `STUDIO_CAPTURE_PLAN` diisi.

```powershell
npm run build
$env:STUDIO_CAPTURE_PLAN = "C:\temp\plan.json"
$env:STUDIO_USER_DATA   = "C:\temp\userdata-uji"
$env:STUDIO_LOG         = "C:\temp\uji.log"
node_modules\electron\dist\electron.exe .
```

`plan.json` berisi langkah berurutan:

```json
[
  { "main": "seed", "wait": 1500 },
  { "main": "speech", "wait": 500 },
  { "js": "location.reload()", "wait": 2500 },
  { "js": "document.querySelector('article button')?.click()", "wait": 3000, "shot": "C:/temp/editor.png" },
  { "drag": { "selector": "div[aria-label^=\"Klip 1 \"]", "at": "right", "dx": 80, "fy": 0.2 }, "wait": 2000 },
  { "key": "Delete", "wait": 800 },
  { "js": "(async () => { const l = await window.api.projects.list(); console.log('CEK ' + l.length) })()", "wait": 500 },
  { "main": "export", "exportTo": "C:/temp/ekspor", "wait": 30000 },
  { "wait": 100, "quit": true }
]
```

| Langkah | Fungsi |
|---|---|
| `main: "seed"` | membuat proyek demo 4 klip dari gambar dan suara sintetis (tanpa API) |
| `main: "speech"` | mengganti suara demo dengan ucapan sungguhan (Windows SAPI) + waktu kata perkiraan |
| `main: "dialogue"` | ucapan SAPI dengan dialog yang disusun `composeSceneSpeech`, untuk mengecek teks/TTS/caption tanpa API |
| `main: "quality"` | memeriksa alias pemeran, perbaikan tautan lama, penolakan gambar hitam, blokir ekspor, dan pemangkasan adegan dengan riwayat aset tetap ada |
| `main: "videos"` | memberi semua klip video uji 6 detik (klip 1 diberi zoom kuat) |
| `main: "sounds"` | menambah efek nada sintetis 0,6 detik pada posisi 1,2 detik, tanpa API |
| `main: "mockSounds"` | mengganti IPC saran/pencarian/tambah efek dengan fixture lokal untuk pengujian panel tanpa kunci atau kuota; jalankan setelah `seed` dan `sounds` |
| `main: "mockVisuals"` | mensimulasikan progres prompt, gagal pada percobaan pertama jika `ok: false`, pembatalan, lalu keberhasilan. Memakai naskah proyek uji yang sudah ada; tanpa API |
| `size: [1180, 720]` | mengubah ukuran jendela untuk memeriksa tata letak minimum |
| `main: "overlays"` | menambah logo dan teks overlay demo |
| `main: "key"` + `provider`, `ok` | menyimpan kunci palsu dengan status tes lulus/gagal |
| `main: "export"` + `exportTo`, `projectId` | mengekspor proyek demo (atau proyek tertentu) ke folder |
| `js` | menjalankan JavaScript di halaman (boleh `async`); hasil `console.log` masuk ke `STUDIO_LOG` |
| `drag` | seret mouse sungguhan: `selector`, `at` (`left`/`right`/`center`), `dx`, `fy` (posisi vertikal 0–1) |
| `click` | klik mouse sungguhan: `selector`, `fx`, atau `pointJs` (JS yang mengembalikan `{x, y}`) |
| `key` | tekan tombol sungguhan, misalnya `"s"` atau `"Delete"` |
| `wait` | jeda sesudah langkah (ms) |
| `shot` | simpan screenshot jendela ke path PNG |
| `quit` | tutup aplikasi |

Tips:

- **Jangan** memanggil `location.reload()` di dalam fungsi `async` yang ditunggu; buat langkah tersendiri.
- `drag`, `click`, dan `key` memakai input Electron sungguhan (`sendInputEvent`), jadi pointer capture dan
  shortcut keyboard bekerja seperti dipakai manusia. Event buatan JavaScript tidak cukup untuk menyeret.
- Periksa isi halaman lewat `console.log` (misalnya tab aktif, nilai input), bukan hanya screenshot.
- Untuk menguji dengan data proyek asli, salin `studio.db` lewat backup SQLite ke folder uji, **kosongkan tabel
  `secrets`** di salinan, lalu salin folder proyeknya.

## Menguji modul bersama tanpa aplikasi

Modul `src/shared/*` murni TypeScript dan bisa dijalankan di Node:

```bash
npx esbuild src/shared/captions.ts --bundle --platform=node --format=cjs --outfile=tmp/captions.cjs
node -e "const c = require('./tmp/captions.cjs'); console.log(c.chunkWords([{text:'Halo',start:0,end:0.4}]))"
```

Cara ini dipakai untuk menguji pemenggalan caption, sorotan kata, dan getaran gerak kamera (dengan mengukur
posisi titik pada frame hasil FFmpeg).

## Memeriksa hasil ekspor

```bash
# durasi video dan audio harus sama dengan jumlah durasi klip
ffmpeg -i hasil.mp4 -map 0:v -c copy -f null -
ffmpeg -i hasil.mp4 -map 0:a -c copy -f null -
# cuplikan frame di detik tertentu
ffmpeg -ss 3.5 -i hasil.mp4 -frames:v 1 frame.png
```

FFmpeg ada di `node_modules/ffmpeg-static/ffmpeg.exe`. Graph filter terakhir ditulis ke `tmp/export-<id>/graph.txt`
selama ekspor berjalan.

## Debugging

- Mode harness `mockImagePicker` membuat fixture WebP dari gambar demo dan mengganti dialog OS; pemanggilan
  `window.api.assets.pickClipImage` tetap melewati IPC impor sebenarnya. Gunakan hanya dengan data sementara.

- DevTools renderer: tekan `Ctrl+Shift+I` di mode pengembangan.
- Log proses utama muncul di terminal `npm run dev`.
- Error dari IPC muncul sebagai toast; pesannya berasal dari `throw new Error('...')` di proses utama.

## Versi dan rilis

1. Naikkan versi: `npm version 1.1.0 --no-git-tag-version` (mengubah `package.json` dan `package-lock.json`).
   Halaman About membaca versi dari `app.getVersion()`.
2. Catat perubahan di `CHANGELOG.md`.
3. `npm run typecheck` dan `npm run build`.
4. `npm run dist` → `dist/Kisara-Setup-<versi>.exe`.

Yang ikut dipaketkan (lihat `electron-builder.yml`): `out/`, FFmpeg (di luar asar), `resources/fonts` → `fonts`,
`resources/whisper` → `whisper`, `resources/licenses` → `licenses`, dan lisensi FFmpeg →
`licenses/FFmpeg-LICENSE.txt`.

### Membagikan kode tanpa installer

Folder proyek bisa dibagikan tanpa `node_modules`, `out`, dan `dist`. Penerima cukup menjalankan `npm install`
lalu `npm run dev`. Salinan distribusi juga bisa diberi skrip `START.bat` (Windows) atau `START.command` (macOS)
yang memasang dependensi, mengunduh Electron, membuild kalau `out/` belum ada, lalu membuka aplikasi.
