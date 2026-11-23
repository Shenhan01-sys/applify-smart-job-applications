import { automationApi } from "@/services/automationApi";
import { cleanCoverLetter } from "@/lib/manualSubmit";

/**
 * Tandai lamaran terkirim karena pengguna mengirimnya sendiri (POST /api/approvals/:id/mark-sent). Melempar
 * ApiError bila backend menolak; pakai markSentErrorMessage untuk pesannya.
 */
export async function markApprovalSent(approvalId: string): Promise<void> {
  const res = await automationApi.markApprovalSent(approvalId);
  if (!res || res.success !== true) throw new Error("Lamaran belum bisa ditandai terkirim.");
}

/**
 * Cover letter yang disetujui untuk satu persetujuan (GET /api/approvals/:id, milik pengguna sendiri), atau null
 * bila kosong. Melempar bila persetujuan tidak bisa dibaca; pemanggil memutuskan apa yang tampil.
 */
export async function loadApprovedCoverLetter(approvalId: string): Promise<string | null> {
  const approval = (await automationApi.getApproval(approvalId)) as { cover_letter?: unknown } | null;
  return cleanCoverLetter(approval?.cover_letter);
}
