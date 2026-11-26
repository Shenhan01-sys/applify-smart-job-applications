import { agentFactsByJob, type AgentLogFacts } from "./agentEvidence.ts";
import { attemptsByJob, type ApplyAttempt } from "./formGaps.ts";

/**
 * Percobaan agen per LAMARAN, bukan per lowongan.
 *
 * Log percobaan (application_logs) hanya membawa job_id. Satu lowongan bisa punya beberapa lamaran (diajukan ulang,
 * ditutup, diganti), dan percobaan terbaru milik lowongan itu bisa berasal dari lamaran yang lain. Contoh nyata
 * (audit Gemini 26 November 2026): kartu Datadog yang Ditutup (dibuat 20 November) menampilkan "Bukti pengiriman" dari
 * percobaan 25 November milik lamaran Datadog yang lain. Satu percobaan milik sebuah lamaran bila waktunya jatuh dalam
 * jendela [dibuat, lamaran berikutnya untuk lowongan yang sama dibuat). Lamaran paling baru untuk lowongan itu
 * mendapat semua percobaan sesudah dibuat.
 *
 * Fungsi murni tanpa React dan tanpa Supabase.
 */

export interface ApplicationLike {
  id: string;
  job_id: string;
  created_at?: unknown;
}

export interface ApplicationAttempt {
  attempt?: ApplyAttempt;
  facts?: AgentLogFacts;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const ms = (v: unknown): number => (typeof v === "string" ? Date.parse(v) : NaN);

/**
 * Percobaan terbaru dan faktanya untuk setiap lamaran. Lamaran tanpa tanggal dibuat yang terbaca, atau tanpa percobaan
 * di jendelanya, tidak punya isian (kartu tidak menampilkan hasil agen, lebih baik daripada hasil milik lamaran lain).
 */
export function attemptsForApplications(
  applications: readonly ApplicationLike[] | null | undefined,
  rowsByJob: Record<string, readonly unknown[]> | null | undefined,
): Record<string, ApplicationAttempt> {
  const out: Record<string, ApplicationAttempt> = {};
  if (!Array.isArray(applications) || !rowsByJob) return out;

  const createdByJob = new Map<string, number[]>();
  for (const app of applications) {
    const t = ms(app?.created_at);
    if (!app || typeof app.job_id !== "string" || Number.isNaN(t)) continue;
    const list = createdByJob.get(app.job_id) ?? [];
    list.push(t);
    createdByJob.set(app.job_id, list);
  }

  for (const app of applications) {
    if (!app || typeof app.id !== "string" || typeof app.job_id !== "string") continue;
    const start = ms(app.created_at);
    if (Number.isNaN(start)) continue;
    // Awal jendela lamaran berikutnya untuk lowongan yang sama; Infinity bila ini lamaran terbarunya.
    const laterStarts = (createdByJob.get(app.job_id) ?? []).filter((t) => t > start);
    const end = laterStarts.length > 0 ? Math.min(...laterStarts) : Infinity;
    const rows = (rowsByJob[app.job_id] ?? []).filter((r) => {
      if (!isRecord(r)) return false;
      const t = ms(r.created_at);
      return !Number.isNaN(t) && t >= start && t < end;
    });
    if (rows.length === 0) continue;
    const attempt = attemptsByJob(rows, [app.job_id])[app.job_id];
    const facts = agentFactsByJob(rows, [app.job_id])[app.job_id];
    if (attempt || facts) out[app.id] = { ...(attempt ? { attempt } : {}), ...(facts ? { facts } : {}) };
  }
  return out;
}

/** Baris log per lowongan (kunci: job_id) dari hasil kueri application_logs, untuk attemptsForApplications. */
export function groupLogRowsByJob(rows: unknown, jobIds: readonly string[]): Record<string, unknown[]> {
  const wanted = new Set(jobIds);
  const out: Record<string, unknown[]> = {};
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!isRecord(row) || typeof row.job_id !== "string" || !wanted.has(row.job_id)) continue;
    (out[row.job_id] ??= []).push(row);
  }
  return out;
}
