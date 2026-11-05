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

### Naskah diperiksa lintas adegan sebelum diterapkan

Pemeriksaan keterpahaman memakai kutipan dan nomor sah, satu putaran perbaikan terbatas beserta adegan tetangga, lalu pembacaan ulang. Hasil yang belum lolos tidak mengganti naskah lama. Aturan berlaku sesuai genre, tidak mengklaim verifikasi sumber dan tidak memaksa bahaya pada visual edukasi. Lihat [keterpahaman-naskah.md](keterpahaman-naskah.md).

### Brainstorm dan teks animasi tidak mengarang riset atau transaksi

Enam kandidat ditinjau sebelum mengubah draf; hook dan daftar pemeriksaan tersimpan sebagai arahan, bukan fakta terverifikasi. Teks/angka animasi adalah overlay opsional pada JSON editor, memakai fungsi frame bersama untuk preview dan ASS. Counter tidak menebak seluruh transaksi dari narasi; waktu dan nominal ditinjau pengguna. Lihat [brainstorm-dan-teks-animasi.md](brainstorm-dan-teks-animasi.md).

### Progres naskah panjang disimpan sebelum commit

script-draft.json menyimpan kerangka dan prefix adegan secara atomik, terikat hash arahan, sinopsis, format, bahasa, durasi dan naskah sebelumnya. Kelompok empat adegan mengurangi ukuran respons. Saat request gagal, klik Susun naskah melanjutkan dari disk, termasuk setelah restart; mengganti model tetap boleh untuk melanjutkan kerangka yang sama. Perubahan input membatalkan pemakaian draf. Pemeriksaan lintas adegan tetap wajib dan naskah lama baru diganti setelah lolos. Draf lengkap disimpan sebelum review supaya timeout review tidak menulis ulang seluruh naskah. Checkpoint dihapus setelah commit berhasil.

### Pemeriksa alur tidak mewarisi instruksi penulis

System prompt pemeriksa berdiri sendiri, tanpa arahan membuat scenes dari penulis. Genre, bahasa dan batas fakta dipertahankan dalam brief/draf yang diperiksa; temuan harus memiliki nomor dan kutipan exact. Respons salah struktur atau kutipan dicoba ulang satu kali dengan bentuk JSON eksplisit, tidak dianggap issues kosong. Kegagalan kedua tetap memblokir commit dan mempertahankan checkpoint lengkap. Mengubah prompt pemeriksa tidak mengubah fingerprint draf penulisan, supaya draf 39/39 yang sudah tersimpan dapat dipulihkan.

### Perbaikan alur melanjutkan tulisan terbaru

Pemeriksaan dapat menjalankan maksimal dua putaran perbaikan dalam satu penyusunan. Setiap kelompok perbaikan yang valid langsung diteruskan ke callback checkpoint; writer menyimpannya sebagai draf lengkap dengan fingerprint input yang sama. Kegagalan reread atau temuan tersisa tidak mengembalikan teks ke draf sebelum perbaikan. Percobaan berikutnya membaca ulang teks terbaru. Temuan yang masih ada tetap memblokir commit; tidak ada pelolosan otomatis atas naskah bermasalah.

## Flow2API: isolasi antrean dan retry yang terbatas (29 Oktober 2026)

Flow memakai antrean tersendiri dengan konkurensi satu. Media disimpan lokal, mengikuti pemeriksaan kualitas/probe yang sama, dan tidak dipasang bila konteks adegan sudah berubah. Video yang berhasil mengubah motionType menjadi video agar preview/export memakai hasilnya. API key hanya dikirim ke origin server lokal; pengalihan unduhan eksternal tidak membawa Authorization.

Pemilihan akun berada pada backend, bukan penghitungan 20 gambar di renderer. Konektor hanya mengulang penolakan kuota yang eksplisit bila health backend mengumumkan patch kebijakan Kisara aktif. CAPTCHA, auth, koneksi, timeout, atau hasil tak jelas berhenti untuk menghindari pengiriman ganda. Status terhubung tidak dijadikan bukti keberhasilan generasi. Lihat docs/google-flow-lokal.md untuk patch, setup, dan hasil pengujian.

### Peluncur Flow lokal

`flowLocal.ts` hanya menjalankan peluncur instalasi yang dikenal di 127.0.0.1:8765, memakai execFile dengan argumen terpisah dan windowsHide. Startup tidak memblokir pembuatan jendela. Status dan generasi menunggu promise peluncuran yang sama; server sehat dipakai kembali. Timeout/error peluncur tidak menampilkan keluaran proses mentah, yang mungkin berisi informasi sensitif. Endpoint manual lain tidak menjalankan proses lokal. Server tidak dihentikan ketika Kisara ditutup.

### Draf lengkap dan pemeriksaan alur

Draf lengkap yang gagal diperiksa AI tidak diterapkan otomatis sebagai naskah yang lolos. Pengguna dapat memilih membuka checkpoint yang cocok melalui IPC pemulihan tanpa request AI, dengan penanda review tertunda. Ide/pengaturan/klip lama tetap diperiksa sebelum replaceScript. Metadata checkpoint hanya menawarkan tombol; fingerprint penuh tetap diverifikasi saat membuka. Pilihan TTS proyek tidak berubah otomatis saat langkah Ide dibuka karena ia bagian dari fingerprint dan preferensi pengguna.

### Status worker dan proses narasi

Flow setup memakai API backend terautentikasi yang hanya mengembalikan identitas akun, route, status, dan label worker. Pairing adalah pilihan eksplisit pengguna dan tidak boleh meminjam route akun lain. Preflight batch dilakukan sebelum membuat job ketika worker belum siap. Status ini tidak menjadi bukti kuota, login Google, atau generasi pasti berhasil.

Narasi dapat berada pada tahap Whisper sebelum audio per adegan terpasang; tampilkan tahap dan hitungan tersimpan terpisah. Semua provider memeriksa fingerprint dan teks sebelum menerapkan hasil suara. Helper mediaProcess memasang listener abort hanya selama subprocess hidup dan melepasnya pada seluruh jalur selesai/error; jangan menambahkan listener permanen per potongan audio.

### Profil Flow terkelola

Satu profil browser per email dan route UUID; konektor Worker/Updater dibungkus dalam scope terpisah untuk menghindari tabrakan global. Kunci diinjeksikan melalui stdin helper dan storage browser, tidak lewat seed JS atau argumen CLI. Login/OTP pengguna tidak diotomatisasi. Helper wajib mencocokkan email sesi sebelum mengeksekusi sync dan pairing. Akun/profile tidak dipasangkan hanya karena worker sudah tersambung. Browser Playwright pendukung merupakan dependensi lokal; jalur ini tidak mengganti atau mengedit profil Chrome utama pengguna.

### Label pembicara tidak menjadi ucapan TTS
`dialogue[].speaker` dipakai sebagai identitas pembicara, bukan prefiks yang dibacakan.
`composeSceneSpeech` menambahkan isi dialog dan tag pembawaan saja. `stripSpeakerLabels` membersihkan
heading Narator/Narrator dan nama pemeran yang dikenal pada awal baris/kalimat, termasuk format lama
`Kenzo, “...”`; nama yang memang berada di dalam kalimat atau ucapan tetap dipertahankan.

Narasi gabungan mengambil snapshot teks sumber dan teks ucapan terpisah. Semua provider menerima
teks ucapan; pemotongan dan caption mengikuti teks tersebut. Aset mempertahankan `prompt` sebagai
naskah sumber untuk pemeriksaan edit terlambat, dan menyimpan `meta.spokenText` untuk sinkronisasi
caption berikutnya. Rekaman lama tidak diubah otomatis dan perlu direkam ulang secara sadar.
Tidak ada migrasi atau penulisan ulang naskah proyek pengguna. Regresi mencakup kelima provider,
pemotongan FFmpeg, heading/tag/nama literal dan rekaman Windows lokal lewat harness terisolasi.

### TTS per klip menolak hasil yang sudah basi atau dibatalkan
Pemeriksaan fingerprint dan naskah sebelum memasang audio berlaku untuk semua provider, termasuk Gemini dan ElevenLabs. Setelah pengukuran audio selesai, sinyal pembatalan diperiksa sebelum insert aset dan patch klip. Ini mencegah hasil yang terlambat mengganti suara setelah pengguna mengedit naskah, memilih suara lain, atau membatalkan pekerjaan. Regresi `tools/check-clip-tts-stale.cjs` menjalankan 30 kasus provider/perubahan dengan layanan tiruan; tidak memakai kredit atau data pengguna.


### Karakter utama channel dan referensi Flow
Kenzo bawaan berasal dari gambar milik pengguna di resources/kenzo.png. Pengaturan global menyimpan nama, ciri tetap, pilihan aktif dan ID file referensi. Upload menggandakan gambar terverifikasi ke folder channel-character dengan nama UUID; path arbitrer dari renderer tidak diterima. Referensi karakter utama menjadi gambar pertama pada setiap permintaan gambar Flow, tanpa menyunting naskah/proyek lama. Hasil yang terlambat setelah karakter diganti masuk riwayat, tidak dipasang. Mengunggah karakter baru tidak menimpa gambar atau video yang sudah ada.

Transport browser memakai protokol browserMediaVersion 2, worker 1.4.x, dan menolak backend lama sebelum mengirim gambar/video. Lampiran diunggah lewat kontrol normal, dipilih dari pustaka dengan nama berbasis hash isi dan diverifikasi sebelum satu klik kirim. Pemilihan media serta kirim memakai klik Chrome melalui izin debugger yang sudah digunakan worker. Penolakan sebelum kirim tidak mengulang generasi; hasil setelah kirim yang belum jelas harus diperiksa.

Image-to-video mengirim gambar adegan sebagai satu referensi animasi kepada Flow Agent, memilih rasio dan x1 pada kelompok pengaturan video, lalu mengambil media video dari tile hasil. Ini memakai instruksi animasi Agent; belum sama dengan jaminan first-frame numerik dari mode Frames. Durasi diminta 8 detik dan hasil aktual diukur, bukan dijanjikan mengikuti panjang narasi. Klip lebih panjang mengikuti perilaku timeline yang sudah ada. Transfer blob melalui endpoint lokal terautentikasi dibatasi 40 MB dan unduhan sekali pakai, sehingga video tidak dibawa di WebSocket besar. Pengujian browser lokal menggunakan ekstensi nyata dan halaman tiruan; keberhasilan Google harus dicatat terpisah.


Verifikasi implementasi Kenzo: unggahan di Flow Agent masuk pustaka sebelum dipilih sebagai bahan. Klik pemilihan harus memakai input Chrome asli. Sesudah pemasangan, tunggu unggahan selesai dan ambil ulang node composer. Lampiran yang tertinggal hanya boleh digunakan ulang bila gambar hasil decode cocok dengan referensi yang diminta; lampiran berbeda ditolak. Baseline media diambil lagi tepat sebelum klik kirim, termasuk thumbnail yang belum selesai decode; gambar hasil harus sesuai rasio. Ini mencegah unggahan lembar karakter keliru diterima sebagai hasil adegan.

Bukti runtime: satu hasil adegan Kenzo 1376×768 dari Flow asli telah diunduh ke tmp/bugcheck/kenzo-live.png dan diperiksa visual. Uji video Google mencapai persetujuan kredit (approval_required), sehingga keberhasilan video nyata belum diklaim sebelum persetujuan dan hasil diperiksa. Endpoint recover hanya membaca hasil video yang sudah dikirim, tidak membuat generasi baru. Pada sesi yang masih ada, collector mempertahankan baseline; fallback hanya menerima tepat satu video proyek.

Tes native terisolasi kenzo-media-native-verified.log lulus: IPC nyata mengirim referensi bawaan, menyimpan gambar, meneruskan gambar adegan ke I2V, mengonversi video ke H.264 MP4, dan memasang motionType video pada klip. Storyboard dan indikator Kenzo diperiksa pada screenshot. Halaman Flow tiruan dengan worker asli mencakup tujuh kasus referensi/video termasuk pustaka, dua rasio, unggahan gagal dan penggunaan ulang lampiran cocok. Data proyek pengguna dan audio lama tidak diubah oleh harness.


Verifikasi video nyata (4 November 2026): setelah pengguna menyetujui biaya di Flow, Worker 1.4.2 berhasil mengambil hasil yang sudah ada melalui recover tanpa generasi baru. File tmp/bugcheck/kenzo-live.mp4 berukuran 843137 byte, H.264/AAC, 1280×720, 24 fps, durasi 7,96 detik. FFmpeg berhasil mendecode seluruh 191 frame; contact sheet pada empat waktu memperlihatkan Kenzo memasukkan uang ke stoples dengan identitas visual tetap. Hasil nyata tersimpan sebagai artefak uji; pemasangan video pada klip telah diuji terpisah lewat harness native terisolasi, bukan dengan mengubah proyek produksi pengguna. Pengambilan media memakai cookie Chrome hanya ke host Google yang diizinkan, dan API key hanya ke backend loopback.


### Referensi gaya seluruh adegan dan mode Frames (4 November 2026)
Pengaturan Umum memiliki referensi gaya global terpisah dari identitas Kenzo, dengan unggahan gambar terverifikasi dan salinan UUID milik aplikasi. Bawaan mengikuti ilustrasi Kenzo. Instruksi gaya mencakup NPC, lingkungan, bangunan dan properti; preset gaya proyek tidak disertakan jika gaya global aktif. Referensi identitas menjadi gambar pertama, gaya menjadi berikutnya, dan gambar identik tidak diduplikasi. Sisa maksimum tiga referensi dipakai untuk pemeran adegan. Fingerprint antrean dan pemeriksaan sebelum pemasangan hasil menyertakan gaya; mengganti gaya tidak menulis ulang media lama.

Video browser memiliki pilihan eksplisit Agent (bawaan yang sudah terbukti pada Google) atau Frames. Tidak ada fallback diam-diam dari Frames ke Agent. Protokol browserFramesVersion 1 dan action generate_frames_video mencegah server/worker lama menganggapnya generasi Agent. Worker 1.5.1 memeriksa kontrol standar Video/Frames, rasio, x1 dan gambar start frame yang sudah didecode; frame salah atau dilepas sebelum klik menolak pengiriman. Ini baru lolos halaman uji; UI Flow akun pengguna saat inspeksi hanya menampilkan Agent, sehingga keberhasilan Frames pada Google belum diklaim. Pilihan di UI menyatakan batas verifikasi ini.

Regresi: sepuluh kasus worker nyata pada halaman tiruan, termasuk portrait/landscape, mode tidak tersedia, frame salah dan frame dilepas saat input; seluruh kasus negatif nol submit. Uji API backend, unduhan video tanpa generasi baru, dan pengiriman native satu kali lulus. Harness native channel-style-integration-verified.log lulus dengan dua referensi berbeda pada gambar, satu gambar adegan pada video, serta motionType video di timeline terisolasi. Preview panel gaya diperiksa melalui channel-style-ui.png. Typecheck dan build lulus. Tidak ada perubahan proyek produksi atau kredit Google dalam rangkaian tes ini.


### Deduplikasi referensi berdasarkan piksel, bukan encoding PNG
Unggahan gaya yang memakai gambar Kenzo yang sama dapat memiliki byte berbeda dari resources/kenzo.png karena normalisasi PNG. Perbandingan Buffer.equals mengirim dua referensi meskipun piksel identik, sementara Flow memasang satu bahan; worker kemudian menunggu jumlah lampiran yang tidak akan tercapai. Pemeriksaan baca-saja pada kasus pengguna menemukan ukuran file berbeda dengan piksel hasil decode identik. sameReferenceImage membandingkan dimensi dan bitmap decode, memakai kesamaan byte sebagai jalur cepat. Referensi identitas/gaya yang identik dilampirkan sekali dan prompt gaya menunjuk gambar nomor satu. Gambar berbeda tetap terpisah; tidak memakai toleransi warna yang dapat menyatukan karakter/gaya berbeda.

Regresi native reference-dedup-native.log: PNG hasil normalisasi berbeda byte tetapi sama piksel; gambar berbeda dimensi tidak digabung; IPC upload asli dan generate.clipImage mengirim tepat satu referensi untuk identitas dan gaya, kemudian menyimpan hasil pada klip uji. Lampiran Kenzo di Chrome aktif juga diverifikasi dapat dibaca tanpa submit Google baru. Typecheck dan build lulus. Data pengguna tidak ditulis oleh pengujian. Perbaikan berada di proses utama Kisara; tidak membutuhkan reload worker.
