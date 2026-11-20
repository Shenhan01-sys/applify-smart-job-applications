/**
 * Detail lowongan di kartu: kapan detail lengkap perlu diambil, bagaimana gaji ditulis, dan bagaimana gaji
 * lowongan dibandingkan dengan lowongan serupa.
 *
 * Baris lowongan dari JobStreet, Glints, dan Dealls hanya membawa ringkasan (deskripsi pendek, tanpa
 * requirements, sering tanpa gaji). Server punya dua endpoint untuk melengkapinya:
 *   POST /api/jobs/:id/enrich           mengambil deskripsi, requirements, dan gaji dari situs asal
 *   GET  /api/jobs/:id/salary-benchmark median gaji lowongan serupa yang mencantumkan gaji
 * Berkas ini hanya berisi logika murni di sekitar kedua endpoint itu. Tidak ada angka karangan: bila data
 * tidak cukup, hasilnya "tidak cukup", bukan perkiraan.
 *
 * TypeScript murni tanpa impor, supaya jalan di bawah `node --test`.
 */

// ---- kapan detail perlu diambil ---------------------------------------------------------------------

/** Sumber yang detailnya bisa diambil server. Glints tidak: halamannya dijaga captcha. */
export const DETAIL_PLATFORMS = ["jobstreet", "dealls"] as const;

/** Deskripsi yang lebih pendek dari ini dianggap ringkasan, bukan deskripsi lengkap. */
export const DETAIL_MIN_DESCRIPTION_LENGTH = 600;

export const GLINTS_DETAIL_NOTE = "Glints tidak mengizinkan detail diambil otomatis. Buka lowongan di Glints untuk deskripsi lengkap.";

export interface JobDetailInput {
  platform_source?: unknown;
  description?: unknown;
  requirements?: unknown;
  external_url?: unknown;
  status?: unknown;
}

/** Nilai jobs.status yang ditulis server saat situs asal menyatakan lowongan sudah ditutup. */
export const CLOSED_JOB_STATUS = "closed";
export const CLOSED_JOB_NOTE = "Lowongan ini sudah ditutup di situs asal, jadi tidak bisa dilamar lagi.";

export function isClosedJob(job: JobDetailInput): boolean {
  return job.status === CLOSED_JOB_STATUS;
}

const platformOf = (job: JobDetailInput): string => (typeof job.platform_source === "string" ? job.platform_source.trim().toLowerCase() : "");

/** Panjang deskripsi tanpa tag HTML dan spasi di tepi. */
function descriptionLength(description: unknown): number {
  return typeof description === "string" ? description.replace(/<[^>]*>/g, " ").trim().length : 0;
}

function hasRequirements(requirements: unknown): boolean {
  return Array.isArray(requirements) && requirements.some((r) => typeof r === "string" && r.trim() !== "");
}

/** Deskripsi pendek atau requirements kosong: kartu ini baru berisi ringkasan. Berlaku untuk semua sumber. */
export function isThinDetail(job: JobDetailInput): boolean {
  return descriptionLength(job.description) < DETAIL_MIN_DESCRIPTION_LENGTH || !hasRequirements(job.requirements);
}

/**
 * Skor kecocokan di kartu dihitung dari teks yang ada di baris saat itu. Baris dari daftar baru memuat ringkasan
 * (deskripsi pendek), jadi skornya perkiraan: setelah detail lengkap diambil, lebih banyak skill terbaca dan
 * persennya bisa berubah (uji klik 20 November 2026: 100% di daftar, 13% setelah detail dibuka). Rumus dan
 * kamus skill-nya sama; yang berbeda hanya teks yang dibaca.
 */
export function isProvisionalMatch(job: Pick<JobDetailInput, "description">): boolean {
  return descriptionLength(job.description) < DETAIL_MIN_DESCRIPTION_LENGTH;
}

export const PROVISIONAL_MATCH_NOTE = "Perkiraan: teks lowongan masih pendek, jadi persennya bisa berubah setelah detail lengkap dibuka.";

/** True bila detail layak diambil dari server: sumbernya didukung dan isinya masih ringkasan. */
export function needsDetail(job: JobDetailInput): boolean {
  return (DETAIL_PLATFORMS as readonly string[]).includes(platformOf(job)) && isThinDetail(job);
}

/**
 * True bila kartu perlu dicek sekali ke situs asal saat dibuka: sumbernya didukung, alamatnya ada, dan belum
 * ditandai ditutup. Kartu yang detailnya sudah lengkap juga dicek, karena hanya halaman aslinya yang tahu apakah
 * lowongan masih dibuka (JobStreet tetap menampilkan halaman lowongan yang sudah Expired).
 */
export function shouldCheckSource(job: JobDetailInput): boolean {
  return (DETAIL_PLATFORMS as readonly string[]).includes(platformOf(job))
    && typeof job.external_url === "string" && job.external_url.startsWith("https://")
    && !isClosedJob(job);
}

/** True bila lowongan Glints masih berisi ringkasan: detailnya tidak bisa diambil, jadi pengguna diarahkan ke situs asal. */
export function needsGlintsNote(job: JobDetailInput): boolean {
  return platformOf(job) === "glints" && isThinDetail(job);
}

/** Catatan singkat saat detail tidak bisa diambil; alasan dari server ditampilkan bila ada. */
export function enrichFailureNote(reason?: unknown): string {
  const text = typeof reason === "string" ? reason.trim().replace(/\s+/g, " ") : "";
  if (!text) return "Detail lengkap belum bisa diambil.";
  return `Detail lengkap belum bisa diambil: ${text.length > 160 ? `${text.slice(0, 157)}...` : text}`;
}

export interface EnrichJobResult {
  job?: Record<string, unknown> | null;
  enriched?: boolean;
  reason?: string;
}

/** Baris lowongan terbaru dari server di atas baris lama; kolom yang tidak dikirim server dipertahankan. */
export function mergeJobUpdate<T extends { id: string }>(current: T, row: unknown): T {
  if (!row || typeof row !== "object" || Array.isArray(row)) return current;
  const next = row as Record<string, unknown>;
  if (next.id !== current.id) return current;
  const merged: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(next)) if (v !== undefined) merged[k] = v;
  return merged as T;
}

// ---- penulisan gaji -------------------------------------------------------------------------------------

export interface SalaryInput {
  salary_min?: unknown;
  salary_max?: unknown;
  salary_currency?: unknown;
  salary_period?: unknown;
}

/** Angka positif dari number atau teks angka; selain itu null (0, null, dan teks bukan angka berarti "tidak ada"). */
function positive(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

const currencyOf = (v: unknown): string => (typeof v === "string" && v.trim() !== "" ? v.trim().toUpperCase() : "IDR");

/** 8,5 (satu desimal, koma), tanpa ",0". */
function decimal(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace(".", ",");
}

function group(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Rupiah ringkas: 8.500.000 menjadi { num: "8,5", unit: "jt" }. */
function compactRupiah(n: number): { num: string; unit: string } {
  if (n >= 1e9) return { num: decimal(n / 1e9), unit: "M" };
  if (n >= 1e6) return { num: decimal(n / 1e6), unit: "jt" };
  if (n >= 1e3) return { num: decimal(n / 1e3), unit: "rb" };
  return { num: group(n), unit: "" };
}

/** "Rp 8,5 jt" untuk rupiah; mata uang lain ditulis lengkap: "USD 3.000". */
export function formatMoney(amount: number, currency = "IDR"): string {
  if (currency !== "IDR") return `${currency} ${group(amount)}`;
  const { num, unit } = compactRupiah(amount);
  return `Rp ${num}${unit ? ` ${unit}` : ""}`;
}

/** "Rp 5–7 jt" (satuan sama ditulis sekali), "Rp 500 rb–2 jt", atau satu angka bila kedua ujung sama. */
export function formatMoneyRange(a: number, b: number, currency = "IDR"): string {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (currency !== "IDR") return lo === hi ? formatMoney(lo, currency) : `${currency} ${group(lo)}–${group(hi)}`;
  const x = compactRupiah(lo);
  const y = compactRupiah(hi);
  if (x.num === y.num && x.unit === y.unit) return formatMoney(lo, currency);
  if (x.unit === y.unit) return `Rp ${x.num}–${y.num}${x.unit ? ` ${x.unit}` : ""}`;
  return `Rp ${x.num}${x.unit ? ` ${x.unit}` : ""}–${y.num}${y.unit ? ` ${y.unit}` : ""}`;
}

const PERIOD_LABELS: Record<string, string> = {
  hourly: "jam",
  hour: "jam",
  daily: "hari",
  day: "hari",
  weekly: "minggu",
  week: "minggu",
  monthly: "bulan",
  month: "bulan",
  yearly: "tahun",
  year: "tahun",
  annual: "tahun",
  annually: "tahun",
};

const periodKey = (v: unknown): string => (typeof v === "string" ? v.trim().toLowerCase().replace(/[\s_-]+/g, "") : "");

/**
 * Gaji untuk kartu: "Rp 5–7 jt / bulan", "Mulai Rp 5 jt / bulan", "Hingga Rp 7 jt / bulan". null bila lowongan
 * tidak mencantumkan gaji sama sekali. Satuan waktu hanya ditulis bila diketahui.
 */
export function salaryText(job: SalaryInput): string | null {
  const min = positive(job.salary_min);
  const max = positive(job.salary_max);
  if (min === null && max === null) return null;
  const currency = currencyOf(job.salary_currency);
  const body =
    min !== null && max !== null
      ? formatMoneyRange(min, max, currency)
      : min !== null
        ? `Mulai ${formatMoney(min, currency)}`
        : `Hingga ${formatMoney(max as number, currency)}`;
  const raw = typeof job.salary_period === "string" ? job.salary_period.trim() : "";
  const period = PERIOD_LABELS[periodKey(raw)] ?? raw;
  return period ? `${body} / ${period}` : body;
}

// ---- pembanding gaji --------------------------------------------------------------------------------------

/** Jumlah lowongan serupa (yang mencantumkan gaji) minimal agar median berarti. Server memakai batas yang sama. */
export const BENCHMARK_MIN_SAMPLES = 5;

export interface SalaryBenchmarkResult {
  n: number;
  p25: number | null;
  median: number | null;
  p75: number | null;
  currency: string;
  period: string;
  keywords: string[];
  sufficient: boolean;
}

export type BenchmarkPosition = "below" | "within" | "above";

export type BenchmarkView =
  | {
      kind: "compare";
      /** below: di bawah p25; above: di atas p75; within: di antaranya. Dibandingkan dengan titik tengah gaji lowongan. */
      position: BenchmarkPosition;
      n: number;
      p25: number;
      median: number;
      p75: number;
      currency: string;
      /** Rentang gaji lowongan per bulan; satu angka (min = max) bila lowongan hanya menulis satu batas. */
      jobMin: number;
      jobMax: number;
    }
  | {
      kind: "market-only";
      n: number;
      p25: number;
      median: number;
      p75: number;
      currency: string;
      /** false bila lowongan menulis gaji dalam satuan yang tidak bisa dibandingkan langsung (per jam, mata uang lain). */
      jobHasSalary: boolean;
    }
  | { kind: "insufficient"; n: number };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Pengali ke gaji per bulan; null bila satuannya tidak bisa dibandingkan dengan median bulanan. */
function monthlyFactor(period: unknown): number | null {
  const key = periodKey(period);
  if (key === "" || key === "monthly" || key === "month") return 1;
  if (key === "yearly" || key === "year" || key === "annual" || key === "annually") return 1 / 12;
  return null;
}

/**
 * Tampilan pembanding gaji dari gaji lowongan dan hasil endpoint salary-benchmark.
 * null bila hasil endpoint tidak ada atau tidak terbaca (kartu menampilkan "belum tersedia").
 */
export function benchmarkView(job: SalaryInput, bench: unknown): BenchmarkView | null {
  if (!bench || typeof bench !== "object") return null;
  const b = bench as Partial<SalaryBenchmarkResult>;
  const n = finite(b.n) && b.n > 0 ? Math.floor(b.n) : 0;
  if (b.sufficient !== true || !finite(b.median)) return { kind: "insufficient", n };

  const median = b.median;
  const p25 = finite(b.p25) ? b.p25 : median;
  const p75 = finite(b.p75) ? b.p75 : median;
  const currency = currencyOf(b.currency);

  const min = positive(job.salary_min);
  const max = positive(job.salary_max);
  if (min === null && max === null) return { kind: "market-only", n, p25, median, p75, currency, jobHasSalary: false };

  const factor = monthlyFactor(job.salary_period);
  if (factor === null || currencyOf(job.salary_currency) !== currency) {
    return { kind: "market-only", n, p25, median, p75, currency, jobHasSalary: true };
  }
  const jobMin = (min ?? (max as number)) * factor;
  const jobMax = (max ?? (min as number)) * factor;
  const mid = (jobMin + jobMax) / 2;
  const position: BenchmarkPosition = mid < p25 ? "below" : mid > p75 ? "above" : "within";
  return { kind: "compare", position, n, p25, median, p75, currency, jobMin, jobMax };
}

/** Kalimat penjelas pembanding gaji, dipakai sebagai teks di bawah batang dan sebagai label pembaca layar. */
export function benchmarkText(view: BenchmarkView): string {
  if (view.kind === "insufficient") {
    const found = view.n > 0 ? `Baru ada ${view.n} lowongan serupa` : "Belum ada lowongan serupa";
    return `${found} yang mencantumkan gaji, belum cukup untuk dibandingkan (butuh minimal ${BENCHMARK_MIN_SAMPLES}).`;
  }
  const median = formatMoney(view.median, view.currency);
  const band = formatMoneyRange(view.p25, view.p75, view.currency);
  if (view.kind === "market-only") {
    const lead = view.jobHasSalary
      ? "Gaji lowongan ini memakai satuan yang tidak bisa dibandingkan langsung."
      : "Lowongan ini tidak mencantumkan gaji.";
    return `${lead} Median ${view.n} lowongan serupa: ${median} per bulan (rentang tengah ${band}).`;
  }
  if (view.position === "above") return `Gaji lowongan ini di atas median ${view.n} lowongan serupa (${median} per bulan). Rentang tengahnya ${band}.`;
  if (view.position === "below") return `Gaji lowongan ini di bawah median ${view.n} lowongan serupa (${median} per bulan). Rentang tengahnya ${band}.`;
  return `Gaji lowongan ini berada di rentang tengah ${view.n} lowongan serupa (${band}). Mediannya ${median} per bulan.`;
}

export interface BenchmarkScale {
  /** Semua nilai dalam persen lebar batang (0..100). */
  bandLeft: number;
  bandWidth: number;
  medianAt: number;
  jobLeft: number;
  jobWidth: number;
}

/** Posisi batang pembanding: pita p25–p75, garis median, dan rentang gaji lowongan pada satu skala. */
export function benchmarkScale(view: Extract<BenchmarkView, { kind: "compare" }>): BenchmarkScale {
  const lo = Math.min(view.p25, view.jobMin, view.median);
  const hi = Math.max(view.p75, view.jobMax, view.median);
  const pad = (hi - lo) * 0.15 || hi * 0.1 || 1;
  const d0 = Math.max(0, lo - pad);
  const d1 = hi + pad;
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - d0) / (d1 - d0)) * 100));
  const jobLeft = pct(view.jobMin);
  // satu angka gaji tetap terlihat sebagai penanda kecil
  const jobWidth = Math.max(pct(view.jobMax) - jobLeft, 1.5);
  return {
    bandLeft: pct(view.p25),
    bandWidth: Math.max(pct(view.p75) - pct(view.p25), 1.5),
    medianAt: pct(view.median),
    jobLeft: Math.min(jobLeft, 100 - jobWidth),
    jobWidth,
  };
}

// ---- analisis kecocokan skill -----------------------------------------------------------------------------

export interface MatchLike {
  status?: string;
  matched?: readonly string[];
  missing?: readonly string[];
}

export interface MatchBreakdown {
  matched: number;
  missing: number;
  total: number;
  /** Bagian skill yang cocok, 0..1. */
  share: number;
}

/** Hitungan untuk grafik donat. null bila tidak ada skill yang dihitung (status bukan "ok"): tidak ada grafik nol. */
export function matchBreakdown(match: MatchLike | null | undefined): MatchBreakdown | null {
  if (!match || match.status !== "ok") return null;
  const matched = match.matched?.length ?? 0;
  const missing = match.missing?.length ?? 0;
  const total = matched + missing;
  if (total === 0) return null;
  return { matched, missing, total, share: matched / total };
}

/** Penjelasan di bagian "Analisis kecocokan skill" saat belum ada grafik. */
export function skillAnalysisNote(opts: {
  status: string | null;
  unavailable?: string;
  loadingDetail?: boolean;
  thinDetail?: boolean;
}): string {
  if (opts.status === null) return opts.unavailable ?? "Menghitung kecocokan skill...";
  if (opts.status === "no-profile-skills") return "Lengkapi skill di Profil untuk melihat analisis kecocokan.";
  if (opts.loadingDetail) return "Mengambil detail lengkap untuk membaca skill yang diminta...";
  if (opts.thinDetail) {
    return "Lowongan ini baru menampilkan ringkasan, jadi skill yang diminta belum terbaca. Buka lowongan di situs asal untuk deskripsi lengkap.";
  }
  return "Deskripsi lowongan ini tidak menyebut skill yang bisa dikenali.";
}
