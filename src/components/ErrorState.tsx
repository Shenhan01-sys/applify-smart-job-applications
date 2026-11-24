import { AlertCircle, Loader2, RefreshCw } from "lucide-react";

/**
 * Keadaan galat standar untuk halaman yang gagal memuat data. Selalu menyebut apa yang terjadi dan
 * menawarkan "Coba lagi", supaya pengguna tidak melihat layar kosong atau data palsu.
 */
export function ErrorState({
  title = "Data belum bisa dimuat",
  message,
  onRetry,
  retrying = false,
  className = "",
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div role="alert" className={`rounded-2xl border border-red-200 bg-red-50/70 px-5 py-6 text-center sm:px-6 ${className}`}>
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-red-100">
        <AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-red-800">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-red-700">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
        >
          {retrying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          Coba lagi
        </button>
      )}
    </div>
  );
}
