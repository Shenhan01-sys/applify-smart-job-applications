/**
 * Satu peta label berbahasa Indonesia untuk kartu lowongan.
 *
 * Kode di database tetap bahasa Inggris (jobs.type, jobs.workplace_type, jobs.salary_period); hanya yang
 * tampil di layar yang diterjemahkan. Nilai yang tidak dikenal ditampilkan apa adanya, tidak dibuang.
 *
 * TypeScript murni tanpa impor, supaya jalan di bawah `node --test`.
 */

export const JOB_LABELS = {
  /** jobs.type */
  type: {
    "full-time": "Penuh waktu",
    "part-time": "Paruh waktu",
    contract: "Kontrak",
    internship: "Magang",
    freelance: "Freelance",
    temporary: "Sementara",
  } as Record<string, string>,
  /** jobs.workplace_type */
  workplace: {
    remote: "Remote",
    hybrid: "Hybrid",
    "on-site": "Di kantor",
    onsite: "Di kantor",
  } as Record<string, string>,
  /** jobs.salary_period, dipakai setelah garis miring: "/bulan" */
  salaryPeriod: {
    hourly: "jam",
    daily: "hari",
    weekly: "minggu",
    monthly: "bulan",
    month: "bulan",
    yearly: "tahun",
    year: "tahun",
    annual: "tahun",
    annually: "tahun",
  } as Record<string, string>,
  /** Teks tetap di kartu lowongan. */
  card: {
    matchLabel: "Cocok",
    matchBadge: "Cocok denganmu",
    sourcePrefix: "Sumber:",
    seeDetail: "Lihat detail",
    collapse: "Ringkas",
    apply: "Lamar dengan AI",
    salaryMissing: "Gaji tidak dicantumkan",
    strategy: "Strategi AI",
    skillAnalysis: "Analisis kecocokan skill",
    skillGaps: "Skill yang belum ada di profilmu:",
    salaryBenchmark: "Pembanding gaji",
    marketAverage: "Rata-rata pasar",
    percentile: "persentil",
    aboveMarket: "Di atas pasar",
    atMarket: "Setara pasar",
    belowMarket: "Di bawah pasar",
    plan: "Rencana lamaran AI",
    requirements: "Persyaratan utama",
  },
} as const;

/** "Full_Time ", "full time" dan "full-time" menjadi kunci yang sama. */
function key(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s_]+/g, "-") : "";
}

function lookup(map: Record<string, string>, value: unknown): string {
  const k = key(value);
  if (!k) return "";
  return map[k] ?? (typeof value === "string" ? value.trim() : "");
}

export const jobTypeLabel = (value: unknown): string => lookup(JOB_LABELS.type, value);
export const workplaceLabel = (value: unknown): string => lookup(JOB_LABELS.workplace, value);
export const salaryPeriodLabel = (value: unknown): string => lookup(JOB_LABELS.salaryPeriod, value);

/** Ranking pasar dari persentil gaji: label untuk teks di bawah batang gaji. */
export function marketPositionLabel(percentile: number): string {
  if (percentile >= 75) return JOB_LABELS.card.aboveMarket;
  if (percentile >= 50) return JOB_LABELS.card.atMarket;
  return JOB_LABELS.card.belowMarket;
}
