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
 * saat masa berlaku habis. Hanya permintaan yang belum diputuskan (`pending`) dan sudah lewat `expires_at`
 * yang ditampilkan `expired`. Baris yang sudah diputuskan tetap "Disetujui" atau "Ditolak": keputusan pengguna
 * tidak hilang karena waktu (uji klik produksi 21 November 2026, temuan 22: lima dari tujuh baris riwayat,
 * termasuk yang sudah disetujui, tertulis "Kedaluwarsa"). Bahwa masa berlaku 1 jam untuk pengiriman email sudah
 * lewat dijelaskan terpisah oleh panel email (lib/emailApply.ts).
 */
export function effectiveApprovalStatus(status: string, expiresAt: string | null | undefined, now: number = Date.now()): string {
  if (status === "pending" && expiresAt) {
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

/**
 * Worker menandai job apply tanpa tautan lowongan sebagai failed dengan pesan ini (NonRetryableError).
 * Bagi pengguna itu bukan kegagalan agen, jadi tampil sebagai Dilewati.
 */
export function isQueueSkipped(status?: string | null, errorMessage?: string | null): boolean {
  return status === "failed" && /tidak punya tautan/i.test(errorMessage ?? "");
}

export function queueDisplayLabel(status?: string | null, errorMessage?: string | null): string {
  return isQueueSkipped(status, errorMessage) ? "Dilewati" : queueStatusLabel(status);
}

/**
 * Label dan penjelasan bila agen tidak berhasil mengisi satu isian pun (application_logs.details.reason
 * "no_fields_filled"): lamaran tidak berubah status dan belum terkirim, pengguna perlu mengisi sendiri.
 */
export const FILL_YOURSELF_LABEL = "Isi sendiri di situs";
export const NO_FIELDS_FILLED_TEXT =
  "Agen belum berhasil mengisi formulir lowongan ini (halaman mungkin meminta masuk dulu). Lamaran belum terkirim. Isi sendiri di situs lowongan, atau ajukan lagi.";

/**
 * Penjelasan satu kalimat untuk pengguna awam: apa artinya status antrean ini dan apa yang perlu dilakukan.
 * `fieldsFilled` (dari log percobaan agen untuk tugas itu) membedakan tugas apply yang selesai tanpa mengisi
 * apa pun (0) dari yang mengisi sebagian atau seluruhnya; null atau kosong berarti belum diketahui.
 */
export function queueStatusHint(
  status: string | null | undefined,
  jobType?: string | null,
  errorMessage?: string | null,
  fieldsFilled?: number | null,
): string {
  if (isQueueSkipped(status, errorMessage)) {
    return "Dilewati: lowongan ini tidak punya tautan untuk dilamar. Pilih lowongan lain di halaman Lowongan.";
  }
  switch (status) {
    case "pending":
      return "Tugas sudah masuk antrean. Agen akan mengerjakannya begitu gilirannya tiba; kamu tidak perlu melakukan apa-apa.";
    case "processing":
      return "Agen sedang mengerjakan tugas ini. Halaman ini bisa ditinggalkan; hasilnya muncul di sini.";
    case "completed":
      if (jobType === "apply" && fieldsFilled === 0) return NO_FIELDS_FILLED_TEXT;
      return jobType === "apply"
        ? "Agen sudah mencoba mengisi formulir di peramban server dan berhenti sebelum tombol kirim. Isian itu tidak tersimpan di perangkatmu, jadi kirim sendiri lewat situs lowongan bila sudah yakin."
        : "Tugas selesai.";
    case "failed":
      return "Tugas tidak berhasil. Kamu bisa mencoba lagi dari halaman Lowongan.";
    default:
      return "";
  }
}

/** Antrean yang masih berjalan (belum selesai atau gagal): dipakai untuk lencana dan muat ulang berkala. */
export const isQueueActive = (status?: string | null) => status === "pending" || status === "processing";

/**
 * True bila ada tugas apply yang tadi masih berjalan (pending atau processing) dan kini selesai atau gagal.
 * `before` adalah status per id dari pemuatan sebelumnya; tugas yang belum pernah terlihat tidak dihitung
 * (pemuatan pertama sudah memuat data terbaru, dan status akhirnya tidak berarti baru saja berubah).
 */
export function applyJobFinished(
  before: ReadonlyMap<string, string>,
  items: ReadonlyArray<{ id: string; status: string; job_type?: string | null }>,
): boolean {
  return items.some((i) => i.job_type === "apply" && !isQueueActive(i.status) && isQueueActive(before.get(i.id)));
}
