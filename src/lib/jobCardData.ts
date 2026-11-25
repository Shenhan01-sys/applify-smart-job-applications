/**
 * What a Job Feed card may show for a row of the `jobs` table.
 *
 * Rows ingested from the job sources (backend/services/job-ingest.service.ts) carry no AI analysis. The live
 * `jobs` table has skill_matches, skill_gaps, ai_actions and salary_benchmark columns (they are not in
 * schema.sql), but no flow ever fills them for a real row: only the demo data in mocks/mockData.ts does. The
 * same holds for acceptance_potential, company_culture_score, growth_potential and ai_strategy. The card used
 * to assume all of them were present, which crashed the page for a real row and, for the missing numbers,
 * printed invented defaults. These helpers return `null` or an empty list for what is not there, and the
 * card hides that part.
 *
 * What a real row does get is built elsewhere: the skill analysis comes from lib/matchScore.ts (computeMatch),
 * and the full description, requirements, salary and salary comparison come from the server through
 * lib/jobDetail.ts. skill_matches is only an extra source when a row happens to carry it.
 *
 * Plain TypeScript with no imports, so it runs under `node --test` without a bundler.
 */

/** A usable 0..100 score; anything else (null, undefined, NaN, text) is "not measured". */
export function scoreOrNull(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Always an array: jsonb columns come back as null, a string, or an object when a source wrote them badly. */
export function listOrEmpty<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export interface SkillMatchLike {
  skill?: string;
  level?: number;
}

export interface RadarPoint {
  name: string;
  value: number;
}

const AXES: Array<{ name: string; key: string }> = [
  { name: "Tech", key: "Tech" },
  { name: "Exp", key: "Experience" },
  { name: "Edu", key: "Education" },
  { name: "Soft", key: "Soft" },
  { name: "Lang", key: "Language" },
  { name: "Tools", key: "Tools" },
];

/**
 * Radar points from measured skill matches only. No matches = no chart (null), never a chart of
 * made-up numbers. An axis with no match of its own is 0, so the shape shows what was measured.
 */
export function radarFromMatches(matches: unknown): RadarPoint[] | null {
  const list = listOrEmpty<SkillMatchLike>(matches).filter((m) => m && typeof m.skill === "string");
  if (list.length === 0) return null;
  return AXES.map(({ name, key }) => ({
    name,
    value: scoreOrNull(list.find((m) => m.skill!.includes(key))?.level) ?? 0,
  }));
}

/** Date to print on the card: the posting date, else the day the row was saved; null when neither is valid. */
export function postedDate(row: { posted_at?: unknown; created_at?: unknown }): Date | null {
  for (const raw of [row.posted_at, row.created_at]) {
    if (typeof raw === "string" && raw) {
      const d = new Date(raw);
      if (Number.isFinite(d.getTime())) return d;
    }
  }
  return null;
}

/**
 * The Edge Function relays the model's JSON, so a list such as skillGaps may hold strings, objects, or junk.
 * Keep non-empty, unique, trimmed strings (an object contributes its `skill` or `message`).
 */
export function cleanStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const text = typeof x === "string" ? x : x && typeof x === "object" ? String((x as any).skill ?? (x as any).message ?? "") : "";
    const t = text.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * Alamat lowongan yang aman dipakai sebagai `href`: hanya http dan https. `external_url` berasal dari scraper dan
 * klien MCP, jadi bisa berisi `javascript:` atau `data:` (temuan BS-P1-02). Selain itu hasilnya null dan kartu
 * tidak menampilkan tautan.
 */
export function safeExternalHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > 2000) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
