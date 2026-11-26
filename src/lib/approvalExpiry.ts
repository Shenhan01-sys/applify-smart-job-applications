/**
 * Masa berlaku persetujuan, satu-satunya tempat angkanya ditulis di frontend. Server memakai APPROVAL_TTL_MS =
 * 24 jam (backend/services/approval-shared.ts), dan tes tests/approvalExpiry.test.ts menjaga keduanya tetap sama.
 * Teks yang menyebut masa berlaku (jendela detail lamaran, modal Lamar dengan AI, panel email, kebijakan privasi)
 * harus memakai konstanta ini, bukan angka yang diketik sendiri (temuan Gemini 26 November 2026: jendela detail
 * masih menulis "berlaku 1 jam").
 */
export const APPROVAL_VALID_HOURS = 24;

/** "24 jam", untuk disisipkan ke kalimat. */
export const APPROVAL_VALID_TEXT = `${APPROVAL_VALID_HOURS} jam`;

/**
 * Id persetujuan yang masih berlaku: sudah disetujui dan belum lewat expires_at. Hanya persetujuan seperti ini yang
 * masih bisa dijawab pertanyaannya, dimasukkan kodenya, atau dijalankan ulang; yang lain ada di Riwayat. Daftar yang
 * rusak, tanpa id, atau tanpa expires_at yang terbaca dianggap tidak berlaku, dan tidak pernah melempar galat.
 */
export function liveApprovalIds(approvals: unknown, now: number = Date.now()): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(approvals)) return ids;
  for (const a of approvals) {
    if (!a || typeof a !== "object") continue;
    const row = a as { id?: unknown; status?: unknown; expires_at?: unknown };
    if (typeof row.id !== "string" || row.status !== "approved") continue;
    const exp = typeof row.expires_at === "string" ? Date.parse(row.expires_at) : NaN;
    if (Number.isFinite(exp) && exp > now) ids.add(row.id);
  }
  return ids;
}

/** Teks bila lamaran punya percobaan agen yang menunggu jawaban atau kode, tetapi persetujuannya sudah tidak berlaku. */
export const STALE_APPROVAL_TEXT =
  "Persetujuan untuk percobaan ini sudah kedaluwarsa atau ditutup, jadi pertanyaan, kode, dan langkahnya tidak bisa dilanjutkan lagi. Ajukan lagi ke Persetujuan supaya agen mengisi ulang.";
