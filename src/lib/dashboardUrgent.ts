import { isAgentApplyActive } from "./agentApplyStatus.ts";
import {
  emptyPlacementData,
  pendingBreakdown,
  placementContextFromData,
  splitApprovalTabs,
  type PlacementSourceData,
} from "./approvalTabs.ts";
import { questionsToAnswer } from "./formQuestions.ts";
import { awaitingCodeState } from "./securityCode.ts";

export interface UrgentActionsSummary {
  /** Draf yang menunggu keputusanmu (tahap "Menunggu persetujuan"). */
  pendingApprovalsCount: number;
  awaitingCodeCount: number;
  pendingQuestionsCount: number;
  /** Kartu Menunggu berlabel "Perlu dicek, kirim belum terkonfirmasi": hasil kirimnya tidak pasti, pengguna harus memutuskan. */
  unverifiedCount: number;
  total: number;
}

export const EMPTY_URGENT_SUMMARY: UrgentActionsSummary = {
  pendingApprovalsCount: 0,
  awaitingCodeCount: 0,
  pendingQuestionsCount: 0,
  unverifiedCount: 0,
  total: 0,
};

const asList = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string")
    : [];

/**
 * Merangkum tindakan mendesak di Beranda (E2E-06) dari kartu yang sama dengan tab Menunggu di halaman Persetujuan.
 *
 * Tidak ada aturan sendiri di sini: setiap persetujuan ditempatkan oleh `splitApprovalTabs` dengan konteks dari
 * `placementContextFromData`, persis seperti halaman Persetujuan. Banner hanya menghitung kartu Menunggu menurut tahapnya,
 * jadi angkanya tidak bisa berbeda dari kartu yang ditemukan pengguna setelah menekan "Tinjau di Persetujuan":
 *   1. tahap review: draf yang menunggu keputusan dan belum kedaluwarsa.
 *   2. tahap needs_action dengan agen menunggu kode keamanan email.
 *   3. tahap needs_action dengan agen yang berhenti dan menunggu jawaban pertanyaan formulir.
 *   4. tahap unverified: kirim belum terkonfirmasi, hasilnya tidak pasti (kasus Binance, 26 November 2026).
 * Persetujuan kedaluwarsa dan yang sudah ditutup ada di Riwayat dan tidak dihitung.
 */
export function summarizeUrgentActions(input: {
  /** Persetujuan pending dari backend (GET /api/approvals/pending). */
  pendingApprovals?: unknown;
  /** Riwayat dari backend (GET /api/approvals/history, `APPROVAL_HISTORY_LIMIT` baris). */
  history?: unknown;
  /** Hasil `loadEmailApplyData(history, { placementOnly: true })`. Tanpanya, status agen dianggap belum terbaca. */
  data?: PlacementSourceData;
  now?: number;
}): UrgentActionsSummary {
  const now = input.now ?? Date.now();
  const data = input.data ?? emptyPlacementData();
  const tabs = splitApprovalTabs(
    [...asList(input.pendingApprovals), ...asList(input.history)] as { id: string; status?: string | null; expires_at?: string | null }[],
    (a) => placementContextFromData(data, a.id),
    now,
  );

  let awaitingCodeCount = 0;
  let pendingQuestionsCount = 0;
  let unverifiedCount = 0;
  for (const { item, placement } of tabs.pending) {
    if (placement.stage === "unverified") {
      unverifiedCount += 1;
      continue;
    }
    if (placement.stage !== "needs_action") continue;
    const row = data.agent[item.id];
    if (!row) continue;
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

  const pendingApprovalsCount = pendingBreakdown(tabs).review;
  return {
    pendingApprovalsCount,
    awaitingCodeCount,
    pendingQuestionsCount,
    unverifiedCount,
    total: pendingApprovalsCount + awaitingCodeCount + pendingQuestionsCount + unverifiedCount,
  };
}
