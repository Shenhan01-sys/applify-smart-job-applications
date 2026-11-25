import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CircleHelp, Puzzle, BookOpen, ListChecks } from "lucide-react";
import { HELP_EXTENSION } from "@/components/help/helpContent";
import { HelpSteps } from "@/components/help/HelpSteps";
import { HelpGlossary } from "@/components/help/HelpGlossary";
import { HelpFaq } from "@/components/help/HelpFaq";

// Halaman publik: tanpa beforeLoad dan tanpa AppShell, supaya bisa dibuka sebelum masuk akun.
export const Route = createFileRoute("/bantuan")({
  head: () => ({ meta: [{ title: "Bantuan - Applify" }] }),
  component: BantuanPage,
});

function BantuanPage() {
  return (
    <div className="app-ui min-h-screen bg-background px-4 py-10">
      <main className="mx-auto w-full max-w-2xl">
        <Link to="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke beranda
        </Link>

        <h1 className="mt-4 text-3xl font-bold">Bantuan Applify</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Halaman ini menjelaskan alur lamaran dan istilah yang muncul di aplikasi. Bisa dibuka sebelum atau sesudah masuk akun.
        </p>

        <section id="cara-kerja" className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <ListChecks className="h-5 w-5 text-primary" aria-hidden="true" /> Cara kerja lima langkah
          </h2>
          <HelpSteps />
        </section>

        <section id="ekstensi" className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Puzzle className="h-5 w-5 text-primary" aria-hidden="true" /> {HELP_EXTENSION.title}
          </h2>
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/90">
            <p>{HELP_EXTENSION.intro}</p>
            <p>{HELP_EXTENSION.use}</p>
            <p>
              {HELP_EXTENSION.token} Buka bagian itu di{" "}
              <Link to="/settings" hash="ekstensi" className="text-primary underline underline-offset-2">
                halaman Pengaturan
              </Link>
              .
            </p>
            <p>{HELP_EXTENSION.stop}</p>
          </div>
        </section>

        <section id="glosarium" className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" /> Glosarium singkat
          </h2>
          <HelpGlossary />
        </section>

        <section id="faq" className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <CircleHelp className="h-5 w-5 text-primary" aria-hidden="true" /> Kenapa lamaran belum terkirim
          </h2>
          <HelpFaq />
        </section>

        <p className="mt-8 text-sm text-muted-foreground">
          Butuh bantuan lain? Tulis kendala yang kamu temui di kolom kendala formulir UAT. Peneliti membacanya tanpa data diri.
        </p>
      </main>
    </div>
  );
}
