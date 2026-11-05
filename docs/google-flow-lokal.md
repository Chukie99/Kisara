# Google Flow lokal di Kisara

Kisara dapat membuat gambar adegan, lembar pemeran, dan image-to-video lewat Flow2API lokal. Ini konektor ke server pengguna; kuota Google tetap berlaku dan jumlah akun tidak menjamin 39 atau 80 gambar selesai.

## Menghubungkan

1. Jalankan `tools/flow2api/START-FLOW2API.cmd`. Panel berada di http://127.0.0.1:8765/manage.
2. Di setiap profil Chrome, login Google Flow dengan akun yang sesuai. Token Updater menyinkronkan sesi akun. Captcha Worker menghubungkan browser; memasangnya tidak menambah akun Google.
3. Pada Captcha Worker, gunakan WebSocket `ws://127.0.0.1:8765/captcha_ws`, API key Flow2API, serta Route key unik seperti `akun-1`. Di panel akun Flow2API, isi **Extension Route Key** dengan nilai yang sama untuk akun Google tersebut. Jangan menebak pasangan akun dan profil.
4. Kisara → Pengaturan → Gambar dan video → Google Flow (Flow2API) → **Hubungkan server lokal**. Tombol ini membaca konfigurasi instalasi lokal tanpa menampilkan kunci. Untuk instalasi server lain, buka alamat dan API key manual.
5. Pilih model gambar dan video yang tersedia. Gambar memakai tombol gambar di storyboard; Video AI memakai gambar adegan sebagai frame awal. Video yang berhasil otomatis menjadi media aktif klip.

API key Flow2API, Connection Token milik Token Updater, dan kata sandi admin adalah tiga nilai berbeda. API key Kisara disimpan lewat penyimpanan terenkripsi aplikasi. Jangan menempelkan Connection Token pada kolom alamat API.

## Antrean, akun, dan kegagalan

- Antrean Flow di Kisara berjalan satu per satu. Tidak ada batas buatan 20 gambar.
- Backend dengan patch Kisara mempertahankan pilihan akun per model. Akun dengan penolakan kuota yang eksplisit diberi cooldown lokal 24 jam, kemudian permintaan dapat dicoba pada akun berikutnya. Ini bukan janji waktu reset kuota Google. Akun yang tidak aktif, tidak mendukung model, tidak memiliki worker yang sesuai, atau tidak valid tetap mengikuti pemeriksaan backend.
- Kesalahan CAPTCHA, autentikasi, koneksi, timeout, atau respons tanpa media tidak memicu pengulangan otomatis pada akun lain. Membatalkan permintaan menghentikan penantian lokal; server penyedia mungkin telah memproses permintaannya. Job yang terputus saat aplikasi ditutup tidak dikirim ulang otomatis.
- Hasil disimpan sebagai aset lokal dan dipasang ke adegan asal. Jika adegan berubah selama generasi, hasil tersimpan di riwayat dan tidak mengganti adegan yang sudah berubah.
- Pemeriksaan koneksi hanya membuktikan server, autentikasi API, dan daftar model. Akun aktif belum membuktikan CAPTCHA worker siap atau generasi berhasil.

## Patch server

Source backend lokal berada dalam folder tools yang dikecualikan dari repositori Kisara. Patch yang dapat ditinjau disimpan pada `tools/flow2api-kisara.patch`, implementasi kebijakannya pada `tools/flow2api-policy.py`. Jalankan `node tools/patch-flow2api.cjs` setelah memasang ulang source backend, lalu mulai ulang server. Skrip memeriksa kompatibilitas patch dan menolak menerapkannya pada versi yang berbeda; jangan memaksa patch saat konflik. Basis yang diuji: upstream Flow2API commit `1bcb9275d154c330d29cac3ba836a13393ff49c7`.

## Validasi 29 Oktober 2026

Typecheck dan build berhasil. Uji klien mencakup SSE/JSON, media base64/unduhan, pembatalan, pemetaan rasio, dan retry hanya pada penolakan kuota eksplisit. Uji Electron dengan profil sementara membuktikan dua job gambar masuk ke adegan yang tepat, adegan lain tetap, video terpasang dengan motionType video, UI model Flow tampil, dan maksimum satu request media berjalan sekaligus. Semua media uji tersebut sintetis.

Tes satu gambar sintetis ke server pengguna belum menghasilkan gambar: server melaporkan empat akun aktif, tetapi pemilihan akun gagal karena worker belum siap. Pemeriksaan admin menunjukkan semua Extension Route Key akun masih kosong. Pasangan akun/profil harus diisi sesuai identitas akun Google pengguna. Generasi gambar dan video Google yang sesungguhnya belum terverifikasi berhasil.

### Server Flow menyala bersama Kisara

Jika Google Flow sudah dipilih sebagai layanan gambar, Kisara menyalakan instalasi lokal Flow2API secara tersembunyi saat startup. Server yang sehat dipakai kembali. Tombol Hubungkan server lokal, tes status Flow, dan awal job generasi juga memeriksa kesiapan peluncur. Tidak perlu membuka terminal atau memasang ulang setelah restart. Mekanisme ini hanya berlaku untuk instalasi tools/flow2api pada alamat 127.0.0.1:8765; endpoint manual lain tetap dikelola pengguna. Tidak menyalakan profil Chrome secara otomatis. Worker Chrome tetap perlu terbuka pada profil akun yang sesuai.

Peluncuran dibatasi 40 detik dan panggilan bersamaan berbagi satu proses peluncur. Gagal meluncurkan tidak menghalangi jendela Kisara dibuka. Server tidak dimatikan saat Kisara ditutup karena mungkin juga dipakai profil Chrome atau aplikasi lain.

### Memasangkan tanpa membuka admin

Pengaturan Kisara → Google Flow → **Pasangkan akun dan worker** menampilkan akun dan worker yang tersambung. Pilih profil yang memakai email akun yang sama, lalu Pasangkan. Route yang dipakai akun lain tidak dapat digunakan bersama. Jika worker tidak muncul, buka profil Chrome dan Google Flow, periksa alamat WebSocket ekstensi `ws://127.0.0.1:8765/captcha_ws` serta API key Flow2API, lalu Perbarui daftar. Nilai akun aktif saja tidak membuktikan worker siap. API setup ini disertakan pada patch Kisara; instalasi upstream lain mungkin perlu patch dan restart backend.

## Tambah akun langsung dari Kisara

Pengaturan → Google Flow menyediakan **Tambah akun** (isi email) dan **Buka browser akun** pada akun yang sudah terdaftar. Kisara menyiapkan profil Chromium terpisah dan satu ekstensi gabungan Worker + Token Updater. Koneksi server, Route Key unik, API key dan Connection Token diisi oleh helper ke penyimpanan browser. Pengguna tidak perlu menyalin token atau memasang dua ekstensi di profil khusus ini.

Pengguna tetap login Google sendiri, termasuk OTP/persetujuan apa pun. Helper memeriksa email dari sesi Google sebelum menyinkronkan agar akun yang login tidak tertukar. Setelah sinkronisasi berhasil, profil dipasangkan ke akun yang sesuai lewat API setup. Jika sesi Google belum terbaca atau email berbeda, status tetap meminta login; akun tidak dipasangkan berdasarkan urutan atau tebakan.

Profil dan sesi browser tersimpan di folder data Kisara `flow-browsers/<id>/profile`. Berkas `flow-profiles.json` hanya mencatat email/id/route, bukan kunci. API key dikirim ke helper lewat stdin; Connection Token dibaca lewat API admin lokal menggunakan konfigurasi instalasi sendiri. Keduanya tidak ditulis ke file ekstensi, log, atau argumen proses. Ekstensi menyimpan konfigurasi pada penyimpanan lokal browser seperti pengaturan manual. Pengaturan Chrome normal yang sudah ada tidak diedit.

Fitur ini memakai instalasi Flow lokal port 8765, Python venv Flow2API dan Chromium Playwright yang sudah tersedia. Profil lama yang dipasang manual tetap bisa digunakan. Profil khusus harus tetap terbuka selama Worker digunakan. Browser yang sama tidak diluncurkan dua kali dalam proses Kisara; jika workernya masih terhubung setelah Kisara dibuka ulang, jendela yang sudah ada dipakai kembali.

Validasi: pemeriksaan profil membuktikan validasi email, penggunaan ulang email tanpa membedakan kapital, satu child per profil, JS konektor valid, serta tidak ada kunci dalam file ekstensi/metadata/argumen. Chromium headless sungguhan memuat Worker + Updater gabungan; konfigurasi sintetis tersimpan dan halaman Indonesia terbuka. UI Electron diuji dengan mock launch. Login Google/OTP, pemeriksaan identitas Google nyata, sinkronisasi cookie Google nyata, dan generasi gambar Google sesungguhnya belum diuji melalui profil ini; keberhasilannya perlu diverifikasi setelah pengguna login.


### Worker 1.0.1: izin domain Flow
Alamat lama labs.google/fx/tools/flow mengalihkan browser ke flow.google.com. Worker manual kini menyertakan izin https://flow.google.com/*, agar akses tab tidak ditolak setelah pengalihan. Setelah memperbarui file, muat ulang ekstensi pada tiap profil Chrome dan setujui izin jika diminta. Status worker tersambung hanya membuktikan WebSocket; keberhasilan generasi masih perlu diuji.


### Penolakan aktivitas tidak biasa
PUBLIC_ERROR_UNUSUAL_ACTIVITY berasal dari penolakan Google Flow, bukan hasil media kosong atau bukti kuota habis. Kisara menampilkan penyebab tersebut tanpa detail sensitif; tidak mengulang permintaan atau mengganti akun untuk penolakan ini. Periksa pemberitahuan melalui Flow langsung pada profil akun yang terkait.


### Jeda persisten setelah penolakan Google
Penolakan PUBLIC_ERROR_UNUSUAL_ACTIVITY menjeda generasi pada endpoint lokal tersebut. Jeda disimpan tanpa kredensial dan tetap aktif setelah restart. Di Pengaturan → Google Flow, tombol "Sudah cek Flow · izinkan satu percobaan" mengizinkan tepat satu permintaan setelah kamu memeriksa Flow langsung; tombol tidak membuat gambar sendiri. Jika percobaan gagal, generasi tetap dijeda. Jika media berhasil diperoleh, jeda dibuka. Ini pengaman lokal, bukan penghapusan pembatasan Google. Rincian riset dan batas verifikasi: [riset-flow-2026-10-30.md](riset-flow-2026-10-30.md).


### Worker 1.0.2: bangun setelah Chrome dibuka
Worker mendaftarkan event startup/install Chrome dan pesan koneksi dari halaman opsi. Membuka opsi atau menyimpan nilai yang sama sekarang meminta koneksi secara eksplisit, tanpa bergantung pada storage.onChanged. Halaman opsi menampilkan status berdasarkan register_ack server, bukan hanya keberhasilan menyimpan. Pemicu bersamaan memakai nomor generasi agar tidak membuat socket ganda. Uji Chromium dengan WebSocket sintetis membuktikan satu koneksi saat menyimpan ulang dan koneksi kembali setelah browser ditutup/dibuka. Muat ulang ekstensi yang sudah dipasang agar file baru aktif. Ini tidak membuktikan Google menerima generasi.


## Jalur gambar melalui halaman Chrome (31 Oktober 2026)

Jalur bawaan baru adalah `flowImageTransport: browser`. Kisara tetap memakai server lokal untuk mengirim pekerjaan ke worker akun yang dipilih, tetapi worker mengoperasikan kontrol halaman Flow normal. Jalur ini tidak membuat RPC Google sendiri dan tidak meminta token CAPTCHA untuk generasi gambar.

Dukungan: Nano Banana 2.1, satu gambar per klip. Rasio 16:9 atau 9:16 diambil dari proyek dan diterapkan ke kontrol gambar Flow setiap submit; jumlah selalu x1. Video dan referensi gambar ditolak sebelum submit. Gambar massal memakai antrean serial; satu kegagalan menghentikan sisa antrean. Chrome profil yang tepat harus tetap terbuka pada tepat satu proyek Flow. Akun browser dipilih eksplisit, atau otomatis hanya jika tepat satu akun dengan worker tersedia.

Hasil dikenali berdasarkan ID media baru, bukan gambar lama di grid. Gambar `/asb/` diunduh ukuran asli dari konteks browser, lalu dinormalisasi dan disimpan lewat antrean aset Kisara. Prompt pengguna yang belum dikirim tidak ditimpa. Persetujuan biaya tidak disetujui otomatis. Penolakan Google, hasil ambigu, atau unduhan gagal menghentikan pekerjaan; tidak ada retry atau perpindahan akun otomatis.

Server menyimpan akun yang sedang menunggu hasil di `data/kisara-browser-pending.json` sebelum submit. Restart tidak menghapus kondisi tak pasti. Tindakan “Sudah cek Flow” di Kisara baru boleh dipakai setelah pengguna memastikan hasil di Chrome. Jeda jalur API lama tetap disimpan terpisah; keberhasilan uji browser tidak berarti jalur API sudah diperbaiki.

Verifikasi nyata: profil Kisara terisolasi menghasilkan job `done`, aset provider `flow2api`, model `flow-browser-nano-banana-2.1`, JPEG 1376 × 768 (243233 byte). Aset tetap terpasang pada klip setelah Kisara direstart. Bukti lokal: `tmp/bugcheck/flow-browser-live-final.log`, `flow-browser-saved-clip.png`, dan `flow-browser-settings.png`. Ini membuktikan satu alur gambar pada akun/proyek pengujian, bukan jaminan semua akun, batch panjang, atau restart Chrome.

Tes regresi: `node tools/check-flow2api.cjs`, Python venv `tools/check-flow-setup.py`, dan `tmp/bugcheck/check-browser-generate.py` (halaman sintetis, termasuk kedua rasio dan x1; bukan bukti generasi Google). Typecheck dan build wajib tetap dijalankan.


Verifikasi portrait (31 Oktober 2026): proyek uji disetel ke 9:16 melalui API proyek Kisara. Satu pekerjaan berakhir `done`, satu JPEG Flow 768 × 1376 (241355 byte) terpasang pada klip. Bukti: `tmp/bugcheck/flow-portrait-confirm.log` dan `flow-portrait-live.png`. Tes `tools/check-flow-browser.py` memastikan kontrol gambar lama x2 diubah ke x1 untuk kedua rasio, tanpa mengubah jumlah video. Pilihan rasio ditunggu sampai `aria-checked=true` sebelum prompt dikirim. Gambar lama tidak dibuat ulang ketika rasio proyek diubah.


## Antrean seluruh klip (31 Oktober 2026)

Tombol `Buat N gambar` pada halaman Visual mengantrekan klip yang gambarnya belum siap. Mode browser tidak membuat lembar pemeran otomatis. Gambar yang masih valid dilewati; `Gambar ulang semua` tetap merupakan tindakan terpisah dengan konfirmasi. Antrean tidak memiliki batas buatan 20 atau 73, tetapi kuota dan penerimaan Google tetap berlaku.

Flow memakai limiter satu pekerjaan. `StopOnFailureBatch` memastikan setelah kegagalan/pembatalan aktif, pekerjaan selanjutnya dibatalkan sebelum submit. Hasil yang sudah tersimpan dan narasi dipertahankan. Perubahan akun/rasio di tengah antrean menghentikan sisa pekerjaan. Menekan mulai lagi saat antrean proyek masih aktif ditolak. Restart tidak otomatis mengirim ulang pekerjaan; setelah memeriksa Flow, mulai kembali gambar yang belum siap.

Verifikasi: `node tools/check-flow-batch.cjs` memproses 73 job dengan peak concurrency 1, lalu menguji gagal pada job kedua (1 selesai, 1 gagal, 71 dibatalkan, hanya 2 submit tiruan). Native Electron `tmp/bugcheck/flow-batch-complete.log` memverifikasi skip aset siap, tidak membuat sheet, 3 pekerjaan sukses, suara tetap, lalu urutan done/failed/canceled. Server tiruan menerima tepat 5 request (3 sukses, kemudian 1 sukses + 1 penolakan) dengan peak concurrency 1. Bukti UI `flow-batch-running.png` dan `flow-batch-stopped.png`. Tes massal ini tidak menggunakan Google; uji Google nyata tetap satu gambar per klip pada landscape dan portrait sebagaimana dicatat di atas.

## Router akun Chrome otomatis (1 November 2026)

Di Pengaturan Google Flow, pilihan akun `Otomatis · pindah akun saat kuota habis` memakai akun siap
berdasarkan ID, mempertahankannya antar klip dan restart. ID akun terakhir dan daftar akun yang kuotanya
habis disimpan di `flow-browser-accounts.json` dalam folder data; tidak berisi kredensial.

Worker hanya menandai `quota_exhausted` jika pemberitahuan kuota/kredit yang eksplisit terlihat sebelum
prompt dikirim, dan halaman tidak sedang melakukan generasi. Pemeriksaan keamanan lebih dahulu.
Backend menghapus status pending untuk penolakan ini; klien melanjutkan klip yang sama di akun berikutnya.
Tidak ada batas gambar buatan atau waktu reset kuota yang ditebak. Untuk memakai kembali akun yang
kuotanya sudah pulih, pilih akun itu secara manual dan selesaikan satu gambar; akun kembali tersedia
untuk mode otomatis. Pilihan akun manual tidak berpindah sendiri.

Pesan kuota yang baru muncul setelah submit tetap dianggap belum pasti, sehingga antrean berhenti.
Penolakan keamanan, permintaan persetujuan, koneksi putus, dan hasil belum pasti tidak memindahkan akun.
Satu percobaan setelah jeda juga tidak melakukan failover. Chrome setiap akun harus memiliki tepat satu
proyek Flow terbuka. Koneksi worker saja tidak membuktikan proyek akun itu siap digunakan.

Verifikasi: `node tools/check-flow-router-integration.cjs` menguji klien produksi melalui HTTP lokal,
73 gambar (2 + 3 + 68), persistensi pilihan setelah reload modul, semua kuota habis, pemulihan akun
manual, dan jeda lintas akun. `tools/check-flow-browser.py` menguji halaman sintetis termasuk penolakan
kuota sebelum submit tanpa klik Generate dan prioritas blokir keamanan. `tools/check-flow-setup.py`
menguji penerusan kode kuota dan status pending. Uji native Electron menggunakan profil terpisah dan
server sintetis; bukan bukti perpindahan akibat kuota Google sungguhan.

## Perbaikan konfirmasi kirim Flow (1 November 2026)

Penghubung sekarang mengambil ulang editor sesudah menutup pengaturan, memverifikasi isi input,
menunggu hingga 12 detik agar tombol aktif (termasuk `aria-disabled`), dan mengklik sekali. Setelah
klik, ia menunggu indikator proses, gambar baru, atau pengosongan composer sebagai konfirmasi
halaman menerima aksi. Klik tanpa konfirmasi menghasilkan `submit_unconfirmed`; tidak diulang.
Indikator pending yang tersembunyi tidak dihitung sebagai proses berjalan.

Draft yang identik dengan seluruh perintah gambar dapat digunakan kembali setelah pemeriksaan
jeda yang sudah ada. Draft berbeda tetap ditolak tanpa ditimpa. Guard server/klien untuk hasil
sebelumnya yang belum pasti tetap memerlukan tindakan eksplisit pengguna; perbaikan tidak
menghapus status tersebut saat restart.

Kegagalan sebelum klik (`submit_not_ready`, `prompt_input_failed`) tidak lagi diklasifikasikan
klien sebagai hasil belum pasti. Kode setelah klik dibedakan menjadi pengiriman belum dikonfirmasi,
proses masih pending melewati batas waktu, hasil belum muncul, unduhan gagal, atau hasil lebih dari
satu. Server mencatat account ID, request ID acak, kode dan tahap ke log; tanpa prompt, media,
cookie atau API key. Pemeriksaan readonly mengembalikan jumlah editor, panjang draft, status
tombol, koneksi dan indikator proses, tanpa isi draft.

Bukti regresi: `tools/check-flow-browser.py` lulus skenario tombol lambat aktif, aria-disabled,
editor/tombol diganti, draft identik/draft berbeda, pending tersembunyi, serta klik tanpa efek yang
hanya dilakukan sekali. `tools/check-flow-setup.py` membuktikan penolakan sebelum submit tidak
meninggalkan pending; klik tanpa konfirmasi tetap memerlukan acknowledge. Tes klien produksi
`tools/check-flow-router-integration.cjs` mencakup seluruh kode baru dan tidak berpindah akun pada
hasil tak pasti. Harness native `tmp/bugcheck/flow-submit-native.log` lulus: kegagalan sebelum klik
menghentikan antrean tanpa membuat uncertain pause, klik tanpa konfirmasi menjeda dan menolak
batch berikutnya. Screenshot `flow-submit-pre.png` dan `flow-submit-unconfirmed.png` sudah diperiksa.

Pemeriksaan langsung halaman Acek setelah pemasangan hanya membaca metadata: proyek terbuka,
composer kosong, tidak sibuk, online, tombol nonaktif saat kosong. Tidak ada generasi Google baru
yang dikirim untuk tes ini; keberhasilan percobaan riil berikutnya belum dibuktikan.

## Klik mouse Chrome, worker 1.3.0 (2 November 2026)

Pengguna menguji draft yang sama dengan klik langsung di Chrome dan Flow mulai membuat gambar.
Log sebelumnya menunjukkan `submit_unconfirmed`. Ini membedakan keberhasilan klik langsung dari
kegagalan jalur klik DOM, tetapi tidak membuktikan mekanisme internal Google yang menolak klik itu.

Worker 1.3.0 kini menyiapkan draft dan baseline hasil melalui adapter DOM, lalu memakai satu pasangan
`Input.dispatchMouseEvent` mousePressed/mouseReleased melalui `chrome.debugger` untuk tombol kirim.
Target dibatasi tab proyek Flow yang unik pada profil worker. Tombol difokuskan, digulir ke viewport,
divalidasi lagi, dan koordinat dihitung setelah attach agar perubahan viewport tidak menyesatkan klik.
Sesi dilepas sebelum menunggu hasil. Jika attach gagal, tidak ada klik; jika input mungkin sudah
terkirim, tidak ada fallback atau klik ulang. Penantian hasil tetap menggunakan baseline media yang
sama, dengan guard hasil belum pasti yang persisten.

Manifest menambahkan izin `debugger`, sehingga pengguna harus me-reload ekstensi ke 1.3.0 dan
menyetujui izin jika Chrome meminta. Worker lama ditolak sebelum submit melalui kode
`native_input_unavailable`; tidak memakai lagi fallback `.click()` pada tombol kirim. Izin ini
memungkinkan pengendalian tab melalui Chrome Debugger API, sehingga hanya digunakan sementara
untuk input mouse pada tab Flow sasaran. Tidak digunakan untuk memanggil RPC Google privat.
Referensi: [Chrome Debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger).

Tes `tools/check-flow-browser.py` membuktikan kontrol negatif `.click()` ditolak fixture, sedangkan
klik worker menghasilkan `isTrusted=true`, mousedown dan tepat satu submit. Penolakan attach tidak
mengirim input; kegagalan sesudah mouseReleased tidak mengulang klik; sesi dapat dipasang/dilepas
lagi setelah tes. Seluruh regresi sebelumnya tetap lulus. Harness native
`tmp/bugcheck/flow-native-input.log` memverifikasi pesan izin dan penanganan jeda tanpa menyentuh
pustaka produksi. Typecheck dan build lulus. Jalur klik baru belum diverifikasi terhadap Google Flow
nyata karena worker pengguna masih perlu dimuat ulang dengan izin baru. Gambar dari klik manual
pengguna tidak dibuat ulang oleh tes.
