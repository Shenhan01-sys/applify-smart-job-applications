import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_UPDATED } from "@/lib/privacyContent";

// Halaman publik: tanpa beforeLoad dan tanpa AppShell, sehingga bisa dibuka tanpa login
// (dibutuhkan untuk tautan kebijakan privasi di layar persetujuan Google OAuth).
export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Kebijakan Privasi — Applify" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <main className="mx-auto w-full max-w-2xl">
        <Link to="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke beranda
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Kebijakan Privasi</h1>
        <p className="mt-2 text-sm text-muted-foreground">Terakhir diperbarui: {PRIVACY_UPDATED}</p>
        <p className="mt-4 text-sm leading-relaxed text-foreground/90">{PRIVACY_INTRO}</p>

        {PRIVACY_SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="mt-8">
            <h2 className="text-lg font-bold">{s.title}</h2>
            <div className="mt-2 space-y-3 text-sm leading-relaxed text-foreground/90">
              {s.items && (
                <ul className="list-disc space-y-1.5 pl-5">
                  {s.items.map((d) => <li key={d}>{d}</li>)}
                </ul>
              )}
              {s.paragraphs?.map((p) => <p key={p}>{p}</p>)}
            </div>
          </section>
        ))}

        <p className="mt-8 text-sm text-muted-foreground">
          Ringkasan lain dan kontak peneliti ada di halaman{" "}
          <Link to="/terms" className="text-primary underline underline-offset-2">Ketentuan &amp; Privasi</Link>.
        </p>
      </main>
    </div>
  );
}
