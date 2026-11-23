import { supabase } from "@/lib/supabase";
import { isMockMode } from "@/lib/appConfig";
import { describeApiError } from "@/lib/apiErrors";
import { automationApi } from "@/services/automationApi";
import {
  ANSWERS_TABLE_MISSING_TEXT,
  MAX_ANSWER_LENGTH,
  isMissingAnswersTable,
  rerunStatusMessage,
  type AnswerRow,
} from "@/lib/formQuestions";

/**
 * Bank jawaban formulir (tabel user_form_answers) dan pemicu jalan ulang agen.
 *
 * Pengguna menjawab pertanyaan yang tidak bisa dijawab agen dari profil; jawabannya disimpan per kunci
 * pertanyaan (lihat questionKey) dan dipakai lagi oleh worker untuk lowongan lain. Dibaca dan ditulis
 * dengan sesi pengguna sendiri (RLS hanya mengizinkan baris sendiri). Tabelnya mungkin belum ada di database
 * (migrasi belum dijalankan): galatnya dilempar sebagai AnswersTableMissingError dengan pesan untuk pengguna.
 */

export interface SavedAnswer {
  id: string;
  question_key: string;
  question_label: string;
  answer: string;
  updated_at: string | null;
}

/** Tabel user_form_answers belum ada di database. `message` sudah berbahasa Indonesia dan siap ditampilkan. */
export class AnswersTableMissingError extends Error {
  code = "answers_table_missing";
  constructor() {
    super(ANSWERS_TABLE_MISSING_TEXT);
    this.name = "AnswersTableMissingError";
  }
}

/** Galat yang pesannya sudah berbahasa Indonesia dan boleh ditampilkan apa adanya. */
export class AnswerInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnswerInputError";
  }
}

const TABLE = "user_form_answers";

// Mode demo tidak memanggil Supabase: jawaban hanya hidup di memori selama halaman terbuka.
let mockRows: SavedAnswer[] = [];

function fail(error: unknown): never {
  if (isMissingAnswersTable(error)) throw new AnswersTableMissingError();
  throw error;
}

function cleanRow(row: unknown): SavedAnswer | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.question_key !== "string" || typeof r.answer !== "string") return null;
  return {
    id: r.id,
    question_key: r.question_key,
    question_label: typeof r.question_label === "string" && r.question_label ? r.question_label : r.question_key,
    answer: r.answer,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
  };
}

/** Semua jawaban tersimpan milik pengguna, yang terbaru diubah lebih dulu. */
export async function listAnswers(): Promise<SavedAnswer[]> {
  if (isMockMode()) return [...mockRows];
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, question_key, question_label, answer, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) fail(error);
  return (data ?? []).map(cleanRow).filter((r): r is SavedAnswer => r !== null);
}

/** Jawaban per kunci pertanyaan, untuk mengisi formulir lebih dulu (initialAnswers). */
export function answersByKey(rows: readonly SavedAnswer[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) out[r.question_key] = r.answer;
  return out;
}

/** Simpan atau perbarui jawaban (kunci unik per pengguna). Baris dengan jawaban kosong atau terlalu panjang ditolak. */
export async function saveAnswers(rows: readonly AnswerRow[]): Promise<void> {
  if (rows.length === 0) throw new AnswerInputError("Belum ada jawaban untuk disimpan.");
  for (const r of rows) {
    if (!r.question_key || !r.question_label || !r.answer.trim() || r.answer.length > MAX_ANSWER_LENGTH) {
      throw new AnswerInputError("Jawaban kosong atau terlalu panjang. Periksa lagi isiannya.");
    }
  }
  if (isMockMode()) {
    for (const r of rows) {
      const next: SavedAnswer = { id: `mock-${r.question_key}`, ...r, updated_at: new Date().toISOString() };
      mockRows = [next, ...mockRows.filter((m) => m.question_key !== r.question_key)];
    }
    return;
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AnswerInputError("Sesi login berakhir. Masuk lagi, lalu simpan jawabanmu.");
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(TABLE)
    .upsert(rows.map((r) => ({ user_id: user.id, ...r, updated_at: now })), { onConflict: "user_id,question_key" });
  if (error) fail(error);
}

/** Hapus satu jawaban tersimpan milik pengguna. */
export async function deleteAnswer(id: string): Promise<void> {
  if (!id) throw new AnswerInputError("Jawaban tidak dikenali.");
  if (isMockMode()) {
    mockRows = mockRows.filter((m) => m.id !== id);
    return;
  }
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) fail(error);
}

/**
 * Antrekan ulang tugas apply yang sama untuk persetujuan ini (POST /api/approvals/:id/rerun) supaya agen
 * berjalan lagi dengan jawaban tersimpan. Melempar ApiError bila backend menolak; pakai describeRerunError.
 */
export async function rerunApproval(approvalId: string): Promise<{ queue_job_id: string | null }> {
  const res = await automationApi.rerunApproval(approvalId);
  if (!res || res.success !== true) throw new Error("Agen belum bisa dijalankan lagi.");
  return { queue_job_id: typeof res.queue_job_id === "string" ? res.queue_job_id : null };
}

/** Galat rerunApproval -> pesan singkat untuk pengguna (404, 409, 410, 422, 429 dijelaskan satu per satu). */
export function describeRerunError(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status;
  return rerunStatusMessage(typeof status === "number" ? status : undefined) ?? describeApiError(err, "Agen belum bisa dijalankan lagi.");
}

/** Galat bank jawaban -> pesan untuk pengguna: tabel belum ada dan galat masukan dijelaskan, selainnya memakai `fallback`. */
export function describeAnswerError(err: unknown, fallback: string): string {
  if (err instanceof AnswersTableMissingError || err instanceof AnswerInputError) return err.message;
  if (isMissingAnswersTable(err)) return ANSWERS_TABLE_MISSING_TEXT;
  return fallback;
}
