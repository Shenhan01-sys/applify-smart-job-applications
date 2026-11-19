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
    <div role="alert" className={`rounded-2xl border-2 border-red-200 bg-red-50 p-6 text-center ${className}`}>
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-red-100">
        <AlertCircle className="h-6 w-6 text-red-600" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-red-800">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-red-700">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {retrying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          Coba lagi
        </button>
      )}
    </div>
  );
}
