import { automationApi } from "@/services/automationApi";
import { describeApiError } from "@/lib/apiErrors";
import {
  buildApprovalPayload,
  findPendingApproval,
  syncReturnedPendingCover,
  type PendingApproval,
} from "@/lib/draftApproval";

export interface DraftApprovalInput {
  applicationId: string;
  jobId?: string | null;
  jobTitle?: unknown;
  company?: unknown;
  platform?: unknown;
  coverLetter?: unknown;
}

/** The draft itself cannot be sent (job gone, empty letter). The message is written for the user. */
export class DraftNotSendableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftNotSendableError";
  }
}

/** Hasil sinkron surat: "synced" terkirim, "skipped" tidak ada yang perlu disinkron, "failed" server menolak atau tidak terjangkau. */
export type CoverLetterSyncResult = "synced" | "skipped" | "failed";

/**
 * E2E-04: sinkronkan perubahan surat lamaran ke antrean persetujuan yang masih tertunda.
 * Surat di draf (ai_applications) sudah tersimpan lebih dulu, jadi kegagalan di sini (persetujuan sudah diproses,
 * kedaluwarsa, atau jaringan putus) tidak boleh membuat penyimpanan draf tampak gagal: hasilnya "failed" dan
 * pemanggil memberi tahu pengguna. Surat kosong tidak dikirim, karena server menolaknya dan persetujuan tetap
 * memakai surat sebelumnya.
 */
export async function syncPendingApprovalCoverLetter(approvalId: string | null | undefined, coverLetter: string): Promise<CoverLetterSyncResult> {
  if (!approvalId || approvalId === "pending") return "skipped";
  const trimmed = coverLetter.trim();
  if (!trimmed) return "skipped";
  try {
    await automationApi.updateApprovalCoverLetter(approvalId, trimmed);
    return "synced";
  } catch (err) {
    console.warn("[approval] surat belum tersinkron ke antrean Persetujuan:", err);
    return "failed";
  }
}

/** Pesan untuk pengguna bila sinkron surat ke antrean Persetujuan gagal sementara surat di draf sudah tersimpan. */
export const APPROVAL_COVER_SYNC_FAILED = "Surat tersimpan di draf, tetapi antrean Persetujuan belum ikut diperbarui. Buka halaman Persetujuan dan cek suratnya sebelum menyetujui.";

/** Message for a failed approval request: the draft's own reason, else what the server answered. */
export function describeApprovalError(err: unknown, fallback = "Draf belum bisa diajukan."): string {
  return err instanceof DraftNotSendableError ? err.message : describeApiError(err, fallback);
}

/** The approval this draft is already waiting on, or null. Throws when the pending list cannot be read. */
export async function getPendingApprovalFor(applicationId: string): Promise<PendingApproval | null> {
  return findPendingApproval(await automationApi.getPendingApprovals(), applicationId);
}

/**
 * Send a saved draft to the approval queue (the same call as the "Ajukan ke Persetujuan" button of the AI Apply
 * modal). If the draft already has a pending approval nothing is created: that one is returned with
 * `created: false`, so a second click or a second screen does not queue the same draft twice. When the pending row
 * (found in the list or returned by the idempotent POST) holds a different cover letter than the one being sent,
 * it is aligned once through PATCH /api/approvals/:id/cover-letter before returning.
 * Throws DraftNotSendableError when the draft cannot be sent, and the API error when a call fails.
 */
export async function requestApprovalForDraft(input: DraftApprovalInput): Promise<{ approval: PendingApproval; created: boolean }> {
  const built = buildApprovalPayload(input);
  if (!built.ok) throw new DraftNotSendableError(built.reason);
  const existing = await getPendingApprovalFor(input.applicationId);
  if (existing) {
    const synced = await syncReturnedPendingCover(existing, built.payload.cover_letter, syncPendingApprovalCoverLetter, true);
    existing.cover_letter = synced.approval.cover_letter;
    return { approval: existing, created: false };
  }
  const approval = (await automationApi.createApproval(built.payload)) as PendingApproval;
  // Bila server POST /api/approvals mengembalikan baris pending lama milik (user_id, job_id) dengan
  // surat berbeda dari hasil sunting terbaru di modal, selaraskan via PATCH sebelum selesai.
  return await syncReturnedPendingCover(approval, built.payload.cover_letter, syncPendingApprovalCoverLetter, false);
}
