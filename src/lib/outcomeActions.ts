import { isAgentApplyActive, type AgentApplyRow } from "./agentApplyStatus.ts";
import { classifyJobChannel } from "./applyChannel.ts";
import { describeApiError, parseApiError } from "./apiErrors.ts";
import { APPROVAL_VALID_TEXT } from "./approvalExpiry.ts";
import type { ApprovalStage } from "./approvalTabs.ts";
import { questionsToAnswer } from "./formQuestions.ts";
import { manualSubmitState, safeJobUrl } from "./manualSubmit.ts";
import { awaitingCodeState, isCodeTimeout } from "./securityCode.ts";

/**
 * Tindakan di kartu persetujuan: tidak boleh ada status buntu (keputusan Hans, 26 November 2026).
 *
 * Setiap tahap (ApprovalStage) wajib punya paling sedikit satu tindakan yang selalu ada, apa pun datanya
 * (`ALWAYS_ACTION`). Tindakan lain muncul bila datanya ada (tautan lowongan, ekstensi yang mendukung situs itu, dan seterusnya).
 * Komponen OutcomeActions menggambar persis daftar dari `panelActions`; tes tests/statusActions.test.ts menjaga bahwa
 * setiap tahap, dengan data sekecil apa pun, tetap punya tindakan.
 *
 * Hasil kirim yang tidak pasti (kirim belum terkonfirmasi, kode keamanan tidak masuk, persetujuan kedaluwarsa tanpa
 * kejelasan, lamaran yang dikirim di luar Applify) punya tiga tindakan yang dikerjakan backend, bukan browser:
 *   Sudah terkirim            POST /api/approvals/:id/mark-sent   -> Terkirim, ditandai konfirmasi pengguna
 *   Belum terkirim, ulangi    POST /api/approvals/:id/not-sent    -> persetujuan baru (pending)
 *   Tutup                     POST /api/approvals/:id/close       -> Riwayat, Ditutup
 *
 * Fungsi murni tanpa React dan tanpa Supabase, supaya bisa dites dengan `node --test`.
 */

export type StatusActionId =
  | "review"
  | "confirm_sent"
  | "retry_fresh"
  | "open_form"
  | "close"
  | "rerun"
  | "continue_extension"
  | "refresh"
  | "email_panel"
  | "view_application"
  | "reapply"
  | "view_new_approval";

export const ACTION_LABEL: Record<StatusActionId, string> = {
  review: "Periksa",
  confirm_sent: "Sudah terkirim",
  retry_fresh: "Belum terkirim, ulangi",
  open_form: "Buka formulir lowongan",
  close: "Tutup",
  rerun: "Coba lagi",
  continue_extension: "Lanjutkan di ekstensi",
  refresh: "Muat ulang status",
  email_panel: "Kirim lewat panel Email",
  view_application: "Lihat di Lamaran Saya",
  reapply: "Ajukan lagi dari Lowongan",
  view_new_approval: "Lihat persetujuan baru",
};

/** Semua tindakan yang mungkin pada tiap tahap kartu. Daftar ini dokumentasi sekaligus bahan tes penjaga. */
export const STAGE_ACTIONS: Record<ApprovalStage, readonly StatusActionId[]> = {
  review: ["review"],
  checking: ["refresh", "open_form"],
  not_started: ["rerun", "refresh", "open_form"],
  fill_yourself: ["confirm_sent", "open_form", "close"],
  send_by_email: ["email_panel", "confirm_sent", "open_form", "close"],
  processing: ["refresh", "open_form"],
  needs_action: ["rerun", "continue_extension", "confirm_sent", "retry_fresh", "open_form", "close", "refresh"],
  filled_not_sent: ["rerun", "open_form", "close"],
  unverified: ["confirm_sent", "retry_fresh", "open_form", "close"],
  test_mode: ["email_panel", "open_form", "close"],
  failed_retry: ["rerun", "continue_extension", "open_form", "close"],
  sent: ["view_application"],
  rejected: ["reapply"],
  expired: ["confirm_sent", "retry_fresh", "open_form", "close", "reapply"],
  replaced: ["view_new_approval"],
  closed: ["reapply"],
};

/**
 * Tindakan yang selalu ada pada tahap itu, tanpa syarat data: tidak butuh tautan lowongan, ekstensi, atau baris agen.
 * `review` dan `email_panel` dipenuhi komponen lain (tombol Periksa dan panel Email); sisanya digambar OutcomeActions.
 */
export const ALWAYS_ACTION: Record<ApprovalStage, StatusActionId> = {
  review: "review",
  checking: "refresh",
  not_started: "refresh",
  fill_yourself: "close",
  send_by_email: "close",
  processing: "refresh",
  needs_action: "refresh",
  filled_not_sent: "close",
  unverified: "confirm_sent",
  test_mode: "close",
  failed_retry: "close",
  sent: "view_application",
  rejected: "reapply",
  expired: "reapply",
  replaced: "view_new_approval",
  closed: "reapply",
};

export interface PanelInput {
  stage: ApprovalStage;
  /** approval_requests.status. Hanya persetujuan yang disetujui bisa dikonfirmasi, diulang, atau ditutup. */
  approvalStatus?: string | null;
  row?: AgentApplyRow | null;
  /** jobs.external_url; hanya http(s) yang dipakai. */
  jobUrl?: string | null;
  platform?: string | null;
  /** Blok "Izinkan ekstensi" sudah tampil di kartu: tombol Lanjutkan di ekstensi tidak diulang. */
  consentShown?: boolean;
}

/** Alasan berhenti yang tidak ada gunanya dijalankan ulang: situs menutup lowongan atau melarang AI. */
const NO_RERUN_REASONS: ReadonlySet<string> = new Set(["closed_posting", "ai_prohibited"]);

/** Ekstensi mendukung situs lowongan ini (portal berakun atau ATS yang dikenal), dan bukan hanya bisa dilamar sendiri. */
export function extensionCanContinue(platform: string | null | undefined, jobUrl: string | null | undefined): boolean {
  const c = classifyJobChannel({ platform, external_url: jobUrl });
  return c.extensionSupported && !c.manualOnly;
}

/**
 * Kartu dengan hasil kirim yang tidak pasti memberi tiga pilihan. Disetujui, agen tidak sedang bekerja, dan salah satu:
 * kirim belum terkonfirmasi, kode keamanan tidak masuk atau ditolak, kedaluwarsa tanpa kejelasan, atau lowongan yang
 * hanya bisa dilamar di luar Applify (LinkedIn, email langsung).
 */
export function offersOutcomeChoice(input: Pick<PanelInput, "stage" | "approvalStatus" | "row">): boolean {
  if (input.approvalStatus !== "approved") return false;
  if (isAgentApplyActive(input.row)) return false;
  switch (input.stage) {
    case "unverified":
    case "fill_yourself":
    case "send_by_email":
    case "expired":
      return true;
    case "needs_action":
      return isCodeTimeout(input.row);
    default:
      return false;
  }
}

/** Urutan tindakan yang digambar OutcomeActions pada satu kartu. Kosong berarti kartu ini punya komponen sendiri (Periksa). */
export function panelActions(input: PanelInput): StatusActionId[] {
  const { stage, row } = input;
  const approved = input.approvalStatus === "approved";
  const active = isAgentApplyActive(row);
  const url = safeJobUrl(input.jobUrl);
  const out: StatusActionId[] = [];
  const add = (id: StatusActionId, when = true) => {
    if (when && !out.includes(id)) out.push(id);
  };

  switch (stage) {
    case "review":
      return [];
    case "sent":
      add("view_application");
      return out;
    case "rejected":
    case "closed":
      add("reapply");
      return out;
    case "replaced":
      add("view_new_approval");
      return out;
    case "expired":
      if (offersOutcomeChoice(input)) {
        add("confirm_sent");
        add("retry_fresh");
        add("open_form", !!url);
        add("close");
      } else {
        add("reapply");
      }
      return out;
    case "unverified":
      add("confirm_sent", approved && !active);
      add("retry_fresh", approved && !active);
      add("open_form", !!url);
      add("close", approved && !active);
      add("refresh", out.length === 0 || active);
      return out;
    case "fill_yourself":
    case "send_by_email":
      add("confirm_sent", approved && !active);
      add("open_form", !!url);
      add("close", approved && !active);
      add("refresh", out.length === 0 || active);
      return out;
    case "checking":
    case "processing":
      add("refresh");
      add("open_form", !!url);
      return out;
    case "not_started":
      add("rerun", approved && !active);
      add("refresh");
      add("open_form", !!url);
      return out;
    case "test_mode":
      add("open_form", !!url);
      add("close", approved && !active);
      add("refresh", out.length === 0 || active);
      return out;
    case "filled_not_sent": {
      // AgentManualSubmit sudah memberi buka formulir dan coba lagi bila ia tampil; panel hanya menambah yang kurang.
      const manual = manualSubmitState(row);
      add("rerun", approved && !active && !manual?.canRerun);
      add("open_form", !!url && !manual);
      add("close", approved && !active);
      add("refresh", out.length === 0);
      return out;
    }
    case "failed_retry":
      add("rerun", approved && !active);
      add("continue_extension", approved && !active && !input.consentShown && extensionCanContinue(input.platform, url));
      add("open_form", !!url);
      add("close", approved && !active);
      add("refresh", out.length === 0);
      return out;
    case "needs_action": {
      if (offersOutcomeChoice(input)) {
        add("confirm_sent");
        add("retry_fresh");
        add("open_form", !!url);
        add("close");
        return out;
      }
      // Kode keamanan, pertanyaan, dan izin ekstensi punya formulirnya sendiri; panel tidak menimpanya dengan tombol lain.
      const hasOwnForm = awaitingCodeState(row).waiting || questionsToAnswer(row).length > 0 || input.consentShown === true;
      const manual = manualSubmitState(row);
      const reason = row?.reason ?? "";
      const rerunnable = approved && !active && !hasOwnForm && !manual?.canRerun && !NO_RERUN_REASONS.has(reason);
      add("rerun", rerunnable);
      add("continue_extension", approved && !active && !hasOwnForm && extensionCanContinue(input.platform, url));
      add("open_form", !!url && !manual);
      add("close", approved && !active && !hasOwnForm);
      add("refresh", out.length === 0 || active);
      return out;
    }
  }
}

/** Semua tahap punya tindakan: dipakai tes penjaga dan dokumen docs/status-actions.md. */
export function allStagesHaveAction(): boolean {
  return (Object.keys(STAGE_ACTIONS) as ApprovalStage[]).every((s) => STAGE_ACTIONS[s].includes(ALWAYS_ACTION[s]));
}

/** Teks pengantar tiga pilihan, menurut keadaannya. */
export const OUTCOME_INTRO: Record<"unverified" | "needs_code" | "expired" | "outside", string> = {
  unverified: "Agen menekan tombol kirim, tetapi halaman konfirmasi tidak terlihat. Cek emailmu atau akunmu di situs lowongan, lalu pilih.",
  needs_code: "Situs meminta kode keamanan dan kodenya tidak sampai ke agen. Cek emailmu atau akunmu di situs lowongan, lalu pilih.",
  expired: "Masa berlaku persetujuan ini habis dan Applify tidak punya bukti lamaran terkirim. Cek emailmu atau akunmu di situs lowongan, lalu pilih.",
  outside: "Lowongan ini dilamar di luar Applify, jadi Applify tidak bisa melihat hasilnya. Setelah kamu melamar, beri tahu Applify.",
};

export function outcomeIntroKind(stage: ApprovalStage, row: AgentApplyRow | null | undefined): keyof typeof OUTCOME_INTRO {
  if (stage === "unverified") return "unverified";
  if (stage === "needs_action" && isCodeTimeout(row)) return "needs_code";
  if (stage === "expired") return "expired";
  return "outside";
}

export const EXPIRED_UNAPPROVED_TEXT = `Persetujuan ini tidak kamu setujui sebelum masa berlakunya (${APPROVAL_VALID_TEXT}) habis, jadi tidak ada lamaran yang dikirim. Bila lowongan ini masih kamu minati, ajukan lagi dari halaman Lowongan.`;
export const REJECTED_TEXT = "Kamu menolak persetujuan ini, jadi tidak ada lamaran yang dikirim. Bila berubah pikiran, ajukan lagi dari halaman Lowongan.";

/** Penjelasan satu kalimat untuk tahap riwayat yang tidak punya komponen status agen (persetujuan yang tidak pernah disetujui). */
export function terminalExplanation(stage: ApprovalStage, approvalStatus: string | null | undefined): string | null {
  if (stage === "expired" && approvalStatus !== "approved") return EXPIRED_UNAPPROVED_TEXT;
  if (stage === "rejected") return REJECTED_TEXT;
  return null;
}

export const CONFIRM_SENT_NOTE =
  "Applify mencatat ini sebagai konfirmasi darimu, bukan konfirmasi dari situs lowongan. Lamaran pindah ke Terkirim dan agen tidak akan mengirimnya lagi.";
export const RETRY_FRESH_NOTE =
  "Applify membuat persetujuan baru untuk lowongan ini dan memindahkan yang lama ke Riwayat. Agen baru jalan setelah kamu menyetujuinya. Pastikan lamaran lama memang belum terkirim, supaya tidak terkirim dua kali.";
export const CONFIRM_YES_LABEL: Record<"confirm_sent" | "retry_fresh", string> = {
  confirm_sent: "Ya, sudah terkirim",
  retry_fresh: "Ya, buat persetujuan baru",
};
export const CONFIRM_CANCEL_LABEL = "Batal";
export const OUTCOME_BUSY_LABEL = "Memproses...";

export const OUTCOME_TOAST: Record<"confirm_sent" | "retry_fresh" | "close", string> = {
  confirm_sent: "Tercatat terkirim, atas konfirmasimu. Kartu ada di Riwayat.",
  retry_fresh: "Persetujuan baru dibuat di tab Menunggu. Periksa dan setujui untuk mengulang.",
  close: "Persetujuan ditutup dan dipindah ke Riwayat.",
};

export interface OutcomeFailure {
  /** Sudah selesai di tempat lain (klik ganda, tab lain): bukan galat, cukup memuat ulang. */
  alreadyDone: boolean;
  message: string;
}

/** Galat mark-sent, not-sent, atau close -> pesan untuk pengguna. 409 already_resolved dan already_sent berarti sudah beres. */
export function describeOutcomeError(err: unknown, fallback: string): OutcomeFailure {
  const parsed = parseApiError(err);
  const done = parsed.status === 409 && (parsed.code === "already_resolved" || parsed.code === "already_sent");
  return { alreadyDone: done, message: describeApiError(err, fallback) };
}
