import { ExternalLink, Mail, Send } from "lucide-react";
import { NOT_QUEUED_HEADING, NOT_QUEUED_OPEN_LABEL, NOT_QUEUED_TEXT, type NotQueuedRoute } from "@/lib/approveOutcome";
import { safeJobUrl } from "@/lib/manualSubmit";

/**
 * Pengganti kartu "Agen pengisi formulir" untuk persetujuan yang sengaja tidak diantre (backend: queued false).
 * LinkedIn hanya bisa dilamar sendiri; lowongan email langsung dikirim lewat panel Email di kartu yang sama.
 * Applify tidak punya tombol "sudah kukirim sendiri": status Terkirim hanya datang dari log pengiriman.
 */
export default function NotQueuedNotice({ route, jobUrl }: { route: NotQueuedRoute; jobUrl?: string | null }) {
  const url = route === "manual" ? safeJobUrl(jobUrl) : null;
  const Icon = route === "manual" ? Send : Mail;
  return (
    <div data-testid="not-queued-notice" data-route={route} className="mt-3 rounded-xl border-2 border-black/[8%] bg-white px-3 py-2.5">
      <h4 className="inline-flex items-center gap-2 text-xs font-semibold">
        <Icon className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" /> {NOT_QUEUED_HEADING[route]}
      </h4>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{NOT_QUEUED_TEXT[route]}</p>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#0A5BE0] px-4 text-sm font-semibold text-white transition hover:bg-[#0256d3]"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {NOT_QUEUED_OPEN_LABEL}
          <span className="sr-only"> (terbuka di tab baru)</span>
        </a>
      )}
    </div>
  );
}
