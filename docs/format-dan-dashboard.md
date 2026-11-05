# Format konten dan dashboard

Dashboard dimulai dari pilihan Short/Long, lalu Brainstorm ide, YouTube/transkrip, atau ide sendiri. Niche memakai satu dropdown. Batas menit, bahasa, rasio, gaya dan suara berada di Pengaturan tambahan setelah ide tersedia.

Short meminta satu pertanyaan atau konflik dengan satu jalur penjelasan tuntas; Long mengembangkan satu topik dalam bagian berkaitan. Pilihan ini mengatur arahan model, bukan jaminan keterpahaman. Review alur naskah tetap berjalan. Format awal memilih rasio 9:16 atau 16:9; pengguna dapat menggantinya.

Setiap kandidat brainstorming memiliki outline 3–10 bagian dan estimatedSec. Ide manual atau hasil pengolahan sumber direncanakan sebelum proyek dibuat. FormatPlan mengikat format dan teks sinopsis yang persis; edit sinopsis/format memerlukan rencana baru. Kerangka digunakan dalam prompt naskah. Estimasi otomatis bukan batas keras; penghubung, konteks dan jawaban tidak boleh dikorbankan untuk tepat mencapai angka tersebut.

Rentang validasi estimasi aplikasi: Short 15–120 detik; Long 120–1200 detik. Ini bukan batas atau aturan platform. Durasi akhir mengikuti audio. Pengguna bisa mengaktifkan batas manual; proyek lama mempertahankan batas sebelumnya sampai pengguna mengubahnya. Tidak ada migrasi database: metadata opsional disimpan pada editor_json.

Generasi ulang menyimpan estimasi dan naskah dalam satu transaksi setelah review sukses. Perubahan format, kerangka atau ide selama generasi membatalkan penerapan hasil. Respons kerangka tidak valid mempertahankan draf lama. Tidak ada perubahan pada tempo suara.

Verifikasi: npm run typecheck, npm run build; tools/check-content-format.cjs, tools/check-engagement.cjs, tools/check-comprehension.cjs; profil Electron sementara dengan format-ui-plan.json. Uji memakai model fixture loopback, bukan layanan atau data pengguna. Screenshot dan log format-ui ada di tmp/bugcheck. Kualitas editorial model asli tetap perlu ditinjau pengguna; brainstorming belum melakukan riset web langsung.
