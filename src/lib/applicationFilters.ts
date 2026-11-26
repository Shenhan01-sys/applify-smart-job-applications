/**
 * Utilitas murni untuk pencarian, penyaringan, dan penanda hasil akhir lamaran di halaman Lamaran Saya
 * (UX-P7-04 & UX-P7-06). Tanpa impor React/Supabase agar bisa diuji langsung dengan `node --test`.
 */

export const OUTCOME_PRESETS = ["Wawancara", "Tawaran", "Ditolak"] as const;
export type OutcomePreset = (typeof OUTCOME_PRESETS)[number];

export interface FilterableApp {
  status?: string | null;
  company_response?: string | null;
  jobs?: { title?: string | null; company?: string | null } | null;
}

export function extractOutcomeTag(companyResponse: string | null | undefined): OutcomePreset | null {
  const text = (companyResponse ?? "").trim();
  if (!text) return null;
  for (const preset of OUTCOME_PRESETS) {
    if (text === preset || text.startsWith(`${preset}:`) || text.startsWith(`${preset} -`) || text.startsWith(`${preset} —`)) {
      return preset;
    }
  }
  return null;
}

export function applyOutcomePreset(currentNote: string | null | undefined, preset: OutcomePreset): string {
  const raw = (currentNote ?? "").trim();
  if (!raw) return preset;
  const existing = extractOutcomeTag(raw);
  if (!existing) return `${preset}: ${raw}`;
  const rest = raw.slice(existing.length).replace(/^[:\s—-]+/, "").trim();
  return rest ? `${preset}: ${rest}` : preset;
}

export function filterApplications<T extends FilterableApp>(
  apps: readonly T[],
  opts: { query?: string; status?: string },
): T[] {
  const q = (opts.query ?? "").trim().toLowerCase();
  const status = (opts.status ?? "all").trim();
  return apps.filter((app) => {
    if (status === "active") {
      if (app.status === "closed") return false;
    } else if (status && status !== "all") {
      if (app.status !== status) return false;
    }
    if (!q) return true;
    const hay = [app.jobs?.title ?? "", app.jobs?.company ?? "", app.company_response ?? ""]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
