/**
 * Which rows of the `jobs` table the Lowongan page may show.
 *
 * The table also holds rows made by end-to-end tests: a URL on localhost, 127.0.0.1 or httpbin, or a source
 * such as `e2e-mock`. Applying to one of those opens a test server, not a company. The page drops them
 * on the client; the rows themselves stay in the database.
 *
 * Plain TypeScript with no imports, so it runs under `node --test` without a bundler.
 */

/** Hostnames that point at a test or local machine rather than a company. */
function isTestHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".test") ||
    h === "0.0.0.0" ||
    h === "::1" ||
    /^127\.\d+\.\d+\.\d+$/.test(h) ||
    h.includes("httpbin")
  );
}

/** True for an http(s) address of a real host. Missing, malformed, other schemes and test hosts are false. */
export function isRealJobUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (!parsed.hostname) return false;
  return !isTestHost(parsed.hostname);
}

/** True for the sources the end-to-end tests write: `e2e-mock`, `e2e`, `httpbin`. */
export function isTestSource(source: unknown): boolean {
  if (typeof source !== "string") return false;
  return /^(e2e|httpbin)/.test(source.trim().toLowerCase());
}

export interface JobFilterFields {
  status?: unknown;
  external_url?: unknown;
  platform_source?: unknown;
}

/** An active job with a real posting address that no test wrote. */
export function isVisibleJob(job: JobFilterFields): boolean {
  return job.status === "active" && isRealJobUrl(job.external_url) && !isTestSource(job.platform_source);
}

export function visibleJobs<T extends JobFilterFields>(jobs: readonly T[]): T[] {
  return jobs.filter(isVisibleJob);
}

/** Batas baris per muatan halaman Lowongan. */
export const JOBS_PAGE_LIMIT = 200;

/**
 * Kata kunci pencarian Lowongan, dipecah per kata. Karakter yang punya arti dalam sintaks `or` PostgREST
 * (koma, kurung, titik dua, tanda kutip, garis miring terbalik) dan wildcard (`%`, `*`) dibuang, supaya ketikan
 * pengguna tidak bisa mengubah bentuk kueri. Paling banyak 5 kata.
 */
export function searchTerms(raw: string): string[] {
  return raw.replace(/[,():"'\\%*]/g, " ").split(/\s+/).map((t) => t.trim()).filter(Boolean).slice(0, 5).map((t) => t.slice(0, 40));
}

/**
 * Saringan PostgREST untuk pencarian Lowongan di server. Satu saringan `or` per kata: setiap kata harus muncul
 * di judul, perusahaan, atau lokasi. Memanggil `.or()` beberapa kali berarti DAN di antara saringan.
 * Pencocokan per kata dipakai karena pencocokan frasa utuh gagal untuk "Frontend Engineer, Ads"
 * (koma dibuang sehingga frasa tidak lagi sama dengan judul; uji klik 19 November 2026).
 */
export function jobSearchFilters(raw: string): string[] {
  return searchTerms(raw).map((t) => ["title", "company", "location"].map((col) => `${col}.ilike.*${t}*`).join(","));
}

/** Pencocokan yang sama di klien: setiap kata ada di judul, perusahaan, atau lokasi (tanpa membedakan huruf besar). */
export function matchesJobSearch(job: { title?: string | null; company?: string | null; location?: string | null }, raw: string): boolean {
  const hay = `${job.title ?? ""} ${job.company ?? ""} ${job.location ?? ""}`.toLowerCase();
  return searchTerms(raw).every((t) => hay.includes(t.toLowerCase()));
}
