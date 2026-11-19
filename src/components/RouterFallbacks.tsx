import { Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

/**
 * Layar cadangan untuk router: dipakai saat sebuah halaman gagal dirender (error tak terduga) atau
 * alamat tidak ada. Semua teks berbahasa Indonesia; detail teknis hanya tampil di mode pengembangan.
 */
export function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div role="alert" className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Terjadi kesalahan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Halaman ini gagal dimuat. Data kamu aman. Coba muat ulang, dan kalau masih gagal, kembali ke beranda.
        </p>
        {import.meta.env.DEV && error?.message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Coba lagi
          </button>
          <a
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ke beranda
          </a>
        </div>
      </div>
    </div>
  );
}

export function DefaultNotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-7xl font-bold text-gradient-primary" aria-hidden="true">404</p>
        <h1 className="mt-4 text-xl font-semibold">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Halaman yang kamu cari tidak ada atau sudah dipindahkan. Kamu bisa kembali ke beranda dan melanjutkan dari sana.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md gradient-primary px-5 py-2 text-sm font-medium text-white"
          >
            Ke beranda
          </Link>
        </div>
      </div>
    </div>
  );
}
