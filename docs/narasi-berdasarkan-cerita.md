# Arahan narasi berdasarkan cerita

Keluhan: narasi cerita mistis terasa lurus dan terlalu melaporkan kejadian. Arahan lama memaksa satu baris
per gambar dan setiap kalimat harus dapat difilmkan, serta konteks permintaan lanjutan hanya mengambil
dua bagian narator tanpa dialog. Hal ini dapat mendorong ritme seragam dan sambungan cerita yang lemah.

Arahan kini membedakan situasi visual pada `story` dengan prosa yang didengar pada `narration`. Genre
disimpulkan dari sinopsis, tanpa menambah dropdown atau mengubah skema proyek. Horor mengikuti
kejanggalan, penjelasan sementara, reaksi dan konsekuensi; detail supernatural dan ambiguitas yang sudah
disetujui tetap dijaga. Misteri memakai petunjuk dan perubahan pemahaman; drama mengikuti kebutuhan
tokoh; aksi, komedi dan materi faktual mempunyai penekanan sendiri. Materi faktual tidak diberi dialog
atau pengungkapan yang dikarang. Jumlah kata menjadi rata-rata, bukan panjang kalimat yang seragam.

Tidak semua adegan harus memberi kejutan atau hook. Tidak ada hook/recap/ending baru di tiap kelompok
permintaan. Akhir mengikuti sinopsis dan petunjuk awal, bukan twist acak atau penutup berulang. Dialog
punya fungsi dalam keputusan tokoh dan tidak mengulang narator. Konteks enam adegan terakhir memakai
ucapan hasil `composeSceneSpeech`, termasuk dialog; adegan valid di kelompok repair ikut menjadi konteks.

Arahan yang sama dipakai refinement. ID adegan dipertahankan dan sumber yang diedit selama permintaan
berjalan memblok penerapan hasil. Materi tanpa percakapan tidak lagi dipaksa memiliki dialog. TTS,
integrasi F5, efek suara, aset dan proyek pengguna tidak diubah otomatis oleh perbaikan ini.

Verifikasi: `narrative-voice-checks.cjs` memakai LLM tiruan untuk memeriksa penyampaian arahan genre,
43 adegan dengan akhir yang utuh, dialog dari adegan 8 terbawa ke kelompok berikutnya, ucapan lokal tanpa
tag, refinement nonfiksi tanpa percakapan paksa dan penolakan hasil ketika bahasa sumber berubah.
Regresi story/sound-plan, refinement ID, kerangka 23 bagian menjadi 86 adegan, validasi Flow/TXT/DOCX dan
pelestarian draf saat jawaban gagal lolos. Typecheck dan build lolos. Tes ini memeriksa perilaku kode dan
masukan LLM; kualitas sastra dan tingkat ketegangan perlu diperiksa dari hasil model sebenarnya.

Harness aplikasi `narrative-ui.log` juga lolos untuk progres, error menetap, pembatalan dan perpindahan
ke langkah Naskah dengan 86 adegan serta timestamp. Screenshot halaman diperiksa. Fixture UI menguji
alur aplikasi, bukan kualitas tulisan model asli.

Untuk proyek yang sudah ada, tinjau **Perbaiki naskah & dialog** di langkah Naskah. Arahan baru juga
berlaku saat menyusun naskah baru. Perubahan narasi dapat membuat suara/prompt lama tidak cocok lagi;
tinjau dan perbarui aset terkait sebelum ekspor.
