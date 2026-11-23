import {
  NO_FIELDS_FILLED_TEXT,
  QUEUE_NEEDS_MANUAL_LABEL,
  isQueueNeedsManual,
  isQueueSkipped,
  queueStatusHint,
} from "./statusLabels.ts";
import type { AgentLogFacts } from "./agentEvidence.ts";
import { awaitingCodeState } from "./securityCode.ts";

/**
 * Hasil tugas `apply` (agen pengisi formulir) untuk satu persetujuan, dibaca dari automation_queue
 * (payload.approval_request_id) dan log percobaannya (application_logs: status dan details).
 * Kartu Riwayat Persetujuan memakainya agar pengguna melihat apa yang dikerjakan agen sesudah Setujui,
 * bukan hanya tombol email (temuan uji klik 23 November 2026). Status antrean hanya bilang tugasnya
 * selesai; apakah lamaran terkirim dibaca dari log (`log_status`, `submit_check_verdict`, dan seterusnya).
 */
export interface AgentApplyRow extends AgentLogFacts {
  status?: string | null;
  error_message?: string | null;
  /** automation_queue.id tugas apply ini; dikirim ke backend bersama kode keamanan. */
  queue_job_id?: string | null;
}

export type AgentApplyTone = "waiting" | "working" | "ready" | "sent" | "unverified" | "manual" | "failed" | "none";

export interface AgentApplyView {
  label: string;
  hint: string;
  tone: AgentApplyTone;
  /** Agen tidak berhasil (gagal, dilewati, atau tanpa isian): jalur email layak ditawarkan sebagai cadangan. */
  suggestEmail: boolean;
}

export const AGENT_NOT_STARTED_HINT =
  "Persetujuan ini belum punya tugas pengisian formulir oleh agen. Bila lowongan meminta lamaran lewat email, pakai opsi email di bawah.";

export const AGENT_SENT_LABEL = "Terkirim";
export const AGENT_SENT_HINT = "Agen menekan kirim dan halaman konfirmasi terdeteksi.";
export const AGENT_SENT_EMAIL_NOTE = "Cek juga kotak masuk emailmu: portal lowongan biasanya mengirim email konfirmasi.";

export const AGENT_UNVERIFIED_LABEL = "Perlu dicek: kirim belum terkonfirmasi";
export const AGENT_UNVERIFIED_HINT =
  "Agen sudah menekan tombol kirim, tetapi halaman konfirmasi tidak terlihat. Lamaranmu mungkin sudah terkirim, mungkin juga belum. Cek kotak masuk emailmu atau akunmu di situs lowongan sebelum melamar lagi. Jangan ajukan ulang tanpa mengecek, supaya lamaran tidak terkirim dua kali.";

export const AGENT_PRIOR_UNVERIFIED_LABEL = "Perlu dicek: kirim sebelumnya belum terkonfirmasi";
export const AGENT_PRIOR_UNVERIFIED_HINT =
  "Percobaan kirim sebelumnya belum terkonfirmasi, jadi agen tidak menekan kirim lagi. Cek kotak masuk emailmu atau akunmu di situs lowongan. Bila lamaran belum terkirim, kirim sendiri di situs lowongan.";

export const AGENT_VALIDATION_LABEL = "Ditolak formulir (tidak terkirim)";
export const AGENT_VALIDATION_HINT =
  "Formulir menolak pengiriman dan menampilkan pesan validasi. Tidak ada lamaran yang terkirim. Lengkapi data profilmu, lalu ajukan lagi.";

export const AGENT_PARTIAL_LABEL = "Terisi sebagian, belum dikirim";

export const AGENT_AWAITING_CODE_LABEL = "Menunggu kode keamanan";
export const AGENT_AWAITING_CODE_HINT =
  "Situs lowongan mengirim kode ke emailmu. Masukkan kodenya di bawah sebelum waktunya habis.";

export const AGENT_CODE_TIMEOUT_LABEL = "Kode tidak dimasukkan";
export const AGENT_CODE_TIMEOUT_HINT = "Lamaran belum terkirim. Jalankan agen lagi untuk meminta kode baru.";
/** Worker menulis reason "code_rejected" sesudah 3 kode tidak diterima situs lowongan. */
export const AGENT_CODE_REJECTED_LABEL = "Kode ditolak";
export const AGENT_CODE_REJECTED_HINT =
  "Situs lowongan tidak menerima kode yang dimasukkan. Lamaran belum terkirim. Jalankan agen lagi untuk meminta kode baru, lalu salin kode terbaru dari email.";

const MAX_HINT_LABELS = 3;
const MAX_HINT_LABEL_LENGTH = 70;

function clip(label: string, max: number): string {
  const text = label.trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function partialHint(remaining: readonly string[] | undefined): string {
  const list = (remaining ?? []).filter((l) => typeof l === "string" && l.trim());
  if (list.length === 0) {
    return "Agen hanya mengisi sebagian formulir, dan masih ada isian wajib yang kosong. Lamaran belum terkirim. Lengkapi datanya di Profil Saya atau Pengaturan Agen, lalu ajukan lagi.";
  }
  const shown = list.slice(0, MAX_HINT_LABELS).map((l) => clip(l, MAX_HINT_LABEL_LENGTH)).join("; ");
  const more = list.length - MAX_HINT_LABELS;
  return `Isian wajib yang belum terisi: ${shown}${more > 0 ? `; dan ${more} isian lain` : ""}. Lamaran belum terkirim. Lengkapi datanya di Profil Saya atau Pengaturan Agen, lalu ajukan lagi.`;
}

/**
 * Hasil percobaan agen menurut log, bila log menjelaskan sesuatu yang lebih spesifik daripada "formulir
 * diisi, berhenti sebelum kirim". null berarti log tidak punya hasil khusus (log lama, atau berhenti karena
 * pengiriman otomatis belum diizinkan). Dasarnya kolom terstruktur (status, reason, submit_blocked), bukan
 * pencocokan teks pesan. Dipakai kartu Persetujuan dan jendela detail Lamaran Saya.
 */
export function describeLogOutcome(facts: AgentLogFacts | null | undefined): AgentApplyView | null {
  if (!facts) return null;
  const { log_status: status, reason, submit_blocked: blocked } = facts;
  if (status === "success") {
    const phrase = facts.confirmation_phrase?.trim();
    const parts = [AGENT_SENT_HINT];
    if (phrase) parts.push(`Tulisan di halaman itu: "${phrase}".`);
    parts.push(AGENT_SENT_EMAIL_NOTE);
    return { label: AGENT_SENT_LABEL, hint: parts.join(" "), tone: "sent", suggestEmail: false };
  }
  if (status === "submit_unverified") {
    return { label: AGENT_UNVERIFIED_LABEL, hint: AGENT_UNVERIFIED_HINT, tone: "unverified", suggestEmail: false };
  }
  if (status === "incomplete" && (reason === "validation_failed" || facts.submit_check_verdict === "validation_error")) {
    return { label: AGENT_VALIDATION_LABEL, hint: AGENT_VALIDATION_HINT, tone: "manual", suggestEmail: true };
  }
  if (status === "ready" && reason === "code_timeout") {
    return { label: AGENT_CODE_TIMEOUT_LABEL, hint: AGENT_CODE_TIMEOUT_HINT, tone: "manual", suggestEmail: false };
  }
  if (status === "ready" && reason === "code_rejected") {
    return { label: AGENT_CODE_REJECTED_LABEL, hint: AGENT_CODE_REJECTED_HINT, tone: "manual", suggestEmail: false };
  }
  if (status === "ready" && blocked === "prior_unverified") {
    return { label: AGENT_PRIOR_UNVERIFIED_LABEL, hint: AGENT_PRIOR_UNVERIFIED_HINT, tone: "unverified", suggestEmail: false };
  }
  if (status === "ready" && blocked === "required_remaining") {
    return { label: AGENT_PARTIAL_LABEL, hint: partialHint(facts.remaining_required), tone: "manual", suggestEmail: true };
  }
  return null;
}

/** Tugas selesai tetapi tidak satu isian pun terisi: dari jumlah isian (0) atau alasan no_fields_filled pada log. */
function filledNothing(row: AgentApplyRow): boolean {
  return isQueueNeedsManual(row.status, "apply", row.fields_filled) || (row.log_status === "incomplete" && row.reason === "no_fields_filled");
}

export function describeAgentApply(row: AgentApplyRow | null | undefined, now: number = Date.now()): AgentApplyView {
  if (!row || !row.status) {
    return { label: "Agen belum dijalankan", hint: AGENT_NOT_STARTED_HINT, tone: "none", suggestEmail: true };
  }
  const { status, error_message: err } = row;
  const filled = row.fields_filled;
  if (isQueueSkipped(status, err)) {
    return { label: "Dilewati", hint: queueStatusHint(status, "apply", err, filled), tone: "manual", suggestEmail: true };
  }
  switch (status) {
    case "pending":
      return { label: "Menunggu agen", hint: queueStatusHint(status, "apply", err, filled), tone: "waiting", suggestEmail: false };
    case "processing":
      // Tombol kirim sudah ditekan dan situs meminta kode dari email: agen menunggu pengguna (log awaiting_code).
      if (awaitingCodeState(row, now).waiting) {
        return { label: AGENT_AWAITING_CODE_LABEL, hint: AGENT_AWAITING_CODE_HINT, tone: "waiting", suggestEmail: false };
      }
      return { label: "Agen sedang mengisi formulir", hint: queueStatusHint(status, "apply", err, filled), tone: "working", suggestEmail: false };
    case "completed": {
      const outcome = describeLogOutcome(row);
      if (outcome) return outcome;
      if (filledNothing(row)) {
        return { label: QUEUE_NEEDS_MANUAL_LABEL, hint: NO_FIELDS_FILLED_TEXT, tone: "manual", suggestEmail: true };
      }
      return {
        label: typeof filled === "number" && filled > 0
          ? `Formulir terisi (${filled} isian), berhenti sebelum kirim`
          : "Formulir diisi, berhenti sebelum kirim",
        hint: queueStatusHint(status, "apply", err, filled),
        tone: "ready",
        suggestEmail: false,
      };
    }
    case "failed": {
      // Tombol kirim sudah ditekan sebelum tugas berakhir gagal: lognya lebih jujur daripada "Agen gagal".
      if (row.log_status === "success" || row.log_status === "submit_unverified") {
        const outcome = describeLogOutcome(row);
        if (outcome) return outcome;
      }
      return { label: "Agen gagal", hint: queueStatusHint(status, "apply", err, filled), tone: "failed", suggestEmail: true };
    }
    default:
      return { label: status, hint: "", tone: "none", suggestEmail: true };
  }
}

/**
 * Tugas agen yang masih berjalan: halaman Persetujuan memuat ulang statusnya secara berkala. Agen yang
 * menunggu kode keamanan juga aktif (tugasnya masih processing), supaya muat ulang terus jalan sampai
 * lamaran terkirim atau waktunya habis.
 */
export const isAgentApplyActive = (row: AgentApplyRow | null | undefined) =>
  row?.status === "pending" || row?.status === "processing" || awaitingCodeState(row).waiting;
