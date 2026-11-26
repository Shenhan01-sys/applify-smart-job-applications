import type { AgentLogFacts } from "./agentEvidence.ts";
import { SENT_STALE_ATTEMPT_HINT } from "./agentApplyStatus.ts";

/**
 * Percobaan agen yang bukan sumber lamaran terkirim, di jendela detail Lamaran Saya.
 *
 * Kasus GoToGroup (Data Scientist Intern, 26 November 2026): lamaran terkirim lewat email, tetapi jendela detail masih
 * menampilkan blok "Bukti dari agen" berisi 10 isian dari percobaan agen yang berhenti sebelum kirim, sehingga pengguna
 * bisa mengira agen yang mengirim. Halaman Persetujuan sudah memakai aturan yang sama untuk kartu Terkirim
 * (describeSentApproval, SENT_STALE_ATTEMPT_HINT): percobaan lama yang berhenti sebelum kirim tidak berlaku lagi.
 *
 * Percobaan dianggap tidak berlaku (bukan bukti kirim) bila:
 *   1. lamaran tercatat terkirim, tetapi percobaan terbaru bukan log success (jalur lain yang mengirim: email, atau
 *      pengguna sendiri), atau
 *   2. persetujuan percobaan itu sudah kedaluwarsa atau ditutup, jadi tidak bisa dilanjutkan lagi.
 * Log success tetap bukti pengiriman. Log submit_unverified tidak diberi label "tidak dikirim": agen sempat menekan
 * kirim dan hasilnya belum pasti, itu urusan teks "kirim belum terkonfirmasi".
 */

export const STALE_ATTEMPT_LABEL = "Percobaan agen sebelumnya (tidak dikirim)";
export const STALE_ATTEMPT_EXPIRED_HINT =
  "Persetujuan untuk percobaan ini sudah kedaluwarsa atau ditutup. Isian di bawah hanya catatan percobaan lama yang berhenti sebelum kirim, dan tidak dikirim.";
export const STALE_ATTEMPT_TOGGLE_LABEL = "Lihat catatan percobaan lama";

export interface StaleAttemptNote {
  label: string;
  hint: string;
}

export function staleAttemptNote(input: {
  /** isApplicationSent(lamaran): status lamaran menyatakan terkirim. */
  applicationSent: boolean;
  /** false = persetujuan percobaan itu sudah tidak berlaku. null atau true = berlaku atau belum diketahui. */
  approvalLive?: boolean | null;
  facts: Pick<AgentLogFacts, "log_status"> | null | undefined;
}): StaleAttemptNote | null {
  const status = input.facts?.log_status;
  if (!input.facts || status === "success" || status === "submit_unverified") return null;
  if (input.applicationSent) return { label: STALE_ATTEMPT_LABEL, hint: SENT_STALE_ATTEMPT_HINT };
  if (input.approvalLive === false) return { label: STALE_ATTEMPT_LABEL, hint: STALE_ATTEMPT_EXPIRED_HINT };
  return null;
}
