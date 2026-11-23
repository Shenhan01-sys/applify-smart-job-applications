import { newestRow } from "./formGaps.ts";
import { parseQuestions, type PendingQuestion } from "./formQuestions.ts";

/**
 * Bukti dari agen pengisi formulir: isian yang diisi, tangkapan layar, hasil pemeriksaan tombol kirim.
 * Semuanya dibaca dari satu baris application_logs (action "apply") yang ditulis worker. Fungsi di sini murni
 * (tanpa React dan tanpa Supabase) supaya bisa dites dengan `node --test`. Masukan dari database tidak
 * dipercaya: bentuk yang rusak diabaikan dan tidak pernah melempar galat.
 */

/** Bucket Supabase Storage privat tempat worker menyimpan tangkapan layar: `<user_id>/<queue_job_id>/{filled,after}.png`. */
export const AGENT_SCREENSHOT_BUCKET = "agent-screenshots";
/** Masa berlaku tautan bertanda tangan yang dibuat di peramban pengguna (detik). */
export const SIGNED_URL_TTL_SECONDS = 3600;
export const MAX_FILLED_FIELDS = 40;

export type FilledFieldKind = "text" | "select" | "check" | "upload";

export interface AgentFilledField {
  label: string;
  kind: FilledFieldKind;
  value?: string;
}

export interface AgentScreenshotRef {
  /** Jalur objek di bucket agent-screenshots. Dasar pembuatan tautan bertanda tangan. */
  path: string;
  /** Tautan bertanda tangan yang ditulis worker; kedaluwarsa setelah 7 hari, hanya cadangan. */
  url: string | null;
}

export interface AgentScreenshots {
  filled: AgentScreenshotRef | null;
  after: AgentScreenshotRef | null;
}

/** Fakta hasil percobaan agen yang dibaca dari log: dipakai kartu Persetujuan dan jendela detail Lamaran Saya. */
export interface AgentLogFacts {
  /** application_logs.status: success, ready, incomplete, submit_unverified, atau nilai lain dari worker. */
  log_status?: string | null;
  /** details.submit_check.verdict: confirmed, validation_error, atau uncertain. */
  submit_check_verdict?: string | null;
  /** details.submit_check.confirmation_phrase: tulisan di halaman konfirmasi yang dikenali worker. */
  confirmation_phrase?: string | null;
  /** details.reason, misalnya validation_failed atau no_fields_filled. */
  reason?: string | null;
  /** details.submit_blocked: required_remaining, nothing_filled, prior_unverified, not_allowed, atau null. */
  submit_blocked?: string | null;
  /** details.remaining_required: label isian wajib yang belum terisi. */
  remaining_required?: string[];
  /**
   * details.questions: pertanyaan wajib yang tidak bisa dijawab agen dari profil, untuk dijawab pengguna.
   * Hanya bermakna bila percobaan itu belum terkirim; lihat questionsToAnswer di formQuestions.ts.
   */
  questions?: PendingQuestion[];
  /** null atau undefined = log percobaan belum ada atau tidak terbaca */
  fields_filled?: number | null;
  filled_fields?: AgentFilledField[];
  screenshots?: AgentScreenshots | null;
  /** application_logs.created_at */
  logged_at?: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function cleanCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

const KINDS: ReadonlySet<string> = new Set(["text", "select", "check", "upload"]);

/** Daftar isian yang diisi agen (paling banyak 40). Baris tanpa label dibuang; jenis tak dikenal dianggap teks. */
export function cleanFilledFields(value: unknown): AgentFilledField[] {
  if (!Array.isArray(value)) return [];
  const out: AgentFilledField[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const label = cleanText(item.label, 200);
    if (!label) continue;
    const kind = typeof item.kind === "string" && KINDS.has(item.kind) ? (item.kind as FilledFieldKind) : "text";
    const raw = typeof item.value === "number" && Number.isFinite(item.value) ? String(item.value) : item.value;
    const val = cleanText(raw, 300);
    out.push(val ? { label, kind, value: val } : { label, kind });
    if (out.length >= MAX_FILLED_FIELDS) break;
  }
  return out;
}

/** Jalur objek yang aman: relatif, tanpa "..", tanpa garis miring terbalik. */
export function isSafeStoragePath(path: unknown): path is string {
  return typeof path === "string" && path.length > 0 && path.length <= 300 && !path.startsWith("/") && !path.includes("..") && !path.includes("\\");
}

/** Hanya tautan http(s): tautan lain (misalnya javascript:) tidak pernah dipakai sebagai href atau src. */
function cleanHttpUrl(value: unknown): string | null {
  return typeof value === "string" && value.length <= 2000 && /^https?:\/\//i.test(value) ? value : null;
}

function cleanShot(value: unknown): AgentScreenshotRef | null {
  if (!isRecord(value) || !isSafeStoragePath(value.path)) return null;
  return { path: value.path, url: cleanHttpUrl(value.url) };
}

/** details.screenshots -> jalur dan tautan cadangan; null bila tidak ada satu pun tangkapan layar yang terbaca. */
export function cleanScreenshots(value: unknown): AgentScreenshots | null {
  if (!isRecord(value)) return null;
  const filled = cleanShot(value.filled);
  const after = cleanShot(value.after);
  return filled || after ? { filled, after } : null;
}

function cleanRemaining(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const label = cleanText(item, 400);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
    if (out.length >= 20) break;
  }
  return out;
}

/**
 * Satu baris application_logs ({ status, details, created_at }) -> fakta percobaan agen. Tidak melempar:
 * baris yang bukan objek atau tanpa details menghasilkan fakta kosong (log lama).
 */
export function agentLogFacts(row: unknown): AgentLogFacts {
  if (!isRecord(row)) return {};
  const details = isRecord(row.details) ? row.details : {};
  const check = isRecord(details.submit_check) ? details.submit_check : null;
  return {
    log_status: cleanText(row.status, 40),
    submit_check_verdict: check ? cleanText(check.verdict, 40) : null,
    confirmation_phrase: check ? cleanText(check.confirmation_phrase, 160) : null,
    reason: cleanText(details.reason, 40),
    submit_blocked: cleanText(details.submit_blocked, 40),
    remaining_required: cleanRemaining(details.remaining_required),
    questions: parseQuestions(details.questions),
    fields_filled: cleanCount(details.fields_filled),
    filled_fields: cleanFilledFields(details.filled_fields),
    screenshots: cleanScreenshots(details.screenshots),
    logged_at: typeof row.created_at === "string" && !Number.isNaN(Date.parse(row.created_at)) ? row.created_at : null,
  };
}

/** Percobaan agen terbaru per lowongan (kunci: jobs.id) sebagai fakta; lowongan tanpa log tidak ikut. */
export function agentFactsByJob(rows: unknown, jobIds: unknown): Record<string, AgentLogFacts> {
  if (!Array.isArray(jobIds)) return {};
  const out: Record<string, AgentLogFacts> = {};
  for (const id of jobIds) {
    if (typeof id !== "string" || !id || out[id]) continue;
    const newest = newestRow(rows, id);
    if (newest) out[id] = agentLogFacts(newest);
  }
  return out;
}

/** True bila ada sesuatu yang bisa diperlihatkan sebagai bukti: tangkapan layar atau daftar isian. */
export function hasAgentEvidence(facts: AgentLogFacts | null | undefined): boolean {
  if (!facts) return false;
  return (facts.filled_fields?.length ?? 0) > 0 || !!facts.screenshots?.filled || !!facts.screenshots?.after;
}

export const SCREENSHOT_ERROR_TEXT = "Gambar belum bisa dibuka. Coba lagi sebentar lagi.";
export const SCREENSHOT_MISSING_TEXT = "Gambar tidak ditemukan. Mungkin sudah dihapus.";
export const SCREENSHOT_LOAD_FAILED_TEXT = "Gambar tidak bisa dimuat. Tautannya mungkin sudah kedaluwarsa.";

/**
 * Hasil `createSignedUrl` -> tautan yang dipakai, atau pesan galat singkat. Bila tautan bertanda tangan gagal
 * dibuat tetapi worker menyimpan tautan cadangan, tautan itu dipakai (bisa sudah kedaluwarsa; gambar yang gagal
 * dimuat ditangani tampilan).
 */
export function signedUrlOutcome(
  res: { data?: { signedUrl?: string | null } | null; error?: { message?: string } | null } | null | undefined,
  fallbackUrl?: string | null,
): { url: string; fallback: boolean } | { error: string } {
  const signed = cleanHttpUrl(res?.data?.signedUrl);
  if (signed && !res?.error) return { url: signed, fallback: false };
  const backup = cleanHttpUrl(fallbackUrl);
  if (backup) return { url: backup, fallback: true };
  const message = res?.error?.message ?? "";
  return { error: /not.?found|404/i.test(message) ? SCREENSHOT_MISSING_TEXT : SCREENSHOT_ERROR_TEXT };
}

/** Nilai satu isian untuk ditampilkan. Isian tanpa nilai dijelaskan lewat jenisnya, bukan dikarang. */
export function fieldValueText(field: AgentFilledField): string {
  if (field.value) return field.value;
  switch (field.kind) {
    case "check":
      return "dicentang";
    case "upload":
      return "berkas diunggah";
    case "select":
      return "dipilih";
    default:
      return "tidak dicatat";
  }
}

/** "23 November 2026, 14.05" untuk waktu percobaan; null bila tanggalnya tidak terbaca. */
export function formatAttemptTime(iso: string | null | undefined, timeZone?: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(t));
}
