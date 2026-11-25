/** Teks halaman Bantuan. Tanpa em dash dan tanpa tanda seru, supaya nada tetap tenang. */

export interface HelpStep {
  title: string;
  detail: string;
}

export const HELP_STEPS: readonly HelpStep[] = [
  {
    title: "Lengkapi profil",
    detail: "Isi nama, posisi, dan skill. Agen memakai data ini untuk menyusun lamaran.",
  },
  {
    title: "Unggah CV PDF",
    detail: "Simpan CV di kartu CV untuk Dilampirkan. Agen melampirkan berkas ini saat mengisi formulir.",
  },
  {
    title: "Cari lowongan",
    detail: "Buka halaman Lowongan, lalu pilih lowongan yang cocok.",
  },
  {
    title: "Buat draf lamaran dengan AI",
    detail: "Tekan Lamar dengan AI, lalu Buat draf dengan AI. Draf masih berupa usulan.",
  },
  {
    title: "Periksa dan tekan Setujui",
    detail: "Baca draf di halaman Persetujuan. Tidak ada lamaran yang dikirim sebelum kamu menekan Setujui di halaman Persetujuan.",
  },
];

export const HELP_EXTENSION = {
  title: "Ekstensi Browser",
  intro: "Ekstensi Browser hanya dipakai di Chrome atau Edge di laptop. Ekstensi tidak bisa dipasang di HP.",
  use: "Ekstensi membantu mengisi formulir pada portal yang mewajibkan masuk dengan akunmu sendiri, seperti JobStreet, Glints, Kalibrr, dan Dealls.",
  token: "Buka Pengaturan, bagian Ekstensi Browser, lalu salin token ekstensi. Tempel token itu di panel ekstensi untuk menyambungkan laptopmu ke akun Applify.",
  stop: "Ekstensi berhenti sebelum kirim. Kamu yang memeriksa isian, lalu menekan Kirim sendiri.",
} as const;

export interface HelpTerm {
  term: string;
  meaning: string;
}

export const HELP_GLOSSARY: readonly HelpTerm[] = [
  {
    term: "ATS atau situs karier perusahaan",
    meaning: "Sistem yang dipakai perusahaan untuk menerima dan menyaring lamaran, misalnya Greenhouse atau Lever.",
  },
  {
    term: "Ekstensi Browser",
    meaning: "Program kecil di Chrome atau Edge yang membantu Applify mengisi formulir di portal yang butuh akunmu.",
  },
  {
    term: "Antrean atau daftar tugas agen",
    meaning: "Daftar pekerjaan yang menunggu giliran dijalankan agen.",
  },
  {
    term: "Kuota draf",
    meaning: "Jumlah draf AI yang masih bisa kamu buat dalam sebulan.",
  },
  {
    term: "Persetujuan",
    meaning: "Halaman tempat kamu memeriksa draf, lalu memilih Setujui atau Tolak.",
  },
  {
    term: "Token ekstensi",
    meaning: "Kunci pendek dari Pengaturan yang menyambungkan ekstensi di laptop ke akun Applify-mu.",
  },
];

export const HELP_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: "Kamu belum menekan Setujui",
    answer: "Tanpa persetujuan di halaman Persetujuan, agen tidak mengirim lamaran.",
  },
  {
    question: "Lamaran masih menunggu giliran",
    answer: "Pekerjaan ada di daftar tugas agen. Agen mengerjakan satu tugas pada satu waktu.",
  },
  {
    question: "Agen sedang mengisi lowongan di situs karier perusahaan",
    answer: "Lowongan Greenhouse, Lever, Ashby, atau Workable diisi dan dikirim agen di server. Agen juga bisa menunggu kode keamanan dari emailmu.",
  },
  {
    question: "Lowongan portal menunggu Ekstensi Browser",
    answer: "Portal seperti JobStreet, Glints, Kalibrr, dan Dealls diisi ekstensi di laptop. Setelah itu agen berhenti dan kamu yang menekan Kirim sendiri.",
  },
  {
    question: "Kirim lewat email belum siap",
    answer: "Jalur email menunggu Gmail terhubung dan persetujuanmu. Surat yang dikirim adalah draf yang sudah kamu setujui.",
  },
];
