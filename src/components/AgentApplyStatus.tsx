import { AlertCircle, Bot, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { describeAgentApply, type AgentApplyRow, type AgentApplyTone } from "@/lib/agentApplyStatus";
import { hasAgentEvidence } from "@/lib/agentEvidence";
import AgentEvidence from "@/components/AgentEvidence";

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
 * Apa yang dikerjakan agen pengisi formulir sesudah lamaran disetujui. Tampil di kartu Riwayat Persetujuan,
 * di atas opsi email, supaya jalur utama (agen mengisi formulir lowongan) terlihat lebih dulu. Bila log
 * percobaan punya bukti (tangkapan layar atau daftar isian), blok "Bukti dari agen" ikut tampil.
 */
export default function AgentApplyStatus({ row }: { row: AgentApplyRow | null | undefined }) {
  const view = describeAgentApply(row);
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
      {view.hint && <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{view.hint}</p>}
      {row && hasAgentEvidence(row) && (
        <AgentEvidence screenshots={row.screenshots} filledFields={row.filled_fields} loggedAt={row.logged_at} />
      )}
    </div>
  );
}
