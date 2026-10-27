# Pemeriksaan naskah dan impor hasil Flow

## Pemeriksaan sebelum produksi

Halaman Naskah memiliki panel Periksa naskah yang tertutup pada awalnya. Pemeriksaan lokal berjalan tanpa layanan AI: narasi kosong, pengulangan teks yang panjang, istilah finance tanpa penanda penjelasan di dekatnya, frasa klaim keuntungan/risiko dan durasi timeline yang melampaui target. Ini pencarian pola, bukan evaluasi sastra, bukti salah/benar, atau skor kelayakan monetisasi. Temuan menunjukkan kutipan dan tombol menuju adegan bila relevan. Catatan sumber juga tersedia di panel.

Minta tinjauan AI memakai model penulis terpilih, maksimal 90 detik, hanya setelah tombol ditekan. Setiap temuan wajib mengutip substring asli narasi dan ID adegan yang sah. Kutipan/ID yang tidak cocok menolak laporan; naskah tidak ditulis ulang. Request bersamaan untuk proyek yang sama dideduplikasi. Laporan disimpan di editor.scriptAssessment bersama fingerprint seluruh input editorial; edit naskah/ide/sumber membuat laporan lama tidak berlaku. Gagal AI meninggalkan pesan persisten dan pemeriksaan lokal tetap bisa dipakai. Tidak ada penelusuran web otomatis, verifikasi fakta atau jaminan eksklusivitas/monetisasi.

## Impor massal

Di Visual & suara, Impor hasil Flow membuka pemilih banyak gambar/video (maksimal 200 file, gambar 100 MB, video 512 MB, total 2 GB). Nama 001 - Judul, adegan_002 atau judul yang sama persis dan unik mendapat pasangan awal. Urutan unduhan tidak digunakan sebagai bukti. Nama yang tidak dikenal/ambigu bisa dipilih manual atau dilewati.

Pratinjau memperlihatkan semua pasangan sebelum penerapan. Dua file sejenis untuk satu adegan diblok. Satu gambar dan satu video boleh dipasang pada adegan sama, dengan video aktif. Penggantian visual lama memerlukan sakelar eksplisit; aset lama tetap tersedia di riwayat. Mengimpor gambar mengaktifkan kamera gambar dan melepas pilihan video aktif, tanpa menghapus aset videonya. Suara, caption, narasi dan durasi adegan tidak diubah.

Main hanya menerima path dari file picker; renderer mendapat token dan ID file. Token berlaku 15 menit dan terikat ke proyek serta snapshot adegan/aset. Perubahan setelah preview, file berubah, token dibuang dan adegan dari proyek lain ditolak. Semua file terpilih diperiksa lebih dulu, kemudian asosiasi disimpan dalam transaksi SQLite. File rusak atau gagal DB tidak memasang setengah paket; file tujuan baru yang belum terdaftar dibersihkan. Gambar memakai normalisasi/validasi yang sudah ada. Video dikonversi ke MP4 H264/yuv420p, audio AAC bila tersedia, maksimal tiga menit per konversi. Tujuannya kompatibilitas preview; aset asli pengguna tidak diubah.

Batalkan impor menghentikan tahap persiapan/konversi dan membuang hasil sementara. Commit asosiasi berlangsung sinkron dalam transaksi; permintaan batal yang baru tiba setelah commit tidak membatalkan impor yang sudah selesai. Impor tidak dilanjutkan otomatis setelah aplikasi ditutup; pilih file lagi. Model/layanan eksternal tidak dipanggil untuk impor.

## Pemulihan dari error model

Error Ambil ide menyediakan tautan ke Pengaturan untuk memeriksa model/tes menulis. Home menjaga link, judul, sinopsis, pilihan dan arahan di memori saat bolak-balik ke Pengaturan. Ini berlaku selama sesi aplikasi, bukan cadangan draf ke disk. Setelah membuat proyek, draf Home dibersihkan; proyek memakai penyimpanan database biasa.

## Verifikasi

Typecheck/build lulus. Node checks menilai pola lokal, nomor/judul ambigu, anchor temuan AI, perubahan naskah, deduplikasi dan kegagalan. Harness Electron pada profil sementara menguji quote AI tersimpan (model tiruan), error 503, tinjauan basi, pemetaan manual, duplikat, izin penggantian, pembatalan, file rusak/rollback serta menjaga narasi/audio/durasi dan riwayat aset. Uji pemulihan draf memindahkan halaman ke Pengaturan dan kembali. Tidak memakai proyek/kunci asli.

Gambar sintetis dan video sungguhan diimpor lewat IPC aktual lalu diekspor: H264 1920x1080, AAC, 16,8 detik. Decode seluruh audio/video lulus dan frame diperiksa. Ini bukti fungsi pipeline; kualitas narasi model nyata dan konten akhir tetap perlu ditinjau kreator.
