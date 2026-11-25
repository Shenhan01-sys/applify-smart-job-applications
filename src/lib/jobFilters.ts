/**
 * Which rows of the `jobs` table the Lowongan page may show.
 *
 * The table also holds rows made by end-to-end tests: a URL on localhost, 127.0.0.1 or httpbin, or a source
 * such as `e2e-mock`. Applying to one of those opens a test server, not a company. The page drops them
 * on the client; the rows themselves stay in the database.
 *
 * Plain TypeScript with only relative imports, so it runs under `node --test` without a bundler.
 */

import { HIGH_MATCH_THRESHOLD, NO_PROFILE_SKILLS_TEXT } from "./matchScore.ts";

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
 * Lowongan yang tanggal tayangnya (posted_at) lebih lama dari ini tidak dimuat di halaman Lowongan. Iklan JobStreet
 * berakhir 30 hari setelah tayang (expiresAt di halaman asli, dicek 20 November 2026). Datanya di database tidak diubah.
 */
export const JOB_MAX_AGE_DAYS = 30;

/** Tanggal paling awal (YYYY-MM-DD, UTC) yang masih dimuat. */
export function freshSinceDate(now: Date = new Date()): string {
  return new Date(now.getTime() - JOB_MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10);
}

/** Saringan `or` PostgREST: tayang sejak freshSinceDate, atau tanpa tanggal tayang (tidak dibuang hanya karena itu). */
export function freshJobsFilter(now: Date = new Date()): string {
  return `posted_at.gte.${freshSinceDate(now)},posted_at.is.null`;
}

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

/** Kata cari untuk lowongan uji Applify ("[UJI] Staf Uji Coba"). Diisi agen tanpa Ekstensi Browser. */
export const TEST_LISTING_QUERY = "[UJI]";

/** True bila kotak cari sudah memuat penanda lowongan uji ("uji" atau "[uji]", tanpa membedakan huruf). */
export function isTestListingQuery(raw: string): boolean {
  return searchTerms(raw).some((t) => t.replace(/[[\]]/g, "").toLowerCase() === "uji");
}

export const SAVED_EMPTY_TITLE = "Belum ada lowongan tersimpan";
export const SAVED_EMPTY_TEXT = "Tekan ikon simpan pada kartu lowongan untuk menyimpannya.";

/**
 * Teks keadaan kosong untuk saringan "Tersimpan". null bila teks umum ("Tidak ada lowongan yang cocok") yang
 * benar: ada lowongan tersimpan (jadi kosongnya karena pencarian), atau daftar tersimpan gagal dimuat
 * (kosongnya belum tentu berarti pengguna belum menyimpan apa pun).
 */
export function savedFilterEmpty(input: { filter: string; savedCount: number; loadFailed: boolean }): { title: string; text: string } | null {
  if (input.filter !== "saved" || input.loadFailed || input.savedCount > 0) return null;
  return { title: SAVED_EMPTY_TITLE, text: SAVED_EMPTY_TEXT };
}

// ---- Penyaring tempat kerja dan keadaan kosong halaman Lowongan (uji klik 20 November 2026, temuan 7) --------------

export type WorkplaceKind = "remote" | "hybrid" | "on-site";

interface WorkplaceFields {
  workplace_type?: unknown;
  location?: unknown;
  title?: unknown;
}

const WORKPLACE_FILTER_KIND: Record<string, WorkplaceKind> = { remote: "remote", hybrid: "hybrid", onsite: "on-site" };

/**
 * Jenis tempat kerja sebuah lowongan. `jobs.workplace_type` dibaca dengan normalisasi yang sama seperti label kartu
 * ("On-Site", "onsite", "on_site" sama dengan "on-site"), supaya kartu berlabel "Di kantor" juga lolos penyaring
 * "Di kantor". Bila kolomnya kosong, hanya kata yang jelas di lokasi atau judul yang dipakai ("Remote", "WFH", "Hybrid").
 * Nilai yang tidak dikenal tidak ditebak.
 */
export function workplaceKind(job: WorkplaceFields): WorkplaceKind | null {
  const raw = typeof job.workplace_type === "string" ? job.workplace_type.trim().toLowerCase().replace(/[\s_]+/g, "-") : "";
  if (raw === "remote" || raw === "hybrid") return raw;
  if (raw === "on-site" || raw === "onsite") return "on-site";
  if (raw) return null;
  const text = `${typeof job.location === "string" ? job.location : ""} ${typeof job.title === "string" ? job.title : ""}`.toLowerCase();
  if (/\bhybrid\b/.test(text)) return "hybrid";
  if (/\b(remote|wfh|work from home)\b/.test(text)) return "remote";
  return null;
}

/** Kunci penyaring halaman ("remote", "hybrid", "onsite") terhadap lowongan; kunci lain selalu false. */
export function matchesWorkplaceFilter(job: WorkplaceFields, filter: string): boolean {
  const wanted = WORKPLACE_FILTER_KIND[filter];
  return wanted !== undefined && workplaceKind(job) === wanted;
}

/** Kata di lokasi atau judul yang dibaca workplaceKind bila kolom workplace_type kosong; dipakai juga di kueri server. */
const TEXT_HINTS: Record<"remote" | "hybrid", readonly string[]> = { remote: ["remote", "wfh", "work from home"], hybrid: ["hybrid"] };

/**
 * Saringan `or` PostgREST untuk penyaring tempat kerja ("remote", "hybrid", "onsite"), supaya penyaringnya
 * dijalankan di server seperti kotak cari, bukan hanya pada JOBS_PAGE_LIMIT lowongan yang sudah termuat
 * (di produksi remote dan hybrid ada ratusan, tetapi hampir semuanya di luar 200 terbaru). Lowongan lolos bila
 * `workplace_type` sama persis, atau kolomnya kosong dan lokasi atau judulnya menyebut kata yang jelas, sama
 * dengan workplaceKind. Penyaring klien (matchesWorkplaceFilter) tetap dipasang sebagai pemeriksa akhir.
 * null untuk kunci lain (all, high-match, saved): tidak ada saringan di server.
 */
export function workplaceQueryFilter(filter: string): string | null {
  const kind = WORKPLACE_FILTER_KIND[filter];
  if (!kind) return null;
  const exact = `workplace_type.eq.${kind}`;
  if (kind === "on-site") return exact;
  const hints = TEXT_HINTS[kind].flatMap((w) => [`location.ilike.*${w}*`, `title.ilike.*${w}*`]);
  return `${exact},and(workplace_type.is.null,or(${hints.join(",")}))`;
}

export interface JobsEmptyInput {
  /** Kunci penyaring aktif: all, remote, hybrid, onsite, high-match, saved. */
  filter: string;
  searchQuery: string;
  /** Jumlah lowongan yang termuat untuk pencarian ini (sebelum penyaring klien). */
  loadedCount: number;
  savedCount: number;
  savedLoadFailed: boolean;
  /** null = skill profil belum dimuat atau gagal. */
  profileHasSkills: boolean | null;
  skillsError: string;
  /** Lowongan yang punya skor kecocokan, dan skor tertinggi di antaranya. */
  scoredCount: number;
  topScore: number | null;
}

export interface JobsEmptyState {
  title: string;
  text: string;
  /** Tombol di bawah teks: ke Profil, atau membuka pemindai lowongan. */
  action: "profile" | "scanner" | null;
}

const WORKPLACE_COPY: Record<string, { title: string; label: string }> = {
  remote: { title: "Belum ada lowongan remote", label: "Remote" },
  hybrid: { title: "Belum ada lowongan hybrid", label: "Hybrid" },
  onsite: { title: "Belum ada lowongan di kantor", label: "Di kantor" },
};

/** Label tombol pemindai di halaman Lowongan; teks lain menyebutnya dengan nama ini, bukan dengan letaknya. */
export const SCANNER_BUTTON_LABEL = "Cari lowongan baru dari banyak situs";

/**
 * Subjudul halaman Lowongan saat tidak ada lowongan yang tampil. Tombol pemindai ada di atas kotak cari, bukan di
 * bawah, dan keadaan kosong di bawahnya tidak punya tombol itu (uji klik 21 November 2026, temuan 27), jadi teks
 * menyebut tombolnya dengan nama dan tanpa kata letak.
 */
export function jobsEmptySubtitle(searchQuery: string): string {
  const q = searchQuery.trim();
  return q
    ? `Tidak ada lowongan untuk pencarian "${q}". Coba kata kunci lain, atau tekan "${SCANNER_BUTTON_LABEL}".`
    : `Mulai dengan menekan "${SCANNER_BUTTON_LABEL}".`;
}

export const GENERIC_EMPTY_TITLE = "Tidak ada lowongan yang cocok";
export const GENERIC_EMPTY_TEXT = "Coba ubah penyaring atau kata kunci pencarian.";

/**
 * Teks keadaan kosong halaman Lowongan. Tiap penyaring menyebut apa yang dicari, bukan teks umum, dan memberi
 * langkah berikutnya. Penyaring tempat kerja dijalankan di server (workplaceQueryFilter), jadi kosongnya berarti
 * tidak ada lowongan seperti itu untuk pencarian ini. Penyaring 80% tetap di klien karena skornya per pengguna:
 * ia hanya melihat lowongan yang termuat (paling banyak JOBS_PAGE_LIMIT yang terbaru).
 */
export function jobsEmptyState(input: JobsEmptyInput): JobsEmptyState {
  const query = input.searchQuery.trim();
  const among = `${input.loadedCount} lowongan yang dimuat${query ? ` untuk pencarian "${query}"` : ""}`;

  const wp = WORKPLACE_COPY[input.filter];
  if (wp && input.loadedCount === 0) {
    return {
      title: wp.title,
      text: `Penyaring ini mencari di semua lowongan aktif, dan tidak ada yang berlabel ${wp.label}${query ? ` untuk pencarian "${query}"` : ""}. Coba pilih "Semua"${query ? " atau ganti kata kunci" : ""}.`,
      action: null,
    };
  }

  if (input.loadedCount === 0 && !query) {
    return {
      title: "Belum ada lowongan",
      text: "Tekan tombol biru di atas untuk mencari lowongan dari JobStreet, Glints, Kalibrr, dan papan karier perusahaan.",
      action: "scanner",
    };
  }
  const saved = savedFilterEmpty({ filter: input.filter, savedCount: input.savedCount, loadFailed: input.savedLoadFailed });
  if (saved) return { ...saved, action: null };

  if (input.loadedCount === 0) {
    return {
      title: GENERIC_EMPTY_TITLE,
      text: `Tidak ada lowongan untuk pencarian "${query}". Coba kata kunci yang lebih umum, misalnya nama posisi atau kota, atau hapus pencarian.`,
      action: null,
    };
  }

  if (input.filter === "high-match") {
    if (input.profileHasSkills === false) return { title: "Skill di profilmu belum terisi", text: `${NO_PROFILE_SKILLS_TEXT}.`, action: "profile" };
    if (input.skillsError) return { title: GENERIC_EMPTY_TITLE, text: input.skillsError, action: null };
    const limitNote = input.loadedCount >= JOBS_PAGE_LIMIT ? ` (paling banyak ${JOBS_PAGE_LIMIT} yang terbaru)` : "";
    const basis =
      input.scoredCount === 0 || input.topScore === null
        ? `Dari ${among}, belum ada yang skor kecocokannya bisa dihitung karena lowongannya tidak menyebut skill yang terbaca.`
        : `Dari ${among}, ${input.scoredCount} punya skor kecocokan dan yang tertinggi ${input.topScore}%.`;
    return {
      title: `Belum ada kecocokan ${HIGH_MATCH_THRESHOLD}% ke atas`,
      text: `${basis} Penyaring ini hanya menghitung lowongan yang dimuat di layar${limitNote}. Coba cari nama skill atau posisi di kotak cari, atau lengkapi skill di Profil.`,
      action: null,
    };
  }

  return { title: GENERIC_EMPTY_TITLE, text: GENERIC_EMPTY_TEXT, action: null };
}
