/**
 * Email yang tidak dikirim karena pengiriman nyata sedang dimatikan (mode uji).
 *
 * Worker email (worker/src/handlers/emailApply.ts) menulis log `email_apply` berstatus `skipped` lalu menyelesaikan
 * tugasnya, jadi antrean menampilkan "Selesai" padahal tidak ada email yang keluar. Log itu memuat
 * `details.reason = "real_submit_off"`; worker lama hanya menulis catatan teks yang menyebut ALLOW_REAL_SUBMIT=false,
 * dan keduanya dikenali. Murni dan tanpa impor, supaya bisa dites dengan `node --test`.
 */

export const EMAIL_TEST_MODE_LABEL = "Belum dikirim (mode uji)";
export const EMAIL_TEST_MODE_HINT =
  "Pengiriman email sedang dalam mode uji, jadi email ini tidak dikirim ke rekruter. Lamaranmu belum terkirim.";
export const EMAIL_TEST_MODE_REASON = "real_submit_off";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Log email_apply yang berarti "tidak dikirim karena mode uji". Status lain (gagal, diblokir, kuota habis) bukan mode uji. */
export function isRealSubmitOffLog(log: { status?: unknown; details?: unknown } | null | undefined): boolean {
  if (!log || log.status !== "skipped") return false;
  const details = isRecord(log.details) ? log.details : {};
  if (details.reason === EMAIL_TEST_MODE_REASON) return true;
  // Log lama: alasan hanya ada di catatan teks.
  return typeof details.note === "string" && details.note.includes("ALLOW_REAL_SUBMIT=false");
}
