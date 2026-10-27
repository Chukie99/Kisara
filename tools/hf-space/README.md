---
title: Kisara Image
emoji: 🎬
colorFrom: indigo
colorTo: purple
sdk: gradio
sdk_version: 5.43.1
app_file: app.py
pinned: false
suggested_hardware: zero-a10g
---

# Kisara — Image Space

Draws the clip pictures for [Kisara](https://github.com/) on ZeroGPU.

Kisara calls the `generate` function through this Space's Gradio API, so the app gets full-quality
images for free — no credits, no API keys.

## Membuat Space-nya

1. Buka <https://huggingface.co/new-space>.
2. Isi **Space name** (misalnya `kisara-image`) dan pilih **Gradio** sebagai SDK.
3. Buka **Settings → Hardware** dan pilih **ZeroGPU** (gratis untuk akun pribadi).
4. Unggah tiga file dari folder ini: `app.py`, `requirements.txt`, `README.md`.
5. Tunggu sampai status Space-nya **Running**.
6. Di Kisara: Pengaturan → Gambar dan video → **Hugging Face Space** → isi nama Space
   (`pengguna/kisara-image`) → klik **Simpan dan tes**.

## Memilih model

`app.py` mencoba model berikut **berurutan**, dan berhenti di yang pertama berhasil dimuat:

| # | Model | Gated? | Kualitas | Unduhan | Catatan |
|---|---|---|---|---|---|
| 0 | *isi variabel `MODEL_ID`* | — | — | — | Kalau diisi, ini yang dicoba paling awal. |
| 1 | `black-forest-labs/FLUX.1-schnell` | **Ya** | Terbaik | ±24 GB | Butuh `HF_TOKEN`, lihat di bawah. |
| 2 | `Alpha-VLLM/Lumina-Image-2.0` | Tidak | Tinggi | ±21 GB | Arsitektur modern (DiT), paling dekat ke FLUX. |
| 3 | `Efficient-Large-Model/Sana_1600M_1024px_diffusers` | Tidak | Bagus | ±8 GB (fp16) | Paling kecil, paling cepat dimuat. |
| 4 | `playgroundai/playground-v2.5-1024px-aesthetic` | Tidak | SDXL | ±17 GB | Jaring pengaman terakhir, sekelas SDXL. |

> **Model mana yang sedang jalan?** Buka halaman Space-nya — kalimat paling atas menyebut namanya.
> Kisara juga menampilkannya saat kamu klik **Simpan dan tes** di Pengaturan, misalnya
> *"Terhubung · model aktif: black-forest-labs/FLUX.1-schnell"*.

**Penting soal kuota disk.** Space mengunduh bobot model ke disk-nya yang terbatas. Kalau sebuah model
gagal di tengah unduhan, sisa file-nya bisa memakan ruang dan membuat model berikutnya ikut gagal.
Kalau Space macet di model yang sama terus, lakukan **Factory reboot** dulu, lalu isi `MODEL_ID`
langsung ke model yang kamu mau supaya tidak ada unduhan yang terbuang.

Untuk memaksa satu model, isi **Space variable** `MODEL_ID` (Settings → Variables and secrets),
misalnya `Alpha-VLLM/Lumina-Image-2.0`. Model itu dicoba lebih dulu; sisanya tetap jadi cadangan.

Di log container akan terlihat baris `[kisara] READY: <model>` — itu menandakan model mana yang dipakai.

### Kalau ingin memakai FLUX resmi (gated)

Space akan gagal di model nomor 1 dengan `GatedRepoError: 401` sampai dua hal ini dilakukan:

1. Buka <https://huggingface.co/black-forest-labs/FLUX.1-schnell> dan klik
   **Agree and access repository** (persetujuannya otomatis).
2. Buat token baca di <https://huggingface.co/settings/tokens>, lalu di Space buka
   **Settings → Variables and secrets → New secret**, nama **`HF_TOKEN`**, isinya token itu.
3. **Restart** Space-nya.

Kalau langkah ini dilewati, Space otomatis memakai model nomor 2 — tidak perlu tindakan apa pun.

## Catatan

- **`sdk_version: 5.43.1` sengaja dikunci.** Gradio 6.x meminta `huggingface-hub >= 1.16`, sementara
  `transformers 4.57.6` meminta `< 1.0`. Kalau `sdk_version` tidak dikunci, Space memakai Gradio terbaru dan
  build-nya gagal dengan "conflicting dependencies". Versi ini sama dengan Space FLUX.1-schnell resmi.
- Nama Space dipakai sebagai alamat: `pengguna/kisara-image` → `pengguna-kisara-image.hf.space`.
- Space publik tidak butuh token. Kalau Space-nya **private**, isi juga token Hugging Face
  (Settings → Access Tokens, izin `read`) di Kisara.
- ZeroGPU gratis punya kuota harian dan bisa mengantre saat ramai. Kalau kena, tunggu sebentar
  atau pakai provider lain di Kisara.
- Model diunduh saat Space pertama kali dijalankan, jadi tunggu sampai **Running** sebelum dipakai.
