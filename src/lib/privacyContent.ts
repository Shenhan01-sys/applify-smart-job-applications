// Isi halaman Kebijakan Privasi (src/routes/privacy.tsx). Dipisah dari komponen supaya bisa diuji tanpa DOM.
// Setiap pernyataan sudah dicocokkan dengan kode:
// - akun dan masuk: src/routes/login.tsx (supabase.auth.signInWithOAuth dengan provider google dan linkedin_oidc)
// - tabel dan RLS: database/schema.sql (RLS aktif di semua tabel milik pengguna)
// - CV: backend/services/resume-file.service.ts (bucket Storage privat `resumes`)
// - impor PDF LinkedIn: backend/services/linkedin-import.service.ts (hanya membaca, simpan terjadi di frontend)
// - penyedia model AI: supabase/functions/_shared/providers.ts (openrouter, gemini, anthropic, numes) dan
//   backend/services/ai-pipeline.service.ts (rantai Numes, Gemini, OpenRouter, Groq, lalu Claude)
// - pemantauan AI: backend/services/tracing.service.ts (Langfuse, aktif di Railway sesuai konfirmasi Hans 25 November 2026)
// - Gmail: backend/api/routes/oauth.ts (satu izin, gmail.send; token disimpan lewat token-crypto.ts, terenkripsi)
// - Telegram: backend/services/notifications.service.ts (TELEGRAM_CHAT_ID tunggal milik pengelola)
// - persetujuan dan saklar kirim: backend/api/routes/approval.ts, worker/src/handlers/emailApply.ts (ALLOW_REAL_SUBMIT)
// - hosting: vercel.json (frontend) dan backend/railway.toml (backend)
//
// Yang TIDAK bisa diverifikasi dari kode, sengaja tidak ditulis di halaman:
// - nilai ALLOW_REAL_SUBMIT di server produksi: kalimat "menyala" mengikuti keputusan Hans 24 dan 25 November 2026 dan
//   pemeriksaan Railway 25 November 2026 10.54 WIB (worker true; host Greenhouse dan Portal Uji Applify);
// - lokasi server worker dan penyedia model AI mana yang benar-benar aktif di produksi (bergantung kunci API yang diset);
// - lama penyimpanan data (tidak ada pekerjaan terjadwal penghapusan di kode) dan wilayah (region) proyek Supabase;
// - kontak peneliti: RESEARCHER_EMAIL di bawah, sama dengan email dukungan pada layar persetujuan Google
//   (keputusan Hans, 21 November 2026). Halaman Ketentuan memakai konstanta yang sama.
// - tidak ada fitur hapus akun di aplikasi (pencarian deleteUser, hapus akun di src dan backend kosong); hapus data
//   hanya lewat permintaan ke peneliti.

import { APPROVAL_VALID_TEXT } from "./approvalExpiry.ts";

export const PRIVACY_UPDATED = "25 November 2026";

/** Kontak peneliti untuk pertanyaan dan permintaan hapus data. */
export const RESEARCHER_EMAIL = "hansgunawan775@gmail.com";

export interface PrivacySection {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
}

export const PRIVACY_INTRO =
  "Applify adalah prototipe penelitian skripsi di Program Studi Sistem Informasi, Universitas Kristen Duta Wacana. " +
  "Kebijakan ini menjelaskan data apa yang dikumpulkan, di mana disimpan, siapa yang memprosesnya, dan cara meminta data dihapus. " +
  "Halaman ini ditulis apa adanya dan bukan dokumen hukum yang sudah ditinjau pengacara.";

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: "data-dikumpulkan",
    title: "Data yang dikumpulkan",
    items: [
      "Akun: email dan nama dari akun Google atau LinkedIn yang kamu pakai untuk masuk, atau email dan kata sandi bila kamu mendaftar dengan email. Login dikelola Supabase Auth. Kata sandi tidak disimpan di tabel Applify.",
      "Profil: nama, jabatan, lokasi, nomor telepon, tautan LinkedIn dan portofolio, pengalaman kerja, pendidikan, sertifikasi, proyek, pencapaian, dan skill yang kamu isi.",
      "CV: berkas PDF atau Word yang kamu unggah di Profil Saya.",
      "Impor PDF LinkedIn: teks dari PDF yang kamu pilih dibaca untuk menyusun pratinjau profil. Berkas PDF itu tidak disimpan. Hanya data yang kamu setujui di pratinjau yang masuk ke profilmu.",
      "Lamaran: lowongan yang kamu simpan, draf surat lamaran dan CV hasil AI, jawaban formulir, status lamaran, dan riwayat persetujuan.",
      "Pengaturan agen: data pribadi untuk mengisi formulir lamaran, kriteria pencarian, dan preferensi kerja.",
      "Antrean dan log: tugas yang kamu serahkan ke agen dan catatan hasil kerjanya.",
      "Asesmen Karier Hijau: jawaban yang kamu tulis dan hasil penilaiannya.",
      "Sesi LinkedIn atau Gmail, hanya bila kamu sendiri menghubungkannya.",
    ],
  },
  {
    id: "penyimpanan",
    title: "Tempat penyimpanan",
    paragraphs: [
      "Database dan akun login ada di Supabase. CV disimpan di bucket Supabase Storage yang privat. Aturan akses tingkat baris (row level security) membatasi data tiap pengguna hanya untuk pemiliknya.",
      "Frontend dilayani lewat Vercel. Backend berjalan di Railway. Sesi LinkedIn dan token Gmail disimpan terenkripsi.",
    ],
  },
  {
    id: "pihak-ketiga",
    title: "Pihak ketiga yang memproses data",
    items: [
      "Supabase: database, Storage, dan login.",
      "Google dan LinkedIn: hanya bila kamu memilih masuk dengan akun mereka. Aplikasi menerima nama dan email, dan dari LinkedIn juga foto profil.",
      "Penyedia model AI: Google (Gemini), Anthropic (Claude), Numes (pasar model yang meneruskan permintaan ke penyedia model gratis), OpenRouter, dan Groq. Mereka menerima bagian profil, isi PDF LinkedIn yang kamu impor, dan deskripsi lowongan yang diperlukan untuk menulis draf lamaran, menilai asesmen, atau menyusun pratinjau profil. Jangan menulis data yang tidak ingin kamu bagikan ke penyedia tersebut.",
      "Langfuse: layanan pemantauan panggilan AI (tracing) pada backend. Saat aktif di server, isi prompt dan keluaran AI disamarkan secara bawaan menjadi ringkasan hash dan panjang karakter untuk memantau keandalan dan biaya.",
      "Kapso (WhatsApp) dan Resend (email): hanya bila kamu mengaktifkan dan memverifikasi notifikasi WhatsApp atau email di halaman Pengaturan untuk menerima pembaruan status lamaran dan pengingat tindak lanjut.",
      "Vercel dan Railway: menjalankan frontend dan backend aplikasi.",
      "Telegram: saat status lamaran berubah, server dapat mengirim pemberitahuan berisi judul lowongan dan nama perusahaan ke satu chat Telegram milik pengelola aplikasi, bukan ke akunmu. Ini hanya terjadi bila Telegram diatur di server.",
    ],
    paragraphs: [
      "Applify tidak menjual data dan tidak memasang iklan.",
    ],
  },
  {
    id: "data-google",
    title: "Penggunaan data Google",
    paragraphs: [
      "Masuk dengan Google hanya memberi Applify nama dan email akun Google-mu. Data itu dipakai untuk mengenali akunmu.",
      "Izin Gmail diminta hanya bila kamu menghubungkan Gmail untuk mengirim lamaran lewat email. Applify meminta izin mengirim email (gmail.send) dan membaca alamat akun Gmail yang terhubung (userinfo.email) agar alamat pengirim tampil sebelum kamu mengirim. Applify tidak membaca kotak masuk atau email lain di akunmu. Email baru dikirim setelah kamu menyetujui lamaran di halaman Persetujuan.",
    ],
  },
  {
    id: "persetujuan",
    title: "Lamaran hanya dikirim setelah kamu menyetujui",
    paragraphs: [
      `Agen tidak mengirim lamaran sebelum kamu menyetujuinya di halaman Persetujuan. Setiap persetujuan punya batas waktu ${APPROVAL_VALID_TEXT}.`,
      "Pengiriman sungguhan menyala lewat saklar di server (ALLOW_REAL_SUBMIT). Setelah kamu menekan Setujui, agen boleh menekan tombol kirim di situs lowongan yang diizinkan server, saat ini Greenhouse dan Portal Uji Applify, atau mengirim email lamaran lewat Gmail yang kamu hubungkan sendiri. Lamaran yang sudah terkirim tidak bisa ditarik. Tekan Tolak bila kamu tidak ingin lamaran terkirim.",
    ],
  },
  {
    id: "penelitian",
    title: "Data untuk penelitian skripsi",
    paragraphs: [
      "Hasil pengujian, misalnya jawaban kuesioner atau catatan wawancara, dipakai untuk menilai kegunaan aplikasi dalam laporan skripsi. Cara pelaporan data dan masa penyimpanannya ditentukan peneliti.",
    ],
  },
  {
    id: "hapus-data",
    title: "Mengubah dan menghapus datamu",
    paragraphs: [
      "Kamu bisa mengubah profil, menghapus skill, dan menghapus lowongan tersimpan langsung di aplikasi.",
      "Applify belum punya tombol hapus akun di dalam aplikasi. Untuk menghapus akun beserta seluruh datamu, kirim permintaan ke peneliti di hansgunawan775@gmail.com. Kontak yang sama juga tertera di halaman Ketentuan & Privasi.",
    ],
  },
  {
    id: "perubahan",
    title: "Perubahan kebijakan",
    paragraphs: [
      "Kebijakan ini dapat berubah selama penelitian berjalan. Tanggal pembaruan terakhir tertera di bagian atas halaman.",
    ],
  },
];
