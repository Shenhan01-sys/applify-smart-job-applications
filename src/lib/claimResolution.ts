import { describeApiError, parseApiError } from "./apiErrors.ts";

/**
 * Jawaban gagal dari `POST /api/approvals/:id/resolve-claim`, dipilah untuk `LockedClaimBanner`.
 *
 * Backend (approval-claim-recovery.ts) menjawab 409 untuk tiga keadaan yang bukan galat biasa:
 *   - `claim_in_progress`: worker atau ekstensi masih mengirim (atau statusnya belum bisa dipastikan). Pemulihan
 *     ditolak supaya tidak ada lamaran ganda. Banner cukup memuat ulang status.
 *   - `already_resolved` / `already_logged` / `claim_not_found`: klaim sudah selesai (klik ganda, tab lain, atau
 *     status sudah berubah). Banner disembunyikan dan status dimuat ulang, tanpa pesan galat yang menakutkan.
 *
 * Plain TypeScript tanpa impor selain apiErrors, supaya jalan di `node --test`.
 */
export type ClaimResolveFailureKind = "in_progress" | "already_done" | "other";

export interface ClaimResolveFailure {
  kind: ClaimResolveFailureKind;
  message: string;
}

const ALREADY_DONE_CODES = new Set(["already_resolved", "already_logged", "claim_not_found"]);

export function classifyClaimResolveError(err: unknown, fallback: string): ClaimResolveFailure {
  const parsed = parseApiError(err);
  if (parsed.status === 409) {
    if (parsed.code === "claim_in_progress") return { kind: "in_progress", message: describeApiError(err, fallback) };
    if (parsed.code && ALREADY_DONE_CODES.has(parsed.code)) {
      return { kind: "already_done", message: describeApiError(err, fallback) };
    }
  }
  return { kind: "other", message: describeApiError(err, fallback) };
}

/** Keadaan banner sesudah dua status klaim: hanya `locked_stuck` tanpa log kirim yang menampilkan tombol pemulihan. */
export function shouldShowLockedClaimBanner(
  claimState: string | null | undefined,
  logStatus: string | null | undefined,
): boolean {
  if (claimState !== "locked_stuck") return false;
  return logStatus !== "success" && logStatus !== "submit_unverified";
}
