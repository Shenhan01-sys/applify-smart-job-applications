import { ExternalLink, ListChecks } from "lucide-react";
import { OPEN_JOB_PAGE_LABEL } from "@/lib/agentApplyStatus";
import { safeJobUrl } from "@/lib/manualSubmit";
import { NEXT_STEPS_TITLE, type NextStepItem } from "@/lib/nextStepsGuide";

/**
 * "Langkah berikutnya" saat Ekstensi Browser berhenti sebelum tombol kirim akhir. Daftar bernomor dari
 * `details.next_steps`. Hanya petunjuk dan satu tautan buka halaman lowongan: kartu ini tidak menyimpan sub-formulir,
 * tidak melanjutkan halaman, dan tidak mengirim lamaran. Semua itu diklik pengguna sendiri di tab lowongan.
 */
export default function AgentNextSteps({ items, jobUrl }: { items: NextStepItem[]; jobUrl?: string | null }) {
  const openUrl = safeJobUrl(jobUrl);
  return (
    <div data-testid="agent-next-steps" className="mt-2 rounded-lg border-2 border-blue-100 bg-blue-50/60 px-3 py-2.5">
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-950">
        <ListChecks className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" /> {NEXT_STEPS_TITLE}
      </p>
      <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-blue-950 marker:font-semibold">
        {items.map((item) => (
          <li key={item.key}>
            {item.lead}
            {item.label && <> <strong className="font-semibold">{item.label}</strong></>}
            {item.tail && <> {item.tail}</>}
            {item.openTab && openUrl && (
              <a
                href={openUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="open-job-tab"
                className="mt-1.5 flex min-h-9 w-fit items-center gap-1.5 rounded-lg border-2 border-blue-200 bg-white px-3 py-1.5 font-semibold text-blue-950 transition-colors hover:bg-blue-100"
              >
                {OPEN_JOB_PAGE_LABEL} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
