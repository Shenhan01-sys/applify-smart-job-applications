import { buildAgentApplyRows } from "./agentApplyRows.ts";
import { isAgentApplyActive } from "./agentApplyStatus.ts";
import { questionsToAnswer } from "./formQuestions.ts";
import { awaitingCodeState } from "./securityCode.ts";
import { liveApprovalIds } from "./approvalExpiry.ts";

export interface UrgentActionsSummary {
  pendingApprovalsCount: number;
  awaitingCodeCount: number;
  pendingQuestionsCount: number;
  total: number;
}

/**
 * Merangkum tindakan mendesak yang perlu segera ditindaklanjuti pengguna dari Beranda (E2E-06):
 *   1. Persetujuan yang masih berstatus `pending` dan belum kedaluwarsa.
 *   2. Tugas agen yang sedang menunggu kode keamanan email (`awaiting_code` aktif).
 *   3. Percobaan agen/ekstensi yang berhenti dan menunggu jawaban pertanyaan formulir.
 */
export function summarizeUrgentActions(input: {
  pendingApprovals?: unknown;
  queueRows?: unknown;
  applyLogs?: unknown;
  /**
   * Persetujuan yang sudah diputuskan (Riwayat dari backend, memuat status dan expires_at). Bila ada, kode dan
   * pertanyaan hanya dihitung untuk persetujuan yang masih berlaku: persetujuan kedaluwarsa ada di tab Riwayat dan
   * tidak bisa dijawab lagi, jadi tautan banner ke halaman Persetujuan tidak akan menemukannya (audit Gemini 26 November
   * 2026: banner menghitung 2 pertanyaan yang tidak tampil di tujuan). Tanpa daftar ini, semua dihitung seperti dulu.
   */
  approvals?: unknown;
  now?: number;
}): UrgentActionsSummary {
  const now = input.now ?? Date.now();
  const pendingList = Array.isArray(input.pendingApprovals) ? input.pendingApprovals : [];
  const pendingApprovalsCount = pendingList.filter((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as { status?: unknown; expires_at?: unknown };
    if (row.status !== undefined && row.status !== "pending") return false;
    if (typeof row.expires_at === "string") {
      const exp = Date.parse(row.expires_at);
      if (Number.isFinite(exp) && exp <= now) return false;
    }
    return true;
  }).length;

  const logs = Array.isArray(input.applyLogs) ? input.applyLogs : [];
  const extensionLogs = logs.filter(
    (r) => r && typeof r === "object" && (r as { details?: { channel?: unknown } }).details?.channel === "extension",
  );
  const agentRows = buildAgentApplyRows(input.queueRows, logs, extensionLogs);

  const liveIds = Array.isArray(input.approvals) ? liveApprovalIds(input.approvals, now) : null;

  let awaitingCodeCount = 0;
  let pendingQuestionsCount = 0;
  for (const [approvalId, row] of Object.entries(agentRows)) {
    if (liveIds && !liveIds.has(approvalId)) continue;
    if (awaitingCodeState(row, now).waiting) {
      awaitingCodeCount += 1;
      continue;
    }
    if (
      row.log_status !== "success" &&
      row.log_status !== "submit_unverified" &&
      !isAgentApplyActive(row) &&
      (questionsToAnswer(row).length > 0 || (row.questions_pending ?? 0) > 0)
    ) {
      pendingQuestionsCount += 1;
    }
  }

  return {
    pendingApprovalsCount,
    awaitingCodeCount,
    pendingQuestionsCount,
    total: pendingApprovalsCount + awaitingCodeCount + pendingQuestionsCount,
  };
}
