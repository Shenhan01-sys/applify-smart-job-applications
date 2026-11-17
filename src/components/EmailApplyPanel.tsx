import { useId, useState } from "react";
import { Mail, ChevronDown, ChevronUp, Loader2, AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { automationApi } from "@/services/automationApi";
import { enqueueEmailApply } from "@/services/emailApplyService";
import {
  EMAIL_APPLY_EXPLANATION,
  EMAIL_APPLY_TEST_MODE_NOTE,
  describeQueueError,
  getEmailApplyState,
  type ApprovalLike,
  type EmailQueueRow,
} from "@/lib/emailApply";

interface Props {
  approval: ApprovalLike & { job_title?: string; company?: string };
  gmailConnected: boolean | null;
  used: boolean;
  job?: EmailQueueRow | null;
  suggestions?: string[];
  /** Called after the backend accepted the job, so the parent can show it as queued. */
  onQueued: (approvalId: string) => void;
}

/**
 * "Kirim lewat Email" for an approved application. Visible only for an approval with status approved
 * (see getEmailApplyState). It shows the exact letter that will be sent, asks for the recruiter address,
 * and asks once more before it enqueues an email_apply job; the backend and worker enforce the rest.
 */
export default function EmailApplyPanel({ approval, gmailConnected, used, job, suggestions = [], onQueued }: Props) {
  const { user } = useAuth();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const state = getEmailApplyState(approval, { used, job, gmailConnected, applyEmail: email });
  if (!state.visible) return null;

  const expires = approval.expires_at ? new Date(approval.expires_at) : null;
  const expiresLabel = expires && Number.isFinite(expires.getTime())
    ? expires.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

  const submit = async () => {
    setSending(true);
    setError("");
    try {
      await enqueueEmailApply(approval, email);
      toast.success("Email masuk antrean. Worker akan memprosesnya.");
      setConfirming(false);
      onQueued(approval.id);
    } catch (err) {
      setError(describeQueueError(err));
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border-2 border-black/[8%] bg-black/[2%]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="inline-flex items-center gap-2 text-xs font-semibold">
          <Mail className="h-4 w-4 text-[#0A5BE0]" /> Kirim lewat Email
          {state.block === "used" && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">sudah dipakai</span>}
          {(state.block === "queued") && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">dalam antrean</span>}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t-2 border-black/[6%] pt-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed flex gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#0A5BE0]" />
            <span>
              {EMAIL_APPLY_EXPLANATION}
              {expiresLabel && <> Persetujuan ini berlaku sampai {expiresLabel}.</>}
            </span>
          </p>

          <details className="rounded-lg border-2 border-black/[8%] bg-white">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">Isi email (surat yang kamu setujui)</summary>
            <pre className="px-3 pb-3 pt-1 text-xs whitespace-pre-wrap font-sans text-muted-foreground max-h-60 overflow-auto">{approval.cover_letter}</pre>
          </details>

          <div>
            <label htmlFor={`${uid}-to`} className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Email rekruter (tujuan)
            </label>
            <input
              id={`${uid}-to`}
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setConfirming(false); setError(""); }}
              placeholder="hrd@perusahaan.com"
              aria-invalid={!!state.emailError}
              list={suggestions.length > 0 ? `${uid}-sugg` : undefined}
              className="mt-1 w-full h-10 rounded-lg bg-white border-2 border-black/[10%] px-3 text-sm focus:border-[#0A5BE0]/50 focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/10 aria-[invalid=true]:border-red-400"
            />
            {suggestions.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>Ditemukan di lowongan:</span>
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => { setEmail(s); setConfirming(false); setError(""); }} className="px-2 py-0.5 rounded-md border-2 border-black/[8%] bg-white hover:border-[#0A5BE0]/40 hover:text-[#0A5BE0]">{s}</button>
                ))}
                <datalist id={`${uid}-sugg`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
            )}
            {state.emailError && <p className="mt-1 text-xs text-red-600 flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3 shrink-0" /> {state.emailError}</p>}
          </div>

          <p className="text-[11px] flex items-center gap-1.5">
            {gmailConnected === true ? (
              <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> Gmail terhubung</span>
            ) : gmailConnected === false ? (
              <>
                <span className="inline-flex items-center gap-1 text-amber-800"><AlertCircle className="h-3.5 w-3.5" /> Gmail belum terhubung.</span>
                {user?.id && <a href={automationApi.getGmailConnectUrl(user.id)} className="font-semibold text-[#0A5BE0] hover:underline">Hubungkan Gmail</a>}
              </>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground"><AlertCircle className="h-3.5 w-3.5" /> Status Gmail tidak diketahui.</span>
            )}
          </p>

          {state.message && !state.emailError && (
            <p className="text-xs text-amber-800 bg-amber-50 border-2 border-amber-200 rounded-lg p-2" role="status">{state.message}</p>
          )}
          {error && <p className="text-xs text-red-600 bg-red-50 border-2 border-red-100 rounded-lg p-2" role="alert">{error}</p>}

          {confirming ? (
            <div className="rounded-lg border-2 border-[#0A5BE0]/30 bg-[#0A5BE0]/[4%] p-3 space-y-2">
              <p className="text-xs leading-relaxed">
                Masukkan ke antrean: surat yang disetujui akan dikirim apa adanya ke <b className="break-all">{email.trim()}</b> dari akun Gmail-mu untuk lowongan
                {" "}<b>{approval.job_title ?? "ini"}</b>{approval.company ? <> di <b>{approval.company}</b></> : null}. Email yang sudah terkirim tidak bisa ditarik kembali.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={submit} disabled={sending || !state.enabled} className="h-9 px-4 rounded-lg bg-[#0A5BE0] text-white text-xs font-semibold hover:bg-[#0256d3] disabled:opacity-60 inline-flex items-center gap-1.5">
                  {sending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Ya, masukkan ke antrean
                </button>
                <button type="button" onClick={() => setConfirming(false)} disabled={sending} className="h-9 px-4 rounded-lg border-2 border-black/[8%] bg-white text-xs hover:bg-black/[4%]">Batal</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!state.enabled}
              className="h-9 px-4 rounded-lg bg-[#0A5BE0] text-white text-xs font-semibold hover:bg-[#0256d3] transition disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <Mail className="h-3.5 w-3.5" /> Kirim lewat Email
            </button>
          )}

          <p className="text-[10px] text-muted-foreground leading-relaxed">{EMAIL_APPLY_TEST_MODE_NOTE}</p>
        </div>
      )}
    </div>
  );
}
