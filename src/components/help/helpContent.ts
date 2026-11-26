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
  stop: "Ekstensi berhenti sebelum kirim. Kamu yang memeriksa isian, lalu menekan Kirim Sekarang di panel ekstensi.",
  installTitle: "Cara memasang ekstensi uji",
  installIntro:
    "Ekstensi belum ada di toko Chrome. Selama masa uji, pasang dari berkas zip dengan enam langkah berikut. Langkahnya sama di Chrome dan Edge.",
  notesTitle: "Catatan penting",
} as const;

export interface HelpExtensionStep {
  title: string;
  detail: string;
  /** Tautan yang ditampilkan di akhir langkah: unduhan zip, atau bagian Ekstensi Browser di Pengaturan. */
  link?: "download" | "settings";
}

/** Langkah pasang paket UAT dari zip. Berkasnya: `EXTENSION_DOWNLOAD_HREF` di `src/lib/extensionConnect.ts`. */
export const HELP_EXTENSION_STEPS: readonly HelpExtensionStep[] = [
  {
    title: "Unduh dan ekstrak zip",
    detail:
      "Tekan tombol Unduh ekstensi (zip). Setelah selesai, ekstrak berkasnya. Di Windows, klik kanan berkas zip lalu pilih Extract All. Di Mac, klik dua kali berkas zip.",
    link: "download",
  },
  {
    title: "Buka halaman ekstensi",
    detail:
      "Ketik chrome://extensions di kolom alamat Chrome, atau edge://extensions di Edge, lalu tekan Enter. Nyalakan Mode pengembang (Developer mode) di kanan atas.",
  },
  {
    title: "Muat ekstensi",
    detail:
      "Klik Muat yang belum dikemas (Load unpacked). Pilih folder hasil ekstrak yang langsung berisi berkas manifest.json. Kartu Applify Form Copilot akan muncul dengan ID ikojbhmbbaignmlkcdailnbnekneplkj. Bila ID berbeda, jangan lanjut dan hubungi peneliti.",
  },
  {
    title: "Sematkan ikon Applify",
    detail: "Klik ikon puzzle di toolbar peramban, lalu klik ikon pin di samping Applify Form Copilot.",
  },
  {
    title: "Salin token di Applify",
    detail: "Buka Pengaturan, klik Hubungkan Ekstensi Chrome/Edge, lalu salin token yang muncul.",
    link: "settings",
  },
  {
    title: "Tempel token di ekstensi",
    detail: "Klik ikon Applify di toolbar untuk membuka panel samping. Tempel token di kolom token, lalu tekan Hubungkan Ekstensi.",
  },
];

export const HELP_EXTENSION_NOTES: readonly string[] = [
  "Jangan hapus atau pindahkan folder hasil ekstrak. Chrome membaca ekstensi langsung dari folder itu, jadi ekstensi berhenti bekerja bila folder hilang.",
  "Chrome atau Edge mungkin menampilkan peringatan tentang mode pengembang. Itu wajar untuk versi uji.",
  "Ekstensi hanya untuk laptop. Chrome dan Edge di HP tidak bisa memasangnya.",
  "Untuk versi baru, hapus ekstensi lama di halaman ekstensi, ekstrak zip baru ke folder baru, lalu ulangi langkah 3.",
];

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
    meaning: "Kunci pendek dari Pengaturan yang menyambungkan ekstensi di laptop ke akun Applify-mu. Token berlaku 8 jam, sesudah itu buat token baru.",
  },
];

export const HELP_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: "Kamu belum menekan Setujui",
    answer: "Tanpa persetujuan di halaman Persetujuan, agen tidak mengirim lamaran.",
  },
  {
    question: "Lamaran masih menunggu giliran",
    answer: "Pekerjaan ada di daftar tugas agen. Agen mengerjakan beberapa tugas sekaligus menurut urutan masuk, jadi tugasmu mungkin menunggu giliran sebentar.",
  },
  {
    question: "Agen sedang mengisi lowongan di situs karier perusahaan",
    answer: "Lowongan Greenhouse, Lever, Ashby, atau Workable diisi dan dikirim agen di server. Agen juga bisa menunggu kode keamanan dari emailmu.",
  },
  {
    question: "Lowongan portal menunggu Ekstensi Browser",
    answer: "Portal seperti JobStreet, Glints, Kalibrr, dan Dealls diisi ekstensi di laptop. Setelah itu ekstensi berhenti dan kamu yang menekan Kirim Sekarang di panel ekstensi.",
  },
  {
    question: "Kirim lewat email belum siap",
    answer: "Jalur email menunggu Gmail terhubung dan persetujuanmu. Surat yang dikirim adalah draf yang sudah kamu setujui.",
  },
];

export const HELP_EXTRA_GLOSSARY: readonly HelpTerm[] = [
  {
    term: "Agen",
    meaning: "Program asisten otomatis di server Applify yang menyiapkan isian formulir dan mengirim hanya sesudah kamu menyetujuinya.",
  },
  {
    term: "Draf lamaran",
    meaning: "Rancangan surat lamaran buatan AI yang belum dikirim dan masih bisa kamu sunting sebelum diajukan ke Persetujuan.",
  },
];

export const HELP_EXTRA_FAQ: readonly { question: string; answer: string }[] = [
  {
    question: "Kuota draf bulanan sudah habis",
    answer: "Paket Free mendapat 10 draf per bulan dan paket Pro 100 draf per bulan. Kamu tetap bisa melamar sendiri dari tautan lowongan, menunggu awal bulan, atau memakai API key sendiri jika tersedia.",
  },
  {
    question: "Ekstensi Browser belum tersambung",
    answer: "Buka halaman Pengaturan bagian Ekstensi Browser, salin token ekstensi, lalu tempel di panel ekstensi Chrome atau Edge di laptopmu.",
  },
  {
    question: "Panel ekstensi bilang token tidak sah atau sudah kedaluwarsa",
    answer: "Token ekstensi berlaku 8 jam. Buka Applify, masuk ke Pengaturan, klik Hubungkan Ekstensi Chrome/Edge, salin token baru, lalu tempel di panel ekstensi dan tekan Hubungkan Ekstensi.",
  },
  {
    question: "Kartu tidak bisa dipindah ke kolom Terkirim",
    answer: "Kolom Terkirim hanya diisi otomatis sesudah agen atau pengiriman email berhasil mengirim lamaran, agar catatan bukti pengiriman tetap akurat.",
  },
  {
    question: "Lowongan tidak punya tautan pendaftaran",
    answer: "Sebagian lowongan hanya mencantumkan email HRD atau formulir khusus. Buka rincian lowongan untuk melihat apakah tersedia jalur Kirim lewat Email.",
  },
];
