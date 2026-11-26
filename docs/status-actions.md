# Status dan tindakan pengguna

Dokumen ini mendaftar setiap status yang tampil ke pengguna di halaman Persetujuan, Lamaran Saya, banner Beranda, dan panel samping ekstensi, beserta tindakan yang tersedia. Aturannya: tidak boleh ada status buntu. Setiap status punya sedikitnya satu tindakan, atau satu penjelasan yang jujur bila memang tidak ada yang bisa dilakukan.

Sumber kebenarannya ada di kode, bukan di dokumen ini:

- `src/lib/outcomeActions.ts`: `STAGE_ACTIONS` (semua tindakan yang mungkin per tahap) dan `ALWAYS_ACTION` (satu tindakan yang selalu ada per tahap).
- `src/components/OutcomeActions.tsx`: panel yang menggambar tindakan itu.
- `tests/statusActions.test.ts`: tes penjaga. Tes ini gagal bila ada tahap kartu tanpa tindakan.
- `tests/e2e/status-actions.spec.ts`: tes E2E per status, ditambah penjaga DOM yang memeriksa bahwa setiap kartu di kedua tab punya tombol atau tautan.

## Keputusan Hans, 26 November 2026

Keputusan ini menggantikan penghapusan tombol "Sudah terkirim" pada 25 November. Untuk hasil yang tidak pasti, pengguna mendapat tiga pilihan:

1. Sudah terkirim. Dicatat sebagai konfirmasi pengguna (`confirmed_by: 'user'`), bukan konfirmasi sistem. Kartu berlabel "Terkirim (dikonfirmasi kamu)" supaya data skripsi tetap membedakan keduanya.
2. Belum terkirim, ulangi. Membuat persetujuan baru yang menunggu keputusan, dan melepas persetujuan lama.
3. Tutup. Memindahkan kartu ke Riwayat sebagai Ditutup.

Hasil yang tidak pasti adalah kirim belum terkonfirmasi (`submit_unverified`), kode keamanan tidak dimasukkan atau ditolak (`code_timeout`, `code_rejected`), persetujuan disetujui tetapi masa berlakunya habis tanpa tugas agen atau tanpa bukti kirim, dan lowongan yang hanya bisa dilamar di luar Applify (LinkedIn, email langsung).

Semua tulis ke `approval_requests`, `application_logs`, dan `automation_queue` lewat backend (`POST /api/approvals/:id/mark-sent`, `/not-sent`, `/close`), hanya untuk pemilik persetujuan. Browser tidak menulis langsung. Tidak ada migrasi: hasilnya dicatat sebagai baris `application_logs` (`success` dengan `manual: true` dan `confirmed_by: 'user'`, atau `incomplete` dengan alasan `user_not_sent` atau `user_closed`), dan `POST /api/approvals/claim-statuses` mengembalikannya sebagai keadaan `abandoned` atau `closed`.

## Halaman Persetujuan

Kolom "Sebelum" memakai keadaan sebelum perubahan ini: kartu hanya punya tombol Periksa (draf menunggu), blok izin ekstensi, kolom kode, kolom pertanyaan, panel kirim sendiri (hanya saat agen berhenti sebelum kirim), banner klaim macet, dan panel Email.

| Tahap (label) | Tab | Sebelum | Sesudah |
| --- | --- | --- | --- |
| Menunggu persetujuan | Menunggu | Periksa | Periksa |
| Status belum terbaca | Menunggu | tidak ada | Muat ulang status, Buka formulir lowongan |
| Menunggu giliran | Menunggu | tidak ada | Coba lagi, Muat ulang status, Buka formulir lowongan |
| Perlu diisi sendiri (LinkedIn, dan sejenisnya) | Menunggu | tautan Buka lowongan | Sudah terkirim, Buka formulir lowongan, Tutup |
| Kirim lewat panel Email | Menunggu | panel Email | panel Email, Sudah terkirim, Buka formulir lowongan, Tutup |
| Sedang diproses | Menunggu | tidak ada | Muat ulang status, Buka formulir lowongan |
| Perlu tindakanmu (pertanyaan, kode, login, izin ekstensi) | Menunggu | jawaban, kolom kode, atau izin ekstensi | tindakan yang sama, ditambah Muat ulang status. Bila kode tidak masuk atau ditolak: Sudah terkirim, Belum terkirim ulangi, Tutup |
| Google Form dialihkan ke ekstensi, belum diantre (`google_forms_missing_required`) | Menunggu, Perlu tindakanmu | jawaban dan blok Lanjutkan di ekstensi | jawaban, Lanjutkan di ekstensi, Sudah terkirim, Buka formulir lowongan, Tutup. Label "Formulir punya pertanyaan wajib yang belum terjawab", teksnya menyebut pertanyaan yang kosong |
| Google Form dialihkan ke ekstensi, tugas ekstensi antre | Menunggu, Sedang diproses | hanya "Menunggu Ekstensi Browser", pertanyaan yang kosong tidak disebut | tetap "Menunggu Ekstensi Browser", ditambah daftar pertanyaan yang belum terjawab. Muat ulang status, Buka formulir lowongan |
| Terisi, belum terkirim | Menunggu | panel kirim sendiri | panel kirim sendiri, Coba lagi, Tutup |
| Perlu dicek, kirim belum terkonfirmasi | Menunggu | tidak ada | Sudah terkirim, Belum terkirim ulangi, Buka formulir lowongan, Tutup |
| Belum dikirim (mode uji) | Menunggu | panel Email | panel Email, Buka formulir lowongan, Tutup |
| Belum terkirim, bisa dicoba lagi | Menunggu | tidak ada | Coba lagi, Lanjutkan di ekstensi (bila situsnya didukung), Buka formulir lowongan, Tutup |
| Terkirim, Terkirim (dikonfirmasi kamu) | Riwayat | tidak ada | Lihat di Lamaran Saya |
| Ditolak | Riwayat | tidak ada | Ajukan lagi dari Lowongan |
| Kedaluwarsa, belum terkirim (disetujui) | Riwayat | tidak ada | penjelasan, Sudah terkirim, Belum terkirim ulangi, Buka formulir lowongan, Tutup |
| Kedaluwarsa (tidak pernah disetujui) | Riwayat | tidak ada | penjelasan, Ajukan lagi dari Lowongan |
| Diganti persetujuan baru | Riwayat | tidak ada | Lihat persetujuan baru |
| Ditutup | Riwayat | tidak ada (tahap baru) | Ajukan lagi dari Lowongan |

Catatan penempatan:

- Persetujuan yang disetujui, masa berlakunya habis, dan tidak punya tugas agen sama sekali (status agen terbaca dan kosong) pindah ke Riwayat sebagai "Kedaluwarsa, belum terkirim" dan mendapat tiga tindakan. Tes lama temuan 22 sebelumnya menahannya di "Menunggu giliran" tanpa jalan keluar. Tugas yang masih berjalan dan kirim yang belum terkonfirmasi tetap di Menunggu walau waktunya lewat.
- Pernyataan pengguna menang atas log agen yang tidak pasti. "Belum terkirim, ulangi" dan "Tutup" menutup persetujuan itu walau agen sempat mencatat `submit_unverified`. Hanya log `success` yang lebih kuat.
- Pengalihan ke ekstensi (temuan E2E production 27 November 2026, Google Form "Uji Applify (Peneliti)"): worker mengisi formulir lalu berhenti karena pertanyaan wajib tanpa jawaban, menulis log `incomplete` dengan `reason: google_forms_missing_required`, dan (bila `extension_auto_use` menyala) mengantre tugas `extension_apply`. Baris agen kartu memakai tugas terbaru, yaitu tugas ekstensi, sehingga log tugas worker sebelumnya tidak terbaca dan pertanyaan yang kosong hilang dari kartu. `buildAgentApplyRows` kini membaca juga log tugas worker sebelumnya dan membawa alasan serta labelnya sebagai `handoff_context`, hanya selama tugas ekstensi masih aktif. Penempatan tidak berubah (tetap Sedang diproses), karena ekstensi memang sedang bekerja. Teks alasannya menyebut pertanyaan yang kosong, bukan situs yang belum diizinkan kirim otomatis. Teks umum "berhenti sebelum kirim" kini menyebut penyebab yang paling umum, bukan satu-satunya.
- Status agen belum terbaca: bila satu muat ulang gagal membaca antrean (misalnya batas waktu database), baris agen dari pemuatan sebelumnya dipertahankan (`keepAgentRowsWhenUnreadable`), jadi kartu tidak berganti-ganti antara "Menunggu Ekstensi Browser" dan "Agen belum dijalankan". Pada pemuatan pertama yang gagal, kartu berkata "Status agen belum terbaca", bukan "Agen belum dijalankan".
- Kartu Terkirim yang masih punya percobaan agen lama (pertanyaan, langkah berikutnya, bukti) menyembunyikan semuanya dan menampilkan satu catatan bahwa percobaan lama tidak berlaku lagi (kasus GoToGroup, 26 November 2026).
- Kolom jawaban, kolom kode, dan panel kirim sendiri hanya tampil untuk kartu yang belum terkirim.

## Halaman Lamaran Saya

Papan kanban punya satu tindakan per kartu: Lihat detail. Tindakan di jendela detail:

| Keadaan | Sebelum | Sesudah |
| --- | --- | --- |
| Draf menunggu persetujuan | tautan Buka Persetujuan, teks "berlaku 1 jam" | tautan Buka Persetujuan, teks memakai `APPROVAL_VALID_TEXT` ("24 jam", sama dengan server) |
| Agen berhenti sebelum kirim, persetujuan berlaku | panel kirim sendiri dengan teks "selama uji coba, pengiriman dimatikan" | panel kirim sendiri, teks diganti penjelasan yang berlaku sekarang |
| Pertanyaan atau kode menunggu, persetujuan berlaku | tautan ke Persetujuan | sama |
| Pertanyaan atau kode menunggu, persetujuan sudah kedaluwarsa atau ditutup (kasus IDEKU) | tautan ke Persetujuan yang tidak menampilkannya | catatan `agent-stale-approval`, tanpa tautan, tanpa jawaban, tanpa kode |
| Kirim belum terkonfirmasi, atau perlu dicek (kode tidak sampai) | tautan Buka Persetujuan | Sudah terkirim, Belum terkirim ulangi, Buka formulir lowongan, Tutup, langsung dari jendela detail |
| Lamaran terkirim lewat email atau ditandai pengguna, sedangkan percobaan agen terbaru berhenti sebelum kirim (kasus GoToGroup) | blok "Bukti dari agen" berisi isian percobaan yang berhenti, terbaca seolah agen yang mengirim | blok berjudul "Percobaan agen sebelumnya (tidak dikirim)" dengan catatan `SENT_STALE_ATTEMPT_HINT` (sama dengan kartu Terkirim di Persetujuan), isiannya di balik toggle tertutup. Berlaku juga bila persetujuan percobaan itu sudah kedaluwarsa atau ditutup. Aturannya di `src/lib/staleAttempt.ts`. Log success tetap "Bukti pengiriman", dan `submit_unverified` tidak diberi label "tidak dikirim" |
| Kartu Ditutup untuk lowongan yang punya lamaran lain (kasus Datadog) | menampilkan Bukti pengiriman milik lamaran lain | tanpa bukti. Percobaan agen dibatasi per lamaran lewat jendela waktu (`src/lib/applicationAttempts.ts`), karena log hanya membawa `job_id` |

Konstanta masa berlaku persetujuan ada di `src/lib/approvalExpiry.ts` dan dijaga `tests/approvalExpiry.test.ts`, yang membandingkannya dengan `APPROVAL_TTL_MS` di backend (`backend/services/approval-shared.ts`).

## Banner Tindakan mendesak di Beranda

Banner tidak punya aturan penempatan sendiri. `summarizeUrgentActions` (`src/lib/dashboardUrgent.ts`) menempatkan setiap persetujuan dengan `splitApprovalTabs` dan `placementContextFromData` (`src/lib/approvalTabs.ts`), fungsi yang sama dengan halaman Persetujuan. Datanya dibaca `loadEmailApplyData` (dengan `placementOnly`, tanpa status Gmail dan profil) dari Riwayat sebanyak `APPROVAL_HISTORY_LIMIT` baris, sama dengan halaman Persetujuan.

Keputusan Hans, 27 November 2026: banner menghitung setiap kartu tab Menunggu yang butuh tindakan pengguna, bukan hanya draf dan kartu kirim belum terkonfirmasi. Angka total sama dengan jumlah kartu Menunggu dikurangi kartu yang tidak butuh tindakan (`BACKGROUND_STAGES`). Kartu yang masuk Riwayat (kedaluwarsa, terkirim, ditutup, diganti) tidak dihitung. Satu baris per kelompok, urutannya di `URGENT_LINES`, semuanya menaut ke Persetujuan lewat "Tinjau di Persetujuan".

| Baris banner | Tahap kartu di Menunggu | Sebelum | Sesudah |
| --- | --- | --- | --- |
| "N draf menunggu persetujuanmu." | Menunggu persetujuan | dihitung | sama |
| "N lamaran menunggu kode keamanan dari emailmu." | Perlu tindakanmu, agen menunggu kode | dihitung | sama. Tugas yang masih berjalan tetap dihitung walau masa berlakunya lewat, karena kartunya tetap di Menunggu |
| "N lamaran menunggu jawaban pertanyaan formulir untuk agen." | Perlu tindakanmu, ada pertanyaan | dihitung | sama |
| "N lamaran perlu dicek: kode keamanan tidak dimasukkan atau ditolak." | Perlu tindakanmu, `code_timeout` atau `code_rejected` | tidak dihitung | dihitung |
| "N lamaran berhenti dan perlu tindakanmu (login, CAPTCHA, atau isian wajib)." | Perlu tindakanmu selain empat di atas: menunggu login, CAPTCHA, lowongan ditutup, dialihkan, dan sejenisnya | tidak dihitung | dihitung |
| "N lamaran perlu dicek: kirim belum terkonfirmasi." | Perlu dicek, kirim belum terkonfirmasi | dihitung (sejak 26 November 2026) | sama, termasuk yang masa berlakunya sudah lewat |
| "N lamaran perlu diisi sendiri." | Perlu diisi sendiri (LinkedIn dan sejenisnya) | tidak dihitung | dihitung |
| "N lamaran perlu dikirim lewat panel Email." | Kirim lewat panel Email | tidak dihitung | dihitung |
| "N lamaran terisi, belum terkirim." | Terisi, belum terkirim | tidak dihitung | dihitung |
| "N lamaran belum terkirim, bisa dicoba lagi." | Belum terkirim, bisa dicoba lagi | tidak dihitung | dihitung |
| "N lamaran belum dikirim (mode uji)." | Belum dikirim (mode uji) | tidak dihitung | dihitung |

Tidak dihitung walau ada di Menunggu, karena tidak ada keputusan yang bisa diambil pengguna:

| Tahap | Alasan |
| --- | --- |
| Sedang diproses | Agen atau email sedang bekerja, hasilnya datang sendiri. |
| Menunggu giliran | Tugas menunggu giliran di antrean agen. Tombol Coba lagi hanya jalan keluar bila macet. |
| Status belum terbaca | Data status agen belum termuat atau gagal dimuat. Itu masalah data, bukan hasil kerja agen. Bila ikut dihitung, kegagalan memuat membuat semua kartu disetujui tampak mendesak. |

Ketiganya tetap punya tombol di kartu (Muat ulang status, Coba lagi, Buka formulir lowongan), sesuai aturan tanpa status buntu. Persetujuan yang macet di sana kedaluwarsa dan pindah ke Riwayat dengan tiga tindakan. Tahap baru di `ApprovalStage` membuat `urgentFieldForStage` gagal dikompilasi sampai diputuskan dihitung atau tidak. Tes per tahap ada di `tests/statusActions.test.ts` dan `tests/e2e/dashboard-urgent.spec.ts`.

Chip "N lamaran belum terkirim di kolom Siap dikirim" di Beranda (`MissionControlStage`) menghitung lamaran (`ai_applications` berstatus `ready`, sama dengan kolom papan Lamaran Saya), bukan persetujuan Menunggu. Angkanya bisa berbeda dari tab Menunggu: satu lamaran bisa punya persetujuan yang sudah kedaluwarsa atau ditutup, dan sebaliknya satu persetujuan Menunggu belum tentu punya lamaran `ready`. Chip tidak lagi berbunyi "siap dikirim", karena menyiratkan Applify tinggal mengirim; labelnya kini menyebut kolomnya dan keterangannya (`title`) menjelaskan perbedaannya.

Teks "belum terkirim, bisa dicoba lagi" mengikuti label kartu (`STATUS_TERM.retryable`). Label lama "Gagal, bisa dicoba lagi" sudah dipensiunkan (`RETIRED_STATUS_LABELS`).

## Panel samping ekstensi (hanya dokumentasi, tidak diubah)

Folder `extension/` tidak diubah dalam pekerjaan ini. Inventaris di bawah dibuat dengan membaca kodenya. Status yang buntu tercatat di sini sebagai bahan perbaikan berikutnya. Untuk pengguna Applify, jalan keluarnya ada di halaman Persetujuan: setiap hasil yang tidak pasti sekarang punya tiga tindakan di sana.

| Status ekstensi | Tindakan di panel | Buntu |
| --- | --- | --- |
| Belum terhubung, token tidak valid, token dicabut atau kedaluwarsa saat memuat daftar | Hubungkan Ekstensi, Buka Pengaturan Applify | tidak |
| Token kedaluwarsa saat mengisi, mengisi ulang, atau mengirim (401) | hanya Putus, tanpa tombol Hubungkan ulang | ya |
| Antrean galat berulang | tidak ada tombol, hilang setelah satu keberhasilan | ya |
| Laporan kirim gagal (mungkin sudah terkirim) | Coba lapor lagi | tidak, tetapi bisa menempel selamanya bila `pageUrl` kosong atau LinkedIn |
| Laporan pelepasan gagal | Coba lapor lagi | tidak |
| Butuh izin situs | Izinkan situs | tidak |
| Situs tidak ada di daftar izin ekstensi (`unsupported_host`) | tidak ada, penjelasan hanya di `error_message` backend | ya |
| Tab tanpa akses | Periksa lagi, Buka Situs Lowongan | tidak |
| Tab LinkedIn, formulir terisi di tab lain, sesi tab tidak cocok | tidak ada, hilang saat pengguna pindah tab | ya (teks saja) |
| Mengisi, menyimpan jawaban, mengirim (sementara) | tombol nonaktif | tidak |
| Terisi, sebagian terisi, butuh jawaban | Kirim Sekarang, Isi Formulir Sekarang, Simpan jawaban dan isi ulang | tidak |
| Kolom rahasia (isi sendiri di halaman) | isi ulang saja | sebagian |
| Login atau CAPTCHA diblokir | Lanjutkan setelah Login/CAPTCHA | tidak |
| Diblokir (AI dilarang, lowongan ditutup) | tidak ada | ya |
| Formulir tidak ditemukan, gagal mengisi | Isi Formulir Sekarang, Izinkan situs bila iframe | tidak |
| Catatan ke Applify gagal setelah mengisi | tidak ada, tidak disimpan dan tidak diulang | ya |
| Terkirim | daftar dimuat ulang | tidak |
| Kirim belum terkonfirmasi (sudah dilaporkan) | tidak ada, teks menyebut riwayat Persetujuan tanpa tautan | ya di panel; di Applify sekarang punya tiga tindakan |
| Validasi formulir | Kirim Sekarang tetap ada | tidak |
| Butuh kode keamanan | tidak ada, tombol Kirim disembunyikan | ya di panel; di Applify sekarang punya tiga tindakan |
| Kirim gagal, batas harian, persetujuan kedaluwarsa | Kirim Sekarang untuk kode yang bisa diulang, Isi Formulir Sekarang | tidak |
| Persetujuan terpakai di tempat lain | tidak ada, tombol Kirim disembunyikan | ya (memang harus berhenti: jangan kirim lagi) |
| Antrean menunggu login, CAPTCHA antrean, berhenti, gagal, tidak ada formulir | hanya tulisan di halaman lowongan, panel kosong | ya |

Dua kasus di Applify memutus rantai ini tanpa mengubah ekstensi: kirim belum terkonfirmasi dan butuh kode keamanan. Keduanya dilaporkan ke backend sebagai `submit_unverified` atau alasan `code_timeout`, sehingga halaman Persetujuan menampilkan tiga tindakan.

## Cara menambah status baru

1. Tambahkan tahap di `ApprovalStage` dan `STAGE_LABEL` (`src/lib/approvalTabs.ts`).
2. Tulis tindakannya di `STAGE_ACTIONS` dan `ALWAYS_ACTION` (`src/lib/outcomeActions.ts`).
3. Bila tahap itu memberi tiga pilihan, tambahkan ke `offersOutcomeChoice` dan teks pengantarnya di `OUTCOME_INTRO`.
4. Jalankan `npm run test`. Tes penjaga `statusActions` gagal bila tahap baru belum punya tindakan.
