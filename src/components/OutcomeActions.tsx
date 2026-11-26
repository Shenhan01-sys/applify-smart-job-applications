import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  CheckCircle2, ExternalLink, Loader2, RefreshCw, RotateCcw, Send, XCircle, Chrome, Mail, FileSearch, History as HistoryIcon, ShieldCheck,
} from "lucide-react";
import { automationApi } from "@/services/automationApi";
import { describeRerunError, rerunApproval } from "@/services/formAnswerService";
import { describeConsentError } from "@/lib/extensionConsent";
import { safeJobUrl } from "@/lib/manualSubmit";
import type { AgentApplyRow } from "@/lib/agentApplyStatus";
import type { ApprovalStage } from "@/lib/approvalTabs";
import {
  ACTION_LABEL,
  CONFIRM_CANCEL_LABEL,
  CONFIRM_SENT_NOTE,
  CONFIRM_YES_LABEL,
  OUTCOME_BUSY_LABEL,
  OUTCOME_INTRO,
  OUTCOME_TOAST,
  RETRY_FRESH_NOTE,
  describeOutcomeError,
  offersOutcomeChoice,
  outcomeIntroKind,
  panelActions,
  terminalExplanation,
  type StatusActionId,
} from "@/lib/outcomeActions";

export type OutcomeChange = "confirm_sent" | "retry_fresh" | "close" | "rerun" | "continue_extension" | "refresh";

interface Props {
  approvalId: string;
  stage: ApprovalStage;
  approvalStatus?: string | null;
  row?: AgentApplyRow | null;
  jobUrl?: string | null;
  platform?: string | null;
  /** Blok "Izinkan ekstensi" sudah tampil di kartu: Lanjutkan di ekstensi tidak diulang. */
  consentShown?: boolean;
  /** Backend menerima tindakan (atau tindakan itu sudah beres di tempat lain): halaman memuat ulang datanya. */
  onChanged: (change: OutcomeChange) => void | Promise<void>;
  /** "Lihat persetujuan baru": pindah ke tab Menunggu. */
  onShowPending?: () => void;
  className?: string;
}

const BTN = "inline-flex min-h-11 items-center gap-1.5 rounded-lg border-2 px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
const PRIMARY = `${BTN} border-[#0A5BE0] bg-[#0A5BE0] text-white hover:bg-[#0256d3]`;
const OUTLINE = `${BTN} border-[#999999] bg-white hover:bg-black/[4%]`;

const ICON: Record<StatusActionId, typeof Send> = {
  review: ShieldCheck,
  confirm_sent: CheckCircle2,
  retry_fresh: RotateCcw,
  open_form: ExternalLink,
  close: XCircle,
  rerun: RotateCcw,
  continue_extension: Chrome,
  refresh: RefreshCw,
  email_panel: Mail,
  view_application: FileSearch,
  reapply: Send,
  view_new_approval: HistoryIcon,
};

/**
 * Tindakan di kartu persetujuan, supaya tidak ada status buntu (keputusan Hans, 26 November 2026). Isinya persis daftar
 * `panelActions` (lib/outcomeActions.ts). Hasil kirim yang tidak pasti punya tiga pilihan, semuanya lewat backend karena
 * browser tidak boleh menulis approval_requests, application_logs, atau ai_applications:
 *   Sudah terkirim            -> POST /api/approvals/:id/mark-sent (ditandai konfirmasi pengguna, bukan konfirmasi sistem)
 *   Belum terkirim, ulangi    -> POST /api/approvals/:id/not-sent (persetujuan baru, tanpa kirim apa pun)
 *   Tutup                     -> POST /api/approvals/:id/close
 * "Sudah terkirim" dan "Belum terkirim, ulangi" meminta satu konfirmasi karena keduanya pernyataan tentang dunia nyata.
 */
export default function OutcomeActions({ approvalId, stage, approvalStatus, row, jobUrl, platform, consentShown, onChanged, onShowPending, className = "mt-3" }: Props) {
  const [confirming, setConfirming] = useState<"confirm_sent" | "retry_fresh" | null>(null);
  const [busy, setBusy] = useState<StatusActionId | null>(null);
  const [error, setError] = useState("");

  const actions = panelActions({ stage, approvalStatus, row, jobUrl, platform, consentShown });
  if (actions.length === 0) return null;
  const choice = offersOutcomeChoice({ stage, approvalStatus, row });
  const explanation = terminalExplanation(stage, approvalStatus);
  const url = safeJobUrl(jobUrl);

  async function runOutcome(kind: "confirm_sent" | "retry_fresh" | "close") {
    if (busy) return;
    setBusy(kind);
    setError("");
    try {
      if (kind === "confirm_sent") await automationApi.markApprovalSent(approvalId);
      else if (kind === "retry_fresh") await automationApi.reportApprovalNotSent(approvalId);
      else await automationApi.closeApproval(approvalId);
      toast.success(OUTCOME_TOAST[kind]);
      setConfirming(null);
      await onChanged(kind);
    } catch (err) {
      const failure = describeOutcomeError(err, "Tindakan belum bisa diproses. Data lamaranmu tidak berubah. Coba lagi sebentar lagi.");
      if (failure.alreadyDone) {
        // Sudah beres di tempat lain (klik ganda atau tab lain): bukan galat, muat ulang saja.
        toast.info(failure.message);
        setConfirming(null);
        await onChanged("refresh");
      } else {
        setError(failure.message);
      }
    } finally {
      setBusy(null);
    }
  }

  async function runRerun() {
    if (busy) return;
    setBusy("rerun");
    setError("");
    try {
      await rerunApproval(approvalId);
      toast.success("Agen berjalan lagi. Statusnya muncul di kartu ini.");
      await onChanged("rerun");
    } catch (err) {
      setError(describeRerunError(err));
    } finally {
      setBusy(null);
    }
  }

  async function runExtension() {
    if (busy) return;
    setBusy("continue_extension");
    setError("");
    try {
      await automationApi.grantExtensionConsent(approvalId, false);
      toast.success("Ekstensi akan membuka situs lowongan di tab baru. Lanjutkan pengisian di sana.");
      await onChanged("continue_extension");
    } catch (err) {
      const failure = describeConsentError(err);
      if (failure.alreadyActive) {
        toast.info(failure.message);
        await onChanged("refresh");
      } else {
        setError(failure.message);
      }
    } finally {
      setBusy(null);
    }
  }

  function render(id: StatusActionId) {
    const Icon = ICON[id];
    const label = ACTION_LABEL[id];
    const isBusy = busy === id;
    const icon = isBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />;
    switch (id) {
      case "review":
      case "email_panel":
        return null; // tombol Periksa dan panel Email digambar komponen lain
      case "open_form":
        return url ? (
          <a key={id} data-testid={`action-${id}`} href={url} target="_blank" rel="noopener noreferrer" className={OUTLINE}>
            {icon}
            {label}
            <span className="sr-only"> (terbuka di tab baru)</span>
          </a>
        ) : null;
      case "reapply":
        return (
          <Link key={id} data-testid={`action-${id}`} to="/jobs" className={OUTLINE}>
            {icon}
            {label}
          </Link>
        );
      case "view_application":
        return (
          <Link key={id} data-testid={`action-${id}`} to="/applications" className={OUTLINE}>
            {icon}
            {label}
          </Link>
        );
      case "view_new_approval":
        return (
          <button key={id} type="button" data-testid={`action-${id}`} onClick={() => onShowPending?.()} className={OUTLINE}>
            {icon}
            {label}
          </button>
        );
      case "confirm_sent":
      case "retry_fresh":
        return (
          <button
            key={id}
            type="button"
            data-testid={`action-${id}`}
            disabled={busy !== null}
            aria-expanded={confirming === id}
            onClick={() => { setError(""); setConfirming(confirming === id ? null : id); }}
            className={confirming === id ? PRIMARY : OUTLINE}
          >
            {icon}
            {label}
          </button>
        );
      case "close":
        return (
          <button key={id} type="button" data-testid={`action-${id}`} disabled={busy !== null} onClick={() => runOutcome("close")} className={OUTLINE}>
            {icon}
            {isBusy ? OUTCOME_BUSY_LABEL : label}
          </button>
        );
      case "rerun":
        return (
          <button key={id} type="button" data-testid={`action-${id}`} disabled={busy !== null} onClick={runRerun} className={PRIMARY}>
            {icon}
            {label}
          </button>
        );
      case "continue_extension":
        return (
          <button key={id} type="button" data-testid={`action-${id}`} disabled={busy !== null} onClick={runExtension} className={OUTLINE}>
            {icon}
            {label}
          </button>
        );
      case "refresh":
        return (
          <button key={id} type="button" data-testid={`action-${id}`} disabled={busy !== null} onClick={() => { void onChanged("refresh"); }} className={OUTLINE}>
            {icon}
            {label}
          </button>
        );
    }
  }

  return (
    <section data-testid="status-actions" data-stage={stage} aria-label="Tindakan untuk persetujuan ini" className={`${className} rounded-xl border-2 px-3 py-2.5 ${choice ? "border-amber-300/70 bg-amber-50/60" : "border-black/[8%] bg-white"}`}>
      {explanation && <p data-testid="status-explanation" className="mb-2 text-xs leading-relaxed text-muted-foreground">{explanation}</p>}
      {choice && <p data-testid="outcome-intro" className="text-xs leading-relaxed text-amber-950">{OUTCOME_INTRO[outcomeIntroKind(stage, row)]}</p>}
      <div className={`${choice ? "mt-2.5" : ""} flex flex-wrap items-center gap-2`}>{actions.map(render)}</div>
      {confirming && (
        <div role="group" aria-label="Konfirmasi" data-testid="outcome-confirm" className="mt-2.5 rounded-lg border-2 border-black/[10%] bg-white p-2.5">
          <p className="text-xs leading-relaxed">{confirming === "confirm_sent" ? CONFIRM_SENT_NOTE : RETRY_FRESH_NOTE}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" data-testid="outcome-confirm-yes" disabled={busy !== null} onClick={() => runOutcome(confirming)} className={PRIMARY}>
              {busy === confirming && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {busy === confirming ? OUTCOME_BUSY_LABEL : CONFIRM_YES_LABEL[confirming]}
            </button>
            <button type="button" data-testid="outcome-confirm-cancel" disabled={busy !== null} onClick={() => setConfirming(null)} className={OUTLINE}>
              {CONFIRM_CANCEL_LABEL}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" data-testid="status-actions-error" className="mt-2 rounded-lg border-2 border-red-100 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
