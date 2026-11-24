import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Bot, CheckCircle2, Clock, Loader2, XCircle, RefreshCw } from "lucide-react";
import { automationQueue, type QueueItem } from "@/services/automationQueue";
import { describeError } from "@/lib/authErrors";
import { applyJobFinished, isEmailTestMode, isQueueActive, isQueueNeedsManual, queueDisplayLabel, queueStatusHint, queueTypeLabel } from "@/lib/statusLabels";
import { relativeTime } from "@/lib/dashboardStats";

const POLL_MS = 15_000;

const TONE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900 border-amber-300",
  processing: "bg-blue-100 text-blue-900 border-blue-300",
  completed: "bg-green-100 text-green-900 border-green-300",
  failed: "bg-red-100 text-red-900 border-red-300",
  // Tugas apply yang selesai tanpa mengisi apa pun (isQueueNeedsManual): bukan sukses, bukan galat. Kuning, sama
  // dengan lencana "Isi sendiri di situs" pada kartu lamaran.
  needs_manual: "bg-amber-100 text-amber-900 border-amber-300",
};

function StatusIcon({ status }: { status: string }) {
  if (status === "needs_manual") return <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  if (status === "processing") return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Clock className="h-3.5 w-3.5" aria-hidden="true" />;
}

/**
 * Antrean tugas agen milik pengguna (tabel automation_queue). Tombol "Isi Formulir Saja" di jendela AI Apply
 * menjanjikan "Pantau di Applications"; panel ini yang memenuhi janji itu. Dimuat ulang tiap 15 detik selama
 * ada tugas yang belum selesai. Ditaruh di bawah papan lamaran dengan margin atas (`mt-6`): panel muncul belakangan
 * dan tingginya berubah-ubah, jadi di atas papan ia menggeser papan (temuan 31).
 *
 * Worker mengubah lamaran dan menulis log percobaan saat tugas apply selesai, padahal halaman Lamaran hanya
 * memuat datanya sekali. Karena itu panel memanggil `onApplyFinished` saat sebuah tugas apply berpindah dari
 * berjalan ke selesai atau gagal (tanpa polling tambahan: pemuatan berkala panel ini sudah ada).
 * `fieldsFilledByQueue` (id tugas -> isian yang terisi, dari log percobaan) membuat petunjuk tugas apply yang
 * selesai tanpa mengisi apa pun berbeda dari yang berhasil mengisi.
 */
export function QueuePanel({
  onApplyFinished,
  fieldsFilledByQueue,
}: {
  onApplyFinished?: () => void;
  fieldsFilledByQueue?: Record<string, number | null>;
}) {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // Status tiap tugas pada pemuatan sebelumnya, untuk mendeteksi tugas apply yang baru saja selesai.
  const seen = useRef(new Map<string, string>());
  const finishedRef = useRef(onApplyFinished);
  finishedRef.current = onApplyFinished;

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await automationQueue.getQueue(10);
      const finished = applyJobFinished(seen.current, next);
      seen.current = new Map(next.map((i) => [i.id, i.status]));
      setItems(next);
      setError("");
      if (finished) finishedRef.current?.();
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
    <section aria-labelledby="queue-heading" className="mt-6 rounded-2xl border-2 border-[#999999] bg-white p-4">
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
        {(items ?? []).map((q) => {
          // Status yang tampil: "completed" milik tugas apply tanpa isian terisi tidak ditampilkan sebagai sukses.
          const fieldsFilled = fieldsFilledByQueue?.[q.id];
          // Email yang tidak dikirim karena mode uji juga tidak tampil hijau.
          const testMode = isEmailTestMode(q.status, q.job_type, q.email_test_mode);
          const shown = testMode || isQueueNeedsManual(q.status, q.job_type, fieldsFilled) ? "needs_manual" : q.status;
          return (
          <li key={q.id} className="rounded-xl border-2 border-[#E0E0E0] bg-[#F5F5F5] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{queueTypeLabel(q.job_type)}</p>
                {q.job && <p className="truncate text-sm text-muted-foreground">{q.job.title} · {q.job.company}</p>}
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${TONE[shown] ?? "bg-gray-100 text-gray-800 border-gray-300"}`}>
                <StatusIcon status={shown} /> {queueDisplayLabel(q.status, q.error_message, q.job_type, fieldsFilled, q.email_test_mode)}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {relativeTime(q.created_at)} · {queueStatusHint(q.status, q.job_type, q.error_message, fieldsFilled, q.email_test_mode)}
            </p>
            {q.status === "failed" && q.error_message && (
              <details className="mt-1.5 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Detail teknis untuk pengelola</summary>
                <p className="mt-1 break-words font-mono">{q.error_message}</p>
              </details>
            )}
          </li>
          );
        })}
      </ul>
    </section>
  );
}
