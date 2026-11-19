import { useCallback, useEffect, useState } from "react";
import { Bot, CheckCircle2, Clock, Loader2, XCircle, RefreshCw } from "lucide-react";
import { automationQueue, type QueueItem } from "@/services/automationQueue";
import { describeError } from "@/lib/authErrors";
import { isQueueActive, queueStatusHint, queueStatusLabel, queueTypeLabel } from "@/lib/statusLabels";
import { relativeTime } from "@/lib/dashboardStats";

const POLL_MS = 15_000;

const TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900 border-amber-300",
  processing: "bg-blue-100 text-blue-900 border-blue-300",
  completed: "bg-green-100 text-green-900 border-green-300",
  failed: "bg-red-100 text-red-900 border-red-300",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "processing") return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Clock className="h-3.5 w-3.5" aria-hidden="true" />;
}

/**
 * Antrean tugas agen milik pengguna (tabel automation_queue). Tombol "Isi Formulir Saja" di jendela AI Apply
 * menjanjikan "Pantau di Applications"; panel ini yang memenuhi janji itu. Dimuat ulang tiap 15 detik selama
 * ada tugas yang belum selesai.
 */
export function QueuePanel() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setItems(await automationQueue.getQueue(10));
      setError("");
    } catch (err) {
      setError(describeError(err, "Antrean agen belum bisa dimuat."));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hasActive = (items ?? []).some((i) => isQueueActive(i.status));
  useEffect(() => {
    if (!hasActive) return;
    const t = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(t);
  }, [hasActive, load]);

  if (items === null && !error) return null; // pemuatan pertama: jangan kedipkan panel kosong
  if (!error && items && items.length === 0) return null;

  return (
    <section aria-labelledby="queue-heading" className="mb-6 rounded-2xl border-2 border-[#999999] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="queue-heading" className="flex items-center gap-2 text-base font-bold">
          <Bot className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" /> Antrean Agen
        </h2>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" /> Muat ulang
        </button>
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Tugas yang kamu serahkan ke agen, misalnya mengisi formulir lowongan. Agen tidak menekan tombol kirim sendiri.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error} <button type="button" onClick={load} className="font-semibold underline">Coba lagi</button>
        </p>
      )}

      <ul className="mt-3 space-y-2" aria-live="polite">
        {(items ?? []).map((q) => (
          <li key={q.id} className="rounded-xl border-2 border-[#E0E0E0] bg-[#F5F5F5] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{queueTypeLabel(q.job_type)}</p>
                {q.job && <p className="truncate text-sm text-muted-foreground">{q.job.title} · {q.job.company}</p>}
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${TONE[q.status] ?? "bg-gray-100 text-gray-800 border-gray-300"}`}>
                <StatusIcon status={q.status} /> {queueStatusLabel(q.status)}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {relativeTime(q.created_at)} · {queueStatusHint(q.status, q.job_type)}
            </p>
            {q.status === "failed" && q.error_message && (
              <details className="mt-1.5 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Detail teknis untuk pengelola</summary>
                <p className="mt-1 break-words font-mono">{q.error_message}</p>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
