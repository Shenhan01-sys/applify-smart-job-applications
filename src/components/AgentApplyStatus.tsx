import { AlertCircle, Bot, CheckCircle2, Clock, ExternalLink, Loader2, XCircle } from "lucide-react";
import {
  LOGIN_TAB_INSTRUCTION,
  OPEN_JOB_PAGE_HINT,
  OPEN_JOB_PAGE_LABEL,
  awaitingLoginState,
  describeAgentApply,
  resolveLoginTabUrl,
  type AgentApplyRow,
  type AgentApplyTone,
} from "@/lib/agentApplyStatus";
import { describeDocumentsAttached, hasAgentEvidence } from "@/lib/agentEvidence";
import { manualSubmitState } from "@/lib/manualSubmit";
import AgentEvidence from "@/components/AgentEvidence";
import NotQueuedNotice from "@/components/NotQueuedNotice";
import type { NotQueuedRoute } from "@/lib/approveOutcome";

const TONE: Record<AgentApplyTone, string> = {
  waiting: "bg-amber-100 text-amber-900 border-amber-300",
  working: "bg-blue-100 text-blue-900 border-blue-300",
  ready: "bg-green-100 text-green-900 border-green-300",
  sent: "bg-green-100 text-green-900 border-green-300",
  unverified: "bg-amber-100 text-amber-900 border-amber-300",
  manual: "bg-amber-100 text-amber-900 border-amber-300",
  failed: "bg-red-100 text-red-900 border-red-300",
  none: "bg-gray-100 text-gray-800 border-gray-300",
};

function ToneIcon({ tone }: { tone: AgentApplyTone }) {
  if (tone === "working") return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
  if (tone === "ready" || tone === "sent") return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
  if (tone === "failed") return <XCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  if (tone === "manual" || tone === "unverified") return <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Clock className="h-3.5 w-3.5" aria-hidden="true" />;
}

/**
 * Apa yang dikerjakan agen pengisi formulir sesudah lamaran disetujui. Tampil di kartu persetujuan yang sudah disetujui (tab Menunggu atau Riwayat),
 * di atas opsi email, supaya jalur utama (agen mengisi formulir lowongan) terlihat lebih dulu. Bila log
 * percobaan punya bukti (tangkapan layar atau daftar isian), blok "Bukti dari agen" ikut tampil.
 */
export default function AgentApplyStatus({
  row,
  jobUrl,
  consentShown = false,
  notQueued = null,
}: {
  row: AgentApplyRow | null | undefined;
  jobUrl?: string | null;
  consentShown?: boolean;
  /** Persetujuan ini sengaja tidak diantre (LinkedIn, email langsung). Tanpa percobaan agen, kartu ini diganti penjelasan jalurnya. */
  notQueued?: NotQueuedRoute | null;
}) {
  if (notQueued && !row) return <NotQueuedNotice route={notQueued} jobUrl={jobUrl} />;
  const view = describeAgentApply(row);
  // Situs belum diizinkan kirim otomatis: panel "Kirim sendiri di situs lowongan" di bawah kartu ini sudah menjelaskannya,
  // jadi kalimat umum "berhenti sebelum kirim" tidak diulang.
  const showHint = !!view.hint && manualSubmitState(row)?.kind !== "not_allowed";
  const effectiveHint =
    consentShown && row?.reason === "auth_required"
      ? "Situs ini mewajibkan akun pelamar. Klik Izinkan pada kartu Ekstensi Browser di bawah untuk membuka tab masuk."
      : view.hint;
  // Hanya log Ekstensi Browser yang mencatat berkas terpasang (details.documents_attached). Hanya jenisnya, tanpa nama atau jalur berkas.
  const documents = row?.channel === "extension" ? describeDocumentsAttached(row.documents_attached) : null;
  const openLoginUrl = awaitingLoginState(row).waiting ? resolveLoginTabUrl(row, jobUrl) : null;
  return (
    <div className="mt-3 rounded-xl border-2 border-black/[8%] bg-white px-3 py-2.5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-semibold">
          <Bot className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" /> Agen pengisi formulir
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${TONE[view.tone]}`}>
          <ToneIcon tone={view.tone} /> {view.label}
        </span>
      </div>
      {showHint && view.waitReason && (
        <p
          data-testid="extension-wait-hint"
          data-wait-reason={view.waitReason}
          className="mt-2 rounded-lg border-2 border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900"
        >
          {effectiveHint}
        </p>
      )}
      {showHint && !view.waitReason && <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{effectiveHint}</p>}
      {awaitingLoginState(row).waiting && (
        <div className="mt-2 rounded-lg border-2 border-amber-200 bg-amber-50 px-3 py-2" data-testid="login-tab-guide">
          <p className="text-xs leading-relaxed text-amber-900">{LOGIN_TAB_INSTRUCTION}</p>
          {openLoginUrl && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-900">
              <span>{OPEN_JOB_PAGE_HINT}</span>
              <a
                href={openLoginUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="open-login-tab"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border-2 border-amber-300 bg-white px-3 py-1.5 font-semibold hover:bg-amber-100 transition-colors"
              >
                {OPEN_JOB_PAGE_LABEL} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </p>
          )}
        </div>
      )}
      {documents && (
        <p data-testid="agent-documents" className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
          {documents}
        </p>
      )}
      {row && hasAgentEvidence(row) && (
        <AgentEvidence screenshots={row.screenshots} filledFields={row.filled_fields} loggedAt={row.logged_at} />
      )}
    </div>
  );
}
