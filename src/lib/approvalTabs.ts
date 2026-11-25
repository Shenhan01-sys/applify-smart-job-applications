/**
 * Tab mana yang memuat satu persetujuan di halaman Persetujuan, dan label statusnya.
 *
 * Agen pengisi formulir berjalan di peramban tanpa layar di server, jadi pengguna tidak bisa menekan kirim
 * di sana. Karena itu "Disetujui" bukan akhir cerita. Tab Riwayat hanya memuat persetujuan yang sudah
 * selesai: lamaran yang benar-benar terkirim, atau yang ditutup (ditolak, kedaluwarsa, diganti persetujuan
 * baru). Semua yang sudah disetujui tetapi belum terkirim (masih antre, sedang diproses, formulir terisi tetapi
 * belum dikirim, menunggu jawaban atau kode, gagal dan masih bisa dicoba lagi) tetap di tab Menunggu.
 *
 * Fungsi murni tanpa React dan tanpa Supabase, supaya bisa dites dengan `node --test`. Masukan dari database
 * tidak dipercaya: bentuk yang rusak tidak pernah melempar galat.
 */

import { awaitingLoginState, describeAgentApply, isAgentApplyActive, type AgentApplyRow } from "./agentApplyStatus.ts";
import type { EmailQueueRow } from "./emailApply.ts";
import { EMAIL_TEST_MODE_LABEL } from "./emailTestMode.ts";
import { questionsToAnswer } from "./formQuestions.ts";
import { awaitingCodeState } from "./securityCode.ts";
import { approvalStatusLabel, effectiveApprovalStatus } from "./statusLabels.ts";
import { STATUS_TERM } from "./statusVocabulary.ts";

export type ApprovalTab = "pending" | "history";

export type ApprovalStage =
  // tab Menunggu
  | "review"
  | "checking"
  | "not_started"
  | "processing"
  | "needs_action"
  | "filled_not_sent"
  | "unverified"
  | "test_mode"
  | "failed_retry"
  // tab Riwayat
  | "sent"
  | "rejected"
  | "expired"
  | "replaced";

export interface ApprovalPlacement {
  tab: ApprovalTab;
  stage: ApprovalStage;
  /** Label singkat untuk lencana status kartu. */
  label: string;
}

export const STAGE_LABEL: Record<ApprovalStage, string> = {
  review: "Menunggu persetujuan",
  checking: "Status belum terbaca",
  not_started: STATUS_TERM.waitingTurn,
  processing: STATUS_TERM.processing,
  needs_action: "Perlu tindakanmu",
  filled_not_sent: "Terisi, belum terkirim",
  unverified: "Perlu dicek, kirim belum terkonfirmasi",
  test_mode: EMAIL_TEST_MODE_LABEL,
  failed_retry: STATUS_TERM.retryable,
  sent: "Terkirim",
  rejected: "Ditolak",
  expired: "Kedaluwarsa",
  replaced: "Diganti persetujuan baru",
};

/** Persetujuan yang gagal dan masa berlakunya habis: tidak bisa dicoba lagi, jadi ditutup (tahap expired). */
export const FAILED_CLOSED_LABEL = STATUS_TERM.expiredNotSent;
export const EXPIRED_NOT_SENT_LABEL = STATUS_TERM.expiredNotSent;

/** Tahap yang masuk tab Riwayat. Selain ini, persetujuan ada di tab Menunggu. */
const HISTORY_STAGES: ReadonlySet<ApprovalStage> = new Set(["sent", "rejected", "expired", "replaced"]);

/** Bagian persetujuan (approval_requests) yang dibutuhkan. */
export interface ApprovalPlacementInput {
  status?: string | null;
  expires_at?: string | null;
}

/** Hasil kerja agen dan email untuk persetujuan itu, dibaca dari log dan antrean (services/emailApplyService.ts). */
export interface ApprovalPlacementContext {
  /** Percobaan agen terbaru (antrean apply atau log ekstensi). */
  agent?: AgentApplyRow | null;
  /** Ada log success untuk persetujuan ini (agen atau email sudah benar-benar mengirim). */
  sent?: boolean;
  /** Tugas email_apply terbaru. */
  emailJob?: EmailQueueRow | null;
  /** Tugas email selesai tetapi tidak mengirim karena pengiriman nyata dimatikan. */
  testMode?: boolean;
  /** false = status agen belum terbaca (belum dimuat, atau gagal). */
  agentKnown?: boolean;
  /** Pengguna masih harus mengizinkan Ekstensi Browser sebelum lamaran diantre. */
  consentRequired?: boolean;
  now?: number;
}

const place = (stage: ApprovalStage, label: string = STAGE_LABEL[stage]): ApprovalPlacement => ({
  tab: HISTORY_STAGES.has(stage) ? "history" : "pending",
  stage,
  label,
});

function isExpiredByTime(expiresAt: string | null | undefined, now: number): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= now;
}

const isEmailJobActive = (job: EmailQueueRow | null | undefined) => job?.status === "pending" || job?.status === "processing";

/**
 * Tempat dan label satu persetujuan.
 *
 * approval_requests.status:
 *   pending, belum lewat expires_at -> Menunggu, "Menunggu persetujuan"
 *   pending, lewat expires_at       -> Riwayat, "Kedaluwarsa"
 *   rejected                        -> Riwayat, "Ditolak"
 *   expired                         -> Riwayat, "Kedaluwarsa"
 *   approved                        -> tergantung hasil kerja agen dan email, urutan pemeriksaan:
 *     1. ada log success                                       -> Riwayat, "Terkirim"
 *     2. klaim kirim dilepas (persetujuan baru sudah dibuat)    -> Riwayat, "Diganti persetujuan baru"
 *     3. status agen belum terbaca                              -> Menunggu, "Status belum terbaca"
 *     4. menunggu kode, login, jawaban, atau izin               -> Menunggu, "Perlu tindakanmu"
 *     5. tugas agen atau email masih antre atau berjalan        -> Menunggu, "Sedang diproses"
 *     6. kirim belum terkonfirmasi atau klaim terkunci          -> Menunggu, "Perlu dicek, kirim belum terkonfirmasi"
 *     6b. masa berlaku habis (tidak bisa dicoba lagi)           -> Riwayat, "Kedaluwarsa, belum terkirim"
 *     7. agen berhenti dan butuh tindakan (login, CAPTCHA, isian wajib kosong, dilewati, dan sejenisnya)
 *                                                               -> Menunggu, "Perlu tindakanmu"
 *     8. email tidak terkirim karena mode uji                   -> Menunggu, "Belum dikirim (mode uji)"
 *     9. formulir terisi, berhenti sebelum kirim                -> Menunggu, "Terisi, belum terkirim"
 *    10. tugas agen atau email gagal, masa berlaku masih ada    -> Menunggu, "Gagal, bisa dicoba lagi"
 *        tugas gagal, masa berlaku habis (tidak bisa dicoba)    -> Riwayat, "Gagal, masa berlaku habis"
 *    11. belum ada tugas agen                                   -> Menunggu, "Disetujui, belum terkirim"
 *   status lain yang tidak dikenal                              -> Riwayat, label statusnya
 */
export function placeApproval(approval: ApprovalPlacementInput | null | undefined, ctx: ApprovalPlacementContext = {}): ApprovalPlacement {
  const now = ctx.now ?? Date.now();
  const status = effectiveApprovalStatus(String(approval?.status ?? ""), approval?.expires_at, now);
  if (status === "pending") return place("review");
  if (status === "rejected") return place("rejected");
  if (status === "expired") return place("expired");
  if (status !== "approved") return place("expired", approvalStatusLabel(status));

  const row = ctx.agent ?? null;
  const view = describeAgentApply(row, now);

  if (ctx.sent === true || view.tone === "sent") return place("sent");
  if (row?.claim_state === "abandoned") return place("replaced");
  if (ctx.agentKnown === false && !row) return place("checking");

  const waitingForUser =
    ctx.consentRequired === true ||
    awaitingCodeState(row, now).waiting ||
    awaitingLoginState(row, now).waiting ||
    questionsToAnswer(row).length > 0 ||
    !!view.waitReason;
  if (waitingForUser) return place("needs_action");
  if (isAgentApplyActive(row) || isEmailJobActive(ctx.emailJob)) return place("processing");
  if (view.tone === "unverified") return place("unverified");
  // Masa berlaku habis: agen tidak akan mencoba lagi dan tombol ulangi tidak ada, jadi kartu pindah ke Riwayat
  // (Hans, 25 November 2026: enam kartu Datadog lama menumpuk di Menunggu tanpa bisa diapa-apakan).
  if (row && isExpiredByTime(approval?.expires_at, now)) {
    return view.tone === "failed" || ctx.emailJob?.status === "failed" ? place("expired", FAILED_CLOSED_LABEL) : place("expired", EXPIRED_NOT_SENT_LABEL);
  }
  if (view.tone === "manual") return place("needs_action");
  if (ctx.testMode === true) return place("test_mode");
  if (view.tone === "ready") return place("filled_not_sent");
  if (view.tone === "failed" || ctx.emailJob?.status === "failed") {
    return isExpiredByTime(approval?.expires_at, now) ? place("expired", FAILED_CLOSED_LABEL) : place("failed_retry");
  }
  return place("not_started");
}

export interface PlacedApproval<T> {
  item: T;
  placement: ApprovalPlacement;
}

export interface ApprovalTabs<T> {
  pending: PlacedApproval<T>[];
  history: PlacedApproval<T>[];
}

/**
 * Bagi daftar persetujuan ke dua tab. Urutan masukan dipertahankan di dalam tiap tab, kecuali di Menunggu:
 * persetujuan yang masih menunggu keputusan pengguna (review) diletakkan di atas yang sudah disetujui.
 */
export function splitApprovalTabs<T extends ApprovalPlacementInput>(
  items: readonly T[],
  contextFor: (item: T) => ApprovalPlacementContext,
  now: number = Date.now(),
): ApprovalTabs<T> {
  const review: PlacedApproval<T>[] = [];
  const rest: PlacedApproval<T>[] = [];
  const history: PlacedApproval<T>[] = [];
  for (const item of items) {
    const placement = placeApproval(item, { ...contextFor(item), now });
    const entry = { item, placement };
    if (placement.tab === "history") history.push(entry);
    else if (placement.stage === "review") review.push(entry);
    else rest.push(entry);
  }
  return { pending: [...review, ...rest], history };
}
