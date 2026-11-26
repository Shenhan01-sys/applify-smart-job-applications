import { AlertCircle, Bot, CheckCircle2, Clock, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  AGENT_EXPIRED_ACTION_LABEL,
  LOGIN_TAB_INSTRUCTION,
  OPEN_JOB_PAGE_HINT,
  OPEN_JOB_PAGE_LABEL,
  awaitingLoginState,
  describeAgentApply,
  describeExpiredApproval,
  describeHandoffReason,
  describeSentApproval,
  describeUnreadAgent,
  isAgentApplyActive,
  resolveLoginTabUrl,
  type AgentApplyRow,
  type AgentApplyTone,
  type SentVia,
} from "@/lib/agentApplyStatus";
import { describeDocumentsAttached, hasAgentEvidence } from "@/lib/agentEvidence";
import { manualSubmitState } from "@/lib/manualSubmit";
import AgentEvidence from "@/components/AgentEvidence";
import AgentNextSteps from "@/components/AgentNextSteps";
import { nextStepGuideFor } from "@/lib/nextStepsGuide";
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
  expired = false,
  sentVia = null,
  agentKnown = true,
}: {
  row: AgentApplyRow | null | undefined;
  /** false = status agen belum terbaca (kueri antrean gagal): tanpa baris, kartu tidak boleh berkata "Agen belum dijalankan". */
  agentKnown?: boolean;
  jobUrl?: string | null;
  consentShown?: boolean;
  /** Masa berlaku persetujuan habis dan agen tidak bekerja lagi: tanpa langkah lanjutan, hanya penjelasan dan tautan ajukan lagi. */
  expired?: boolean;
  /** Persetujuan ini sengaja tidak diantre (LinkedIn, email langsung). Tanpa percobaan agen, kartu ini diganti penjelasan jalurnya. */
  notQueued?: NotQueuedRoute | null;
  /** Persetujuan sudah tercatat terkirim lewat jalur ini. Bila percobaan agen terbaru bukan hasil terkirim, teks percobaan lama diganti. */
  sentVia?: SentVia | null;
}) {
  if (notQueued && !row) return <NotQueuedNotice route={notQueued} jobUrl={jobUrl} />;
  const sentOverride = !expired && sentVia ? describeSentApproval(row, sentVia) : null;
  const view = sentOverride ?? (expired ? describeExpiredApproval() : !row && !agentKnown ? describeUnreadAgent() : describeAgentApply(row));
  // Tugas ekstensi hasil pengalihan sedang menunggu: formulir jawabannya disembunyikan selama tugas aktif, jadi pertanyaan yang kosong ditampilkan sebagai daftar.
  const handoff = !expired && !sentOverride && row?.handoff_context && isAgentApplyActive(row) ? row.handoff_context : null;
  // Berhenti sebelum kirim dengan langkah dari ekstensi: daftar bernomor menggantikan kalimat umumnya.
  const nextSteps = expired || sentOverride ? null : nextStepGuideFor(row, view.tone);
  // Situs belum diizinkan kirim otomatis: panel "Kirim sendiri di situs lowongan" di bawah kartu ini sudah menjelaskannya,
  // jadi kalimat umum "berhenti sebelum kirim" tidak diulang.
  const showHint = !!view.hint && !nextSteps && (expired || manualSubmitState(row)?.kind !== "not_allowed");
  const effectiveHint =
    consentShown && row?.reason === "auth_required"
      ? "Situs ini mewajibkan akun pelamar. Klik Izinkan pada kartu Ekstensi Browser di bawah untuk membuka tab masuk."
      : view.hint;
  // Hanya log Ekstensi Browser yang mencatat berkas terpasang (details.documents_attached). Hanya jenisnya, tanpa nama atau jalur berkas.
  const documents = !sentOverride && row?.channel === "extension" ? describeDocumentsAttached(row.documents_attached) : null;
  const loginWaiting = !expired && awaitingLoginState(row).waiting;
  const openLoginUrl = loginWaiting ? resolveLoginTabUrl(row, jobUrl) : null;
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
      {handoff && (
        <div data-testid="handoff-questions" data-handoff-reason={handoff.handoff_reason ?? ""} className="mt-2 rounded-lg border-2 border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <p className="font-semibold">Agen berhenti sebelum kirim dan mengalihkannya ke Ekstensi Browser</p>
          <p className="mt-0.5">
            Alasannya: {describeHandoffReason(handoff.handoff_reason)}.
            {handoff.labels.length > 0 ? " Pertanyaan yang belum terjawab:" : " Ekstensi akan menunjukkan isian yang perlu kamu lengkapi."}
          </p>
          {handoff.labels.length > 0 && (
            <ol className="mt-1 list-decimal space-y-0.5 break-words pl-5">
              {handoff.labels.map((label, i) => (
                <li key={i}>{label}</li>
              ))}
            </ol>
          )}
        </div>
      )}
      {expired && (
        <p className="mt-2">
          <Link
            to="/jobs"
            data-testid="expired-reapply"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border-2 border-[#0A5BE0] bg-white px-3 py-1.5 text-xs font-semibold text-[#0A5BE0] transition-colors hover:bg-[#0A5BE0]/5"
          >
            {AGENT_EXPIRED_ACTION_LABEL}
          </Link>
        </p>
      )}
      {nextSteps && <AgentNextSteps items={nextSteps} jobUrl={jobUrl} />}
      {loginWaiting && (
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
      {row && !sentOverride && hasAgentEvidence(row) && (
        <AgentEvidence screenshots={row.screenshots} filledFields={row.filled_fields} loggedAt={row.logged_at} />
      )}
    </div>
  );
}
