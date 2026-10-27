# Saran durasi dari alur sumber

Saat Ambil ide membaca link atau transkrip, respons AI juga memuat 5–14 bagian alur adaptasi dan perkiraan waktu tiap bagian, termasuk reaksi, percakapan dan jeda. Saran dibulatkan ke menit berikutnya; bukan rasio panjang video sumber. Ini penilaian AI, bukan pengukuran TTS atau jaminan kualitas.

Home dan langkah Ide menampilkan alasan, alur penting, peringatan bila target lebih pendek, serta tombol Pakai saran. Target tidak berubah otomatis. Durasi kustom hasil saran tetap terlihat pada pilihan durasi. Metadata disimpan di editor.storyBrief.pacing (JSON), tanpa migrasi database.

Penulisan naskah memakai alur yang ditinjau beserta sinopsis. Jika target pendek, instruksi mendahulukan pemotongan pengulangan dan detail sampingan, menjaga hubungan sebab-akibat dan akhir. Tidak menjamin AI akan selalu memenuhi kualitas sastra; naskah tetap perlu ditinjau.

Saran terikat pada teks ide dan sinopsis: edit salah satunya menonaktifkan saran dan alur lama untuk penulis. Materi parsial menampilkan pemberitahuan tanpa tombol rekomendasi durasi seluruh cerita. Proyek lama belum punya analisis ini; Ambil ide kembali secara sadar untuk memperolehnya. Fitur ini masih mengikuti mode adaptasi fiksi intake yang ada; belum menambah mode faktual finance.

Verifikasi: typecheck/build; mock LLM untuk validasi analisis, penerusan alur, invalidasi edit dan regresi naskah panjang; harness Electron dengan profil sementara untuk tampilan, penerapan/simpan, invalidasi edit dan sumber parsial. Tidak mengirim proyek atau kunci pengguna untuk pengujian.
