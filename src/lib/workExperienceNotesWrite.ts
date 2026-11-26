/**
 * Penulisan `work_experiences` yang aman sebelum kolom `notes` dimigrasi (DRAFT_2026-11-26_work_experiences_notes.sql).
 *
 * Insert atau update dengan kolom yang belum ada gagal dengan 42703 (Postgres) atau PGRST204 (PostgREST). Di sini
 * penulisan pertama dicoba lengkap. Bila galatnya soal kolom `notes`, penulisan diulang tanpa `notes` dan status itu
 * diingat sementara supaya penulisan berikutnya tidak gagal dua kali. Ingatan itu kedaluwarsa (TTL), jadi sesudah
 * kolom dibuat, tab yang masih terbuka mulai menulis `notes` lagi tanpa perlu dimuat ulang.
 *
 * Modul ini tanpa impor supaya bisa diuji langsung dengan node:test.
 */

export const WORK_EXP_NOTES_UNSUPPORTED_TTL_MS = 5 * 60 * 1000;

let notesUnsupportedAt: number | null = null;

/** Hapus ingatan "kolom notes belum ada" (untuk pengujian). */
export function resetWorkExperienceNotesWriteCache(): void {
  notesUnsupportedAt = null;
}

function notesKnownUnsupported(now: number): boolean {
  if (notesUnsupportedAt === null) return false;
  if (now - notesUnsupportedAt >= WORK_EXP_NOTES_UNSUPPORTED_TTL_MS) {
    notesUnsupportedAt = null;
    return false;
  }
  return true;
}

/**
 * True hanya bila galat menyebut kolom `notes` yang hilang. Galat 42703 untuk kolom lain tidak boleh membuat `notes`
 * dibuang dan ditandai tidak didukung.
 */
export function isMissingWorkExpNotesError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const msg = String(error.message ?? "");
  const columnError = code === "42703" || code === "PGRST204" || /does not exist|schema cache/i.test(msg);
  return columnError && /\bnotes\b/i.test(msg);
}

export async function writeWorkExperienceWithNotesFallback<
  D extends object,
  T extends { data: unknown; error: { message?: string; code?: string } | null },
>(
  data: D,
  runFull: () => PromiseLike<T>,
  runWithoutNotes: (stripped: Omit<D, "notes">) => PromiseLike<T>,
  now: number = Date.now(),
): Promise<T> {
  if (!("notes" in data)) return runFull();
  const { notes: _omit, ...withoutNotes } = data as D & { notes?: unknown };
  if (notesKnownUnsupported(now)) return runWithoutNotes(withoutNotes as Omit<D, "notes">);
  const res = await runFull();
  if (res?.error && isMissingWorkExpNotesError(res.error)) {
    notesUnsupportedAt = now;
    return runWithoutNotes(withoutNotes as Omit<D, "notes">);
  }
  return res;
}
