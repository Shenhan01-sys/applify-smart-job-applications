import { useEffect, useId, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Clock, KeyRound, Loader2 } from "lucide-react";
import { isAgentApplyActive, type AgentApplyRow } from "@/lib/agentApplyStatus";
import { questionsToAnswer } from "@/lib/formQuestions";
import {
  CODE_MAX_LENGTH,
  CODE_RERUN_BUSY_LABEL,
  CODE_RERUN_LABEL,
  CODE_RERUN_STARTED_TEXT,
  SECURITY_CODE_EXPIRED_TEXT,
  SECURITY_CODE_FORWARDED_TEXT,
  SECURITY_CODE_HEADING,
  SECURITY_CODE_INTRO,
  SECURITY_CODE_LABEL,
  SECURITY_CODE_SEND_LABEL,
  SECURITY_CODE_SENDING_LABEL,
  awaitingCodeState,
  codeAccepted,
  codePlaceholder,
  describeSecurityCodeError,
  formatCountdown,
  isCodeTimeout,
  normaliseCode,
  validateCode,
} from "@/lib/securityCode";
import { NEEDS_CHECK_HEADING, NEEDS_CHECK_STEPS } from "@/lib/needsCheck";
import { automationApi } from "@/services/automationApi";
import { describeRerunError, rerunApproval } from "@/services/formAnswerService";

const INPUT_CLASS =
  "mt-1 w-full rounded-lg bg-white border-2 border-black/[10%] px-3 font-mono text-base tracking-wider md:text-sm focus:border-[#0A5BE0]/50 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 aria-[invalid=true]:border-red-400";
const BUTTON_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#0A5BE0] px-4 text-sm font-semibold text-white transition hover:bg-[#0256d3] disabled:cursor-not-allowed disabled:opacity-60";

interface Props {
  approvalId: string;
  row: AgentApplyRow | null | undefined;
  /** Dipanggil sesudah backend menerima tugas ulang (kode tidak dimasukkan tepat waktu), supaya halaman memulai polling. */
  onRerun: (approvalId: string) => void;
  /** Dipanggil sesudah backend menerima kode, supaya halaman segera membaca status agen yang baru. */
  onCodeSent: (approvalId: string) => void;
}

/** Penanda detik: membuat komponen digambar ulang tiap detik selama `enabled`, tanpa menyimpan apa pun. */
function useSecondTick(enabled: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [enabled]);
}

/**
 * "Masukkan kode keamanan": sebagian formulir lowongan mengirim kode sekali pakai ke email pelamar sesudah
 * tombol kirim ditekan. Worker menahan formulir sampai 10 menit (log awaiting_code) dan kolom ini
 * meneruskan kode ke agen lewat backend. Bila waktunya habis tanpa kode (log ready, reason code_timeout),
 * tersedia tombol "Jalankan agen lagi" untuk meminta kode baru.
 *
 * Kode hanya hidup di kolom isian ini: tidak masuk localStorage, tidak dicatat, dan dikosongkan begitu
 * backend menerimanya.
 */
export default function AgentSecurityCode({ approvalId, row, onRerun, onCodeSent }: Props) {
  const awaitingLog = row?.log_status === "awaiting_code";
  useSecondTick(awaitingLog);
  const state = awaitingCodeState(row);
  const active = isAgentApplyActive(row);
  const [rerunStarted, setRerunStarted] = useState(false);

  // Catatan "Agen berjalan lagi" hanya selama tugas ulang itu berjalan.
  const wasActive = useRef(false);
  useEffect(() => {
    if (active) wasActive.current = true;
    else if (wasActive.current) {
      wasActive.current = false;
      setRerunStarted(false);
    }
  }, [active]);

  const queueJobId = row?.queue_job_id ?? "";
  if (state.waiting && queueJobId) {
    // Log baru (misalnya kode salah, agen meminta lagi) = formulir baru yang kosong.
    return (
      <CodeForm
        key={`${queueJobId}|${row?.logged_at ?? ""}`}
        queueJobId={queueJobId}
        secondsLeft={state.secondsLeft}
        codeLength={state.codeLength}
        onSent={() => onCodeSent(approvalId)}
      />
    );
  }
  // Waktu habis tetapi log penutup belum terbaca: jangan tiba-tiba kosong.
  if (awaitingLog && !state.waiting && row?.status === "processing") return <Note>{SECURITY_CODE_EXPIRED_TEXT}</Note>;
  if (active) return rerunStarted ? <Note tone="started">{CODE_RERUN_STARTED_TEXT}</Note> : null;
  // Pertanyaan yang belum dijawab punya tombol jalankan ulang sendiri (AgentQuestions).
  if (isCodeTimeout(row) && questionsToAnswer(row).length === 0) {
    return (
      <>
        <NeedsCheckSteps />
        <RerunButton
          approvalId={approvalId}
          onStarted={() => {
            setRerunStarted(true);
            onRerun(approvalId);
          }}
        />
      </>
    );
  }
  return null;
}

/** Langkah berikutnya untuk lamaran "Perlu dicek": email, kode di halaman situs, lalu kirim sendiri (lib/needsCheck.ts). */
function NeedsCheckSteps() {
  return (
    <div data-testid="needs-check-steps" className="mt-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
      <p className="font-semibold">{NEEDS_CHECK_HEADING}</p>
      <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 leading-relaxed">
        {NEEDS_CHECK_STEPS.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "started" }) {
  const cls = tone === "started" ? "border-green-300 bg-green-50 text-green-900" : "border-amber-300 bg-amber-50 text-amber-900";
  return (
    <div role="status" className={`mt-3 flex items-center gap-1.5 rounded-xl border-2 px-3 py-2.5 text-xs font-semibold ${cls}`}>
      {tone === "started" ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {children}
    </div>
  );
}

function RerunButton({ approvalId, onStarted }: { approvalId: string; onStarted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await rerunApproval(approvalId);
    } catch (err) {
      setError(describeRerunError(err));
      setBusy(false);
      return;
    }
    onStarted();
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={run} disabled={busy} aria-busy={busy} className={BUTTON_CLASS}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {busy ? CODE_RERUN_BUSY_LABEL : CODE_RERUN_LABEL}
      </button>
      {error && (
        <p role="alert" className="mt-2 rounded-lg border-2 border-red-100 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function CodeForm({
  queueJobId,
  secondsLeft,
  codeLength,
  onSent,
}: {
  queueJobId: string;
  secondsLeft: number;
  codeLength: number | null;
  onSent: () => void;
}) {
  const uid = useId();
  const inputId = `${uid}-code`;
  const errId = `${uid}-err`;
  const headingId = `${uid}-heading`;
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [forwarded, setForwarded] = useState(false);
  const check = validateCode(value, codeLength);
  const showCheck = touched && value.length > 0 && !check.ok;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!check.ok) {
      setTouched(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await automationApi.submitSecurityCode(queueJobId, check.code);
      if (!codeAccepted(res)) throw new Error("not_accepted");
    } catch (err) {
      setError(describeSecurityCodeError(err));
      setBusy(false);
      return;
    }
    // Backend menerima kode: kosongkan kolomnya. Kode tidak disimpan di mana pun.
    setValue("");
    setBusy(false);
    setForwarded(true);
    onSent();
  }

  // Tempelan dari email sering berisi spasi atau tanda hubung ("AB12 CD34"): rapikan dulu supaya muat.
  function paste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    e.preventDefault();
    setValue(normaliseCode(text).slice(0, CODE_MAX_LENGTH));
    setError("");
  }

  return (
    <section aria-labelledby={headingId} className="mt-3 rounded-xl border-2 border-black/[8%] bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id={headingId} className="inline-flex items-center gap-2 text-xs font-semibold">
          <KeyRound className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" /> {SECURITY_CODE_HEADING}
        </h4>
        <span
          role="timer"
          aria-label={`Sisa waktu ${formatCountdown(secondsLeft)}`}
          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-amber-900"
        >
          <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {formatCountdown(secondsLeft)}
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{SECURITY_CODE_INTRO}</p>

      {forwarded ? (
        <p role="status" className="mt-3 flex items-center gap-1.5 rounded-lg border-2 border-green-300 bg-green-50 px-3 py-2.5 text-xs font-semibold text-green-900">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> {SECURITY_CODE_FORWARDED_TEXT}
        </p>
      ) : (
        <form onSubmit={submit} noValidate className="mt-3 space-y-3">
          <div>
            <label htmlFor={inputId} className="block text-xs font-semibold leading-snug">{SECURITY_CODE_LABEL}</label>
            <input
              id={inputId}
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={CODE_MAX_LENGTH}
              value={value}
              disabled={busy}
              placeholder={codePlaceholder(codeLength)}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError("");
              }}
              onPaste={paste}
              onBlur={() => setTouched(true)}
              aria-invalid={showCheck}
              aria-describedby={showCheck ? errId : undefined}
              className={`${INPUT_CLASS} min-h-11`}
            />
            {showCheck && (
              <p id={errId} className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" /> {check.message}
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-lg border-2 border-red-100 bg-red-50 p-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy || !check.ok} aria-busy={busy} className={BUTTON_CLASS}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? SECURITY_CODE_SENDING_LABEL : SECURITY_CODE_SEND_LABEL}
          </button>
          {!busy && !check.ok && !showCheck && value.length > 0 && (
            <p className="text-xs text-muted-foreground">{check.message}</p>
          )}
        </form>
      )}
    </section>
  );
}
