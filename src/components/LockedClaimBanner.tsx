import { useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { AgentApplyRow } from "@/lib/agentApplyStatus";
import { automationApi } from "@/services/automationApi";
import { classifyClaimResolveError, shouldShowLockedClaimBanner } from "@/lib/claimResolution";

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
  const [busy, setBusy] = useState<"create_fresh_approval" | null>(null);
  const [error, setError] = useState("");
  // Sesudah pemulihan berhasil (atau klaim ternyata sudah selesai), banner langsung hilang tanpa menunggu muat ulang,
  // supaya klik kedua tidak membuat persetujuan baru lagi.
  const [done, setDone] = useState(false);

  if (done || !shouldShowLockedClaimBanner(row?.claim_state, row?.log_status)) return null;

  // Tidak ada tombol "sudah kukirim": sesi agen berjalan di peramban worker yang tidak bisa dibuka pengguna
  // (Hans, 25 November 2026). Satu-satunya pemulihan dari sini adalah persetujuan baru.
  const resolve = async (resolution: "create_fresh_approval") => {
    if (busy !== null) return;
    setBusy(resolution);
    setError("");
    try {
      const res = await automationApi.resolveLockedClaim(approvalId, resolution);
      toast.success(res.newApprovalId ? "Permintaan persetujuan baru dibuat di tab Menunggu." : "Permintaan persetujuan baru siap ditinjau.");
      setDone(true);
      await onResolved();
    } catch (err) {
      const failure = classifyClaimResolveError(
        err,
        "Status klaim terkunci belum bisa dipulihkan. Periksa koneksi internetmu lalu coba tekan tombol di bawah lagi. Data lamaran dan persetujuanmu tidak hilang.",
      );
      if (failure.kind === "already_done") {
        // 409: klaim sudah diselesaikan (klik ganda atau tab lain). Sembunyikan banner dan muat ulang status.
        toast.info(failure.message);
        setDone(true);
        await onResolved();
      } else if (failure.kind === "in_progress") {
        // 409: pengiriman masih berjalan. Jangan tawarkan pemulihan; muat ulang supaya statusnya mengikuti.
        toast.warning(failure.message);
        await onResolved();
      } else {
        setError(failure.message);
      }
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
          Cek dulu kotak masuk emailmu. Bila sudah ada email konfirmasi dari perusahaan, lamaranmu sudah terkirim, jadi
          jangan buat persetujuan baru supaya tidak terkirim dua kali.
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
          onClick={() => resolve("create_fresh_approval")}
          disabled={busy !== null}
          className="min-h-10 px-3 rounded-lg border-2 border-[#0A5BE0] text-[#0A5BE0] bg-white text-xs font-semibold hover:bg-[#0A5BE0]/5 transition disabled:opacity-60 inline-flex items-center gap-1.5"
        >
          {busy === "create_fresh_approval" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
          Belum ada konfirmasi, buat persetujuan baru
        </button>
      </div>
    </div>
  );
}
