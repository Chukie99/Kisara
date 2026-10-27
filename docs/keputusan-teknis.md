# Keputusan teknis

Catatan kenapa sesuatu dibuat begitu. Sebagian besar lahir dari bug nyata, jadi baca dulu sebelum mengubah
bagian terkait. Tambahkan entri baru di akhir setiap kali membuat keputusan penting.

### Narasi direkam satu kali utuh, lalu dipotong per adegan
TTS yang dipanggil per klip menghasilkan suara dan intonasi yang berbeda-beda. Satu rekaman utuh lalu dipotong
membuat suaranya konsisten. Jangan menambah tombol "buat suara" per klip.

### Whisper tanpa `--prompt`, dengan DTW
Naskah yang dikirim sebagai prompt membuat Whisper berhalusinasi: dalam uji coba, Whisper mengulang "tidak tidak
tidak..." puluhan kali. Caption klip 1 selesai 2 detik lebih cepat dari suaranya, dan kata-kata awal klip lain
tertumpuk di detik 0. Waktu per kata bawaan whisper.cpp juga kurang presisi. Dari tiga cara yang diuji,
`-nfa -dtw small` tanpa prompt paling akurat: caption hanya meleset sekitar 0,1–0,2 detik dari suara (diuji pada
proyek nyata). Ejaan caption tetap dari naskah (`align.ts`); dari Whisper hanya diambil waktunya.

### Potongan adegan mengikuti kata
Dengan Whisper, adegan dipotong di jeda antara kata terakhir satu adegan dan kata pertama adegan berikutnya
(`cutsFromWords`), jadi potongan tidak pernah jatuh di tengah kata. Tanpa waktu kata, `chooseCuts` memilih dari
jeda yang dideteksi FFmpeg. Gemini diberi `<long pause>` di antara adegan supaya jedanya jelas. ElevenLabs
memakai waktu kata dari API-nya sendiri.

### Sorotan caption bertahan di jeda antar kata
Di jeda antar kata, sorotan tetap di kata terakhir yang sudah diucapkan (`captionAt`), sama seperti ekspor.
Dulu sorotan lompat ke kata terakhir baris lalu balik lagi, sehingga terlihat berkedip.

### Segmen ekspor dibulatkan ke frame + 2 frame cadangan
`xfade` menghentikan seluruh video kalau klip pertama habis sebelum offset transisi. Dengan transisi `cut`
(1 frame) dan durasi klip yang tidak pas di frame, gambar video pernah berhenti setelah klip 1 sementara audio
tetap jalan. `planSegments` membulatkan awal klip ke frame utuh dan menambah 2 frame cadangan.

### Gerak kamera di ekspor memakai filter `perspective`, bukan `zoompan`
`zoompan` membulatkan potongan gambar ke piksel bulat setiap frame, sehingga gerak lambat bergoyang 0,6–0,7 px
per frame (terlihat bergetar, terutama garis tipis). `perspective` (sense=source, cubic) bergerak pecahan piksel:
getarannya 0,02–0,16 px dengan kecepatan hampir sama. Gambar diproses di resolusi aslinya (1×–2× output) lalu
diperkecil, supaya tetap tajam. Catatan: penghitung frame `perspective` mulai dari 1, jadi rumusnya memakai `(on-1)`.

### Kotak caption rounded digambar sendiri
libass hanya bisa membuat kotak bersudut siku. Kotak rounded digambar sebagai drawing ASS di layer bawah teks.
Lebarnya dihitung dari metrik file font (`fontMetrics.ts`), dan baris dipecah dengan fungsi yang sama dengan
pratinjau (`layoutCaptionLines`).

### Ukuran caption memakai metrik `cell` per font
libass mengukur ukuran font dengan winAscent+winDescent, CSS dengan em. Tanpa konversi, caption di ekspor hanya
sekitar 57% ukuran pratinjau. Setiap font di `CAPTION_FONTS` punya nilai `cell` hasil pengukuran file TTF-nya.

### Pratinjau menjaga tiga klip tetap terpasang
Membuat elemen `<video>` baru setiap pindah klip sempat menampilkan frame pertama video (atau poster) sebelum
seek. Akibatnya ada kilasan di sambungan potongan dan di transisi. Klip sebelum/sekarang/sesudah selalu
terpasang dalam urutan timeline. Klip berikutnya menunggu di titik mulainya, dan langsung diputar tanpa seek
ulang (seek ulang menahan video sekitar 150 ms).

### Video overlay hardware dimatikan
Di Windows, Chromium menyerahkan video ke overlay hardware (DirectComposition) yang membulatkan posisi dan
ukuran ke piksel bulat. Gerak kamera di atas video jadi gemetar di pratinjau, padahal gambar halus.
Switch `disable-direct-composition-video-overlays` dan opasitas 0,999 untuk video yang bergerak menahan video
di jalur render biasa. (Pemilik aplikasi masih melihat getaran di pratinjau; lihat masalah-diketahui.md.)

### Suara milik klipnya ("klip tertaut")
Seperti suara bawaan klip video di editor lain: suara bisa dipotong dan digeser di dalam klip, dan terpotong di
akhir klip. Ini menjaga sinkron naskah per adegan dan rekam ulang narasi tetap sederhana.

### Potong klip ikut membelah suara dan naskah
Saat klip dibelah, file suara dipotong di jeda antar kata terdekat, dan teks narasinya dibagi
(`splitNarration`). Dengan begitu tiap bagian punya aset dan naskah yang cocok (tidak dianggap basi), dan bisa
direkam ulang sendiri. Bagian pertama diberi transisi `cut` agar sambungannya mulus.

### Panel Transisi, bukan popup
Popup di timeline menutupi pratinjau, padahal pengguna ingin melihat contoh transisinya. Tombol sambungan
membuka panel di kanan, lalu pratinjau memutar sambungan itu berulang-ulang (audition).

### Prompt visual berlabel dan baris Wardrobe
Model gambar tidak membaca naskah. Prompt yang kurang spesifik menghasilkan latar Bumi dan alien untuk cerita di
Mars, dan baju astronot di semua adegan. Setiap prompt kini menyebut dunia/era dengan jelas, orang disebut
"human", dan baju per adegan ditulis di baris `Wardrobe` (bawaan lembar karakter atau custom).

### Prompt video selalu melarang musik
Beberapa model video (Veo, Grok, MiniMax) membuat musik sendiri tanpa saklar. Setiap prompt diakhiri `NO_MUSIC`,
dan audio dimatikan lewat parameter kalau modelnya punya. Audio dari file video tidak pernah dipakai di ekspor.

### Kunci API dienkripsi safeStorage, kunci kripto dibuat saat startup
Kunci kriptografi `safeStorage` baru tertulis ke `Local State` sekitar 10 detik setelah dibuat. Membuatnya saat
startup (`warmUpEncryption`) mencegah kunci API tidak terbaca setelah aplikasi ditutup paksa.

### Informasi produk ditampilkan tanpa embed promosi
Halaman Tentang aplikasi memakai panduan lokal dan informasi lisensi. Embed tutorial dan penambahan header
Referer untuk video promosi sudah dihapus.

### Sinkron caption mempertahankan edit manual
`meta.editedWords` melindungi teks, penghapusan, dan waktu caption manual dari sinkron Whisper, baik mode
caption lama maupun semua klip. Aturan kelayakan ada di `captionNeedsSync` untuk main dan renderer.
Metadata dibaca ulang setelah Whisper selesai agar edit yang masuk selama proses tidak tertimpa.

### Desain suara memakai aturan durasi bersama
Efek suara punya track sendiri di pratinjau dan ekspor, dengan batas sumber dan akhir video dari
`shared/sound.ts`. Saran AI memakai ID adegan agar penempatan saat dipilih mengikuti durasi narasi terbaru.
Pencarian dibatasi CC0 dan metadata sumber tetap disimpan; penggunaan API komersial punya ketentuan terpisah.
Duplikasi proyek memetakan ulang referensi aset musik, overlay, efek, dan ID adegan dalam saran suara.

### Studio gelap terpisah dari gaya konten
Tema slate/biru dipakai untuk antarmuka, navigasi pustaka, langkah produksi, dan panel editor. Token caption
tetap sama agar perombakan UI tidak mengubah video pengguna. Panel monitor dan rel editor harus punya batas
grid minimum nol dan overflow yang jelas agar tetap muat pada jendela 1180×720.

### Dialog harus menjadi teks yang benar-benar disuarakan
Instruksi dalam prompt saja pernah menghasilkan narasi tanpa dialog. Skema naskah sekarang menyediakan
`dialogue[]`; `composeSceneSpeech` menggabungkannya ke `Clip.narration`. Perbaikan naskah lama memakai
`sourceScene` agar pemangkasan pengulangan tidak memasangkan ulang aset ke adegan yang salah. Pemetaan,
dialog, dan edit bersamaan divalidasi sebelum transaksi; aset lama dipertahankan sebagai riwayat.

### Pemeran dan validasi gambar tidak boleh gagal diam-diam
Pencocokan nama mentah membuat Ari dan Ustaz Ari dianggap berbeda, sehingga prompt kehilangan identitas.
Alias gelar/peran yang tidak ambigu dipakai bersama; daftar pemeran yang tidak dikenal ditolak. Anggaran
prompt dibagi per tokoh agar deskripsi tokoh pertama tidak membuang tokoh berikutnya. Setting tropis tidak
boleh berubah menjadi es karena metafora dingin. Pemeriksaan piksel menolak gambar kosong/hitam, termasuk
aset lama sebelum ekspor; pemeriksaan ini tidak menggantikan peninjauan wajah atau OCR.

### Efek otomatis memasang audio dan mengikuti klip
Saran efek tanpa track audio membuat hasil ekspor tetap sunyi. Job `sfx` kini memasang hasil pencarian CC0
atau audio sintetis bawaan yang cocok dengan aksi. Track ditautkan ke ID klip dan dipotong oleh batas klip.
Efek manual dipertahankan dan pemanggilan ulang tidak menggandakan track. Event penambahan efek digabung
di renderer agar edit manual yang belum tersimpan tidak ditimpa; perubahan waktu dari main juga dijadwalkan
ulang untuk disimpan jika snapshot lama masih berjalan. Pipeline memeriksa hasil job dan menghentikan alur
pada kegagalan wajib, bukan menampilkan sukses sesudah suara/gambar gagal.

### Keberadaan aset bukan bukti bahwa aset masih cocok
Setelah naskah, dialog, pemeran, gaya atau pembawaan berubah, aset lama pernah tetap dianggap siap.
Fingerprint gambar dan suara dibandingkan melalui fungsi bersama di main/renderer; hasil AI yang basi
dibuat ulang dalam alur produksi, sementara impor lokal dipertahankan. Fingerprint dicatat dari masukan
saat permintaan dikirim, bukan dari klip yang mungkin berubah ketika hasilnya tiba. Bundle rencana dikirim
ke renderer sebelum produksi agar autosave tidak mengembalikan prompt lama.

### WebP dari Gradio dinormalisasi sebelum validasi
Gradio mengirim WebP secara default, sedangkan nativeImage Windows tidak dapat mendekodenya. Jalur Hugging Face mengonversi WebP ke PNG dengan FFmpeg sebelum pemeriksaan piksel dan penyimpanan. PNG/JPEG tetap divalidasi; gambar kosong dan respons rusak tetap ditolak. Template Space meminta PNG, tetapi aplikasi tetap mendukung Space lama tanpa pembaruan server.

### Normalisasi gambar berlaku pada semua pintu masuk
Impor manual dan hasil Higgsfield/Cloudflare juga dapat berupa WebP. Keduanya memakai normalisasi yang sama
sebelum penyimpanan; ekstensi berkas mengikuti byte hasil konversi. Pembatalan diperiksa sebelum menyimpan
hasil generasi agar pekerjaan yang dibatalkan tidak mengganti gambar klip.

### Serialisasi Hugging Face dilakukan oleh antrean pekerjaan
Menunggu job satu per satu di pipeline tidak membuat permintaannya serial: semua job sudah dimulai saat
daftar dibuat. Antrean `huggingface` dengan batas satu dipakai gambar dan potret, sehingga batch serta tombol
per klip memakai batas yang sama. Respons Gradio hanya mengambil event `complete`, bukan pratinjau progres.
URL relatif diselesaikan ke Space; token tidak diteruskan ke origin unduhan lain. Permintaan generasi memiliki
batas waktu dan jeda percobaan ulang bisa dibatalkan.

### SQLite Node-API tidak dibangun ulang untuk ABI Electron
`better-sqlite3` 13 menyertakan biner Node-API untuk Windows x64, yang berhasil diuji langsung di Node dan
Electron. Rebuild lama justru memerlukan Python/toolchain meskipun biner tersedia. Postinstall memeriksa
database dalam memori dan installer memakai `npmRebuild: false`; dependensi native baru harus diperiksa
kompatibilitasnya sebelum mempertahankan pengaturan ini.

### Rebranding tidak memindahkan profil enkripsi
Kisara memakai identitas produk baru pada UI, paket, installer, shortcut, dan ekspor. Profil lama tetap
dipakai di tempatnya, bersama database, aset, dan `Local State`. Nama direktori lama dalam deteksi profil
dan nama/protokol bridge TTS lama adalah kompatibilitas teknis; jangan dihapus melalui penggantian teks
global. Instalasi baru memakai folder Kisara. Atribut dan lisensi komponen pihak ketiga tetap dipertahankan.

### Timestamp adalah metadata adegan, bukan teks narator atau instruksi menggambar
`shared/flow.ts` menghitung waktu dari durasi klip yang sama dengan timeline. UI, clipboard, TXT dan DOCX
memakai baris yang sama; nomor/waktu tidak dimasukkan ke prompt gambar dan tidak dibacakan TTS. Prompt
yang tidak cocok lagi dengan naskah diblok dari ekspor. Naskah dan visual panjang diminta dalam kelompok
terbatas agar jawaban tidak terpotong. Visual harus cocok dengan nomor adegan, tanpa cadangan pencocokan
berdasarkan urutan jawaban. Lihat [podcast-dan-flow.md](podcast-dan-flow.md).

### Kerangka alur bukan daftar gambar
Model lokal mengembalikan 23 bagian kerangka untuk target 10 menit. Syarat minimum setengah dari 86 adegan
menolak kerangka yang valid. Kerangka kini dikembangkan ke slot adegan terpisah, termasuk alokasi akhir
cerita; permintaan kecil dan perbaikan ID yang hilang mencegah kehilangan satu bagian. Proxy custom juga
menerima skema di system instruction, karena flag JSON dapat diterima tetapi diabaikan. Jangan mengembalikan
syarat jumlah bagian kerangka berdasarkan jumlah klip. Status dan kegagalan naskah harus terlihat di halaman,
bukan hanya toast yang hilang saat penulisan panjang.

### Narasi mengikuti cerita; batas gambar bukan batas kalimat

Arahan bersama `STORY_VOICE` berlaku pada penyusunan dan perbaikan naskah. Genre dan pembawaan disimpulkan
dari sinopsis yang disetujui, bukan gaya gambar. Horor membangun kejanggalan, reaksi, antisipasi dan
konsekuensi; misteri menyiapkan petunjuk, drama mengikuti kebutuhan tokoh, materi faktual menjaga klaim.
Jangan kembali memaksa setiap adegan menjadi satu kalimat atau setiap kalimat mendeskripsikan gambar.
Situasi yang digambar ada pada `story`; narasi boleh memuat pikiran dan arti detail yang berlandaskan alur.
Anggaran kata merupakan rata-rata; ritme boleh bervariasi. Hook tidak wajib berupa pertanyaan dan tidak
diulang pada tiap kelompok permintaan. Detail fiksi mengikuti kanon, tanpa twist atau penjelasan baru
yang bertentangan dengan sinopsis.

Konteks kelanjutan memakai enam adegan diterima terakhir beserta dialog yang benar-benar diucapkan;
repair juga melihat adegan valid dalam kelompok yang sedang dikerjakan. Refinement mempertahankan ID
adegan dan akhir cerita, serta tidak memaksakan dialog ke materi yang tidak memiliki percakapan. Edit
sinopsis, bahasa, TTS atau brief selama refinement membatalkan penerapan hasil. Perubahan arahan tidak
menulis ulang proyek lama otomatis; gunakan Perbaiki naskah & dialog atau susun ulang secara sadar.

### Kegagalan satu kelompok visual tidak membuang seluruh rencana
AI dapat mengembalikan jumlah atau nomor prompt yang salah. Visual kini diminta maksimal 6 adegan, divalidasi berdasarkan nomor global, dan yang hilang dicoba sekali lagi dalam kelompok maksimal 3. Kelompok valid disimpan ke disk dengan hash masukan; lanjut hanya memakai masukan yang sama. Database tetap diterapkan atomik setelah semua adegan cocok. Status, pembatalan, batas waktu per permintaan, dan deduplikasi pemanggilan berlaku juga untuk visual. Hasil sementara tetap ada setelah aplikasi ditutup; cache basi atau rusak diabaikan.

HTTP 500/502/503 mendapat maksimal dua retry untuk seluruh satu proses visual, dengan jeda 2 lalu 5 detik
yang dapat dibatalkan. Budget tidak direset per kelompok/adegan agar router yang terus bermasalah tidak
memicu badai permintaan. UI menampilkan jeda dan saat permintaan ulang dikirim. Kelompok yang sudah
tervalidasi tidak diulang; error 400, autentikasi dan 429 tidak memakai retry ini. Retry tidak mengubah
model/provider secara diam-diam dan tidak menjamin server yang mati akan pulih.

Jika kelompok 6 adegan melewati batas 3 menit, visual mencoba kelompok 3 adegan dan mempertahankan ukuran kecil untuk kelanjutannya. Jika tiga adegan masih timeout, permintaan turun menjadi satu adegan dan mempertahankan ukuran tersebut saat dilanjutkan. Timeout pada satu adegan menampilkan error dengan nomor adegan dan jumlah hasil sementara; pembatalan tidak memicu percobaan ulang. Konteks keseluruhan memakai ringkasan alur per adegan, sementara narasi dan alur lengkap dikirim hanya untuk adegan yang diminta.

### Endpoint custom tidak dianggap mendukung flag JSON terstruktur
Router dapat mengganti provider di tengah rangkaian permintaan. Custom meminta JSON melalui instruksi dan skema dalam prompt terlebih dahulu, tanpa `response_format`; jawaban tidak valid dapat dicoba sekali dengan `json_object`. HTTP 400 generik bukan bukti bahwa format JSON ditolak, sehingga tidak memicu pengulangan tiga format. Provider lain hanya mencoba format alternatif bila error menyebut parameter yang tidak didukung. Envelope error bertingkat diperiksa di main untuk klasifikasi; UI hanya menerima pesan ringkas tanpa JSON mentah, identitas akun, atau ID permintaan. Error `bad request` generik tidak boleh disebut sebagai bukti saldo habis.

### Flush wajib menolak kegagalan simpan sebelum AI, ekspor, atau navigasi
Autosave boleh menangkap error untuk menampilkan status, tetapi `flush()` harus melempar jika data belum tersimpan. Pemanggil menghentikan aksi dan menampilkan error. Versi pemuatan dan ID proyek melindungi status dari hasil simpan lama; cleanup halaman tidak boleh melepas proyek baru yang sudah dimuat. Jendela tidak boleh ditutup saat ada edit yang gagal disimpan tanpa menampilkan masalahnya. Checkpoint visual disimpan terpisah dari SQLite, tanpa kunci API; prompt baru tetap diterapkan sebagai satu transaksi setelah semua adegan valid.

### Paket Agent dan paragraf narasi memakai urutan adegan yang sama
`shared/flow.ts` mengelompokkan adegan per 10 dan mempertahankan nomor global, termasuk paket terakhir yang lebih pendek. Paket Agent adalah instruksi untuk meminta aset terpisah, bukan satu prompt kolase atau integrasi generasi Flow. Narasi dirapikan menjadi satu paragraf per adegan tanpa mengubah kata/dialog; nomor dan timestamp hanya ada dalam panduan UI, tidak di teks ucapan. Clipboard dan ekspor memakai formatter yang sama. Ekspor narasi tidak membutuhkan visual siap; ekspor paket hanya membutuhkan prompt dalam paket tersebut siap.

### Nama aset mengikuti judul adegan; tampilan Flow dapat disederhanakan tanpa menulis ulang naskah
Nama aset dibentuk satu kali di `flowAssetName`: prefiks urut tiga digit dan judul sumber, dengan karakter berbahaya untuk nama file dibersihkan. Nama yang sama dipakai UI, paket Agent, panduan dan peta gambar–narasi. `ASSET NAME` berada di luar deskripsi gambar; nomor tidak digambar pada piksel atau dibacakan narator. Penamaan/rename di Flow diminta, bukan dijamin, sehingga peta urutan tetap tersedia. `editor.flowLook` adalah override ekspor Flow: preset kartun Indonesia sederhana memakai arahan flat 2D dan casting lokal, membersihkan kata render yang bertentangan dari rencana lama, dan mempertahankan aksi, pakaian, narasi, waktu serta gaya proyek asli.

### Error caption YouTube bukan bukti tidak ada caption

Jangan menelan error yt-dlp lalu mengunduh audio secara diam-diam. Penolakan akses, rate limit dan timeout
ditampilkan; hanya HTTP 429 dicoba sekali lagi. Whisper dipakai jika pengambilan caption berhasil tetapi
tidak menyediakan teks yang bisa dibaca, serta model lokal siap. Caption pendek minimal 80 karakter
tetap valid. Status parsial mengikuti durasi sebenarnya, bukan semua hasil Whisper dianggap terpotong.
Link video dinormalisasi (watch, youtu.be, Shorts, live, embed); parameter playlist/tracking dibuang.
yt-dlp mengabaikan config global dan, bila mendukungnya, memakai Node bawaan Electron melalui
`--js-runtimes` dan `ELECTRON_RUN_AS_NODE=1`; help dicek agar versi lama tidak menerima flag tak dikenal.
Unduhan alat dan subprocess dibatasi waktunya. Error Ambil ide tetap terlihat di Home dan langkah Ide,
link tetap tersedia untuk retry. Hasil podcast tidak boleh menimpa judul/sinopsis/bahasa yang diedit
selagi permintaan berjalan.
### F5 Hugging Face memakai identitas referensi dan pemotongan narasi bersama

Provider `f5-hf` memakai setting Space tersendiri dan token Hugging Face yang sudah terenkripsi. Tidak
ada kolom atau migrasi proyek baru: `tts_provider` dan `tts_voice` menyimpan provider serta ID referensi.
Settings KV mendapat nama Space, endpoint, WAV referensi milik folder aplikasi, transkrip dan revision ID.
Penggantian setting/sampel membuat ID baru, sehingga fingerprint suara mencerminkan referensi terpilih.
Jangan mengirim path lokal arbitrer: hanya basename UUID WAV dalam `f5-reference` diterima.

Kontrak Gradio diperiksa sebelum upload. Upload hanya terjadi saat membuat narasi, bukan memilih file,
menyimpan setting atau mengetes API. Output wajib event selesai dan harus bisa didekode ke PCM WAV oleh
FFmpeg. Download dibatasi ukuran/domain; token tidak diteruskan ke CDN atau redirect origin berbeda.
Bagian teks disuarakan serial dengan referensi sama, digabung menjadi satu take per kelompok lalu masuk
ke `sliceTake` yang juga dipakai Gemini/Supertonic. Jangan menambah aturan caption/ekspor terpisah.
F5 tidak membaca tag emosi Gemini; teks tag dibersihkan sebelum dikirim dan penulisan F5 tidak memintanya.
Pilihan provider/ref/naskah yang berubah saat pekerjaan berjalan menghentikan pemasangan hasil lama.


### Impor referensi F5 mengukur audio hasil decode

OGG/Opus dapat tidak memiliki metadata durasi yang terbaca. Impor menormalisasi dulu ke PCM WAV 24 kHz mono lalu memeriksa durasi 3–15 detik. Decode dibatasi 16 detik; hasil di atas 15 detik ditolak, bukan dipotong lalu diterima. File gagal dibersihkan dan pilihan referensi sebelumnya tetap berlaku. Pemilih juga menerima ekstensi oga dan opus. Uji sintetis Vorbis/Opus serta penolakan sampel 2/18 detik lulus; typecheck/build lulus.

### F5: baca event selesai sebelum koneksi SSE ditutup

Antrean narasi F5 yang timeout tetap menjadi job gagal; jangan mencoba ulang otomatis karena dapat menambah permintaan di Space publik. Storyboard menampilkan kegagalan terakhir sebagai panel persisten. Pembaca Gradio memproses event SSE bertahap (termasuk CRLF dan batas chunk), hanya mengambil hasil complete, lalu membatalkan reader. Jangan menunggu EOF karena server dapat mempertahankan koneksi setelah audio selesai. Event error, JSON rusak, koneksi putus dan batas ukuran tetap ditolak tanpa membocorkan respons mentah. Tahap API/upload/menunggu/download diteruskan ke progress job; status menunggu tidak mengklaim posisi antrean server. Batas delapan menit tetap berlaku.

### Tempo narasi lokal diterapkan sebelum alignment

`editor.narrationSpeed` disimpan sebagai JSON proyek, tanpa kolom baru. `shared/speech.narrationSpeed` memberi awal 0,90 dan membatasi 0,80–1,10; fingerprint Supertonic menyertakan tempo sehingga audio sebelumnya perlu diperbarui. Service lokal merender preset studio dahulu, kemudian memakai FFmpeg atempo ke file sementara dan mengganti WAV setelah berhasil. Caption, pemotongan adegan, pratinjau dan ekspor memakai WAV hasil tempo yang sama. Jangan mengubah playbackRate renderer secara terpisah. Hasil yang terlambat setelah teks/tempo/suara diubah tidak diterapkan. Kontrol emosi cloud tidak ditampilkan sebagai kontrol yang bekerja di Supertonic.

### Prompt gambar dan I2V Flow memakai sumber adegan yang sama

`editor.flowMode` memilih image/video; shared/flow menyusun clipboard, paket dan ekspor dari scene yang sama. Motion berasal dari videoPrompt klip yang sudah ada. Mode video menjaga first frame dan meminta gerak subjek/lingkungan, bukan kamera saja. Jangan menambahkan label/nama ke prompt per-adegan atau menjanjikan durasi/output/rename dari layanan eksternal. Melengkapi motion pada frame yang valid tidak boleh menulis ulang deskripsi gambar. Narasi dan urutan tetap sama; mode tidak mengubah timeline/render MP4.

### F5 lokal memakai API studio yang sudah ada

Provider f5-local terpisah dari f5-hf dan Supertonic. Endpoint hanya HTTP loopback; voice, model dan referensi tetap di studio F5. Tidak mengedit/mengimpor ulang sampel dan tidak membaca kunci cloud. ID suara diberi revisi metadata untuk fingerprint. Tempo diberikan ke inferensi F5, lalu WAV hasilnya masuk alignment/pemotongan bersama sebelum preview/ekspor. Antrean serial, polling status yang nyata, tanpa retry POST otomatis. Cancel hanya menghentikan penantian di Kisara karena API studio tidak menyediakan cancel. Provider yang offline tidak boleh diam-diam diganti, agar tidak terdengar suara lain.

### Saran durasi berdasarkan alur yang ditinjau

Analisis intake menyimpan bagian alur dan estimasi ruang cerita pada editor.storyBrief.pacing. Bukan rasio durasi sumber; pengguna menerapkan saran secara sadar. Ikatan ide/sinopsis mencegah outline basi dipakai setelah edit. Sumber parsial tidak mendapat rekomendasi seluruh cerita. Penulis mendapat alur yang masih cocok dan prioritas pemadatan sebab-akibat. Lihat [saran-durasi.md](saran-durasi.md).

### Mode faktual tidak mewarisi prompt adaptasi fiksi

Sumber finance/edukasi memakai SourceOptions dan mode faktual eksplisit dari intake sampai naskah serta refinement. Renaming hanya untuk fiksi; catatan fakta dari transkrip tetap ditandai belum diverifikasi. Proyek lama tidak dikonversi melalui dropdown. Pembeda kreator adalah audiens, sudut dan kontribusinya, tanpa janji eksklusivitas atau monetisasi. Lihat [sumber-faktual.md](sumber-faktual.md).

### Pemeriksaan naskah terikat versi; impor Flow ditinjau sebelum diterapkan

Tinjauan AI wajib memiliki kutipan exact dan ID adegan sah, tidak mengubah naskah dan tidak memverifikasi fakta. Fingerprint menyimpan seluruh input untuk invalidasi setelah edit. Impor massal memakai token path dari picker, pasangan eksplisit, validasi media dan transaksi; jangan menebak berdasarkan urutan file atau menghapus aset lama. Normalisasi video menjaga kompatibilitas preview; durasi narasi tetap berasal dari timeline bersama. Cancel menghentikan persiapan, bukan membalik commit yang selesai. Lihat [pemeriksaan-dan-impor-flow.md](pemeriksaan-dan-impor-flow.md).
