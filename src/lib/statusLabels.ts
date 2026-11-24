/**
 * Label berbahasa Indonesia untuk status yang tersimpan sebagai kode bahasa Inggris di database.
 * Kode di database tidak diubah; hanya tampilannya. Hanya mengimpor berkas murni lain (dengan ekstensi .ts),
 * supaya bisa dites dengan `node --test`.
 */

import { EMAIL_TEST_MODE_HINT, EMAIL_TEST_MODE_LABEL } from "./emailTestMode.ts";
import { describeExtensionWait, extensionWaitHint } from "./extensionWaitReason.ts";

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
 * termasuk yang sudah disetujui, tertulis "Kedaluwarsa"). Bahwa masa berlaku 24 jam untuk pengiriman email sudah
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
  extension_apply: "Isi formulir via Ekstensi Browser",
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

/**
 * True bila tugas apply berstatus completed tetapi agen tidak mengisi satu isian pun (log percobaan untuk tugas
 * itu mencatat details.fields_filled = 0). Bagi worker tugasnya memang selesai, tetapi bagi pengguna hasilnya
 * belum berhasil: lamaran belum terkirim dan formulirnya harus diisi sendiri. Label hijau "Selesai" untuk kasus
 * ini menyesatkan (uji klik 21 November 2026, temuan 25). Dasarnya kolom terstruktur fields_filled, bukan
 * pencocokan teks pesan. null atau undefined berarti belum diketahui, jadi label tetap "Selesai".
 */
export function isQueueNeedsManual(status?: string | null, jobType?: string | null, fieldsFilled?: number | null): boolean {
  return status === "completed" && (jobType === "apply" || jobType === "extension_apply") && fieldsFilled === 0;
}

/** Label untuk tugas apply yang selesai tanpa mengisi apa pun; bukan keadaan sukses, jadi tidak memakai "Selesai". */
export const QUEUE_NEEDS_MANUAL_LABEL = "Perlu diisi sendiri";

/**
 * Tugas email_apply yang selesai tetapi log-nya `skipped` karena pengiriman nyata dimatikan (mode uji): tidak ada
 * email yang keluar, jadi bukan "Selesai". `emailTestMode` datang dari log (lib/emailTestMode.ts), bukan dari status antrean.
 */
export function isEmailTestMode(status?: string | null, jobType?: string | null, emailTestMode?: boolean | null): boolean {
  return status === "completed" && jobType === "email_apply" && emailTestMode === true;
}

export function queueDisplayLabel(
  status?: string | null,
  errorMessage?: string | null,
  jobType?: string | null,
  fieldsFilled?: number | null,
  emailTestMode?: boolean | null,
): string {
  if (isEmailTestMode(status, jobType, emailTestMode)) return EMAIL_TEST_MODE_LABEL;
  if (isQueueNeedsManual(status, jobType, fieldsFilled)) return QUEUE_NEEDS_MANUAL_LABEL;
  return isQueueSkipped(status, errorMessage) ? "Dilewati" : queueStatusLabel(status);
}

/**
 * Label dan penjelasan bila agen tidak berhasil mengisi satu isian pun (application_logs.details.reason
 * "no_fields_filled"): lamaran tidak berubah status dan belum terkirim, pengguna perlu mengisi sendiri.
 */
export const FILL_YOURSELF_LABEL = "Isi sendiri di situs";
/**
 * Tugas apply yang selesai dan mengisi formulir, tetapi tidak menekan kirim. Formulir itu ada di peramban server,
 * jadi pengguna tidak bisa menekan kirim di sana; teks ini tidak menyuruhnya (temuan uji klik 23 November 2026).
 * Kalimatnya tetap benar saat ALLOW_REAL_SUBMIT dinyalakan, karena host yang tidak diizinkan juga berhenti di sini.
 */
export const AGENT_STOPPED_BEFORE_SUBMIT_TEXT =
  "Agen sudah mengisi formulir di peramban server, lalu berhenti sebelum tombol kirim karena pengiriman otomatis belum diizinkan (selama uji coba, pengiriman dimatikan). Lamaran tidak terkirim dan ada di kolom Siap dikirim. Bila pengiriman diizinkan, agen menekan kirim sendiri dan lamaran pindah ke Terkirim.";

export const NO_FIELDS_FILLED_TEXT =
  "Agen belum berhasil mengisi formulir lowongan ini (halaman mungkin meminta masuk dulu). Lamaran belum terkirim. Isi sendiri di situs lowongan, atau ajukan lagi.";

/**
 * Penjelasan satu kalimat untuk pengguna awam: apa artinya status antrean ini dan apa yang perlu dilakukan.
 * `fieldsFilled` (dari log percobaan agen untuk tugas itu) membedakan tugas apply yang selesai tanpa mengisi
 * apa pun (0) dari yang mengisi sebagian atau seluruhnya; null atau kosong berarti belum diketahui.
 */
export const EXTENSION_STOPPED_BEFORE_SUBMIT_TEXT =
  "Ekstensi Browser sudah mengisi formulir di tab perambanmu dan berhenti sebelum tombol kirim. Buka tab atau panel Ekstensi untuk memeriksa isian lalu klik Kirim Sekarang.";

export function queueStatusHint(
  status: string | null | undefined,
  jobType?: string | null,
  errorMessage?: string | null,
  fieldsFilled?: number | null,
  emailTestMode?: boolean | null,
  /** `scheduled_at` baris antrean dan jam sekarang: hanya dipakai untuk mengenali ekstensi yang tidak aktif. */
  wait?: { scheduledAt?: string | null; now?: number },
): string {
  if (isEmailTestMode(status, jobType, emailTestMode)) return EMAIL_TEST_MODE_HINT;
  if (isQueueSkipped(status, errorMessage)) {
    return "Dilewati: lowongan ini tidak punya tautan untuk dilamar. Pilih lowongan lain di halaman Lowongan.";
  }
  const isExt = jobType === "extension_apply";
  switch (status) {
    case "pending": {
      if (isExt) {
        // Ekstensi sudah mencoba tetapi tertahan (izin situs), atau tidak ada ekstensi aktif: sebut penyebabnya.
        const reason = extensionWaitHint(
          describeExtensionWait({ job_type: jobType, status, error_message: errorMessage, scheduled_at: wait?.scheduledAt }, wait?.now),
        );
        if (reason) return reason;
      }
      return isExt
        ? "Tugas sudah masuk antrean Ekstensi Browser. Ekstensi akan membuka tab baru di browser kamu dan mengisi formulir di sana. Kamu bisa melihat prosesnya."
        : "Tugas sudah masuk antrean. Agen akan mengerjakannya begitu gilirannya tiba; kamu tidak perlu melakukan apa-apa.";
    }
    case "processing":
      return isExt
        ? "Ekstensi Browser sedang membuka atau mengisi formulir lamaran di tab perambanmu."
        : "Agen sedang mengerjakan tugas ini. Halaman ini bisa ditinggalkan; hasilnya muncul di sini.";
    case "completed":
      if (isQueueNeedsManual(status, jobType, fieldsFilled)) return NO_FIELDS_FILLED_TEXT;
      if (isExt) return EXTENSION_STOPPED_BEFORE_SUBMIT_TEXT;
      return jobType === "apply"
        ? AGENT_STOPPED_BEFORE_SUBMIT_TEXT
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
  return items.some(
    (i) => (i.job_type === "apply" || i.job_type === "extension_apply") && !isQueueActive(i.status) && isQueueActive(before.get(i.id)),
  );
}
