/**
 * Label berbahasa Indonesia untuk status yang tersimpan sebagai kode bahasa Inggris di database.
 * Kode di database tidak diubah; hanya tampilannya. Tanpa impor, supaya bisa dites dengan `node --test`.
 */

/** approval_requests.status */
export const APPROVAL_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu persetujuan",
  approved: "Disetujui",
  rejected: "Ditolak",
  expired: "Kedaluwarsa",
};

/**
 * Status yang ditampilkan untuk satu permintaan persetujuan. Kolom status di database tidak berubah sendiri
 * saat masa berlaku habis, jadi permintaan `pending` atau `approved` yang `expires_at`-nya sudah lewat
 * ditampilkan sebagai `expired`. Tanpa ini, badge menulis "Disetujui" sementara panel email di bawahnya
 * menulis "sudah kedaluwarsa" (uji klik produksi 19 November 2026).
 */
export function effectiveApprovalStatus(status: string, expiresAt: string | null | undefined, now: number = Date.now()): string {
  if ((status === "pending" || status === "approved") && expiresAt) {
    const t = new Date(expiresAt).getTime();
    if (Number.isFinite(t) && t <= now) return "expired";
  }
  return status;
}

/** ai_applications.status */
export const APPLICATION_STATUS_LABEL: Record<string, string> = {
  draft: "Draf",
  ready: "Siap dikirim",
  submitted: "Terkirim",
  follow_up: "Perlu tindak lanjut",
  responded: "Sudah dibalas",
  closed: "Ditutup",
};

/** automation_queue.status */
export const QUEUE_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu giliran",
  processing: "Sedang dikerjakan agen",
  completed: "Selesai",
  failed: "Gagal",
};

/** automation_queue.job_type */
export const QUEUE_TYPE_LABEL: Record<string, string> = {
  apply: "Isi formulir lowongan",
  email_apply: "Kirim lamaran lewat email",
  search: "Cari lowongan",
  company_insight: "Analisis perusahaan",
};

function pick(map: Record<string, string>, key: string | null | undefined, unknown: string): string {
  if (!key) return unknown;
  return map[key] ?? `${unknown} (${key})`;
}

export const approvalStatusLabel = (s?: string | null) => pick(APPROVAL_STATUS_LABEL, s, "Status tidak diketahui");
export const applicationStatusLabel = (s?: string | null) => pick(APPLICATION_STATUS_LABEL, s, "Status tidak diketahui");
export const queueStatusLabel = (s?: string | null) => pick(QUEUE_STATUS_LABEL, s, "Status tidak diketahui");
export const queueTypeLabel = (s?: string | null) => pick(QUEUE_TYPE_LABEL, s, "Tugas agen");

/** Penjelasan satu kalimat untuk pengguna awam: apa artinya status antrean ini dan apa yang perlu dilakukan. */
export function queueStatusHint(status: string | null | undefined, jobType?: string | null): string {
  switch (status) {
    case "pending":
      return "Tugas sudah masuk antrean. Agen akan mengerjakannya begitu gilirannya tiba; kamu tidak perlu melakukan apa-apa.";
    case "processing":
      return "Agen sedang mengerjakan tugas ini. Halaman ini bisa ditinggalkan; hasilnya muncul di sini.";
    case "completed":
      return jobType === "apply"
        ? "Agen sudah mengisi formulir lowongan dan berhenti sebelum tombol kirim. Buka lowongannya dan kirim sendiri bila sudah yakin."
        : "Tugas selesai.";
    case "failed":
      return "Tugas tidak berhasil. Kamu bisa mencoba lagi dari halaman Lowongan.";
    default:
      return "";
  }
}

/** Antrean yang masih berjalan (belum selesai atau gagal): dipakai untuk lencana dan muat ulang berkala. */
export const isQueueActive = (status?: string | null) => status === "pending" || status === "processing";
