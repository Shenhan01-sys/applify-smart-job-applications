import { useEffect, useId, useRef, useState } from "react";
import { Check, CheckCircle2, Copy, ExternalLink, FileText, Loader2, RotateCcw, Send } from "lucide-react";
import type { AgentApplyRow } from "@/lib/agentApplyStatus";
import {
  COPIED_TEXT,
  COPY_LETTER_LABEL,
  COPY_PANEL_LABEL,
  LETTER_LOADING_TEXT,
  LETTER_UNAVAILABLE_TEXT,
  MANUAL_HEADING,
  MANUAL_STEPS_TEXT,
  MARKED_HINT,
  MARKED_TEXT,
  MARK_CONFIRM_NO_LABEL,
  MARK_CONFIRM_TEXT,
  MARK_CONFIRM_YES_LABEL,
  MARK_SENT_BUSY_LABEL,
  MARK_SENT_LABEL,
  NO_JOB_URL_TEXT,
  OPEN_FORM_LABEL,
  RERUN_BUSY_LABEL,
  RERUN_LABEL,
  RERUN_NOTE_TEXT,
  cleanCoverLetter,
  copyText,
  copyableFields,
  isManualSent,
  manualSubmitState,
  markSentErrorMessage,
  safeJobUrl,
} from "@/lib/manualSubmit";
import { describeRerunError, rerunApproval } from "@/services/formAnswerService";
import { loadApprovedCoverLetter, markApprovalSent } from "@/services/manualSubmitService";

const PRIMARY = "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#0A5BE0] px-4 text-sm font-semibold text-white transition hover:bg-[#0256d3] disabled:cursor-not-allowed disabled:opacity-60";
const DARK = "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#16150F] px-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";
const OUTLINE = "inline-flex min-h-11 items-center gap-1.5 rounded-lg border-2 border-[#999999] bg-white px-4 text-sm font-semibold transition hover:bg-black/[4%] disabled:cursor-not-allowed disabled:opacity-60";
const COPY_BUTTON = "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border-2 border-black/[10%] bg-white px-3 text-xs font-semibold transition hover:bg-black/[4%]";

type LetterState = { phase: "idle" | "loading" | "error" } | { phase: "ready"; text: string | null };

interface Props {
  /** Persetujuan yang dipakai percobaan agen. Tanpa ini tombol tandai dan coba lagi tidak tampil. */
  approvalId?: string | null;
  /** Percobaan agen terbaru (fakta dari log, dan status tugas bila ada). */
  row: AgentApplyRow | null | undefined;
  /** jobs.external_url. Hanya alamat http(s) yang dipakai. */
  jobUrl?: string | null;
  /** Cover letter yang disetujui. Dibiarkan kosong (undefined) bersama loadCoverLetter agar dimuat dari persetujuan. */
  coverLetter?: string | null;
  loadCoverLetter?: boolean;
  /** Sesudah backend menerima tugas ulang, supaya halaman memperbarui status agen dan memulai polling. */
  onRerun?: (approvalId: string) => void;
  /** Sesudah backend mencatat tanda terkirim, supaya halaman memuat ulang datanya (papan pindah ke Terkirim). */
  onMarked?: (approvalId: string) => void;
  className?: string;
}

/**
 * "Kirim sendiri di situs lowongan": jalan keluar saat agen mengisi formulir lalu berhenti sebelum tombol kirim
 * (log ready). Sesi browser agen sudah hilang, jadi pengguna membuka formulir lowongan, menyalin isian dan
 * cover letter dari agen, mengirim sendiri, lalu menandainya di sini. Penandaan memanggil
 * POST /api/approvals/:id/mark-sent: tidak ada yang dikirim ke situs, hanya pencatatan di Applify. Bila situs
 * nanti diizinkan, "Coba kirim otomatis lagi" menjalankan agen lagi lewat endpoint rerun yang sama dengan alur
 * pertanyaan dan kode keamanan. Alur itu (pertanyaan, kode) punya komponennya sendiri dan tidak tampil di sini.
 */
export default function AgentManualSubmit({
  approvalId,
  row,
  jobUrl,
  coverLetter,
  loadCoverLetter = false,
  onRerun,
  onMarked,
  className = "mt-3",
}: Props) {
  const uid = useId();
  const headingId = `${uid}-heading`;
  const confirmId = `${uid}-confirm`;
  const state = manualSubmitState(row);
  const sent = isManualSent(row);
  const visible = !!state;

  const [letter, setLetter] = useState<LetterState>({ phase: "idle" });
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"mark" | "rerun" | null>(null);
  const [error, setError] = useState("");
  const [marked, setMarked] = useState(false);
  const [rerunStarted, setRerunStarted] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);
  const markButton = useRef<HTMLButtonElement>(null);
  const confirmYes = useRef<HTMLButtonElement>(null);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  // Cover letter yang disetujui: dari properti bila ada, selain itu dimuat dari persetujuan (jendela detail Lamaran Saya).
  const givenLetter = cleanCoverLetter(coverLetter);
  useEffect(() => {
    if (!visible || givenLetter || !loadCoverLetter || !approvalId) return;
    let alive = true;
    setLetter({ phase: "loading" });
    loadApprovedCoverLetter(approvalId)
      .then((text) => alive && setLetter({ phase: "ready", text }))
      .catch((err) => {
        console.warn("[manualSubmit] cover letter belum bisa dimuat:", err);
        if (alive) setLetter({ phase: "error" });
      });
    return () => {
      alive = false;
    };
  }, [visible, givenLetter, loadCoverLetter, approvalId]);
  const letterText = givenLetter ?? (letter.phase === "ready" ? letter.text : null);

  // Percobaan agen baru (log baru): catatan "agen berjalan lagi" dan galat lama tidak berlaku lagi.
  const attemptAt = row?.logged_at ?? null;
  useEffect(() => {
    setRerunStarted(false);
    setError("");
    setConfirming(false);
  }, [attemptAt]);

  useEffect(() => {
    if (confirming) confirmYes.current?.focus();
  }, [confirming]);

  if (marked || sent) {
    return (
      <div role="status" className={`${className} flex items-start gap-2 rounded-xl border-2 border-green-300 bg-green-50 px-3 py-2.5 text-green-900`}>
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="text-xs leading-relaxed">
          <p className="font-semibold">{MARKED_TEXT}</p>
          <p className="mt-0.5">{MARKED_HINT}</p>
        </div>
      </div>
    );
  }
  if (!state) return null;

  const url = safeJobUrl(jobUrl);
  const fields = copyableFields(row?.filled_fields);

  async function copy(key: string, text: string) {
    const res = await copyText(text, typeof navigator !== "undefined" ? navigator : null);
    window.clearTimeout(copyTimer.current);
    if (res.ok) {
      setCopyError("");
      setCopied(key);
      copyTimer.current = window.setTimeout(() => setCopied(null), 2500);
    } else {
      setCopied(null);
      setCopyError(res.error);
    }
  }

  async function confirmMark() {
    if (busy || !approvalId) return;
    setBusy("mark");
    setError("");
    try {
      await markApprovalSent(approvalId);
    } catch (err) {
      setError(markSentErrorMessage(err));
      setConfirming(false);
      setBusy(null);
      markButton.current?.focus();
      return;
    }
    setBusy(null);
    setConfirming(false);
    setMarked(true);
    onMarked?.(approvalId);
  }

  async function rerun() {
    if (busy || !approvalId) return;
    setBusy("rerun");
    setError("");
    try {
      await rerunApproval(approvalId);
    } catch (err) {
      setError(describeRerunError(err));
      setBusy(null);
      return;
    }
    setBusy(null);
    setRerunStarted(true);
    onRerun?.(approvalId);
  }

  const letterButtonLabel = copied === "letter" ? COPIED_TEXT : COPY_LETTER_LABEL;
  return (
    <section aria-labelledby={headingId} className={`${className} rounded-xl border-2 border-black/[8%] bg-white px-3 py-2.5`}>
      <h4 id={headingId} className="inline-flex items-center gap-2 text-xs font-semibold">
        <Send className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" /> {MANUAL_HEADING}
      </h4>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{state.text}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{MANUAL_STEPS_TEXT}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className={PRIMARY}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {OPEN_FORM_LABEL}
            <span className="sr-only"> (terbuka di tab baru)</span>
          </a>
        ) : (
          <p className="text-xs text-muted-foreground">{NO_JOB_URL_TEXT}</p>
        )}
        {letterText ? (
          <button type="button" onClick={() => copy("letter", letterText)} className={OUTLINE}>
            {copied === "letter" ? <Check className="h-4 w-4 text-green-700" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
            {letterButtonLabel}
          </button>
        ) : loadCoverLetter && letter.phase === "loading" ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> {LETTER_LOADING_TEXT}
          </span>
        ) : letter.phase === "error" || (letter.phase === "ready" && !letterText) ? (
          <span className="text-xs text-muted-foreground">{LETTER_UNAVAILABLE_TEXT}</span>
        ) : null}
      </div>

      {fields.length > 0 && (
        <details className="mt-3 rounded-lg border-2 border-black/[8%] px-3 py-2">
          <summary className="cursor-pointer py-3.5 text-xs font-semibold">
            {COPY_PANEL_LABEL} ({fields.length})
          </summary>
          <ul className="space-y-1.5 pb-1">
            {fields.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-2 border-t border-black/[6%] pt-1.5 first:border-t-0 first:pt-0">
                <div className="min-w-0 text-xs">
                  <p className="break-words font-semibold">
                    {f.label} <span className="font-normal text-muted-foreground">({f.kind})</span>
                  </p>
                  <p className="break-words text-muted-foreground">{f.shown}</p>
                </div>
                {f.copy && (
                  <button
                    type="button"
                    onClick={() => copy(f.key, f.copy as string)}
                    aria-label={copied === f.key ? `${COPIED_TEXT}: ${f.label}` : `Salin isian ${f.label}`}
                    className={COPY_BUTTON}
                  >
                    {copied === f.key ? <Check className="h-3.5 w-3.5 text-green-700" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                    {copied === f.key ? COPIED_TEXT : "Salin"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {copied ? COPIED_TEXT : ""}
      </p>
      {copyError && (
        <div role="alert" className="mt-2 rounded-lg border-2 border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <p>{copyError}</p>
          {letterText && (
            <textarea
              readOnly
              rows={6}
              value={letterText}
              aria-label="Teks cover letter"
              onFocus={(e) => e.currentTarget.select()}
              className="mt-2 w-full rounded-lg border-2 border-black/[10%] bg-white p-2 text-base md:text-sm"
            />
          )}
        </div>
      )}

      {rerunStarted && (
        <p role="status" className="mt-3 flex items-start gap-1.5 rounded-lg border-2 border-green-300 bg-green-50 p-2 text-xs font-semibold text-green-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {RERUN_NOTE_TEXT}
        </p>
      )}

      {error && (
        <p role="alert" id={`${uid}-error`} className="mt-3 rounded-lg border-2 border-red-100 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {approvalId && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {confirming ? (
            <div role="group" aria-labelledby={confirmId} className="w-full rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
              <p id={confirmId} className="text-xs font-semibold text-amber-900">
                {MARK_CONFIRM_TEXT}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button ref={confirmYes} type="button" onClick={confirmMark} disabled={busy !== null} aria-busy={busy === "mark"} className={DARK}>
                  {busy === "mark" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {busy === "mark" ? MARK_SENT_BUSY_LABEL : MARK_CONFIRM_YES_LABEL}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    markButton.current?.focus();
                  }}
                  disabled={busy !== null}
                  className={OUTLINE}
                >
                  {MARK_CONFIRM_NO_LABEL}
                </button>
              </div>
            </div>
          ) : (
            <button
              ref={markButton}
              type="button"
              onClick={() => {
                setError("");
                setConfirming(true);
              }}
              disabled={busy !== null}
              aria-describedby={error ? `${uid}-error` : undefined}
              className={DARK}
            >
              <CheckCircle2 className="h-4 w-4 text-[#D2F801]" aria-hidden="true" />
              {MARK_SENT_LABEL}
            </button>
          )}
          {state.canRerun && !confirming && (
            <button type="button" onClick={rerun} disabled={busy !== null || rerunStarted} aria-busy={busy === "rerun"} className={OUTLINE}>
              {busy === "rerun" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
              {busy === "rerun" ? RERUN_BUSY_LABEL : RERUN_LABEL}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
