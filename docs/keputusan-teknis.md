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


### Pemilihan model Flow otomatis sebelum validasi (5 November 2026)
Worker 1.5.2 tidak lagi menolak model selain Nano Banana 2.1 sebelum mencoba memilihnya. Dropdown dibuka melalui kontrol model yang teramati, pilihan 2.1 dicari secara tepat pada role option maupun menuitem, lalu label model dibaca ulang setelah seleksi. Flow nyata menggunakan menuitem; mengandalkan option saja membuat pemilihan tidak berjalan. Model lain tidak dipilih sebagai fallback jika 2.1 tidak tersedia. Node model yang diganti saat render ditangani dengan query ulang. Jika panel pengaturan masih terbuka dan editor sementara tersembunyi, worker menyelesaikan pengaturan dulu, kemudian memperoleh editor baru dan tetap menolak draft yang berbeda sebelum kirim.

Pengujian Flow nyata secara terkontrol memulai dari Nano Banana Pro, menjalankan prepare_image tanpa Generate, lalu membaca kembali Nano Banana 2.1, image aspect 9:16 dan x1. Panel ditutup sesudah pemeriksaan; tidak ada generasi/kredit yang dipakai. Regresi lokal mencakup role option/menuitem, node model diganti, model tidak tersedia (nol submit), serta editor yang kembali setelah Simpan. Tidak ada pengulangan paid submit atau pemilihan model pengganti yang tidak diminta.


### Composer Flow stabil antar-klip dan akses image-to-video (5 November 2026)
Worker 1.5.3 menunggu maksimal 10 detik untuk satu editor prompt yang terhubung dan stabil pada dua pemeriksaan, sebelum konfigurasi, setelah panel pengaturan ditutup, dan setelah lampiran diunggah. Hilangnya editor selama render tidak langsung menjadi prompt_not_found. Panel pengaturan yang sudah terbuka tetap dapat diselesaikan sebelum memperoleh editor. Jeda ini hanya sebelum paid submit; draft pengguna, CAPTCHA, pekerjaan aktif dan hasil sesudah submit tetap menghentikan antrean tanpa retry otomatis. prepare_image juga menunggu editor pulih sebelum melaporkan berhasil.

Regresi worker mencakup editor terlambat pada awal pekerjaan, 1,8 detik setelah Simpan, dan setelah unggahan. Ketiganya berhasil dengan satu submit pada halaman tiruan. prepare_image di Flow asli kembali ke satu editor dan satu tombol kirim, draft kosong, tanpa generasi baru. Uji antrean 73 pekerjaan tetap membuktikan konkurensi satu, hasil selesai dipertahankan, dan pekerjaan berikutnya dibatalkan setelah kegagalan.

Tombol Jadikan N video dipindahkan dari Alat lainnya ke toolbar Visual & suara. Semua gambar harus siap, tetapi narasi bukan prasyarat I2V; audio tetap dapat dibuat terpisah. Prompt Google Flow dipindahkan ke Alat lainnya untuk menjaga lebar toolbar. Konfirmasi jumlah video dan biaya tetap berlaku sebelum batch. Uji UI native memakai proyek demo terisolasi dengan seluruh audioAssetId dikosongkan; tidak mengirim generasi Google dan tidak mengubah proyek pengguna.


### Referensi pustaka dipakai ulang dan jeda busy sebelum submit (5 November 2026)
Worker 1.5.4 membuka pemilih bahan dan mencari nama berbasis hash sebelum melakukan unggahan. Bila seluruh referensi tersedia, pilih bahan tersebut tanpa mengunggah; bila hanya sebagian tersedia, unggah hanya gambar yang belum ditemukan, lalu pasang semua bahan sesuai urutan referensi. Piksel lampiran terpasang tetap dibandingkan dengan referensi; nama file yang cocok saja tidak cukup untuk menerima gambar yang salah. Salinan lama dalam pustaka tidak dihapus. Pemilih yang memakai virtualisasi dapat membuat bahan yang tidak termuat belum ditemukan; jalur unggahan tetap tersedia, jadi ini bukan deduplikasi menyeluruh seluruh aset proyek.

Sebelum persiapan dan sebelum klik kirim, tunggu Flow idle stabil 1,2 detik, maksimal 30 detik. Busy sementara pada akhir jawaban Agent tidak langsung membatalkan batch berikutnya. Batas waktu tetap menolak pengiriman jika aktivitas tidak selesai; CAPTCHA/draft berbeda dan hasil ambigu tidak diulang otomatis. Tes worker nyata pada halaman tiruan mencakup library_reuse (nol unggahan, satu submit), busy_then_idle dan validasi piksel. Inspeksi Flow asli menemukan beberapa aset dengan nama hash Kenzo yang sama, sesuai unggahan ulang dari versi sebelumnya. Uji ulang pustaka pada Flow asli melewati timeout endpoint inspeksi; keberhasilannya tidak diklaim. Tidak ada paid submit dari pemeriksaan tersebut.


### Pemasangan pustaka langsung dan editor tab latar (5 November 2026)
Worker 1.5.5 menangani pemilih bahan Flow yang langsung memasang kartu dan menutup pustaka tanpa tombol Tambahkan ke perintah. Kontrol pustaka memakai klik elemen terlebih dahulu, memeriksa perubahan UI, lalu hanya memakai input native sebagai fallback pada pemilih lama yang masih terbuka. Pemilihan bahan ini terpisah dari paid submit yang tetap satu kali dan memerlukan input native. Referensi terpasang tetap diverifikasi lewat piksel.

Editor prompt yang unik, terlihat dan terhubung langsung diterima; tidak lagi harus mempertahankan identitas node atau menunggu polling kedua. Flow dapat mengganti node setelah lampiran berubah, sementara timer tab latar dapat menunda polling sampai melampaui deadline. Editor tetap diperoleh ulang setelah setiap perpindahan UI. Batas waktu hanya dipakai saat editor belum siap; tidak ada retry paid submit.

Bukti Flow asli: tiga preflight pemasangan Kenzo berurutan berhasil dengan referenceVerified=true, newUploads=0 dan paidSubmits=0. Uji memasang bahan dari pustaka ke prompt lalu memverifikasi piksel; tidak mengisi prompt atau membuat gambar. Ini membuktikan perbaikan preflight, bukan keberhasilan batch generasi berbayar penuh. Regresi ekstensi mencakup library_dom (klik DOM langsung), library_instant (input native), pemilih dengan tombol konfirmasi, dua rasio, editor terlambat, dan kegagalan lampiran yang menolak submit. Salinan lama pustaka tetap dipertahankan.


### Job video melewati lima menit dan pemulihan hasil (5 November 2026)
Job video Biaya Penanganan Awal gagal dengan fetch failed sekitar 303 detik setelah dibuat, sedangkan Flow menghasilkan video. AbortSignal 735 detik tidak mengganti batas headers tersendiri milik Node fetch. POST browser/image sekarang menggunakan node:http dengan sinyal pembatalan yang sama dan batas respons 64 MB, hanya ke endpoint loopback yang tepat, tanpa redirect/retry. Tes HTTP nyata menahan headers 310 detik: respons diterima, satu request; pembatalan tidak mengirim ulang. Batas video server 720 detik dan batas aplikasi 735 detik tetap berlaku.

Ambil video dari Flow adalah IPC/job pemulihan terpisah. Pengguna memilih klip dan membuka video yang sesuai di akun Chrome yang dipilih, lalu mengonfirmasi pemasangan. Mode selected menolak nol atau beberapa pemutar, tidak menggunakan collector lama atau memilih tile secara acak. Mode pemutar canvas Flow memiliki jalur Download media → 720p Ukuran asli; tidak meminta upscale atau generasi. Worker 1.5.7 mengamati download blob dari origin Flow melalui izin downloads dan menunggu file complete. Main hanya membaca MP4 baru di folder Downloads standar, setelah realpath, waktu modifikasi, ukuran yang cocok dan batas 40 MB diperiksa; folder unduhan khusus diarahkan ke Impor video. File dinormalisasi dan diverifikasi durasinya melalui jalur aset video yang sama; perubahan adegan selama unduhan tetap menyimpan hasil sebagai riwayat.

Bukti nyata: video Fee block attaches to price bloc (adegan Biaya Penanganan Awal) berhasil diambil, 2045455 byte, tanpa generasi baru. Fixture Chrome memakai ekstensi asli dan download MP4 blob sungguhan; mode selected nol/dua pemutar menolak, satu pemutar diterima, seluruhnya nol Generate. UI tombol/konfirmasi diperiksa dengan harness terisolasi dan screenshot. Unduhan baru tidak mengganti atau menghapus aset lama pengguna.

Verifikasi native pemulihan: harness terisolasi memanggil window.api.generate.recoverFlowVideo melalui preload/IPC nyata, mengambil hasil Flow asli, menormalisasi MP4 dan memasang aset ke klip demo. Log recovery-video-native.stdout.log mencatat PASS; database uji memperlihatkan motion_type=video, durasi 7940 ms, 720×1280. Screenshot recovery-video-native.png diperiksa. Proyek produksi belum dimodifikasi oleh harness; pengguna perlu membuka ulang aplikasi agar handler IPC baru aktif, lalu mengambil hasil pada klip yang sesuai.


### Audit Flow, prompt I2V tunggal dan hasil canvas otomatis (6 November 2026)
Audit menemukan bahwa jalur recover canvas sudah bekerja, tetapi collector sesudah Generate masih menunggu elemen video yang tidak ada pada editor canvas. Worker 1.5.8 sekarang membuka hanya tile hasil baru yang unik (berdasarkan baseline sebelum submit), lalu memakai jalur unduhan ukuran asli yang sama. Endpoint menerima metadata unduhan untuk hasil kind video otomatis maupun pemulihan; main menggunakan verifikasi file yang sama di kedua jalur. Gambar tidak boleh menerima downloadFile video. Tidak ada retry paid submit atau pemilihan tile sembarang bila hasil lebih dari satu.

Pemilihan beberapa referensi pustaka memakai query ulang per nama dan membuka kembali picker sesudah tiap pemasangan langsung. Ini berlaku pada cache lengkap maupun sesudah unggahan baru, sehingga referensi berikutnya tidak memakai node kartu yang sudah tertutup. Regresi library_multi_cached dan library_multi_upload memasang dua bahan, dengan satu submit akhir.

flowVideoPrompt di shared/flow dipakai oleh generasi Flow otomatis, ekspor panduan dan tombol Salin prompt video pada panel Gerak → Video AI. Gambar acuan menentukan identitas, pakaian, gaya dan lingkungan; nama/deskripsi lama yang berlawanan tidak mengganti gambar. Instruksi mempertahankan tulisan/angka yang sudah ada, melarang tambahan baru, dan meminta tanpa dialog/narator/musik. Adegan yang sudah memiliki gambar dapat mengekspor prompt video tanpa TTS atau prompt gambar baru; arahan gerak kosong memakai gerak ringan sebagai fallback. Ini instruksi model, bukan jaminan fidelitas pixel atau durasi model.

Paket manual exports/Flow-Manual-Promo-Bunga.zip dibuat dari tujuh gambar dan arahan gerak proyek produksi secara read-only. File bernomor sama dipasangkan, rasio 9:16; sumber proyek dan aset pengguna tidak diubah. Uji seluruh alur baru memakai fixture lokal untuk menghindari generasi berbayar saat audit. Batas hasil lebih dari 40 MB, folder Downloads khusus dan persetujuan kredit tetap memerlukan penanganan eksplisit.

Hasil audit native akhir: flow-audit-native-2.stdout.log mencatat empat job I2V serial lewat IPC nyata dan HTTP loopback, tiap job mengirim satu referensi dan prompt shared yang sama, menerima downloadFile lalu menormalisasi dan memasang video pada keempat klip. Log renderer mencatat SPEAKER LABEL PASS dan I2V COPY UI PASS. Screenshot flow-audit-native.png diperiksa. Pengujian ini memakai respons generasi tiruan dan unduhan MP4 valid lokal; tidak membuktikan empat generasi Google berbayar langsung dan tidak mengubah proyek produksi. Typecheck/build serta regresi worker, CDN, referensi ganda, router, guard dan timeout lulus.

Audit screenshot juga menemukan empat aksi video melampaui lebar panel kanan setelah tombol salin/pemulihan ditambahkan. Baris aksi sekarang flex-wrap; harness memeriksa semua tombol tetap di dalam viewport pada lebar jendela 1424 px. Ini perubahan tata letak saja; tidak mengubah job atau media.


### Adegan beraksi dan paket publikasi per video (6 November 2026)
Penyusun visual memprioritaskan subjek yang melakukan aksi pada objek dan memperlihatkan akibat yang sesuai naskah. Pose presenter menunjuk ponsel raksasa/papan/diagram, panggung dekoratif, dan latar pengisi tidak menjadi default. Contoh finance harus tetap ilustratif: jangan mengarang pengalaman orang nyata, kerugian, angka atau bukti. Shot bervariasi mengikuti objek/reveal/reaksi dan kontinuitas. Fingerprint visual-draft-v3-actions memisahkan cache prompt lama; media lama tetap menjadi riwayat dan arahan baru berlaku pada penyusunan visual berikutnya.

EditorSettings.publication menyimpan judul YouTube, deskripsi, hashtag, origin dan source. Tidak perlu kolom/migrasi SQL karena memakai editor_json yang sudah ada. Naskah baru meminta paket publikasi dalam schema yang sama; draf pulih mempertahankan metadata opsional. Naskah panjang/draf tanpa metadata dapat memakai panggilan khusus setelah script tersimpan. Kegagalan metadata tidak membatalkan script lengkap; draf berlabel tetap tersedia dan pengguna dapat memakai Buat paket SEO. Perubahan isi/bahasa/format/aspek menandai paket lama tidak sesuai. Respons AI yang datang sesudah sumber berubah tidak diterapkan.

Panel Judul & deskripsi tersedia dari header proyek, memisahkan judul upload dari nama proyek. Isi dapat diedit, disalin per bagian/semua, dan disimpan sebagai TXT melalui IPC. Batas judul 100, deskripsi 5000 karakter; hasil AI memerlukan 3–5 hashtag relevan, dinormalisasi dan deduplikasi tanpa membedakan kapital. Paket disimpan per proyek, tidak diunggah ke YouTube. Tidak ada klaim pengukuran volume keyword atau jaminan ranking/views. Prinsip judul/deskripsi unik, topik utama pada awal teks dan hashtag relevan mengikuti panduan resmi YouTube (support.google.com/youtube/answer/12948449 dan /6390658).

Regresi publikasi mencakup respons kosong/tidak lengkap, sumber berubah saat AI bekerja, deduplikasi hashtag, format TXT dan perubahan aspek. Regresi pemulihan naskah tetap lulus. Harness native publication-ui.stdout.log membuktikan klien model/IPC nyata (model lokal tiruan), penyimpanan metadata dalam editor_json dan ekspor TXT; screenshot publication-ui.png diperiksa. Paket manual proyek Promo Bunga memiliki JUDUL-DESKRIPSI-HASHTAG.txt yang disusun dari isi video. Tidak ada perubahan langsung ke database produksi selama pengujian.


### Flow: satu kiriman berisi maksimal 10 adegan (7 November 2026)
Mode gambar browser pada aksi Buat semua mengelompokkan maksimal 10 klip menjadi satu perintah Agent, mengikuti alur manual pengguna yang menempelkan beberapa prompt sekaligus. Ini bukan sepuluh klik Generate dan tidak menjamin Google memproses semua adegan paralel. Setiap adegan meminta label KISARA_CLIP_<id> pada balasan chat, di luar gambar. Collector hanya menerima pasangan label dan gambar yang unik dalam balasan permintaan yang sama; tidak memakai urutan galeri sebagai identitas klip.

Satu akun memiliki seluruh kelompok. Pada pilihan Otomatis, akun berikutnya dipakai setelah hasil kelompok sebelumnya dikonsumsi dan disimpan. Setiap akun siap mendapat maksimal satu kelompok per putaran; putaran baru dapat melanjutkan sisa gambar. Pilihan akun manual tetap terikat pada akun itu. Kuota eksplisit sebelum submit boleh pindah akun; penolakan keamanan, hasil ambigu, atau kegagalan sesudah submit menjeda antrean. Hasil parsial yang sudah terpetakan tetap disimpan. Pembatalan menghentikan pekerjaan lokal/kelompok berikutnya, bukan membatalkan permintaan yang sudah diterima Google.

FlowImageBatch menyimpan snapshot prompt, fingerprint, identitas dan referensi per kelompok. Job per klip tetap memakai jalur normalisasi, riwayat aset dan pemeriksaan perubahan adegan yang sama. Buffer referensi dilepas setelah pengiriman. Endpoint image-batch memvalidasi 1–10 ID unik, pemilik future worker, capability Worker 1.6.0 dan URL hasil. Penyimpanan media tidak lagi menghapus unduhan lain saat beberapa hasil diterima.

Uji coordinator, klien HTTP, backend dan Chrome tiruan lulus: satu submit berisi 10 adegan, penyelesaian terbalik tetap dipetakan menurut ID, kegagalan parsial menyimpan sembilan hasil yang sah dan tidak mengirim kelompok baru. Harness native terisolasi membuktikan IPC nyata, 12 job dalam kelompok 10+2 pada dua akun, normalisasi serta pemasangan aset. Typecheck dan build lulus. Uji awal Flow asli dua adegan berhenti sebelum submit karena dialog hak penggunaan referensi pada akun Acek; belum membuktikan batch Google asli. Menunggu persetujuan pengguna terhadap dialog tersebut, tanpa melewati persetujuan atau mengulang generasi berbayar.


Uji Flow asli lanjutan: satu kiriman pada akun Acek membuat dua gambar Kenzo (menabung dan berbelanja di pasar). Flow menaruh dua label pada teks terpisah dan dua gambar dalam satu gallery, sehingga collector berbasis pembungkus label+gambar semula menolak pemetaan. Mapper sekarang juga menerima satu respons dengan satu gallery, tepat satu label unik untuk setiap klip, dan nomor Option/Opsi 1..N yang lengkap serta unik. Nomor eksplisit dipasangkan dengan daftar label balasan; posisi DOM thumbnail tidak menjadi identitas. Label/nomor ganda, hasil kurang, gallery ganda dan batch key yang berbeda tetap ditolak. Fixture mengacak urutan node gallery dan tetap memasangkan berdasarkan nomor opsi.

Kedua hasil lama diambil melalui recover_image, tanpa Generate baru, disimpan di exports/Flow-Batch-Kenzo-Uji dan diperiksa visual: koin masuk ke toples untuk trial_kenzo_coins, belanja tomat untuk trial_kenzo_market. Pemulihan meminta batch key lengkap, himpunan ID unik dan satu ID tujuan yang dikenal; backend menolak payload lain. Dua gambar Google asli terbukti dibuat dari satu kiriman, terpetakan dan terunduh. Uji sepuluh gambar Google asli belum dilakukan; bukti sepuluh masih fixture Chrome. Tidak ada perubahan langsung pada database atau guard produksi, dan akun dengan penolakan keamanan tidak dialihkan otomatis.


Uji sepuluh gambar Google asli kemudian lulus pada akun Acek: satu kiriman untuk sepuluh adegan proyek Gen Z (06–15), sepuluh pending tile terlihat bersamaan, lalu sepuluh gambar terpetakan dan terunduh. Hasil ada di exports/Flow-Batch-GenZ-06-15, dengan nama bernomor adegan dan ID klip; sepuluh file diperiksa valid serta contact sheet ditinjau. Paket ZIP berisi hanya sepuluh JPG dan petunjuk impor. Database proyek produksi tetap hanya dibaca, sehingga pengguna mengimpor paket lewat jalur normal Kisara.

Flow memang merender hanya enam opsi sampai Lihat semua ditekan. Collector kini membuka tombol tersebut hanya dalam respons batch yang dimiliki, dengan tepat satu kontrol yang cocok; tidak menekan Generate. Uji asli menutup galeri yang sama lewat Lihat lebih sedikit, lalu helper membukanya otomatis kembali: collapsed=6, expanded=10, mapped=10. Fixture memastikan pemetaan berdasarkan nomor opsi meskipun DOM dibalik, label ganda ditolak, dan pemulihan tidak menambah submit. Pembacaan label memakai text node agar label terakhir tidak tergabung dengan tulisan tombol UI. Bukti ini menggantikan batas sebelumnya bahwa sepuluh hanya diuji dalam fixture. Pergantian akun 10+2 terbukti melalui native IPC dengan server tiruan; belum diuji antar-dua akun Google asli dalam satu putaran.


### Kesiapan halaman Flow dan status koneksi (7 November 2026)
Laporan gagal pada klip 16 menunjukkan pesan browser_not_ready ketika worker tetap terhubung. Pemeriksaan awal menemukan akun 1 tidak dapat dibaca sebagai satu proyek, sedangkan akun 2–4 memiliki kotak prompt. Pada pemeriksaan berikutnya halaman akun 1 kembali terbaca; status kuota akun 1 yang pernah habis dan jeda uncertain_result produksi masih tersimpan. Tidak ada perubahan langsung pada routing, guard atau database produksi selama audit ini.

Pemilihan akun gambar/video kini memeriksa halaman kandidat sebelum submit: satu proyek, tepat satu kotak prompt dan tombol kirim, online, tidak sedang bekerja dan tidak berisi draft. Mode Otomatis melewati kandidat dengan masalah halaman sebelum mengirim; mode manual melaporkan akun tujuan dan alasannya. Pembatasan Google pada kandidat menjeda generasi. Tidak ada perpindahan akun setelah hasil ambigu. Browser inspection lama yang tidak memiliki metadata composer tidak diklaim siap. Jadwal kuota tidak ditebak.

flowReadiness dipakai bersama main dan renderer. FlowSetup menampilkan flag kuota tersimpan melalui pembacaan router, tanpa mengubahnya. Pengaturan membedakan Server tersambung, Sambungan worker, kesiapan halaman, kuota habis terdeteksi, dan jeda generasi. Semua halaman diperiksa pada pembukaan/perbaruan dan setiap 15 detik saat panel terbuka. Formulir tambah akun serta pemasangan worker dilipat; pemilihan akun berada sebelum daftar status. Penjelasan lama bahwa video/referensi belum tersedia dan seluruh gambar selalu dikirim satu per satu dihapus agar sesuai implementasi batch 10.

Regresi klien utama dan batch lulus: proyek tidak terbaca/busy/draft dilewati sebelum generasi, manual tidak pindah akun, blok Google menghasilkan nol submit dan jeda global, flag kuota sesuai state tersimpan. Pemeriksaan akun asli dengan routing sementara memilih akun 2 dan mengecualikan akun 1 yang tercatat habis; tidak ada permintaan generasi Google. Harness native pada profil sementara membuktikan batch 10+2 tetap tersimpan, empat worker tersambung hanya menghasilkan satu halaman siap pada fixture, serta kuota dan jeda tidak terlihat sebagai siap generasi. Screenshot flow-readiness-native.png dan flow-readiness-paused.png ditinjau; typecheck dan build lulus. Pengguna membuka ulang Kisara untuk memuat kode baru. Jeda lama hanya dapat dilanjutkan melalui aksi eksplisit satu percobaan dan satu gambar yang berhasil sebelum batch berikutnya.


### Perkembangan cerita dan adegan (7 November 2026)
Audit video Gen Z dan video pembanding menunjukkan pengantar berlarut, argumen berulang dan ilustrasi meja yang statis. Kontrak ENGAGEMENT_DIRECTION kini dipakai pada perencanaan format, penulisan factual/fiction, perbaikan naskah serta pemeriksaan editorial. Pembuka diarahkan pada keputusan atau masalah konkret, ada jawaban parsial awal, setiap bagian menambah perkembangan, dan penutup satu payoff singkat. Materi faktual tetap harus menjaga fakta, angka, batas simulasi dan tidak mengarang biografi, percakapan, sumber atau hasil investasi. Tokoh ilustrasi yang memang disetujui boleh membawa contoh, bukan diklaim sebagai kasus nyata.

Alokasi naskah panjang menggunakan storyBeatSlots: beat pertama dan terakhir mendapat satu adegan masing-masing; seluruh beat tengah dipertahankan dalam urutan asli. Ini menggantikan pembagian rata yang ikut memanjangkan pengantar dan kesimpulan. ID global, jumlah slot dan checkpoint parsial tidak berubah. Pemeriksaan lintas adegan sekarang melihat situasi visual serta narasi, dan menilai pengulangan yang nyata tanpa menganggap pemakaian ulang objek/angka untuk langkah baru sebagai kesalahan. Kutipan temuan tetap harus cocok persis; hasil review gagal tidak menimpa proyek.

SCENE_DIRECTION mengarahkan pilihan, interaksi, detail penemuan dan konsekuensi, menjaga kontinuitas lokasi/wardrobe serta gaya NPC dan latar. Prompt I2V meminta starting state sebelum aksi dan satu perubahan fisik yang sesuai frame. Konteks storyboard kini membawa situasi dan narasi, bukan salah satunya saja; fingerprint visual v4 mencegah prompt draft v3 yang belum diterapkan terpakai kembali. Tidak ada perubahan worker Flow atau format database. Proyek lama tidak ditulis ulang otomatis; gunakan Perbaiki naskah & dialog lalu tinjau dan perbarui prompt sebelum generasi ulang.

Validasi: check-story-direction.cjs menguji 3–160 slot, beat lengkap/berurutan, drafting factual/fiction, perbaikan editorial dengan kutipan, penolakan review invalid tanpa overwrite, serta penerapan prompt gambar dan I2V melalui fixture. check-script-resume.cjs lulus termasuk checkpoint perbaikan, pemulihan eksplisit, pembatalan dan invalidasi saat sumber berubah. Typecheck dan build akhir lulus. Native harness dengan profil sementara berhasil membuka workflow proyek; screenshot project.png ditinjau.

Uji penulis asli pada endpoint custom yang sudah dikonfigurasi, dengan penyimpanan proyek tiruan, menghasilkan contoh enam adegan dan prompt geraknya; pembuka berubah menjadi Kenzo menarik uang di kasir. Naskah/prompt ada di tmp/bugcheck/story-direction-1794029027680/live. Penulis masih dapat memilih rangkaian desk shot; instruksi bukan jaminan kualitas estetika atau retensi. Belum ada video penuh baru, pengukuran audiens, atau bukti hasil melebihi pembanding. Tidak ada generasi Flow/TTS, perubahan data proyek produksi atau konsumsi kredit gambar/video dalam pengujian ini.


### Anggaran adegan adaptif, audit klaim, ucapan, dan pemeriksaan storyboard (8 November 2026)
Kerangka naskah panjang mengembalikan sceneCount di antara jumlah beat dan batas adegan dari durasi. Batas durasi bukan kuota yang wajib diisi. Target disimpan sebagai targetCount di checkpoint; draf parsial tetap harus merupakan prefix ID berurutan, sedangkan draf lengkap boleh memiliki celah ID setelah bagian yang sepenuhnya berulang dibuang. Pemeriksaan editorial hanya boleh membuang bagian tengah yang tidak membawa fakta, batasan, jembatan sebab-akibat, reaksi, atau payoff baru; pembuka dan penutup tetap dipertahankan. Draf hasil pemangkasan disimpan sebelum pemeriksaan berikutnya.

Materi faktual menjalani audit klaim terpisah SETELAH perbaikan alur, termasuk ketika memakai Perbaiki naskah & dialog. Audit menilai angka, satuan, periode, definisi, ketentuan produk dan kekuatan kesimpulan terhadap bahan yang tersedia. Model tidak memiliki browsing; catatan/transkrip tidak otomatis menjadi bukti dan audit ini bukan verifikasi independen. Kutipan yang tidak cocok, respons tidak lengkap, atau temuan yang belum terselesaikan menghentikan penerapan. Pemulihan draf eksplisit tetap melewati AI dan mempertahankan penanda perlu tinjau.

shared/speech menentukan pembawaan default: natural untuk materi faktual atau belum diklasifikasikan, dramatis untuk fiksi yang dinyatakan eksplisit; pilihan pengguna tetap menang. Jalur TTS per klip dan narasi utuh memakai normalisasi ucapan Indonesia yang sama untuk nominal Rp, persen dan singkatan terpilih. Bahasa lain, URL, tanggal dan penanda vokal dipertahankan. Naskah asli tetap dapat diedit; aset menyimpan spokenText hasil normalisasi dan kata caption mengikuti teks yang benar-benar dibacakan. Fingerprint mencakup versi normalisasi dan bahasa. Rekaman lama tidak ditulis ulang otomatis. Saat klip dipotong, naskah dibagi dari spokenText agar perluasan satu nominal menjadi beberapa kata tidak salah memotong naskah; setiap potongan menyimpan spokenText miliknya sendiri.

Penyusunan visual membawa prompt yang telah diterima dari kelompok sebelumnya dan melakukan pemeriksaan keseluruhan storyboard sebelum penerapan. Pemeriksa membedakan pose/situasi duplikat dari kontinuitas objek dan langkah baru yang diperlukan. Maksimal dua putaran perbaikan hanya menyentuh adegan yang ditandai dengan kutipan aksi yang cocok; gambar awal yang sudah disetujui untuk permintaan motion-only tidak ditulis ulang. Kegagalan mengembalikan checkpoint sebelumnya dan tidak menerapkan sebagian prompt. Fingerprint visual v5 mencegah checkpoint lama melewati pemeriksaan baru.

Validasi: check-story-direction, check-prompt-quality, check-script-resume, check-comprehension, dan check-content-format memakai AI tiruan serta penyimpanan terisolasi. Kasus mencakup 12 dari anggaran 39 adegan, penghapusan duplikat dengan ID tetap, pemulihan checkpoint ringkas, audit klaim, perbaikan hanya adegan visual yang ditandai, kutipan invalid, pembatalan dan perubahan sumber. Native harness profil sementara membuktikan default Natural, teks ucapan/caption per klip dan narasi utuh, sumber yang tetap dapat diedit, serta kedua metadata potongan audio. Layanan F5 ditiru memakai suara Windows SAPI; tidak ada kredit gambar, TTS cloud atau data produksi yang dipakai.


### Brainstorm Long dimulai dari pengalaman penonton (8 November 2026)
Arahan brainstorming Long menargetkan pekerja Indonesia usia kira-kira 20–45, termasuk pekerja muda dan orang berkeluarga sesuai preferensi kreator. Arahan tambahan yang lebih spesifik tetap diutamakan. Ini profil editorial yang dipilih, bukan kesimpulan dari analytics channel. Kandidat harus berangkat dari situasi yang dapat dikenali, pilihan atau tekanan yang spesifik, sudut yang kurang kentara, dan mekanisme/konflik yang cukup berkembang untuk Long. Pembuka memberi masalah konkret dan jawaban parsial; bagian berikutnya perlu menambah penemuan atau konsekuensi, kondisi/batasan, lalu satu payoff. Naskah tidak dipanjangkan untuk memenuhi delapan atau sepuluh menit.

Brainstorm mengembalikan audience sebagai bagian kontrak; kartu menampilkan Buat siapa dan Kenapa layak dicoba. Saat dipilih, audience diteruskan ke storyBrief.sourceOptions.audience dan hook serta alasan menonton ke contribution, sehingga penulis tidak kembali memakai penonton pemula yang generik. Format JSON editor yang sudah ada tetap dipakai tanpa migrasi database atau IPC baru. Judul dan angle yang identik setelah normalisasi kapitalisasi/tanda baca ditolak; kesamaan makna masih memerlukan penilaian model/kreator.

Kebaruan dan potensi retensi adalah hipotesis. Brainstorm tidak melakukan riset web atau membaca analytics; model dilarang mengklaim viral, kompetisi rendah, pasti relatable, atau pasti jarang dibahas. Kandidat Long diminta menyebut pencarian/perbandingan sudut YouTube yang perlu dilakukan dan bukti untuk klaim utamanya. Niche lain tetap dipertahankan; contoh tekanan keuangan tidak dipaksakan ke semua genre. Short tetap memakai cakupan formatnya sendiri.

Validasi check-brainstorm.cjs memakai penulis tiruan untuk memeriksa kontrak Long, preferensi kreator, mode fiksi, isolasi default Short, penolakan duplikat dan audience/kerangka tidak lengkap. Native harness profil sementara menampilkan enam kandidat, memeriksa teks dan tata letak, memilih ide orang berkeluarga, lalu membuktikan audience, hipotesis menonton dan kerangka Long tersimpan pada proyek. Screenshot candidates.png ditinjau. Typecheck dan build lulus; hasil ini memverifikasi integrasi, bukan membuktikan kebaruan topik atau retensi nyata.


### Pembagian shot visual sebelum produksi media (8 November 2026)
Satu bagian narasi tidak lagi harus menahan satu gambar selama 8–15 detik. Sebelum generateVisuals menyusun prompt, divideUnproducedShots membagi bagian panjang yang belum mempunyai prompt, aset gambar/video/audio, trim, atau efek bertaut. Antrean media aktif mencegah pembagian. Klip yang sudah diproduksi dan prompt yang telah disetujui dipertahankan; proyek lama tidak ditulis ulang di latar belakang.

Aturan murni di shared/visualShots.ts memilih batas kata dengan prioritas akhir kalimat/klausa, target sekitar 4,5 detik (pembuka 3 detik), batas 7 detik (pembuka 4,5 detik), minimum 1,8 detik. Bobot ucapan memperhitungkan perluasan nominal Indonesia dan tag jeda. Nominal beserta skala/satuan tidak dipisahkan. Teks, spasi, tanda baca dan tag dipertahankan persis; jumlah durasi semua shot sama dengan durasi sumber. Teks sangat pendek atau tanpa pembagian layak dipertahankan, bukan diisi kalimat rekaan. Durasi ini perkiraan sebelum TTS, bukan batas wajib untuk hasil rekaman nyata.

Pembagian disimpan dalam transaksi SQLite, ID pertama dipertahankan dan shot berikutnya memakai ID baru. Setiap shot membawa konteks sumber serta fokus bagian narasinya. Prompt meminta momen berbeda yang relevan (situasi, detail, reaksi atau konsekuensi), bukan pose sama dengan zoom lain, dan masih menjalani pemeriksaan urutan visual. Fingerprint draft v6 memisahkan arahan lama. Bundle segera diterbitkan agar autosave memakai daftar shot terbaru. Jika penulis visual gagal, pembagian yang sudah selesai tetap tersedia dan retry tidak menggandakan shot. Jumlah gambar serta kebutuhan generasi dapat bertambah; panel Flow menjelaskan ini sebelum pengguna menyusun prompt.

narrationTakeText dipakai seluruh penyedia rekaman utuh: batas visual di tengah kalimat memakai spasi, bukan instruksi jeda panjang/paragraf. Batas kalimat mempertahankan separator sebelumnya. Rekaman lama tidak diubah. Pratinjau dan ekspor tetap memakai klip dan aturan timeline bersama yang sama; tidak ada efek atau waktu tambahan yang hanya dihitung pada satu sisi.

Validasi: check-visual-shots memeriksa teks lossless, jumlah durasi, rentang shot, retry, nominal dan perlindungan media serta separator TTS. Regresi story-direction, prompt-quality, script-resume, content-format dan comprehension lulus dengan penulis tiruan. Typecheck dan build lulus. Native harness profil terisolasi membuktikan satu bagian 15 detik menjadi tiga shot, semua klip demo yang sudah punya aset tetap identik, antrean aktif memblokir pembagian dan pengulangan tidak menambah shot. Screenshot flow-shots.png pada lebar 1180 px diperiksa dan teks panel/posisi tombol diverifikasi dari DOM. Bukti ada di tmp/bugcheck/visual-shots-native-1794148166969 (stdout.log dan ui.log); percobaan screenshot pertama berada di tab Baca naskah sehingga pemeriksaan panel Flow baru lulus setelah tab yang benar dibuka. Tidak ada data produksi atau kredit Flow/TTS yang dipakai. Belum ada pengukuran retensi penonton atau pembuktian kualitas gambar baru dari layanan asli.


### Bahasa hasil brainstorming mengikuti pilihan proyek (8 November 2026)
Laporan pengguna memperlihatkan enam kartu Finance dalam bahasa Inggris meskipun bahasa pilihan Indonesia. Instruksi singkat Write in Indonesian sebelumnya tidak disertai pemeriksaan hasil. Brainstorm kini menegaskan kontrak bahasa di akhir system prompt dan outputLanguage pada prompt: seluruh nilai teks judul, audience, angle, hook, synopsis, why, outline dan checks memakai bahasa pilihan; nama kunci JSON tidak diterjemahkan. Instruksi tambahan dan judul sebelumnya tidak boleh mengganti bahasa pilihan. Panel menampilkan Bahasa hasil agar pilihan terlihat sebelum generasi.

shared/brainstormLanguage mendeteksi prosa Inggris yang jelas pada hasil Indonesia secara konservatif melalui perbandingan kata fungsi di setiap bidang. Ini penanganan kasus yang dilaporkan, bukan pendeteksi universal semua bahasa atau jaminan menangkap setiap frasa asing. Nama produk dan istilah pendek dalam kalimat Indonesia tetap diperbolehkan. Jika terdeteksi, satu permintaan brainstorm-language-repair menulis ulang semua nilai teks dalam bahasa pilihan tanpa menambah klaim atau mengganti ide. Hasil koreksi diperiksa lagi dengan kontrak enam ide, kelengkapan, judul/sudut unik, format dan bahasa. Jika koreksi gagal, hasil baru tidak diterbitkan. Permintaan pertama dan koreksi berbagi deadline tiga menit; tidak ada retry tanpa batas. Koreksi hanya saat diperlukan dan memakai kuota model yang sama, bukan layanan TTS atau Flow. Pilihan bahasa Inggris eksplisit tetap didukung. Proyek dan rekaman lama tidak diubah.

check-brainstorm lulus termasuk keluaran Inggris, checks Inggris di antara teks Indonesia, koreksi berhasil, koreksi tetap Inggris/invalid yang ditolak, nama GoPay dalam kalimat Indonesia, pilihan English, Short dan fiksi. Typecheck/build lulus. Harness native dengan profil terpisah memakai IPC dan klien HTTP penulis asli dengan fetch tiruan: respons pertama Inggris memicu satu koreksi, enam kartu Indonesia tampil dengan Bahasa hasil: Indonesia, dan ide pilihan membawa audience serta hook/why/kerangka Indonesia ke proyek. stdout.log dan app.log di tmp/bugcheck/brainstorm-language-native-1794149935200 mencatat PASS; candidates.png diperiksa. Tidak ada permintaan model berbayar atau perubahan data produksi selama pengujian. Hasil Inggris yang sebelumnya sudah tampil perlu dibuat ulang setelah aplikasi dibuka ulang.


### Pemulihan jawaban JSON router custom (8 November 2026)
Screenshot pengguna menunjukkan brainstorming Short gagal dengan model all-free-models pada endpoint custom lokal. Reproduksi read-only dengan topik uji dan model/endpoint yang sama kemudian berhasil mengembalikan enam ide (satu respons plain, stop, 11805 karakter). Kegagalan asli tidak berhasil diulang; bukti tersebut tidak membuktikan penyebab spesifik respons pada screenshot. Kunci hanya dibuka di memori proses Electron lewat safeStorage dengan profil uji dan database produksi readonly; tidak dicetak atau disimpan plaintext. Artefak model uji ada di tmp/bugcheck/brainstorm-json-live-1794150449329.

Pembaca JSON kini mencari satu objek/array lengkap secara seimbang di antara prose/fence dan mengabaikan tag think yang lengkap. Koma akhir sebelum kurung penutup di luar string boleh dibuang; teks kutipan, angka dan satuan tidak diubah. Tidak menambah penutup atau bidang hilang. Objek nested dari keluaran terpotong, kurung rusak dan beberapa objek yang ambigu ditolak. finish_reason length selalu dianggap terpotong meskipun teks awal tampak seperti JSON lengkap.

Router custom mendapat maksimal tiga percobaan protokol: plain, json_object, lalu plain dengan arahan pemulihan jika jawaban kosong/rusak atau format JSON tidak didukung. Semua memakai model yang sama dan signal/deadline pemanggil yang sama; protokol bukan pergantian model atau akun. Arahan ulang meminta hasil lengkap dan ringkas dalam bahasa pilihan, tanpa mengarang fakta. Model bisa memakai kuota tambahan saat retry. Penolakan/refusal/content_filter, auth, saldo, rate limit, kesalahan server, dan pembatalan tidak diulang melalui jalur format. Error akhir membedakan jawaban kosong, terpotong, dan JSON rusak; tidak selalu menyuruh mengganti model.

check-llm-json lulus dengan fixture HTTP: wrapper dan koma akhir, string/nominal tetap, penolakan data parsial/ambigu, tiga percobaan maksimum, penolakan akses/kuota/rate/server/refusal/cancel tanpa retry. Regresi brainstorm, prompt-quality dan story-direction lulus. Typecheck/build lulus. Native harness Short lewat IPC dan klien HTTP nyata dengan respons tiruan membuktikan prosa awal, format json_object ditolak, lalu enam kartu Indonesia tampil pada percobaan ketiga. stdout.log/app.log dan recovered.png di tmp/bugcheck/brainstorm-json-native-1794150831299 ditinjau. Pengujian terisolasi tidak mengubah proyek produksi dan tidak memakai generasi Flow atau TTS. Perbaikan meningkatkan pembacaan/pemulihan; tidak menjamin router selalu memberi respons lengkap.


### Hook frontal dan satu pertanyaan penutup per video (8 November 2026)
Sesuai preferensi kreator, HOOK_DIRECTION mengarahkan judul pada kontradiksi, tekanan atau pilihan yang langsung dikenali penonton. Janji klik dan pembuka dibedakan: judul membuka pertanyaan yang benar-benar dijawab isi, sementara kalimat pembuka langsung memperlihatkan persoalannya tanpa mengulang judul atau salam/pengantar. Gaya frontal tetap harus sesuai genre, bahasa, contoh yang disetujui dan fakta; tidak memakai penghinaan, kepastian hasil atau tuduhan rekaan. Aturan dipakai ENGAGEMENT_DIRECTION untuk kerangka/naskah/revisi serta PUBLICATION_DIRECTION untuk judul publikasi dan thumbnail.

CTA_DIRECTION meminta tepat satu undangan komentar singkat yang benar-benar diucapkan dalam narasi terakhir, sesudah payoff. Pertanyaan mengangkat dua prioritas yang sama-sama masuk akal, dilema dari pembahasan, atau satu pengalaman konkret dan alasannya. Bukan pertanyaan generik, daftar like-share-subscribe, hadiah, spam kata kunci atau pemancing pertengkaran. Tidak ditambahkan pada setiap adegan, beat atau akhir kelompok generasi. Aturan penutup lama diselaraskan agar CTA tunggal tidak dianggap penutup berulang; pemeriksaan editorial juga diarahkan memeriksa pembuka serta penutup dan tidak menyamakan pertanyaan pengalaman akhir dengan klaim faktual yang belum terjawab. Ini arahan model dan pemeriksaan AI, bukan pengukuran CTR/komentar atau jaminan kepatuhan setiap keluaran.

BrainstormIdea menambah cta wajib dengan batas 300 karakter; schema, parser dan pemeriksaan bahasa mencakup bidang ini. Kartu menampilkan Pembuka dan Pertanyaan penutup. Pilihan ide meneruskan CTA bersama hook/why ke sourceOptions.contribution, sehingga penulis mempertahankan arah interaksi yang dipilih. Format editor JSON yang sudah ada dipakai tanpa kolom database atau IPC baru. Proyek/naskah/aset lama tidak ditulis ulang otomatis; arahan berlaku pada brainstorming, penulisan atau revisi berikutnya.

Validasi: check-brainstorm memeriksa kontrak hook/CTA, CTA hilang/terlalu panjang, koreksi CTA Inggris dan penerapan bahasa. check-story-direction memeriksa arahan bersama pada penulis dan perbaikan editorial; regresi prompt-quality, publication dan script-resume lulus. Typecheck/build lulus. Harness native profil terpisah melewati IPC dan klien model dengan respons tiruan, menampilkan enam kartu dengan Pembuka/Pertanyaan penutup, lalu membuktikan CTA yang dipilih tersimpan di arahan sumber proyek. Screenshot candidates.png ditinjau; stdout.log dan app.log di tmp/bugcheck/hook-cta-native-1794154610243 mencatat PASS. Tidak ada generasi Flow/TTS, perubahan data produksi atau bukti CTR/retensi/komentar nyata dalam uji ini.


### Pemeriksaan storyboard yang gagal harus menunjukkan temuan (8 November 2026)
Screenshot pengguna menunjukkan 20/20 prompt tersusun tetapi belum diterapkan karena review urutan gagal. Pembacaan readonly proyek Mbedakan Utang Konsumsi dan Utang Investasi menemukan narasi adegan 9/12 yang identik dan penjelasan pelunasan kartu kredit yang berulang pada 11/16. Cache berisi 20 prompt, bukan kehilangan hasil. Penyebab tidak boleh disamarkan dengan memaksa gambar baru atau melewati review.

Review kini memberi kind script atau visual, nomor, kutipan aksi persis dan alasan Indonesia. Masalah yang berasal dari pengulangan naskah berhenti dengan arahan meninjau isi, tanpa putaran generasi visual tambahan. Masalah visual tetap mendapat maksimal dua putaran perbaikan pada adegan yang ditandai. Alasan dan nomor adegan ditampilkan dalam error, bukan pesan generik 20/20 belum lengkap. Callback review memasok visualIssues ke status; FlowPanel menampilkan daftar temuan, klasifikasi dan tombol Tinjau adegan yang membuka editor adegan terkait. Hasil yang gagal tidak diterapkan sebagai prompt siap produksi.

VisualDraft menyimpan reviewIssues yang sudah valid. Fingerprint difaktorkan ke visualDraftFingerprint tanpa mengganti v6 atau urutan sumber sehingga cache lama tetap kompatibel. visualStatus memulihkan status/temuan dari disk setelah restart jika fingerprint sumber masih cocok. Edit naskah/gaya/karakter membatalkan temuan yang basi. Review korup atau kutipan yang tidak cocok dibuang tanpa menghilangkan prompt yang masih valid. Cache lama tanpa rincian review tetap bisa dilanjutkan; alasan kegagalan lama yang belum disimpan tidak direka ulang. Tidak ada penulisan ke proyek produksi selama audit.

Validasi: check-visual-review menguji status 20/20, temuan sesudah module restart, invalidasi setelah edit, dan pelestarian prompt saat metadata review korup. check-story-direction memastikan masalah script berhenti tanpa generasi visual baru, sementara repair visual terarah dan penolakan kutipan invalid tetap lulus. Typecheck/build lulus. Native harness profil terisolasi memakai checkpoint dan IPC sebenarnya: temuan pulih, alasan bernomor tampil, dan tombol membuka editor adegan; proses kemudian ditutup/dibuka ulang dan pemeriksaan yang sama lulus. Screenshot review.png ditinjau; app.log/restart.log di tmp/bugcheck/visual-review-native-final-1794155359529 mencatat PASS. Pemeriksaan readonly tambahan membuktikan cache 20 prompt produksi masih cocok dengan fingerprint missing. Pengujian native memakai temuan fixture tanpa layanan AI/Flow/TTS berbayar; naskah produksi belum diperbaiki otomatis dan kelulusan review model aslinya belum diklaim.


### Revisi harus memakai temuan dan panjang draf aktual (8 November 2026)
Setelah laporan storyboard menandai naskah berulang, alur lama masih mengarahkan pengguna menyusun prompt atau mencari tombol revisi di bagian lain. refineScript juga tidak membawa scriptAssessment/temuan storyboard ke request dan menghitung anggaran kata dari target durasi proyek. Pada naskah sekitar 82 detik dengan target 600 detik, hal ini mengarahkan revisi ke panjang yang tidak sesuai isi.

Revisi kini menghitung rata-rata kata dari narasi yang sedang direvisi, menegaskan bahwa target hanya batas atas, dan membawa temuan lokal serta assessment dengan scriptReviewKey yang cocok. Temuan storyboard diambil hanya dari checkpoint yang fingerprint-nya sesuai sumber terkini. ID pada findings dipetakan ke nomor adegan. Temuan adalah saran editorial, bukan bukti fakta atau instruksi yang boleh menimpa aturan. Editor diarahkan menangani beberapa shot sebagai fragmen kalimat yang sama, mempertahankan kelanjutan/jembatan/angka unik, dan tidak membuang separuh kalimat saat menghapus duplikasi. Audit alur/klaim serta pemeriksaan perubahan sumber sebelum penerapan tetap berjalan.

ScriptReviewPanel dan laporan Flow menyediakan Perbaiki temuan naskah. Untuk storyboard yang terblokir masalah script, tombol utama belum-berprompt juga menjalankan revisi, bukan mengulang generasi visual. Hasil lama tetap aman sampai revisi lengkap lolos; setelah sukses assessment lama dan status visual lama dibersihkan, bundle hasil ditampilkan untuk ditinjau sebelum menyusun prompt yang berubah. Tidak ada revisi otomatis pada proyek produksi dalam pengujian ini.

Regresi check-story-direction membuktikan temuan sumber yang tepat masuk request, assessment basi diabaikan, naskah pendek tidak dipanjangkan ke target 10 menit, dan ID sumber adegan yang dipertahankan tetap sama. Typecheck/build lulus. Native harness dengan profil terisolasi, SQLite dan IPC asli serta penulis HTTP tiruan membuktikan tombol laporan memanggil revisi, request membawa alasan storyboard dan anggaran aktual, duplikasi terhapus (empat adegan menjadi tiga), serta error storyboard lama tidak tertinggal. Screenshot repaired.png diperiksa; stdout.log/app.log di tmp/bugcheck/refine-findings-native-1794156203335 mencatat PASS. Ini verifikasi alur dan penyimpanan, bukan jaminan setiap respons model asli menyelesaikan semua temuan. Tidak ada data produksi, kredit Flow atau TTS yang diubah/dipakai.


### Gerak I2V harus satu aksi yang mungkin dari frame awal (9 November 2026)
Keluhan gerak terasa acak ditelusuri ke kontrak yang tidak konsisten: system meminta satu aksi tetapi schema motion meminta tiap karakter, lingkungan dan kamera bergerak. Fallback Higgsfield juga menambah push-in otomatis. Ini temuan instruksi, bukan diagnosis dari video keluaran pengguna yang belum diperiksa.

SCENE_DIRECTION kini mencakup I2V_DIRECTION: satu subjek utama, pose awal, aksi fisik dengan arah/kontak, dan kondisi akhir; latar boleh diam, kamera terkunci untuk interaksi kecil, tanpa aksi berulang atau metafora finansial literal. Schema diselaraskan. Flow dan Higgsfield memakai flowVideoPrompt bersama, dengan prioritas gambar awal, kontinuitas objek dan pengurangan aksi bila posisi frame tidak memungkinkan. Fallback tanpa motion tetap konservatif, tidak mengarang interaksi. Penulis masih menerima deskripsi frame, bukan pemeriksaan vision atas gambar aktual; model video menerima gambarnya.

Fingerprint checkpoint visual naik ke v7-physical-motion supaya draf lama tidak diterapkan sebagai arahan baru. File cache lama tidak dihapus otomatis, tetapi status/temuannya yang memakai fingerprint lama tidak dipulihkan; susun ulang untuk mendapat review terkini. Prompt/aset proyek yang sudah diterapkan tidak diubah otomatis. Tidak ada perubahan UI, database, durasi atau rendering.

Validasi: check-flow-prompts, check-story-direction dan check-visual-review lulus dengan respons model tiruan dan penyimpanan terisolasi. Typecheck lulus. Tidak ada generasi Flow/Higgsfield/TTS atau penilaian kualitas video nyata dalam pengujian ini.


### Video Flow paralel antar akun Chrome (9 November 2026)
Tombol Jadikan semua video sebelumnya hanya membuat antrean serial: queue flow2api=1 dan route backend memakai satu lock global. Bulk video browser sekarang memakai queue flow-video maksimal tiga pekerjaan dan FlowVideoBatch yang meminjam satu akun per pekerjaan. Hanya pilihan akun Otomatis dapat memakai beberapa worker independen; pilihan manual/API transport tetap serial. Satu akun selalu satu pekerjaan, bukan tiga submit pada satu composer. Hasil setiap video dinormalisasi, disimpan dan dipasang segera setelah selesai, tanpa menunggu seluruh kelompok.

Route backend kini mengunci per account_id untuk gambar, batch gambar dan video; status browserParallelVersion=1 menandai dukungan ini. Worker tidak berubah. Klien memeriksa halaman, route unik, akun aktif, kuota yang tercatat, browserBusy dan uncertainResult sebelum menjadwalkan. Hasil tidak pasti tidak dibersihkan demi paralelisme. Bila hanya satu akun lain siap, pool tetap mengarah ke akun itu. Backend lama dengan beberapa kandidat dihentikan sebelum submit dan meminta restart. Pembaruan route dipasang melalui patch-flow2api; proses server yang sudah berjalan perlu dimuat ulang agar memakai kode baru.

Setiap video dipatok ke akun yang dipinjam; tidak dipindah/dikirim ulang setelah kegagalan. Pemeriksaan jeda diulang tepat sebelum submit, dengan pengecualian percobaan tunggal yang memang sudah diizinkan. Kesalahan/pembatalan menghentikan pekerjaan baru dalam batch, sementara pekerjaan yang sudah berjalan boleh menyimpan hasilnya. Perubahan konfigurasi selama preflight membatalkan enqueue. Batch gambar, manual selection, pemulihan unduhan dan aturan kuota tetap dipertahankan. Tidak ada perubahan data proyek produksi atau penghapusan state pending.

Validasi otomatis: check-flow-video-parallel menguji 2/3 akun overlap, eksklusivitas akun, hasil tidak berurutan, penghentian antrean dan keberhasilan in-flight tetap tersimpan, serta pembatalan saat menunggu. check-flow-video-service memakai HTTP lokal untuk pinned account/reference/result, manual serial, busy/pending skip, server lama, quota dan blok Google. check-flow-video-backend memakai route FastAPI aktual dan tiga socket tiruan; duplicate akun ditolak sebelum submit, future dan state per akun benar. Regresi check-flow-batch, check-flow2api, check-flow-ten-service, check-flow-ten-backend dan check-flow-setup lulus.

Harness native mockFlowParallelVideo memakai profil SQLite terisolasi, IPC/antrean/normalisasi FFmpeg/penyimpanan asli dengan server dan MP4 lokal: puncak tiga akun sekaligus, urutan selesai berbeda, empat aset terpasang ke adegan yang cocok, serta screenshot halaman Visual & suara ditinjau. Tidak ada generasi atau bukti kecepatan dari Google nyata. Pemakaian paralel tetap bergantung pada jumlah akun/halaman siap dan kuota yang tersedia.

Build final dan typecheck lulus. Bukti native terakhir: tmp/bugcheck/parallel-video-native-1794222257899/stdout-final.log dan app-final.log; assertion tambahan membuktikan setidaknya satu video sudah terpasang sebelum permintaan keempat dimulai. Screenshot result.png memperlihatkan empat klip bertanda video. Pembacaan readonly data produksi menunjukkan tidak ada job queued/running tetapi server memiliki pending account 1; state ini dipertahankan dan proses server produksi tidak dihentikan otomatis. Untuk memuat perubahan route, restart server Flow2API setelah pekerjaan Chrome selesai, lalu buka ulang Kisara dan gunakan pilihan akun Otomatis.


### Audit alur produksi dan perbaikan routing/collector video (9 November 2026)
Screenshot dan pembacaan readonly proyek mengonfirmasi video keenam gagal multiple_outputs, enam job selanjutnya dibatalkan, dan lima video tersimpan. Default Agent diganti Frames untuk gambar langsung menjadi frame awal; pilihan Agent eksplisit dipertahankan dengan keterangan bahwa gambar perantara dapat dibuat. Tidak ada fallback Frames ke Agent. Error mengikuti jenis media. Worker 1.6.1 menghitung satu hasil per tile video baru, mengecualikan tile yang sudah ada, tetap menolak dua hasil berbeda. Perubahan worker masuk patch sumber dan lolos pemasangan ulang.

Higgsfield kini memeriksa fingerprint gambar dan snapshot sumber video baru sebelum pemasangan hasil; hasil yang sumbernya berubah disimpan di riwayat. Enam skenario stale-video lulus. 27/27 regresi CJS, 32 skenario ekstensi browser referensi/recovery, regresi backend, typecheck/build dan uji native lulus. Ekspor lokal H.264/AAC berdurasi audio/video identik 16,800 detik, 504 frame terdekode, caption diperiksa. Teks pilihan Frames/Agent memakai note agar label tidak tertutup hint panjang.

Laporan lengkap, bukti, dan masalah terbuka: docs/audit-2026-11-09.md. Audit ini tidak mengklaim semua bug selesai: durasi shot lama masih panjang, prompt gerak belum menerima piksel gambar untuk pemeriksaan vision, dan bulk video belum mendeteksi kesegaran video yang telah terpasang setelah sumber diganti. Tidak ada generasi Google nyata, perubahan proyek produksi, pembersihan pending atau reset kuota.


### Penyajian berdasarkan acuan dan satu prompt thumbnail (9 November 2026)
Acuan lokal Snpc3GU-aYE diperiksa melalui frame berurutan dan transkrip parsial; catatan ada di tmp/reference-detailed-1794231761687/analisis-penyajian.md. Pola yang diterapkan adalah pembuka konkret, jawaban awal, perkembangan sebab-akibat, pergantian fungsi shot dan teks penekanan selektif. Ini tidak menyalin alur atau klaim keuangan video acuan. Audio musik/SFX acuan belum dinilai langsung.

Penulis visual kini menerima schema role/focus/emphasis; fungsi shot tersimpan di editor.presentation tanpa migrasi. Mayoritas sambungan cut, transisi khusus singkat dibatasi satu tiap lima pembaruan. Gambar detail tidak lagi diwajibkan memuat presenter channel. Caption transkrip default proyek baru menjadi none; pengaturan proyek lama dipertahankan. Emphasis harus kutipan literal narasi, pendek, dan dibatasi maksimal floor(45% jumlah shot) untuk cue otomatis. Teks bukan angka yang dilukis model gambar. Resolver src/shared/presentation.ts mengikuti kata audio atau perkiraan, trim suara, posisi suara, urutan dan durasi shot; Player, Timeline, OverlayPanel, EditorStep dan exporter memakai hasil yang sama. Narasi berubah membuat cue lama disembunyikan. Edit tampilan dipertahankan saat rencana diperbarui; edit waktu atau split menjadi timing manual.

Buat versi penyajian baru memakai duplikasi proyek dengan berkas tersendiri lalu melepas media aktif dan membagi narasi tanpa kehilangan teks/durasi. Proyek asal tidak ditimpa. Penting: saveSnapshot sengaja tidak menulis tautan media dan visualSource; fungsi harus memakai patchClip/patchClipText secara eksplisit sebelum divideUnproducedShots. Jangan mengandalkan imageAssetId:null di snapshot. Media lama tetap ada sebagai riwayat salinan; gambar/suara baru perlu dibuat untuk shot baru. Tidak ada panggilan model/generasi saat membuat salinan.

Judul & thumbnail memiliki aksi Buat 1 prompt thumbnail tersendiri melalui IPC story:thumbnail: satu konsep dan satu prompt siap salin, janji yang didukung naskah, identitas/gaya, komposisi terbaca di ponsel dan headline singkat. Prompt visual Inggris, headline mengikuti bahasa video. Hasil terikat naskah/gaya/judul; perubahan sumber atau referensi selama request ditolak, hasil tidak menimpa judul/deskripsi/hashtag edit. UI dan ekspor TXT menolak thumbnail basi. Ini membuat prompt, belum membuat gambar atau menjamin klik.

Validasi: typecheck dan build bersih; 27 regresi CJS lulus, check-presentation menambahkan kutipan, normalisasi rupiah, waktu kata, trim, urutan, stale cue, timing manual dan split. check-publication menguji request thumbnail tersendiri, sumber/judul, invalid/stale refusal; check-story-direction membuktikan role/focus dari model masuk pembaruan visual. Harness native profil terisolasi di tmp/bugcheck/presentation-native-1794234322161 menguji IPC salinan, original unchanged, berkas salinan, narasi/durasi utuh, tautan media terlepas, SQLite role/cue, tombol versi baru, HTTP model tiruan thumbnail dan penyimpanan tanpa menimpa metadata edit. Screenshot presentation.png, thumbnail.png, new-version.png dan preview.png diperiksa. Ekspor aktual H.264/AAC 16.800 detik masing-masing, 504 frame; export-frame.png menunjukkan emphasis kuning, preview dan editor menampilkan cue sama. Tidak mengubah proyek/kunci produksi dan tidak memakai kuota Google/TTS/model nyata. Kualitas estetika keluaran generasi baru tetap perlu ditinjau pada hasil nyata.


### Referensi Flow di flow-content.google dan alasan gagal batch (9 November 2026)
Screenshot Uang Pajak Lari Ke Mana? menunjukkan reference_upload_failed sesudah satu gambar berhasil. Pembacaan readonly proyek 29bc95f7-4461-4562-aeeb-c533cc76f719 mengonfirmasi satu gambar aktif dan kegagalan berulang pada shot kedua. Endpoint inspect_upload lokal menunjukkan lampiran Gambar bahan 1448x1086 sudah termuat dari flow-content.google; composer kosong dan tidak busy. Worker sebelumnya hanya memiliki fallback piksel lintas origin untuk lh3.googleusercontent.com. Ketika fetch dari halaman ditolak CORS, lampiran host Flow sendiri gagal diverifikasi.

Worker 1.6.2 memperbolehkan fallback hanya untuk dua host gambar HTTPS tersebut. Host Flow sudah ada di manifest sebelum perubahan; tidak menambah izin. Tetap memeriksa sender ekstensi/tab proyek Flow, menolak userinfo/port nonstandar/redirect, tidak mengirim kredensial, membatasi ukuran/mime/dimensi, dan mencocokkan piksel. Gambar berbeda tetap ditolak. Diagnostik gambar hanya menampilkan hostname dan ukuran, bukan URL bertoken. Upload dua referensi yang baru memasang satu chip kini melanjutkan pemilihan referensi sisanya, tanpa memasang ulang chip yang pikselnya sudah cocok. Urutan dan jumlah tetap diverifikasi.

Uji native juga menemukan FlowImageBatch.canDrain sebelumnya menyembunyikan baris kegagalan yang sudah diketahui: batch dihentikan ketika hasil diterima, lalu seluruh baris tanpa bytes dibatalkan sehingga alasan sebenarnya tidak terlihat. BatchImageResult kini menandai skipped untuk batch_stopped. Baris gagal yang diketahui tetap dikonsumsi untuk menampilkan error; hanya tugas yang belum dicoba dibatalkan, dan sukses tetap dipasang. Tidak ada retry otomatis atau perpindahan akun untuk error referensi. Pesan Indonesia membedakan verifikasi referensi sebelum Generate dari hasil yang tidak pasti setelah kirim.

Validasi: check-flow-reference-host.cjs memakai Chrome dan ekstensi sebenarnya dengan halaman/media tiruan: reuse dan upload flow-content, reuse lh3, salah gambar, host terlarang, unggah sebagian dua gambar, serta empat penolakan URL berkredensial/port/host/skema. Fetch halaman sengaja ditolak untuk menguji fallback background asli. Semua enam skenario dan empat guard lulus; salinan ekstensi dengan whitelist lama mereproduksi reference_upload_failed dan nol submit. Bukti tmp/bugcheck/flow-reference-host-1794237322409 dan baseline -1794237422380. check-flow-ten/check-flow-ten-service menguji error yang terlihat, skip, tidak retry, tidak berpindah akun dan hasil sukses tetap ada. 27 regresi CJS, typecheck dan build lulus. Harness native profil terisolasi tmp/bugcheck/reference-failure-native-1794237601100 menguji IPC, 12 job, satu sukses, shot kedua gagal dengan pesan yang tepat, sisa dibatalkan dan hanya satu kelompok terkirim; DOM dan failure.png diperiksa.

Patch ekstensi disimpan kembali di tools/flow2api-kisara.patch dan lolos pemasangan idempoten/reverse check. Chrome yang masih menjalankan background lama harus memuat ulang Flow2API Captcha Worker hingga versi 1.6.2 tampil; Kisara perlu dibuka ulang untuk build/pesan baru. Tidak mengirim generasi atau upload baru ke Google, tidak mengubah media/database proyek produksi, tidak menghapus lampiran/draft/pending, dan tidak mengklaim kelanjutan produksi di Google sudah sukses.
