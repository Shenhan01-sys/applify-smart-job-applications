import {
  NO_FIELDS_FILLED_TEXT,
  QUEUE_NEEDS_MANUAL_LABEL,
  isQueueNeedsManual,
  isQueueSkipped,
  queueStatusHint,
} from "./statusLabels.ts";

/**
 * Hasil tugas `apply` (agen pengisi formulir) untuk satu persetujuan, dibaca dari automation_queue
 * (payload.approval_request_id) dan log percobaannya (application_logs.details.fields_filled).
 * Kartu Riwayat Persetujuan memakainya agar pengguna melihat apa yang dikerjakan agen sesudah Setujui,
 * bukan hanya tombol email (temuan uji klik 23 November 2026).
 */
export interface AgentApplyRow {
  status?: string | null;
  error_message?: string | null;
  /** null atau undefined = log percobaan belum ada atau tidak terbaca */
  fields_filled?: number | null;
}

export type AgentApplyTone = "waiting" | "working" | "ready" | "manual" | "failed" | "none";

export interface AgentApplyView {
  label: string;
  hint: string;
  tone: AgentApplyTone;
  /** Agen tidak berhasil (gagal, dilewati, atau tanpa isian): jalur email layak ditawarkan sebagai cadangan. */
  suggestEmail: boolean;
}

export const AGENT_NOT_STARTED_HINT =
  "Persetujuan ini belum punya tugas pengisian formulir oleh agen. Bila lowongan meminta lamaran lewat email, pakai opsi email di bawah.";

export function describeAgentApply(row: AgentApplyRow | null | undefined): AgentApplyView {
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
      return { label: "Agen sedang mengisi formulir", hint: queueStatusHint(status, "apply", err, filled), tone: "working", suggestEmail: false };
    case "completed":
      if (isQueueNeedsManual(status, "apply", filled)) {
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
    case "failed":
      return { label: "Agen gagal", hint: queueStatusHint(status, "apply", err, filled), tone: "failed", suggestEmail: true };
    default:
      return { label: status, hint: "", tone: "none", suggestEmail: true };
  }
}

/** Tugas agen yang masih berjalan: halaman Persetujuan memuat ulang statusnya secara berkala. */
export const isAgentApplyActive = (row: AgentApplyRow | null | undefined) =>
  row?.status === "pending" || row?.status === "processing";
