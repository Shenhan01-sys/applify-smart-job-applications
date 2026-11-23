import { useEffect, useId, useState } from "react";
import { AlertCircle, Loader2, Pencil, Trash2 } from "lucide-react";
import { ANSWERS_TABLE_MISSING_TEXT, MAX_ANSWER_LENGTH } from "@/lib/formQuestions";
import {
  AnswersTableMissingError,
  deleteAnswer,
  describeAnswerError,
  listAnswers,
  saveAnswers,
  type SavedAnswer,
} from "@/services/formAnswerService";

export const SAVED_ANSWERS_EMPTY_TEXT =
  "Belum ada jawaban tersimpan. Jawaban muncul di sini setelah kamu menjawab pertanyaan agen di halaman Persetujuan.";

const BUTTON =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg border-2 border-black/[8%] bg-black/[4%] px-3 text-sm hover:bg-black/[7%] transition disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Jawaban formulir yang tersimpan (tabel user_form_answers), untuk dilihat, diubah, dan dihapus. Agen memakai
 * jawaban ini lagi saat menemui pertanyaan yang sama di lowongan lain. Dibaca dengan sesi pengguna sendiri.
 */
export default function SavedAnswers() {
  const uid = useId();
  const [rows, setRows] = useState<SavedAnswer[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [missing, setMissing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const load = () => {
    setLoadError("");
    setRows(null);
    listAnswers()
      .then(setRows)
      .catch((err) => {
        if (err instanceof AnswersTableMissingError) setMissing(true);
        else setLoadError("Jawaban tersimpan belum bisa dimuat. Coba lagi.");
      });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const startEdit = (row: SavedAnswer) => {
    setEditingId(row.id);
    setDraft(row.answer);
    setConfirmId(null);
    setRowError(null);
  };

  const saveEdit = async (row: SavedAnswer) => {
    const answer = draft.trim();
    if (!answer) return setRowError({ id: row.id, message: "Isi jawaban ini." });
    if (answer.length > MAX_ANSWER_LENGTH) return setRowError({ id: row.id, message: `Jawaban terlalu panjang. Maksimal ${MAX_ANSWER_LENGTH} karakter.` });
    setBusyId(row.id);
    setRowError(null);
    try {
      await saveAnswers([{ question_key: row.question_key, question_label: row.question_label, answer }]);
      setRows((list) => (list ?? []).map((r) => (r.id === row.id ? { ...r, answer, updated_at: new Date().toISOString() } : r)));
      setEditingId(null);
    } catch (err) {
      setRowError({ id: row.id, message: describeAnswerError(err, "Jawaban belum bisa disimpan. Coba lagi.") });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: SavedAnswer) => {
    setBusyId(row.id);
    setRowError(null);
    try {
      await deleteAnswer(row.id);
      setRows((list) => (list ?? []).filter((r) => r.id !== row.id));
      setConfirmId(null);
    } catch (err) {
      setRowError({ id: row.id, message: describeAnswerError(err, "Jawaban belum bisa dihapus. Coba lagi.") });
    } finally {
      setBusyId(null);
    }
  };

  if (missing) {
    return <p role="status" className="mt-4 rounded-lg border-2 border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">{ANSWERS_TABLE_MISSING_TEXT}</p>;
  }
  if (loadError) {
    return (
      <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-red-700">
        <span className="inline-flex items-center gap-1.5"><AlertCircle className="h-4 w-4" aria-hidden="true" /> {loadError}</span>
        <button type="button" onClick={load} className={BUTTON}>Coba lagi</button>
      </div>
    );
  }
  if (rows === null) {
    return (
      <p role="status" className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Memuat jawaban...
      </p>
    );
  }
  if (rows.length === 0) return <p className="mt-4 text-sm text-muted-foreground">{SAVED_ANSWERS_EMPTY_TEXT}</p>;

  return (
    <ul className="mt-4 space-y-2">
      {rows.map((row) => {
        const editing = editingId === row.id;
        const busy = busyId === row.id;
        const error = rowError?.id === row.id ? rowError.message : "";
        return (
          <li key={row.id} className="rounded-xl border-2 border-black/[8%] bg-white px-3 py-2.5">
            <p className="line-clamp-2 break-words text-xs font-semibold" title={row.question_label}>{row.question_label}</p>
            {editing ? (
              <div className="mt-1.5">
                <label htmlFor={`${uid}-${row.id}`} className="sr-only">Jawaban untuk: {row.question_label}</label>
                <textarea
                  id={`${uid}-${row.id}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={3}
                  maxLength={MAX_ANSWER_LENGTH}
                  disabled={busy}
                  aria-invalid={!!error}
                  className="w-full rounded-lg bg-white border-2 border-black/[10%] px-3 py-2 text-base md:text-sm focus:border-[#0A5BE0]/50 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 aria-[invalid=true]:border-red-400"
                />
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => saveEdit(row)} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#0A5BE0] px-4 text-sm font-semibold text-white hover:bg-[#0256d3] transition disabled:cursor-not-allowed disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Simpan
                  </button>
                  <button type="button" onClick={() => { setEditingId(null); setRowError(null); }} disabled={busy} className={BUTTON}>Batal</button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-0.5 line-clamp-2 break-words text-sm text-muted-foreground" title={row.answer}>{row.answer}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {confirmId === row.id ? (
                    <>
                      <span className="text-xs">Hapus jawaban ini?</span>
                      <button type="button" onClick={() => remove(row)} disabled={busy} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 transition disabled:cursor-not-allowed disabled:opacity-60">
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Ya, hapus
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)} disabled={busy} className={BUTTON}>Batal</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => startEdit(row)} className={BUTTON} aria-label={`Ubah jawaban: ${row.question_label}`}>
                        <Pencil className="h-4 w-4" aria-hidden="true" /> Ubah
                      </button>
                      <button type="button" onClick={() => { setConfirmId(row.id); setRowError(null); }} className={BUTTON} aria-label={`Hapus jawaban: ${row.question_label}`}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" /> Hapus
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" /> {error}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
