import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { AgentApplyRow } from "@/lib/agentApplyStatus";
import { automationApi } from "@/services/automationApi";
import { describeApiError } from "@/lib/apiErrors";

interface Props {
  approvalId: string;
  row: AgentApplyRow | null | undefined;
  onResolved: () => void | Promise<void>;
}

/**
 * Panel pemulihan aman untuk persetujuan yang terkunci di `approval_submit_claims` karena worker/ekstensi
 * terhenti sebelum melapor. Tidak pernah melepas klaim lama yang berisiko ganda.
 */
export default function LockedClaimBanner({ approvalId, row, onResolved }: Props) {
  const [busy, setBusy] = useState<"mark_sent" | "create_fresh_approval" | null>(null);
  const [error, setError] = useState("");

  if (row?.claim_state !== "locked_stuck") return null;
  if (row.log_status === "success" || row.log_status === "submit_unverified") return null;

  const resolve = async (resolution: "mark_sent" | "create_fresh_approval") => {
    setBusy(resolution);
    setError("");
    try {
      const res = await automationApi.resolveLockedClaim(approvalId, resolution);
      toast.success(
        resolution === "mark_sent"
          ? "Status lamaran ditandai terkirim."
          : res.newApprovalId
            ? "Permintaan persetujuan baru dibuat di tab Menunggu."
            : "Permintaan persetujuan baru siap ditinjau."
      );
      await onResolved();
    } catch (err) {
      setError(describeApiError(err, "Gagal menyelesaikan status klaim terkunci."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-2.5 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 space-y-2.5">
      <div className="flex items-start gap-2 text-xs text-amber-950">
        <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="leading-relaxed">
          Klaim pengiriman untuk persetujuan ini terkunci karena percobaan sebelumnya tidak selesai melapor.
          Cek kotak masuk emailmu atau portal perusahaan lebih dulu sebelum memilih aksi di bawah:
        </p>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => resolve("mark_sent")}
          disabled={busy !== null}
          className="min-h-10 px-3 rounded-lg bg-[#16150F] text-white text-xs font-semibold hover:opacity-90 transition disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          {busy === "mark_sent" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5 text-[#D2F801]" aria-hidden="true" />}
          Sudah kukirim / ada email konfirmasi
        </button>
        <button
          type="button"
          onClick={() => resolve("create_fresh_approval")}
          disabled={busy !== null}
          className="min-h-10 px-3 rounded-lg border-2 border-[#0A5BE0] text-[#0A5BE0] bg-white text-xs font-semibold hover:bg-[#0A5BE0]/5 transition disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          {busy === "create_fresh_approval" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          Belum terkirim — buat persetujuan baru
        </button>
      </div>
    </div>
  );
}
