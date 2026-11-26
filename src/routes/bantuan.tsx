import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CircleHelp, Download, Puzzle, BookOpen, ListChecks } from "lucide-react";
import { HELP_EXTENSION, HELP_EXTENSION_NOTES, HELP_EXTENSION_STEPS } from "@/components/help/helpContent";
import {
  EXTENSION_DOWNLOAD_FILENAME,
  EXTENSION_DOWNLOAD_HREF,
  EXTENSION_DOWNLOAD_LABEL,
  EXTENSION_DOWNLOAD_VERSION,
} from "@/lib/extensionConnect";
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
            <p>{HELP_EXTENSION.stop}</p>
          </div>

          <h3 className="mt-5 text-base font-bold">{HELP_EXTENSION.installTitle}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">{HELP_EXTENSION.installIntro}</p>
          <ol data-testid="help-extension-steps" className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-foreground/90">
            {HELP_EXTENSION_STEPS.map((step) => (
              <li key={step.title}>
                <span className="font-semibold">{step.title}.</span> {step.detail}
                {step.link === "download" && (
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <a
                      href={EXTENSION_DOWNLOAD_HREF}
                      download={EXTENSION_DOWNLOAD_FILENAME}
                      data-testid="help-extension-download"
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" /> {EXTENSION_DOWNLOAD_LABEL}
                    </a>
                    <span className="text-xs text-muted-foreground">Versi uji {EXTENSION_DOWNLOAD_VERSION}</span>
                  </span>
                )}
                {step.link === "settings" && (
                  <>
                    {" "}
                    Langsung ke{" "}
                    <Link to="/settings" hash="ekstensi" className="text-primary underline underline-offset-2">
                      bagian Ekstensi Browser di Pengaturan
                    </Link>
                    .
                  </>
                )}
              </li>
            ))}
          </ol>

          <h3 className="mt-5 text-base font-bold">{HELP_EXTENSION.notesTitle}</h3>
          <ul data-testid="help-extension-notes" className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground/90">
            {HELP_EXTENSION_NOTES.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
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
