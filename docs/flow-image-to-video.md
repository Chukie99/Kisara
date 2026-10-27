# Dua jenis prompt Google Flow

Di Naskah → Naskah & prompt Google Flow tersedia Text to Image dan Image to Video. Pilihan tersimpan di editor JSON proyek (flowMode); proyek lama tetap mulai di mode gambar.

Text to Image mempertahankan alur gambar lama beserta gaya proyek atau kartun Indonesia sederhana. Image to Video memakai clip.videoPrompt sebagai arahan gerak, dilengkapi instruksi menjaga frame awal, identitas, pakaian, lokasi dan gaya. Prompt meminta gerak subjek/lingkungan, bukan sekadar pan/zoom, satu shot tanpa montase dan tanpa narasi tambahan. Nomor/timestamp/nama file tetap label di luar prompt per adegan.

Di mode video, buka adegan untuk mengedit Arahan gerak adegan. Perubahan juga mengubah videoPrompt klip yang dipakai generasi video internal; kolom ini sudah ada sehingga tidak perlu migrasi. AI penulis menerima instruksi gerak subjek yang spesifik. Jika hanya motion yang kosong dan rencana gambar sudah valid, melengkapinya tidak menulis ulang gambar/cast/kamera. Hasil kosong tidak dicache sebagai selesai. Edit sumber atau gerak yang terjadi saat AI bekerja menolak penerapan hasil lama.

Salin prompt per adegan, panduan TXT/DOCX dan paket 10 mengikuti mode terpilih. Paket I2V membutuhkan gambar acuan bernama sama untuk setiap adegan, meminta hasil video terpisah dan tidak mengklaim bisa unggah, menamai atau memilih durasi bila fitur tidak tersedia. Timestamp adalah timeline narasi; pilih durasi generasi yang tersedia di Flow lalu sesuaikan di editor. Narasi terpisah tidak berubah.

Penggunaan: di Flow pilih Video/Frames, tambah gambar adegan sebagai frame awal, tempel prompt I2V, lalu generate. Kisara tidak menjalankan layanan Flow; biaya/kuota mengikuti akun Flow. Tidak ada video Flow nyata dibuat selama audit ini. Referensi resmi: https://support.google.com/flow/answer/16353334 dan https://support.google.com/flow/answer/16352836

Verifikasi: typecheck/build; i2v-checks (12 adegan, paket 10+2, gerak spesifik, referensi/nama, readiness, TXT/DOCX, narasi tetap); i2v-story-checks (LLM tiruan, motion-only menjaga frame, motion kosong ditolak); named-flow/batch-flow/flow regressions; dev harness profil sementara i2v-ui-v2 (mode+edit tersimpan, clipboard, ekspor IPC, kembali ke gambar tanpa kehilangan gerak). Screenshot i2v-ui.png dan t2i-ui.png diperiksa.

Regresi MP4: dev harness seed/export dengan profil sementara lulus; demo-export.mp4 berdurasi 16,80 detik, H.264 1920×1080 30fps dan AAC stereo 48kHz. FFmpeg mendecode seluruh video tanpa error; frame detik 3 diperiksa. Ini proyek demo lokal, bukan hasil generasi Flow.
