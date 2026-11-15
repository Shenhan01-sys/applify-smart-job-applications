# HITL Approval Flow — design brief

**Proses nyata yang direpresentasikan.** Lamaran yang ditulis AI tidak boleh terkirim tanpa izin pemilik akun.
Urutannya: draf AI → **gerbang persetujuan manusia** → antrean (`automation_queue`) → agen browser mengisi
formulir → terkirim. Pengiriman nyata hanya terjadi bila pengguna menyetujui *dan* worker diizinkan
(`ALLOW_REAL_SUBMIT=true`).

**Objek inti.** Surat lamaran (dokumen) yang berpindah posisi di sepanjang lintasan. Gerbang persetujuan
digambar sebagai simpul berwarna ink dengan cincin lime yang terus berdenyut: satu-satunya titik yang
menunggu tangan manusia.

**Metafora spasial.** Lintasan horizontal 5 simpul (`HitlTrack`). Penghubung antarsimpul adalah garis
putus-putus yang terus mengalir (`path-flow` + `animate-dbDataFlow`, sama dengan dashboard) sehingga arah
proses terbaca tanpa label. Simpul yang sudah dilewati terisi biru eco; simpul yang belum dilalui abu.

**Gerak.**
- Kontinu: aliran dash pada penghubung, denyut cincin lime pada simpul yang aktif.
- Micro-beat: surat meluncur (transisi `left`, easing `cubic-bezier(.22,1,.36,1)`) ke simpul berikutnya
  ketika status berubah (mis. setelah "Ajukan ke Persetujuan").

**Sistem visual (Applify in-app).** Paper `#F4F1E8` sebagai alas lintasan, ink `#16150F` untuk gerbang,
lime `#D2F801` untuk perhatian, eco `#0A5BE0` untuk tahap selesai, `font-display` untuk judul,
angka `font-mono`, border 2 px, radius 2xl. Tidak ada warna di luar token ini.

**Dipakai di.**
- `AIApplyModal` — setelah draf jadi: surat berhenti di gerbang; tombol utama "Ajukan ke Persetujuan".
- `ApprovalReviewModal` — pengguna sedang berada di gerbang; menyetujui = surat masuk antrean.
