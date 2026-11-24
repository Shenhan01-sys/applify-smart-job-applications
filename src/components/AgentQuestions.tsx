import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, HelpCircle, Loader2 } from "lucide-react";
import { isAgentApplyActive, type AgentApplyRow } from "@/lib/agentApplyStatus";
import {
  ANSWERS_TABLE_MISSING_TEXT,
  ANSWER_NO,
  ANSWER_YES,
  ERROR_NO_ANSWERS,
  EXTENSION_ANSWERS_SAVED_TEXT,
  MAX_ANSWER_LENGTH,
  RERUN_STARTED_TEXT,
  SELF_FILL_LABEL,
  answersToRows,
  fileUploadInstruction,
  initialAnswers,
  questionsToAnswer,
  questionsToSelfFill,
  questionsToUpload,
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
const EXTENSION_INTRO =
  "Ekstensi Browser berhenti sebelum kirim karena pertanyaan ini tidak bisa dijawab dari profilmu. Jawabanmu disimpan dan dipakai lagi untuk lowongan lain.";
const SELF_FILL_INTRO =
  "Kolom ini berisi data rahasia, jadi tidak diisi otomatis dan tidak disimpan di Applify. Isi sendiri langsung di halaman lowongan.";
const SUBMIT_LABEL = "Simpan jawaban dan jalankan agen lagi";
const EXTENSION_SUBMIT_LABEL = "Simpan jawaban";
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
 * "Agen butuh jawabanmu": pertanyaan yang tidak bisa dijawab agen dari profil (log percobaan terbaru,
 * details.questions). Muncul hanya bila percobaan terbaru belum terkirim dan tidak ada tugas agen yang sedang
 * berjalan. Jawaban disimpan ke bank jawaban (user_form_answers).
 *
 * Log worker: lalu tugas apply yang sama diantrekan ulang (POST /api/approvals/:id/rerun).
 * Log Ekstensi Browser (`row.channel === "extension"`): tidak ada tugas worker yang dijalankan ulang. Pengguna
 * kembali ke tab lowongan dan mengisi ulang dari panel ekstensi.
 * Kolom rahasia (`kind: "secret_skip"`) tidak punya isian: hanya ditampilkan sebagai "Isi sendiri di halaman lowongan".
 * Berkas yang tidak terpasang (`kind: "file"`, mis. "Unggah CV secara manual") juga tanpa isian: ditampilkan sebagai
 * petunjuk untuk mengunggahnya sendiri di tab lowongan.
 */
export default function AgentQuestions({ approvalId, row, onRerun }: Props) {
  const questions = questionsToAnswer(row);
  const selfFill = questionsToSelfFill(row);
  const uploads = questionsToUpload(row);
  const extension = row?.channel === "extension";
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
  if (questions.length === 0 && selfFill.length === 0 && uploads.length === 0) return null;
  // Hanya kolom rahasia dan berkas: tidak ada yang bisa dijawab di sini, jadi tidak ada formulir dan tombol simpan.
  if (questions.length === 0) return <SelfFillCard questions={selfFill} uploads={uploads} />;
  const formKey = `${[...questions, ...selfFill, ...uploads].map((q) => q.key).join("\u0001")}|${row?.logged_at ?? ""}`;
  return (
    <QuestionForm
      key={formKey}
      approvalId={approvalId}
      questions={questions}
      selfFill={selfFill}
      uploads={uploads}
      extension={extension}
      onStarted={() => {
        setStarted(true);
        onRerun(approvalId);
      }}
    />
  );
}

function SelfFillCard({ questions, uploads }: { questions: PendingQuestion[]; uploads: PendingQuestion[] }) {
  const headingId = `${useId()}-heading`;
  return (
    <section aria-labelledby={headingId} className="mt-3 rounded-xl border-2 border-black/[8%] bg-white px-3 py-2.5">
      <h4 id={headingId} className="inline-flex items-center gap-2 text-xs font-semibold">
        <HelpCircle className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" /> {SELF_FILL_LABEL}
      </h4>
      <SelfFillList questions={questions} />
      <UploadList questions={uploads} />
    </section>
  );
}

/** Kolom rahasia (`secret_skip`): hanya label dan keterangan, tanpa kolom isian. */
function SelfFillList({ questions }: { questions: PendingQuestion[] }) {
  if (questions.length === 0) return null;
  return (
    <div data-testid="agent-self-fill" className="mt-3">
      <p className="text-xs text-muted-foreground leading-relaxed">{SELF_FILL_INTRO}</p>
      <ul className="mt-2 space-y-2">
        {questions.map((q) => (
          <li key={q.key} className="rounded-lg border-2 border-black/[8%] px-3 py-2">
            <span className="block text-xs font-semibold leading-snug break-words">
              {q.label}
              {q.required === true && <span className="ml-1 font-normal text-muted-foreground">(wajib)</span>}
            </span>
            <span className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
              {SELF_FILL_LABEL}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Berkas yang harus diunggah sendiri (`file`): hanya petunjuk, tanpa kolom isian. */
function UploadList({ questions }: { questions: PendingQuestion[] }) {
  if (questions.length === 0) return null;
  return (
    <div data-testid="agent-file-upload" className="mt-3">
      <ul className="space-y-2">
        {questions.map((q) => (
          <li key={q.key} className="rounded-lg border-2 border-black/[8%] px-3 py-2 text-xs font-semibold leading-snug break-words">
            {fileUploadInstruction(q.label)}
            {q.required === true && <span className="ml-1 font-normal text-muted-foreground">(wajib)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StartedNote() {
  return (
    <div role="status" className="mt-3 flex items-center gap-1.5 rounded-xl border-2 border-green-300 bg-green-50 px-3 py-2.5 text-xs font-semibold text-green-900">
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {RERUN_STARTED_TEXT}
    </div>
  );
}

function QuestionForm({
  approvalId,
  questions,
  selfFill,
  uploads,
  extension,
  onStarted,
}: {
  approvalId: string;
  questions: PendingQuestion[];
  selfFill: PendingQuestion[];
  uploads: PendingQuestion[];
  extension: boolean;
  onStarted: () => void;
}) {
  const uid = useId();
  const [answers, setAnswers] = useState<Record<string, string>>(() => initialAnswers(questions, null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  // Hanya log ekstensi: jawaban sudah tersimpan dan pengguna diminta kembali ke tab lowongan.
  const [savedForExtension, setSavedForExtension] = useState(false);

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
    if (savedForExtension) setSavedForExtension(false);
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
    const rows = answersToRows(questions, answers);
    if (rows.length === 0) {
      setFormError(ERROR_NO_ANSWERS);
      return;
    }
    setBusy(true);
    try {
      await saveAnswers(rows);
    } catch (err) {
      if (err instanceof AnswersTableMissingError) setTableMissing(true);
      setFormError(describeAnswerError(err, "Jawabanmu belum bisa disimpan. Coba lagi."));
      setBusy(false);
      return;
    }
    // Log ekstensi tidak punya tugas worker: jangan memanggil rerun. Pengguna mengisi ulang dari panel ekstensi.
    if (extension) {
      setSavedForExtension(true);
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
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{extension ? EXTENSION_INTRO : INTRO}</p>

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
          // Penanda dari log ekstensi (`required`); log worker tidak punya kunci ini dan semuanya wajib.
          const labelText = (
            <>
              {q.label}
              {q.required === true && <span className="ml-1 font-normal text-muted-foreground">(wajib)</span>}
              {q.required === false && <span className="ml-1 font-normal text-muted-foreground">(opsional)</span>}
            </>
          );

          let control: React.ReactNode;
          if (q.kind === "check") {
            control = (
              <fieldset aria-describedby={describedBy} disabled={busy}>
                <legend className={labelClass}>{labelText}</legend>
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
                <label htmlFor={id} className={labelClass}>{labelText}</label>
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
                <label htmlFor={id} className={labelClass}>{labelText}</label>
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
                <label htmlFor={id} className={labelClass}>{labelText}</label>
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
        {savedForExtension && (
          <p role="status" className="flex items-start gap-1.5 rounded-lg border-2 border-green-300 bg-green-50 p-2 text-xs font-semibold text-green-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {EXTENSION_ANSWERS_SAVED_TEXT}
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
            {busy ? (extension ? "Menyimpan jawaban..." : "Menyimpan dan menjalankan agen...") : extension ? EXTENSION_SUBMIT_LABEL : SUBMIT_LABEL}
          </button>
          <p className="mt-1.5 text-xs text-muted-foreground">Jangan menulis kata sandi di sini.</p>
        </div>
      </form>

      <SelfFillList questions={selfFill} />
      <UploadList questions={uploads} />
    </section>
  );
}
