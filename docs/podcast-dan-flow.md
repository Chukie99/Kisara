# Podcast → naskah bertimestamp → Google Flow

1. Tempel link YouTube atau transkrip podcast pada beranda / langkah Ide cerita, lalu pilih **Ambil ide**.
2. Tinjau dan edit judul, ide fiksi, serta sinopsis. Materi sumber dipakai untuk premis; nama tokoh, tempat,
   detail kejadian, dan kalimat dibangun ulang secara koheren. Ini bukan mode dokumenter faktual.
3. Pilih durasi (hingga 10 menit) dan gaya visual, lalu susun naskah. Setiap adegan mempunyai nomor dan rentang
   waktu. Timestamp merupakan label terpisah, sehingga tidak dibacakan TTS.
4. Di Naskah, buka panel **Naskah & prompt Google Flow** dan pilih **Susun/perbarui prompt**.
   Tidak diperlukan kunci layanan gambar atau TTS untuk menyiapkan panduan; hanya layanan penulis AI.
5. Salin prompt per adegan, atau ekspor **TXT** / **DOCX**. Salin hanya isi prompt ke Google Flow;
   nomor, waktu, judul, dan narasi merupakan panduan urutan, bukan teks yang perlu digambar.

## Sumber data dan waktu

- `editor.storyBrief` menyimpan ide fiksi dan judul sumber; tidak ada kolom/migrasi klip baru.
- `shared/flow.ts` menjadi sumber baris berurutan untuk UI, clipboard, TXT/DOCX, dan label waktu JSON Colab.
  Waktu dihitung dari akumulasi `Clip.durationMs` dalam milidetik; label ditampilkan sebagai menit:detik.
- Sebelum ada suara, durasi adalah perkiraan pembacaan. Setelah TTS selesai, durasi adegan mengikuti audio.
  Edit durasi, urutan, atau suara mengubah waktu berikutnya; ekspor ulang panduannya setelah perubahan.
- Prompt Flow menyertakan gaya lengkap, rasio, identitas tokoh, pakaian dan rencana adegan. Ia tidak memakai
  pemangkasan prompt penyedia SDXL. Identitas visual tetap perlu ditinjau saat hasil gambar dibuat di Flow.
- Ekspor ditolak jika ada narasi kosong, prompt hilang, atau prompt sudah tidak cocok dengan naskah.
- JSON Colab tetap tersedia di Storyboard untuk notebook lama, dengan metadata waktu/narasi tambahan.

## Pemrosesan AI dan batasan

Transkrip panjang diringkas per bagian sebelum diadaptasi. Bagian kosong tidak boleh dilewati diam-diam.
Transkripsi lokal yang hanya membaca awal video tetap ditandai parsial. Jika video tidak dapat diambil,
pengguna dapat menempelkan teks transkrip langsung.

Naskah panjang diawali kerangka alur lengkap (diminta 8–12 bagian), lalu dikembangkan maksimal 8 adegan per
permintaan. Jumlah bagian kerangka tidak harus sama dengan jumlah gambar: kerangka 23 bagian dapat
dikembangkan menjadi 86 adegan. Jawaban yang kurang dilengkapi hanya untuk ID adegan yang hilang, maksimal
4 adegan per permintaan perbaikan. Rencana visual
dibuat maksimal 6 adegan per permintaan, dengan perbaikan maksimal 3 adegan dengan daftar pemeran berkelanjutan. Nomor/jumlah jawaban harus
cocok persis dengan adegan yang diminta; jangan menebak pasangan dari urutan jawaban. Prompt diterapkan
bersama setelah seluruh bagian valid. Kelompok valid disimpan atomik dalam berkas checkpoint per proyek agar permintaan yang gagal atau dibatalkan bisa dilanjutkan setelah aplikasi dibuka ulang. Perubahan naskah/gaya/pemeran membatalkan hasil sementara. Panel Google Flow menampilkan progres, pembatalan, dan error menetap, termasuk sesudah halaman dibuka ulang. Edit pengguna yang terjadi saat AI bekerja tidak boleh ditimpa.

Panel status Ide cerita menampilkan tahap AI penulis, jumlah adegan selesai, waktu tunggu, pembatalan, dan
pesan gagal yang tetap terlihat. Permintaan per proyek dibagi dengan pemanggil lain agar tidak berjalan
ganda. Satu permintaan ke model dibatasi 3 menit; pembatalan diteruskan ke provider. Hugging Face dan
Cloudflare tidak dipakai untuk menyusun naskah. Endpoint custom selalu mendapat skema dalam instruksi,
karena sebagian proxy menerima `response_format` tanpa menerapkannya.

Kualitas alur dan adaptasi tetap bergantung pada model. Perubahan nama dan prompt AI tidak memberikan
jaminan hak adaptasi; lihat [hak-pakai-konten.md](hak-pakai-konten.md).

## Verifikasi

Mode dev harness `mockPodcast` menguji perpindahan hasil ide ke UI/proyek tanpa API. `flow` menyiapkan tiga
adegan dengan waktu 00:00, 00:05, dan 00:09. `mockFlowSave` mengganti dialog OS agar ekspor IPC sebenarnya
menulis ke data sementara. Uji bersama `seed` dan `quality`, memakai `STUDIO_USER_DATA` terpisah.

Jika kelompok 6 adegan melewati batas 3 menit, visual mencoba kelompok 3 adegan dan mempertahankan ukuran kecil untuk kelanjutannya. Jika tiga adegan masih timeout, permintaan turun menjadi satu adegan dan mempertahankan ukuran tersebut saat dilanjutkan. Timeout pada satu adegan menampilkan error dengan nomor adegan dan jumlah hasil sementara; pembatalan tidak memicu percobaan ulang. Konteks keseluruhan memakai ringkasan alur per adegan, sementara narasi dan alur lengkap dikirim hanya untuk adegan yang diminta.

## Paket 10 prompt dan paragraf narasi

Panel Naskah memiliki tiga tampilan: **Panduan adegan**, **Paket 10 prompt**, dan **Narasi per adegan**. Paket memakai nomor global 01–10, 11–20, dan seterusnya; 86 adegan menghasilkan 9 paket dengan 6 prompt pada paket terakhir. Setiap paket hanya berisi instruksi Agent dan prompt gambar, tanpa teks narasi atau timestamp. Nomor SCENE adalah penanda tugas, bukan tulisan dalam gambar. Aktifkan Agent di Flow sebelum mencoba paket. Instruksi meminta aset terpisah, tetapi tidak menjamin kemampuan atau hasil Flow dan tidak mengirim permintaan ke Google secara otomatis.

Tab Narasi menampilkan satu paragraf untuk satu adegan, dengan nomor gambar dan rentang waktunya. Salin paragraf tunggal atau seluruh narasi; salinan dan ekspor narasi TXT/DOCX berisi hanya teks ucapan dengan satu baris kosong antarparagraf. Label, judul, timestamp, tag ekspresi, dan prompt gambar tidak ikut dibacakan. Ini tidak menulis ulang naskah atau mengubah durasi audio. Narasi bisa diekspor sebelum gambar/prompt siap. Ekspor panduan lengkap tetap menyertakan nomor/waktu dan prompt. Ekspor paket hanya memvalidasi adegan dalam paket terpilih.

## Nama gambar dan kartun Indonesia

Paket Agent membawa `ASSET NAME` dari judul adegan asli, misalnya `001 - Kasir Baru`, tanpa menerjemahkannya ke Inggris. Agent diminta menamai aset segera setelah membuatnya dan menjawab dengan daftar hasil berbahasa Indonesia. Nama/nomor adalah metadata, bukan tulisan yang dicetak pada gambar. Nama unduhan aktual tetap bergantung pada kemampuan Flow. Tab **Daftar gambar** menyediakan nama yang bisa disalin, pasangan timestamp/paragraf, serta ekspor TXT/DOCX sebagai pegangan jika penamaan Flow tidak sesuai.

Pilihan **Kartun Indonesia sederhana** berlaku khusus pada prompt Flow. Ia memakai gambar 2D datar, garis tebal sedikit tidak rata, warna solid, wajah sederhana dan latar minim detail. Casting diarahkan ke warga Indonesia sehari-hari dengan variasi ciri Asia Tenggara, warna kulit kuning langsat–sawo matang, rambut gelap dan pakaian sesuai cerita. Deskripsi visual lama yang terlalu realistis diturunkan prioritasnya. Preset ini dapat langsung diterapkan pada prompt yang sudah siap, tanpa permintaan AI baru, tanpa menulis ulang narasi dan tanpa mengubah gaya proyek/video yang sudah ada. Simpanannya ada di `editor.flowLook`. Kualitas hasil dan kepatuhan model tetap perlu diperiksa di Flow.
