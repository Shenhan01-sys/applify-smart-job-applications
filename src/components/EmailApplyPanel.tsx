import { useId, useState } from "react";
import { Mail, ChevronDown, ChevronUp, Loader2, AlertCircle, CheckCircle2, ShieldCheck, Paperclip } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { EMAIL_TEST_MODE_HINT, EMAIL_TEST_MODE_LABEL } from "@/lib/emailTestMode";
import { automationApi } from "@/services/automationApi";
import { describeApiError } from "@/lib/apiErrors";
import { enqueueEmailApply } from "@/services/emailApplyService";
import {
  EMAIL_APPLY_EXPLANATION,
  describeQueueError,
  getEmailApplyState,
  type ApprovalLike,
  type EmailQueueRow,
} from "@/lib/emailApply";
import { describeNotAttached, describeSentAttachments, type AttachmentPlan, type SentAttachments } from "@/lib/emailAttachments";

interface Props {
  approval: ApprovalLike & { job_title?: string; company?: string };
  gmailConnected: boolean | null;
  used: boolean;
  job?: EmailQueueRow | null;
  suggestions?: string[];
  /** Email terakhir selesai tanpa terkirim karena mode uji (log skipped): tampil "Belum dikirim (mode uji)". */
  testMode?: boolean;
  /** Lampiran yang akan dikirim (pratinjau). Tidak ada: profil atau lowongan tidak terbaca, daftar tidak ditampilkan. */
  plan?: AttachmentPlan | null;
  /** Lampiran yang tercatat pada email yang sudah terkirim. */
  sent?: SentAttachments | null;
  /** Called after the backend accepted the job, so the parent can show it as queued. */
  onQueued: (approvalId: string) => void;
}

/**
 * "Kirim lewat Email" for an approved application. Visible only for an approval with status approved
 * (see getEmailApplyState). It shows the exact letter that will be sent, asks for the recruiter address,
 * and asks once more before it enqueues an email_apply job; the backend and worker enforce the rest.
 */
export default function EmailApplyPanel({ approval, gmailConnected, used, job, suggestions = [], testMode = false, plan = null, sent = null, onQueued }: Props) {
  const { user } = useAuth();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [error, setError] = useState("");

  const handleConnectGmail = async () => {
    setConnectingGmail(true);
    setError("");
    try {
      const url = await automationApi.startGmailOAuth();
      if (url) window.location.assign(url);
    } catch (e: any) {
      setError(describeApiError(e, "Gagal memulai koneksi Gmail."));
    } finally {
      setConnectingGmail(false);
    }
  };

  const state = getEmailApplyState(approval, { used, job, gmailConnected, applyEmail: email });
  if (!state.visible) return null;

  const expires = approval.expires_at ? new Date(approval.expires_at) : null;
  const expiresLabel = expires && Number.isFinite(expires.getTime())
    ? expires.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

  const sentText = used && sent && sent.attached.length > 0 ? describeSentAttachments(sent) : "";
  const notSentText = used && sent ? describeNotAttached(sent) : "";

  const submit = async () => {
    setSending(true);
    setError("");
    try {
      await enqueueEmailApply(approval, email);
      toast.success("Email masuk antrean. Agen akan memprosesnya.");
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
        <span className="inline-flex flex-wrap items-center gap-2 text-xs font-semibold">
          <Mail className="h-4 w-4 text-[#0A5BE0]" /> Opsi lain: Kirim lewat Email
          <span className="font-normal text-muted-foreground">(untuk lowongan yang meminta lamaran ke email rekruter)</span>
          {state.block === "used" && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">sudah dipakai</span>}
          {(state.block === "queued") && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">dalam antrean</span>}
          {testMode && state.block !== "used" && (
            <span data-testid="email-test-mode" className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{EMAIL_TEST_MODE_LABEL}</span>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {sentText && (
        <p data-testid="email-sent-attachments" className="px-3 pb-2.5 -mt-1 text-xs text-muted-foreground flex gap-1.5">
          <Paperclip className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Terkirim dengan lampiran: {sentText}.
            {notSentText && <> Tidak terlampir: {notSentText}.</>}
          </span>
        </p>
      )}

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t-2 border-black/[6%] pt-3">
          <p className="text-xs text-muted-foreground leading-relaxed flex gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[#0A5BE0]" />
            <span>
              {EMAIL_APPLY_EXPLANATION}
              {expiresLabel && <> Persetujuan ini berlaku sampai {expiresLabel}.</>}
            </span>
          </p>

          {testMode && state.block !== "used" && (
            <p role="status" className="text-xs text-amber-800 bg-amber-50 border-2 border-amber-200 rounded-lg p-2">{EMAIL_TEST_MODE_HINT}</p>
          )}

          <details className="rounded-lg border-2 border-black/[8%] bg-white">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium">Isi email (surat yang kamu setujui)</summary>
            <pre className="px-3 pb-3 pt-1 text-xs whitespace-pre-wrap font-sans text-muted-foreground max-h-60 overflow-auto">{approval.cover_letter}</pre>
          </details>

          {plan && !used && (
            <div data-testid="email-attachments" className="rounded-lg border-2 border-black/[8%] bg-white p-3 space-y-2">
              <p className="text-xs font-semibold flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5 text-[#0A5BE0]" /> Lampiran yang akan dikirim</p>
              <ul className="space-y-1 text-xs">
                {plan.items.map((item) => (
                  <li key={item.kind} data-testid={`email-attachment-${item.kind}`} className="break-all">{item.label}</li>
                ))}
              </ul>
              {plan.warnings.map((w) => (
                <p key={w.code + w.kind} role="status" data-testid={`email-attachment-warning-${w.code}`} className="text-xs text-amber-800 bg-amber-50 border-2 border-amber-200 rounded-lg p-2">
                  {w.message}{" "}
                  {w.code === "cv_not_on_approval" ? null : (
                    <Link to="/profile" className="font-semibold underline underline-offset-2">
                      {w.code === "no_cv" ? "Unggah CV di Profil" : "Buka Profil"}
                    </Link>
                  )}
                </p>
              ))}
              <p className="text-xs text-muted-foreground">Total lampiran dibatasi 20 MB. Bila lebih, dokumen opsional dilepas lebih dulu, lalu PDF surat; CV tidak pernah dilepas.</p>
            </div>
          )}

          <div>
            <label htmlFor={`${uid}-to`} className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
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
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>Ditemukan di lowongan:</span>
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => { setEmail(s); setConfirming(false); setError(""); }} className="px-2 py-0.5 rounded-md border-2 border-black/[8%] bg-white hover:border-[#0A5BE0]/40 hover:text-[#0A5BE0]">{s}</button>
                ))}
                <datalist id={`${uid}-sugg`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
            )}
            {state.emailError && <p className="mt-1 text-xs text-red-600 flex items-center gap-1" role="alert"><AlertCircle className="h-3 w-3 shrink-0" /> {state.emailError}</p>}
          </div>

          <p className="text-xs flex items-center gap-1.5">
            {gmailConnected === true ? (
              <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> Gmail terhubung</span>
            ) : gmailConnected === false ? (
              <>
                <span className="inline-flex items-center gap-1 text-amber-800"><AlertCircle className="h-3.5 w-3.5" /> Gmail belum terhubung.</span>
                {user?.id && (
                  <button
                    type="button"
                    onClick={handleConnectGmail}
                    disabled={connectingGmail}
                    className="font-semibold text-[#0A5BE0] hover:underline disabled:opacity-60"
                  >
                    {connectingGmail ? "Membuka..." : "Hubungkan Gmail"}
                  </button>
                )}
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
              {plan && (
                <p data-testid="email-confirm-attachments" className="text-xs leading-relaxed">
                  <b>Lampiran:</b> {plan.items.length > 0 ? plan.items.map((i) => i.label).join(", ") : "tidak ada"}
                  {plan.noCv ? <> (tanpa CV)</> : null}.
                </p>
              )}
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
        </div>
      )}
    </div>
  );
}
