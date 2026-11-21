/**
 * Bukti hijau di isi lowongan, untuk penandaan `jobs.is_green` (Karier Hijau).
 *
 * Uji klik produksi 21 November 2026 (temuan 26): Karier Hijau menampilkan Frontend Engineer (Tokopedia),
 * Management Consultant (McKinsey), Tax Consultant (PwC), dan peran lain yang tidak berkaitan dengan lingkungan.
 * Penandaannya dulu hanya dari tebakan model terhadap nama perusahaan (assessCompanyGreen di insight.ts).
 * Kini sebuah lowongan hanya ditandai hijau bila model memberi skor tinggi DAN judul atau deskripsi lowongan itu
 * sendiri memuat istilah lingkungan. Nama perusahaan tidak dihitung.
 *
 * Istilah dicocokkan sebagai kata atau frasa utuh. "solar" tidak dipakai sendirian karena dalam bahasa Indonesia
 * itu bahan bakar diesel; "lingkungan" tidak dipakai sendirian karena "lingkungan kerja" ada di hampir semua lowongan.
 * Salinan dari worker/src/lib/greenEvidence.ts (paket terpisah, daftar istilah sama; tests/greenEvidence.test.ts
 * membandingkan keduanya). Di frontend dipakai sebagai penyaring saat menampilkan: baris `jobs.is_green` yang ditandai
 * sebelum aturan ini ada, dan judul serta deskripsinya tidak memuat istilah lingkungan, tidak ditampilkan di Karier
 * Hijau. Datanya sendiri tidak diubah.
 *
 * TypeScript murni tanpa impor, supaya jalan di bawah `node --test`.
 */

/** Istilah yang menunjuk kegiatan lingkungan; satu saja di judul atau deskripsi sudah cukup. */
export const STRONG_GREEN_TERMS: readonly string[] = [
  "energi terbarukan", "energi baru terbarukan", "renewable energy", "renewable", "ebt", "plts",
  "tenaga surya", "panel surya", "energi surya", "solar panel", "solar energy", "solar power",
  "tenaga angin", "wind power", "wind turbine", "wind farm", "hydropower", "pembangkit listrik tenaga air",
  "panas bumi", "geothermal", "biomassa", "biomass", "biogas", "bioenergi", "bioenergy", "biofuel",
  "efisiensi energi", "energy efficiency",
  "jejak karbon", "carbon footprint", "carbon credit", "kredit karbon", "carbon emission", "emisi karbon",
  "gas rumah kaca", "greenhouse gas", "net zero", "dekarbonisasi", "decarbonization", "decarbonisation",
  "perubahan iklim", "climate change", "climate action",
  "environmental", "lingkungan hidup", "pelestarian lingkungan", "kelestarian lingkungan", "dampak lingkungan", "amdal",
  "pengelolaan sampah", "pengelolaan limbah", "waste management", "daur ulang", "recycling", "circular economy", "ekonomi sirkular",
  "pengolahan air", "water treatment", "konservasi", "conservation", "kehutanan", "forestry", "reforestasi",
  "biodiversity", "keanekaragaman hayati", "pertanian berkelanjutan", "sustainable agriculture",
  "kendaraan listrik", "electric vehicle", "mobilitas listrik",
  "energi hijau", "green energy", "green building", "bangunan hijau", "ekonomi hijau", "green economy", "hidrogen hijau", "green hydrogen",
];

/**
 * Istilah yang sering muncul sebagai kalimat promosi ("pertumbuhan berkelanjutan"). Baru dihitung bila ada di
 * judul, atau bila sedikitnya dua istilah berbeda dari daftar ini ada di deskripsi.
 */
export const WEAK_GREEN_TERMS: readonly string[] = ["sustainability", "sustainable", "keberlanjutan", "berkelanjutan", "esg"];

/** Huruf kecil; selain a-z dan 0-9 menjadi spasi; diberi spasi di kedua ujung untuk pencocokan kata utuh. */
function pad(text: unknown): string {
  const s = typeof text === "string" ? text : "";
  return ` ${s.toLowerCase().replace(/<[^>]*>/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

const has = (hay: string, term: string): boolean => hay.includes(` ${term.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `);

/** Apakah judul atau deskripsi lowongan itu sendiri memuat bukti kegiatan lingkungan. */
export function hasGreenEvidence(title: unknown, description: unknown): boolean {
  const t = pad(title);
  const d = pad(description);
  if (STRONG_GREEN_TERMS.some((k) => has(t, k) || has(d, k))) return true;
  if (WEAK_GREEN_TERMS.some((k) => has(t, k))) return true;
  return WEAK_GREEN_TERMS.filter((k) => has(d, k)).length >= 2;
}

/** Ambang skor hijau dari model (insight.ts memakai nilai yang sama). */
export const GREEN_SCORE_THRESHOLD = 70;

/** Nilai `jobs.is_green`: skor model cukup tinggi dan ada bukti di isi lowongan. */
export function decideGreen(score: number, title: unknown, description: unknown, threshold: number = GREEN_SCORE_THRESHOLD): boolean {
  return Number.isFinite(score) && score >= threshold && hasGreenEvidence(title, description);
}
