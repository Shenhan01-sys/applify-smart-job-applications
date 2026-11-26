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
import type { NotQueuedRoute } from "./approveOutcome.ts";
import { awaitingCodeState } from "./securityCode.ts";
import { approvalStatusLabel, effectiveApprovalStatus } from "./statusLabels.ts";
import { STATUS_TERM } from "./statusVocabulary.ts";

export type ApprovalTab = "pending" | "history";

export type ApprovalStage =
  // tab Menunggu
  | "review"
  | "checking"
  | "not_started"
  | "fill_yourself"
  | "send_by_email"
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
  | "replaced"
  | "closed";

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
  fill_yourself: STATUS_TERM.fillYourself,
  send_by_email: STATUS_TERM.sendByEmail,
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
  closed: "Ditutup",
};

/** Terkirim menurut pernyataan pengguna (POST /mark-sent), bukan konfirmasi sistem. Data skripsi membedakannya. */
export const SENT_BY_USER_LABEL = "Terkirim (dikonfirmasi kamu)";

/** Persetujuan yang gagal dan masa berlakunya habis: tidak bisa dicoba lagi, jadi ditutup (tahap expired). */
export const FAILED_CLOSED_LABEL = STATUS_TERM.expiredNotSent;
export const EXPIRED_NOT_SENT_LABEL = STATUS_TERM.expiredNotSent;
/** Masa berlaku habis dan status agen tidak terbaca: ditutup dari Menunggu, tetapi tidak diklaim "belum terkirim". */
export const EXPIRED_UNKNOWN_LABEL = "Masa berlaku habis, status belum terbaca";

/** Tahap yang masuk tab Riwayat. Selain ini, persetujuan ada di tab Menunggu. */
const HISTORY_STAGES: ReadonlySet<ApprovalStage> = new Set(["sent", "rejected", "expired", "replaced", "closed"]);

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
  /**
   * Persetujuan ini sengaja tidak diantre ke agen atau ekstensi (backend: queued false). "manual" = lowongan hanya bisa
   * dilamar sendiri (LinkedIn), "email_direct" = dikirim lewat panel Email. Tanpa tugas apa pun, kartunya tidak boleh
   * berlabel "Menunggu giliran", karena tidak ada giliran yang ditunggu.
   */
  notQueued?: NotQueuedRoute | null;
  now?: number;
}

/**
 * Jumlah persetujuan Riwayat yang dimuat. Halaman Persetujuan dan banner Beranda memakai angka yang sama: kalau tidak,
 * persetujuan di luar batas ikut atau tidak ikut terhitung, dan angka banner berbeda dari jumlah kartu Menunggu.
 */
export const APPROVAL_HISTORY_LIMIT = 50;

/**
 * Bagian hasil `loadEmailApplyData` (services/emailApplyService.ts) yang dibaca `placeApproval`. Bentuk struktural supaya
 * berkas ini tetap murni, tanpa Supabase.
 */
export interface PlacementSourceData {
  agent: Record<string, AgentApplyRow>;
  used: ReadonlySet<string>;
  jobs: Record<string, EmailQueueRow>;
  testMode: ReadonlySet<string>;
  agentKnown: boolean;
  notQueued: Record<string, NotQueuedRoute>;
}

/** Data kosong: status agen belum terbaca (agentKnown false), jadi tidak ada yang dianggap "tanpa tugas". */
export const emptyPlacementData = (): PlacementSourceData => ({ agent: {}, used: new Set(), jobs: {}, testMode: new Set(), agentKnown: false, notQueued: {} });

/**
 * Konteks penempatan satu persetujuan, dari data yang sama dengan yang dipakai halaman Persetujuan. Satu-satunya tempat
 * yang menerjemahkan data itu ke `ApprovalPlacementContext`, jadi halaman Persetujuan dan banner Beranda tidak bisa
 * berbeda pendapat tentang tab sebuah kartu. `local` adalah ingatan halaman Persetujuan saja (izin ekstensi dan jalur
 * tanpa antrean dari jawaban approve barusan); Beranda tidak punya dan memakai data lowongan.
 */
export function placementContextFromData(
  data: PlacementSourceData,
  id: string,
  local: { consentRequired?: boolean; notQueued?: NotQueuedRoute | null } = {},
): ApprovalPlacementContext {
  return {
    agent: data.agent[id],
    sent: data.used.has(id),
    emailJob: data.jobs[id],
    testMode: data.testMode.has(id),
    agentKnown: data.agentKnown,
    consentRequired: local.consentRequired === true,
    notQueued: local.notQueued ?? data.notQueued[id] ?? null,
  };
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
 *     2. klaim kirim dilepas atau pengguna memilih "Belum terkirim, ulangi" (persetujuan baru sudah dibuat)
 *                                                               -> Riwayat, "Diganti persetujuan baru"
 *        pengguna memilih "Tutup"                               -> Riwayat, "Ditutup"
 *     3. status agen belum terbaca                              -> Menunggu, "Status belum terbaca";
 *        masa berlaku sudah habis                               -> Riwayat, "Masa berlaku habis, status belum terbaca"
 *     3b. masa berlaku habis, agen tidak bekerja, kirim sudah  -> Riwayat, "Kedaluwarsa, belum terkirim"
 *         terkonfirmasi atau tidak ada percobaan terbuka (pertanyaan tertunda ikut ditutup)
 *     4. menunggu kode, login, jawaban, atau izin               -> Menunggu, "Perlu tindakanmu"
 *     5. tugas agen atau email masih antre atau berjalan        -> Menunggu, "Sedang diproses"
 *     6. kirim belum terkonfirmasi atau klaim terkunci          -> Menunggu, "Perlu dicek, kirim belum terkonfirmasi"
 *     7. agen berhenti dan butuh tindakan (login, CAPTCHA, isian wajib kosong, dilewati, dan sejenisnya)
 *                                                               -> Menunggu, "Perlu tindakanmu"
 *     8. email tidak terkirim karena mode uji                   -> Menunggu, "Belum dikirim (mode uji)"
 *     9. formulir terisi, berhenti sebelum kirim                -> Menunggu, "Terisi, belum terkirim"
 *    10. tugas agen atau email gagal, masa berlaku masih ada    -> Menunggu, "Gagal, bisa dicoba lagi"
 *        tugas gagal, masa berlaku habis (tidak bisa dicoba)    -> Riwayat, "Gagal, masa berlaku habis"
 *    11. belum ada tugas, tidak diantre (LinkedIn atau email)   -> Menunggu, "Perlu diisi sendiri" atau "Kirim lewat panel Email";
 *        masa berlaku habis                                     -> Riwayat, "Kedaluwarsa, belum terkirim"
 *    12. belum ada tugas agen                                   -> Menunggu, "Menunggu giliran"
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

  if (ctx.sent === true || view.tone === "sent") return place("sent", row?.confirmed_by === "user" ? SENT_BY_USER_LABEL : STAGE_LABEL.sent);
  // Pernyataan pengguna ("Belum terkirim, ulangi" atau "Tutup") menutup persetujuan ini, juga bila agen sempat mencatat
  // kirim yang belum terkonfirmasi. Hanya log success yang lebih kuat (cabang di atas).
  if (row?.claim_state === "abandoned") return place("replaced");
  if (row?.claim_state === "closed") return place("closed");
  if (ctx.agentKnown === false && !row) {
    // Persetujuan yang masa berlakunya sudah habis tidak bisa dijawab, diunggah, atau dilanjutkan lagi, jadi status
    // agen yang tidak terbaca tidak boleh menahannya di Menunggu (uji E2E production 26 November 2026: tab Menunggu
    // menunjukkan 18 sementara Beranda menghitung 2 tindakan, sebagian besar kartu kedaluwarsa berlabel
    // "Status belum terbaca"). Labelnya tidak menyebut "belum terkirim": tanpa status agen, belum pasti lamarannya tidak terkirim.
    return isExpiredByTime(approval?.expires_at, now) ? place("expired", EXPIRED_UNKNOWN_LABEL) : place("checking");
  }

  // Masa berlaku habis dan agen tidak sedang bekerja: tidak ada lagi yang bisa dijawab, diunggah, atau dilanjutkan di
  // ekstensi, jadi kartu pindah ke Riwayat walau masih ada pertanyaan tertunda (Hans, 26 November 2026: kartu Dealls
  // lama masih berlabel "Perlu tindakanmu" dan menanyakan kolom). Tugas yang masih berjalan dan kirim yang belum
  // terkonfirmasi tetap di Menunggu. Tanpa tugas apa pun, persetujuan yang tidak diantre (LinkedIn, email langsung)
  // juga ditutup saat masa berlakunya habis, karena tidak ada percobaan agen yang akan datang dan tidak ada tombol
  // untuk menandainya terkirim.
  const idleNotQueued = !!ctx.notQueued && !ctx.emailJob && ctx.testMode !== true;
  // Tanpa tugas agen sama sekali (status agen terbaca dan kosong) juga ditutup saat masa berlakunya habis: tidak ada
  // giliran yang ditunggu. Hasil kirimnya tidak diketahui, jadi kartu di Riwayat memberi tiga tindakan.
  const noTaskAtAll = !row && ctx.agentKnown === true && !ctx.emailJob && ctx.testMode !== true;
  if (
    (row || idleNotQueued || noTaskAtAll) &&
    isExpiredByTime(approval?.expires_at, now) &&
    view.tone !== "unverified" &&
    !isAgentApplyActive(row) &&
    !isEmailJobActive(ctx.emailJob)
  ) {
    return view.tone === "failed" || ctx.emailJob?.status === "failed" ? place("expired", FAILED_CLOSED_LABEL) : place("expired", EXPIRED_NOT_SENT_LABEL);
  }

  const waitingForUser =
    ctx.consentRequired === true ||
    awaitingCodeState(row, now).waiting ||
    awaitingLoginState(row, now).waiting ||
    questionsToAnswer(row).length > 0 ||
    !!view.waitReason;
  if (waitingForUser) return place("needs_action");
  if (isAgentApplyActive(row) || isEmailJobActive(ctx.emailJob)) return place("processing");
  if (view.tone === "unverified") return place("unverified");
  if (view.tone === "manual") return place("needs_action");
  if (ctx.testMode === true) return place("test_mode");
  if (view.tone === "ready") return place("filled_not_sent");
  if (view.tone === "failed" || ctx.emailJob?.status === "failed") {
    return isExpiredByTime(approval?.expires_at, now) ? place("expired", FAILED_CLOSED_LABEL) : place("failed_retry");
  }
  if (ctx.notQueued === "manual") return place("fill_yourself");
  if (ctx.notQueued === "email_direct") return place("send_by_email");
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

export interface PendingBreakdown {
  /** Menunggu keputusanmu: belum disetujui atau ditolak, dan belum kedaluwarsa. Sama dengan hitungan Beranda. */
  review: number;
  /** Sudah disetujui, tetapi belum selesai (antre, diproses, perlu tindakanmu, terisi belum terkirim, dan sejenisnya). */
  inProgress: number;
  total: number;
}

/** Rincian isi tab Menunggu, supaya angkanya bisa dibandingkan dengan hitungan "tindakan" di Beranda. */
export function pendingBreakdown<T>(tabs: ApprovalTabs<T>): PendingBreakdown {
  const review = tabs.pending.filter((p) => p.placement.stage === "review").length;
  return { review, inProgress: tabs.pending.length - review, total: tabs.pending.length };
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
