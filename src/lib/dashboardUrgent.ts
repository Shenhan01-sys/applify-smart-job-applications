import { isAgentApplyActive } from "./agentApplyStatus.ts";
import {
  emptyPlacementData,
  placementContextFromData,
  splitApprovalTabs,
  type ApprovalStage,
  type PlacementSourceData,
} from "./approvalTabs.ts";
import { questionsToAnswer } from "./formQuestions.ts";
import { awaitingCodeState, isCodeTimeout } from "./securityCode.ts";

export interface UrgentActionsSummary {
  /** Draf yang menunggu keputusanmu (tahap "Menunggu persetujuan"). */
  pendingApprovalsCount: number;
  /** Tahap "Perlu tindakanmu": agen menunggu kode keamanan dari email. */
  awaitingCodeCount: number;
  /** Tahap "Perlu tindakanmu": agen berhenti dan menunggu jawaban pertanyaan formulir. */
  pendingQuestionsCount: number;
  /** Tahap "Perlu tindakanmu": kode keamanan tidak dimasukkan tepat waktu atau ditolak (`code_timeout`, `code_rejected`). */
  codeFailedCount: number;
  /** Tahap "Perlu tindakanmu" yang lain: login, CAPTCHA, isian wajib kosong, dialihkan, dan sejenisnya. */
  otherActionCount: number;
  /** Kartu Menunggu berlabel "Perlu dicek, kirim belum terkonfirmasi": hasil kirimnya tidak pasti, pengguna harus memutuskan. */
  unverifiedCount: number;
  /** Tahap "Perlu diisi sendiri": lowongan yang hanya bisa dilamar sendiri (LinkedIn dan sejenisnya). */
  fillYourselfCount: number;
  /** Tahap "Kirim lewat panel Email": lowongan email langsung yang belum dikirim. */
  sendByEmailCount: number;
  /** Tahap "Terisi, belum terkirim": agen mengisi formulir lalu berhenti sebelum tombol kirim. */
  filledNotSentCount: number;
  /** Tahap "Belum terkirim, bisa dicoba lagi": tugas agen atau email gagal dan persetujuan masih berlaku. */
  failedRetryCount: number;
  /** Tahap "Belum dikirim (mode uji)": email tidak dikirim karena pengiriman nyata dimatikan. */
  testModeCount: number;
  total: number;
}

export type UrgentCountField = Exclude<keyof UrgentActionsSummary, "total">;

export const EMPTY_URGENT_SUMMARY: UrgentActionsSummary = {
  pendingApprovalsCount: 0,
  awaitingCodeCount: 0,
  pendingQuestionsCount: 0,
  codeFailedCount: 0,
  otherActionCount: 0,
  unverifiedCount: 0,
  fillYourselfCount: 0,
  sendByEmailCount: 0,
  filledNotSentCount: 0,
  failedRetryCount: 0,
  testModeCount: 0,
  total: 0,
};

/**
 * Baris banner per kelompok, dalam urutan tampil. Satu baris pendek per kelompok, memakai kata yang sama dengan label
 * kartu di tab Menunggu (STATUS_TERM dan STAGE_LABEL), supaya pengguna mengenali kartunya setelah menekan
 * "Tinjau di Persetujuan". Bahasa Indonesia tidak membedakan tunggal dan jamak, jadi satu fungsi teks per kelompok cukup.
 */
export const URGENT_LINES: ReadonlyArray<{ field: UrgentCountField; text: (n: number) => string }> = [
  { field: "pendingApprovalsCount", text: (n) => `${n} draf menunggu persetujuanmu.` },
  { field: "awaitingCodeCount", text: (n) => `${n} lamaran menunggu kode keamanan dari emailmu.` },
  { field: "pendingQuestionsCount", text: (n) => `${n} lamaran menunggu jawaban pertanyaan formulir untuk agen.` },
  { field: "codeFailedCount", text: (n) => `${n} lamaran perlu dicek: kode keamanan tidak dimasukkan atau ditolak.` },
  { field: "otherActionCount", text: (n) => `${n} lamaran berhenti dan perlu tindakanmu (login, CAPTCHA, atau isian wajib).` },
  { field: "unverifiedCount", text: (n) => `${n} lamaran perlu dicek: kirim belum terkonfirmasi.` },
  { field: "fillYourselfCount", text: (n) => `${n} lamaran perlu diisi sendiri.` },
  { field: "sendByEmailCount", text: (n) => `${n} lamaran perlu dikirim lewat panel Email.` },
  { field: "filledNotSentCount", text: (n) => `${n} lamaran terisi, belum terkirim.` },
  { field: "failedRetryCount", text: (n) => `${n} lamaran belum terkirim, bisa dicoba lagi.` },
  { field: "testModeCount", text: (n) => `${n} lamaran belum dikirim (mode uji).` },
];

/** Baris banner yang perlu tampil: hanya kelompok yang jumlahnya lebih dari nol. */
export function urgentLines(summary: UrgentActionsSummary): { field: UrgentCountField; text: string }[] {
  return URGENT_LINES.filter((l) => summary[l.field] > 0).map((l) => ({ field: l.field, text: l.text(summary[l.field]) }));
}

/**
 * Tahap tab Menunggu yang tidak dihitung banner: tidak ada keputusan yang bisa diambil pengguna.
 *   processing   agen atau email sedang bekerja; hasilnya datang sendiri.
 *   not_started  tugas menunggu giliran di antrean agen; tidak ada yang bisa dijawab atau dikirim pengguna.
 *   checking     status agen belum terbaca (belum dimuat atau gagal); bukan hasil kerja, hanya data yang belum ada.
 * Ketiganya tetap punya tombol di kartu (Muat ulang status, Coba lagi, Buka formulir lowongan), tetapi itu jalan keluar
 * bila macet, bukan tindakan yang harus segera dikerjakan. Persetujuan yang macet di sana kedaluwarsa dan pindah ke
 * Riwayat dengan tiga tindakan. Setiap tahap Menunggu lain dihitung.
 */
export const BACKGROUND_STAGES: ReadonlySet<ApprovalStage> = new Set<ApprovalStage>(["processing", "not_started", "checking"]);

type AgentRow = PlacementSourceData["agent"][string] | undefined;

/** Pecah tahap "Perlu tindakanmu" menurut sebabnya, dari baris agen yang sama dengan yang dipakai kartu. */
function needsActionField(row: AgentRow, now: number): UrgentCountField {
  if (!row) return "otherActionCount";
  if (awaitingCodeState(row, now).waiting) return "awaitingCodeCount";
  if (
    row.log_status !== "success" &&
    row.log_status !== "submit_unverified" &&
    !isAgentApplyActive(row) &&
    (questionsToAnswer(row).length > 0 || (row.questions_pending ?? 0) > 0)
  ) {
    return "pendingQuestionsCount";
  }
  if (isCodeTimeout(row)) return "codeFailedCount";
  return "otherActionCount";
}

/**
 * Kelompok banner untuk satu kartu tab Menunggu, atau null bila kartu itu tidak dihitung (BACKGROUND_STAGES, dan tahap
 * Riwayat yang tidak pernah ada di Menunggu). Switch ini lengkap: tahap baru di `ApprovalStage` membuat tipe tidak
 * lolos sampai penulisnya memutuskan dihitung atau tidak.
 */
export function urgentFieldForStage(stage: ApprovalStage, row: AgentRow, now: number): UrgentCountField | null {
  switch (stage) {
    case "review":
      return "pendingApprovalsCount";
    case "needs_action":
      return needsActionField(row, now);
    case "unverified":
      return "unverifiedCount";
    case "fill_yourself":
      return "fillYourselfCount";
    case "send_by_email":
      return "sendByEmailCount";
    case "filled_not_sent":
      return "filledNotSentCount";
    case "failed_retry":
      return "failedRetryCount";
    case "test_mode":
      return "testModeCount";
    case "processing":
    case "not_started":
    case "checking":
    case "sent":
    case "rejected":
    case "expired":
    case "replaced":
    case "closed":
      return null;
    default: {
      const unreachable: never = stage;
      return unreachable;
    }
  }
}

const asList = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string")
    : [];

/**
 * Merangkum tindakan mendesak di Beranda (E2E-06) dari kartu yang sama dengan tab Menunggu di halaman Persetujuan.
 *
 * Tidak ada aturan penempatan sendiri di sini: setiap persetujuan ditempatkan oleh `splitApprovalTabs` dengan konteks
 * dari `placementContextFromData`, persis seperti halaman Persetujuan. Banner menghitung setiap kartu Menunggu yang
 * butuh tindakan pengguna menurut tahapnya, jadi angkanya tidak bisa berbeda dari kartu yang ditemukan pengguna setelah
 * menekan "Tinjau di Persetujuan": total = jumlah kartu Menunggu dikurangi kartu BACKGROUND_STAGES (sedang diproses,
 * menunggu giliran, status belum terbaca). Persetujuan kedaluwarsa dan yang sudah ditutup ada di Riwayat dan tidak dihitung.
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

  const counts: Record<UrgentCountField, number> = {
    pendingApprovalsCount: 0,
    awaitingCodeCount: 0,
    pendingQuestionsCount: 0,
    codeFailedCount: 0,
    otherActionCount: 0,
    unverifiedCount: 0,
    fillYourselfCount: 0,
    sendByEmailCount: 0,
    filledNotSentCount: 0,
    failedRetryCount: 0,
    testModeCount: 0,
  };
  for (const { item, placement } of tabs.pending) {
    const field = urgentFieldForStage(placement.stage, data.agent[item.id], now);
    if (field) counts[field] += 1;
  }
  return { ...counts, total: Object.values(counts).reduce((sum, n) => sum + n, 0) };
}
