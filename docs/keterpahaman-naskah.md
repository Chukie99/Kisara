# Alur naskah yang dapat diikuti pendengar

Penyusunan naskah dan Perbaiki naskah & dialog sekarang melewati pembacaan lintas adegan sebelum database diperbarui. Arahan bersama di src/main/editorial.ts dipakai penulis, editor, pemeriksa opsional, serta intake faktual. Aturan membedakan fakta dengan fiksi; tidak membatasi semua topik pada struktur finance atau horor.

## Kontrak

1. Penulis mempersempit pertanyaan atau konflik sesuai durasi, menjelaskan istilah dan penghubung yang diperlukan, mempertahankan batas klaim dan menjawab hook. Adegan adalah batas visual; jumlah kata rata-rata tidak berarti kalimat harus sama panjang.
2. Pembaca AI melihat seluruh ucapan berurutan. Temuan dibatasi 12, harus menunjuk nomor adegan sah dan kutipan persis dari teks ucapan. Temuan menilai masalah konkret, bukan selera atau jaminan fakta.
3. Bila ada temuan, adegan terkait beserta tetangga diperbaiki sekali dalam kelompok maksimal 8. Urutan dan jumlah adegan tetap; sourceScene lama tetap milik adegan asli pada refinement. Semua konteks tetap tersedia.
4. Seluruh hasil dibaca ulang. Temuan tersisa, respons tidak sah, server gagal, pembatalan penyusunan atau edit bersamaan menghentikan penerapan. Tidak ada loop perbaikan tanpa batas, pergantian provider otomatis, atau fallback ke draft yang belum diperiksa.
5. Generasi memakai batas tiga menit per permintaan dan status pemeriksaan/perbaikan yang terlihat. Refinement menampilkan status menunggu dan kegagalan persisten di halaman Naskah. Permintaan tambahan menggunakan model dan kuota pengguna yang sama; UI menyebutkannya. Waktu dan kualitas tetap tergantung model.

Ini pemeriksaan editorial AI, bukan riset independen. Model yang sama masih bisa melewatkan masalah, membuat saran keliru, atau menolak naskah yang sebenarnya cukup jelas. Fiksi supernatural tidak diminta bukti ilmiah. Proyek lama tidak ditulis ulang otomatis: pengguna memilih Perbaiki naskah & dialog, meninjau narasi lengkap, lalu memperbarui prompt visual dan suara yang berubah.

## Visual

Arahan visual menggambarkan objek, proses atau perbandingan yang sedang dijelaskan, dengan satu fokus yang jelas. Tokoh dalam bahaya tidak lagi menjadi kewajiban adegan pembuka. Tidak mengarang grafik, angka, foto sejarah atau panah hubungan untuk membuktikan klaim. Ilustrasi tetap mengikuti gaya pilihan pengguna. Versi fingerprint visual menjadi v2 sehingga checkpoint dari arahan lama tidak diteruskan sebagai hasil baru. Prompt yang sudah disetujui di proyek tetap ada sampai pengguna menyusunnya ulang.

Pemeriksaan lokal menandai beberapa istilah lintas topik dan kalimat sebab-akibat terlalu pasti sebagai petunjuk. Daftar ini tidak lengkap dan bukan pengganti editor semantik. Kalimat negasi/bersyarat dikecualikan dari pola kepastian sederhana. Versi fingerprint tinjauan opsional juga berubah agar laporan lama diminta diperbarui.

## Verifikasi

- npm run typecheck; npm run build.
- node tools/check-comprehension.cjs: fixture finance, sains, sejarah dan horor; perbaikan lalu baca ulang, nomor/kutipan palsu, respons kosong, input tetap utuh, sourceScene, kegagalan server, pembatalan dan edit bersamaan. Tidak memanggil AI eksternal.
- Regresi factual-source-checks, narrative-voice-checks, production-review-checks dan i2v-story-checks: mode, dialog aktual, 86 adegan, nomor prompt, motion-only serta formatter TXT/DOCX tetap bekerja.
- Dev harness mockComprehension, profil sementara tmp/bugcheck/comprehension-ui-userdata: IPC nyata menyimpan hasil setelah repair; UI menampilkan narasi, alasan gagal persisten dan retry; draft lama tetap sama saat audit kedua gagal. Bukti log comprehension-ui.log dan screenshot comprehension-ui.png serta comprehension-failure-ui.png diperiksa.

Pengujian fixture membuktikan alur kontrol dan perlindungan data. Mutu tulisan dari model pengguna dan hasil gambar Flow perlu ditinjau melalui produksi nyata; tidak diuji dengan kunci, suara atau naskah pribadi pengguna.

## Pilihan ide kehidupan dan fakta unik

Home > Tulis ide sendiri > Belum punya ide? Pilih topik menyediakan Cerita kehidupan dan konflik sehari-hari (ID kehidupan; fiksi eksplisit) serta Fakta unik dan pengetahuan mengejutkan (ID fakta lama dipertahankan; faktual). Arahan kategori meminta satu konflik bersebab-akibat atau satu fenomena beserta mekanismenya. Mode ikut ke editor.storyBrief proyek baru; kategori lain mempertahankan perilakunya. Label panjang bisa membungkus tanpa overflow. Uji Electron melalui server fixture loopback memeriksa prompt main, tombol, hasil ide, dan mode tersimpan pada kedua proyek. Log tmp/bugcheck/niche-ui.log dan screenshot niche-topics-ui.png; typecheck/build lulus. Pengujian tidak memakai AI eksternal.
