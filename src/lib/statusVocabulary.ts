/**
 * Kamus status tunggal (ON-10, catatan 41 dan usulan Gemini di NextRoadMap 42, 25 November 2026).
 *
 * Audit onboarding menemukan satu lamaran bisa tampil dengan tiga kata berbeda di tiga halaman: Persetujuan
 * ("Disetujui, belum terkirim"), Antrean Agen ("Sedang dikerjakan agen"), dan kartu lamaran ("Isi sendiri di situs").
 * Semua label keadaan yang sama sekarang diambil dari sini, supaya Persetujuan, Antrean Agen, Lamaran Saya, dan
 * Beranda memakai kata yang sama. Arti status dan kolom Kanban tidak berubah.
 */
export const STATUS_TERM = {
  /** Sudah disetujui, tugas agen atau email belum mulai (antre). */
  waitingTurn: "Menunggu giliran",
  /** Tugas agen atau email sedang berjalan. */
  processing: "Sedang diproses",
  /** Agen tidak bisa mengisi formulir situs ini; pengguna membuka tautan dan mengirim sendiri. */
  fillYourself: "Perlu diisi sendiri",
  /** Disetujui, tetapi tidak diantre ke agen atau ekstensi: lowongan email langsung, pengguna mengirim lewat panel Email. */
  sendByEmail: "Kirim lewat panel Email",
  /** Formulir terisi sebagian, tombol kirim tidak ditekan. */
  partlyFilled: "Terisi sebagian, belum terkirim",
  /** Situs menolak isian (validasi); tidak ada yang terkirim. */
  rejectedByForm: "Belum terkirim, isian ditolak situs",
  /** Percobaan gagal, masa berlaku persetujuan masih ada. */
  retryable: "Belum terkirim, bisa dicoba lagi",
  /** Masa berlaku persetujuan habis sebelum terkirim. */
  expiredNotSent: "Kedaluwarsa, belum terkirim",
  /** ai_applications follow_up dan responded: sama di Kanban dan Beranda. */
  followUp: "Perlu tindak lanjut",
  responded: "Sudah dibalas",
} as const;

/** Label lama yang tidak boleh tampil lagi di layar (dijaga tes). */
export const RETIRED_STATUS_LABELS = [
  "Disetujui, belum terkirim",
  "Sedang dikerjakan agen",
  "Isi sendiri di situs",
  "Terisi sebagian, belum dikirim",
  "Ditolak formulir (tidak terkirim)",
  "Gagal, bisa dicoba lagi",
  "Gagal, masa berlaku habis",
  "Perlu follow-up",
] as const;
