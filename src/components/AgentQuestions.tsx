import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, HelpCircle, Loader2 } from "lucide-react";
import { isAgentApplyActive, type AgentApplyRow } from "@/lib/agentApplyStatus";
import {
  ANSWERS_TABLE_MISSING_TEXT,
  ANSWER_NO,
  ANSWER_YES,
  MAX_ANSWER_LENGTH,
  RERUN_STARTED_TEXT,
  answersToRows,
  initialAnswers,
  questionsToAnswer,
  validateAnswers,
  type PendingQuestion,
} from "@/lib/formQuestions";
import {
  AnswersTableMissingError,
  answersByKey,
  describeAnswerError,
  describeRerunError,
  listAnswers,
  rerunApproval,
  saveAnswers,
} from "@/services/formAnswerService";

const INTRO =
  "Agen berhenti sebelum kirim karena pertanyaan ini tidak bisa dijawab dari profilmu. Jawabanmu disimpan dan dipakai lagi untuk lowongan lain.";
const SUBMIT_LABEL = "Simpan jawaban dan jalankan agen lagi";
const SELECT_NO_OPTIONS_HINT = "Tulis persis seperti pilihan di formulir";

const INPUT_CLASS =
  "mt-1 w-full rounded-lg bg-white border-2 border-black/[10%] px-3 text-base md:text-sm focus:border-[#0A5BE0]/50 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 aria-[invalid=true]:border-red-400";

interface Props {
  approvalId: string;
  row: AgentApplyRow | null | undefined;
  /** Dipanggil sesudah backend menerima tugas ulang, supaya halaman memperbarui status agen dan memulai polling. */
  onRerun: (approvalId: string) => void;
}

/**
 * "Agen butuh jawabanmu": pertanyaan wajib yang tidak bisa dijawab agen dari profil (log percobaan terbaru,
 * details.questions). Muncul hanya bila percobaan terbaru belum terkirim dan tidak ada tugas agen yang sedang
 * berjalan. Jawaban disimpan ke bank jawaban (user_form_answers), lalu tugas apply yang sama diantrekan ulang.
 */
export default function AgentQuestions({ approvalId, row, onRerun }: Props) {
  const questions = questionsToAnswer(row);
  const active = isAgentApplyActive(row);
  const [started, setStarted] = useState(false);

  // Catatan "Agen berjalan lagi" hanya selama tugas ulang itu berjalan; sesudah selesai, formulir (bila masih
  // ada pertanyaan) atau tidak ada apa-apa yang tampil.
  const wasActive = useRef(false);
  useEffect(() => {
    if (active) wasActive.current = true;
    else if (wasActive.current) {
      wasActive.current = false;
      setStarted(false);
    }
  }, [active]);

  if (active) return started ? <StartedNote /> : null;
  if (questions.length === 0) return null;
  const formKey = `${questions.map((q) => q.key).join("\u0001")}|${row?.logged_at ?? ""}`;
  return (
    <QuestionForm
      key={formKey}
      approvalId={approvalId}
      questions={questions}
      onStarted={() => {
        setStarted(true);
        onRerun(approvalId);
      }}
    />
  );
}

function StartedNote() {
  return (
    <div role="status" className="mt-3 flex items-center gap-1.5 rounded-xl border-2 border-green-300 bg-green-50 px-3 py-2.5 text-xs font-semibold text-green-900">
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {RERUN_STARTED_TEXT}
    </div>
  );
}

function QuestionForm({ approvalId, questions, onStarted }: { approvalId: string; questions: PendingQuestion[]; onStarted: () => void }) {
  const uid = useId();
  const [answers, setAnswers] = useState<Record<string, string>>(() => initialAnswers(questions, null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);

  // Isi lebih dulu dari jawaban tersimpan (kunci pertanyaan sama), tanpa menimpa yang sudah diketik pengguna.
  useEffect(() => {
    let alive = true;
    listAnswers()
      .then((rows) => {
        if (!alive) return;
        const prefill = initialAnswers(questions, answersByKey(rows));
        setAnswers((prev) => {
          const next = { ...prev };
          for (const q of questions) if (!prev[q.key] && prefill[q.key]) next[q.key] = prefill[q.key];
          return next;
        });
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof AnswersTableMissingError) setTableMissing(true);
        else console.warn("[agentQuestions] jawaban tersimpan belum bisa dimuat:", err);
      });
    return () => {
      alive = false;
    };
    // questions tidak berubah selama formulir ini hidup (kuncinya mengikuti pertanyaan)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setAnswer = (key: string, value: string) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    if (errors[key]) setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
    if (formError) setFormError("");
  };

  const fieldId = (i: number) => `${uid}-q${i}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || tableMissing) return;
    setFormError("");
    const check = validateAnswers(questions, answers);
    setErrors(check.errors);
    if (!check.ok) {
      setFormError("Lengkapi semua jawaban dulu. Pertanyaan yang belum dijawab ditandai di atas.");
      const first = questions.findIndex((q) => check.errors[q.key]);
      if (first >= 0) document.getElementById(fieldId(first))?.focus();
      return;
    }
    setBusy(true);
    try {
      await saveAnswers(answersToRows(questions, answers));
    } catch (err) {
      if (err instanceof AnswersTableMissingError) setTableMissing(true);
      setFormError(describeAnswerError(err, "Jawabanmu belum bisa disimpan. Coba lagi."));
      setBusy(false);
      return;
    }
    try {
      await rerunApproval(approvalId);
    } catch (err) {
      setFormError(`Jawabanmu sudah tersimpan. ${describeRerunError(err)}`);
      setBusy(false);
      return;
    }
    onStarted();
  }

  const headingId = `${uid}-heading`;
  return (
    <section aria-labelledby={headingId} className="mt-3 rounded-xl border-2 border-black/[8%] bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={headingId} className="inline-flex items-center gap-2 text-xs font-semibold">
          <HelpCircle className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" /> Agen butuh jawabanmu
        </h4>
        <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
          {questions.length} pertanyaan
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{INTRO}</p>

      <form onSubmit={submit} noValidate className="mt-3 space-y-3">
        {questions.map((q, i) => {
          const id = fieldId(i);
          const errId = `${id}-err`;
          const hintId = `${id}-hint`;
          const err = errors[q.key];
          const value = answers[q.key] ?? "";
          const selectNoOptions = q.kind === "select" && !q.options;
          const describedBy = [err ? errId : "", selectNoOptions ? hintId : ""].filter(Boolean).join(" ") || undefined;
          const labelClass = "block text-xs font-semibold leading-snug break-words";

          let control: React.ReactNode;
          if (q.kind === "check") {
            control = (
              <fieldset aria-describedby={describedBy} disabled={busy}>
                <legend className={labelClass}>{q.label}</legend>
                <div className="mt-1.5 flex gap-4">
                  {[
                    { v: ANSWER_YES, text: "Ya" },
                    { v: ANSWER_NO, text: "Tidak" },
                  ].map((opt, n) => (
                    <label key={opt.v} className="inline-flex min-h-11 items-center gap-2 text-sm">
                      <input
                        id={n === 0 ? id : undefined}
                        type="radio"
                        name={id}
                        value={opt.v}
                        checked={value === opt.v}
                        onChange={() => setAnswer(q.key, opt.v)}
                        aria-invalid={!!err}
                        className="h-4 w-4 accent-[#0A5BE0]"
                      />
                      {opt.text}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          } else if ((q.kind === "select" || q.kind === "radio") && q.options) {
            control = (
              <>
                <label htmlFor={id} className={labelClass}>{q.label}</label>
                <select
                  id={id}
                  value={value}
                  onChange={(e) => setAnswer(q.key, e.target.value)}
                  disabled={busy}
                  aria-invalid={!!err}
                  aria-describedby={describedBy}
                  className={`${INPUT_CLASS} min-h-11`}
                >
                  <option value="">Pilih jawaban</option>
                  {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </>
            );
          } else if (q.kind === "textarea") {
            control = (
              <>
                <label htmlFor={id} className={labelClass}>{q.label}</label>
                <textarea
                  id={id}
                  value={value}
                  onChange={(e) => setAnswer(q.key, e.target.value)}
                  disabled={busy}
                  rows={4}
                  maxLength={MAX_ANSWER_LENGTH}
                  aria-invalid={!!err}
                  aria-describedby={describedBy}
                  className={`${INPUT_CLASS} py-2 resize-y`}
                />
              </>
            );
          } else {
            control = (
              <>
                <label htmlFor={id} className={labelClass}>{q.label}</label>
                <input
                  id={id}
                  type="text"
                  value={value}
                  onChange={(e) => setAnswer(q.key, e.target.value)}
                  disabled={busy}
                  maxLength={MAX_ANSWER_LENGTH}
                  autoComplete="off"
                  aria-invalid={!!err}
                  aria-describedby={describedBy}
                  className={`${INPUT_CLASS} min-h-11`}
                />
                {selectNoOptions && <p id={hintId} className="mt-1 text-xs text-muted-foreground">{SELECT_NO_OPTIONS_HINT}</p>}
              </>
            );
          }

          return (
            <div key={q.key}>
              {control}
              {err && (
                <p id={errId} className="mt-1 flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" /> {err}
                </p>
              )}
            </div>
          );
        })}

        {tableMissing && (
          <p role="status" className="rounded-lg border-2 border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            {ANSWERS_TABLE_MISSING_TEXT}
          </p>
        )}
        {formError && (
          <p role="alert" className="rounded-lg border-2 border-red-100 bg-red-50 p-2 text-xs text-red-700">
            {formError}
          </p>
        )}

        <div>
          <button
            type="submit"
            disabled={busy || tableMissing}
            aria-busy={busy}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#0A5BE0] px-4 text-sm font-semibold text-white transition hover:bg-[#0256d3] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? "Menyimpan dan menjalankan agen..." : SUBMIT_LABEL}
          </button>
          <p className="mt-1.5 text-xs text-muted-foreground">Jangan menulis kata sandi di sini.</p>
        </div>
      </form>
    </section>
  );
}
