# Pengolahan sumber faktual dan fiksi

Ambil ide di Home dan langkah Ide memiliki pilihan Edukasi / faktual (awal untuk proyek baru) dan Adaptasi fiksi. Mode dipilih sebelum mengambil materi; mengganti dropdown tidak mengonversi sinopsis atau naskah lama secara diam-diam. Proyek adaptasi lama tetap fiksi. Untuk memperbaiki proyek finance yang sebelumnya difiksikan, pilih faktual, ambil sumber ulang, tinjau sinopsis, kemudian susun naskah ulang.

SourceOptions membawa mode, target penonton, sudut pembahasan dan kontribusi kreator melalui IPC story:fromVideo. Input dibatasi panjangnya di main. Brief, mode, catatan sumber dan catatan pemeriksaan disimpan di editor.storyBrief (JSON), tanpa migrasi. Preload tetap memakai call yang meneruskan argumen bertipe.

Mode faktual tidak mengganti nama atau membuat protagonis. Model diminta menjaga angka, unit, waktu, syarat dan ketidakpastian, menjelaskan istilah memakai bahasa sehari-hari dan membedakan sumber/opini/simulasi. Catatan sumber belum diverifikasi secara mandiri; tidak ada browsing otomatis atau klaim bahwa fakta sudah benar. Catatan berisi bagian yang perlu dicek ditampilkan sebelum produksi. Ini bukan sistem jaminan akurasi finansial, izin hak cipta, kelayakan monetisasi atau keunikan lintas pembeli aplikasi.

Naskah pendek, kerangka panjang dan refinement punya arahan faktual tersendiri, tanpa pemaksaan dialog, twist atau horor. Saran pacing faktual adalah urutan penjelasan, bukan plot fiksi. Catatan sumber lama tidak diberikan sebagai kanon ketika ide/sinopsis berubah. Proyek manual lama tanpa brief mempertahankan perilaku genre sebelumnya.

Fiksi masih tersedia dengan aturan renaming, kanon, percakapan adaptasi dan akhir cerita. Kedua mode tetap memakai timeline, visual Flow dan pipeline audio yang sama.

Pembedaan konten mengandalkan arahan kreator dan kontribusi nyata, bukan seed acak atau perubahan nama. Sumber, audiens dan sudut yang sama dapat menghasilkan pembahasan mirip; aplikasi tidak membandingkan semua konten pembeli atau menjamin eksklusivitas.

Verifikasi: typecheck/build; factual-source-checks.cjs untuk intake, catatan wajib, mode default, larangan renaming faktual, arahan kreator, naskah pendek/panjang, refinement dan fiksi; regresi pacing/narrative/I2V. Harness factual-source-ui memakai profil sementara, IPC fixture, pilihan mode sungguhan, penyimpanan arahan dan pemeriksaan pergantian dropdown yang tidak mengubah proyek hingga Ambil ide. Hasil tulisan model nyata tetap perlu ditinjau; uji tidak mengirim data/kunci pengguna.
