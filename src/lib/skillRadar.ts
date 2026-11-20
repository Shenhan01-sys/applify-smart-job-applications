/**
 * Pemetaan skill pengguna (`user_skills`) ke enam bidang pada Peta Skill. Murni dan tanpa impor, supaya bisa dites.
 *
 * `marketDemand` adalah patokan perkiraan yang tetap di kode ini. Angkanya bukan hasil hitung dari data lowongan
 * atau survei, jadi halaman harus menyebutnya "patokan perkiraan", bukan "permintaan pasar".
 */
export interface SkillAxis {
  id: number;
  name: string;
  userLevel: number;
  marketDemand: number;
}

export interface UserSkillRow {
  name?: string | null;
  category?: string | null;
  proficiency_level?: number | string | null;
}

export const AXES = [
  { name: "Frontend", market: 90, kw: ["front", "react", "vue", "css", "html", "javascript", "typescript", "tailwind"] },
  { name: "Backend", market: 80, kw: ["back", "node", "api", "server", "golang", "java", "python", "php", "rest", "graphql"] },
  { name: "UI/UX", market: 70, kw: ["ux", "ui/ux", "design", "figma", "wireframe", "prototyp"] },
  { name: "Cloud/DevOps", market: 65, kw: ["cloud", "devops", "aws", "gcp", "azure", "docker", "kubernetes", "ci/cd", "terraform"] },
  { name: "Data/AI", market: 85, kw: ["data", "ai", "ml", "machine", "analytic", "sql", "pandas", "tensor", "llm"] },
  { name: "Agile/Soft", market: 75, kw: ["agile", "scrum", "communication", "leadership", "soft", "management", "kolaborasi"] },
] as const;

/** Data contoh, hanya dipakai di mode demo eksplisit (VITE_MOCK_MODE=true). */
export const DEMO_SKILLS: SkillAxis[] = [
  { id: 1, name: "Frontend", userLevel: 85, marketDemand: 90 },
  { id: 2, name: "Backend", userLevel: 55, marketDemand: 80 },
  { id: 3, name: "UI/UX", userLevel: 40, marketDemand: 70 },
  { id: 4, name: "Cloud/DevOps", userLevel: 25, marketDemand: 65 },
  { id: 5, name: "Data/AI", userLevel: 55, marketDemand: 85 },
  { id: 6, name: "Agile/Soft", userLevel: 90, marketDemand: 75 },
];

export type RadarStatus =
  /** pengguna belum punya skill sama sekali */
  | "empty"
  /** ada skill, tetapi tidak ada yang cocok dengan enam bidang */
  | "unmatched"
  | "ok";

export interface RadarBuild {
  data: SkillAxis[];
  status: RadarStatus;
  matchedCount: number;
  /** Skill yang tidak cocok dengan bidang mana pun: tidak ikut grafik, tetapi tetap ditampilkan. */
  unmatched: UserSkillRow[];
}

export const UNMATCHED_SECTION_TITLE = "Skill di luar enam bidang";
export const UNMATCHED_SECTION_TEXT =
  "Peta ini hanya membaca enam bidang: Frontend, Backend, UI/UX, Cloud/DevOps, Data/AI, dan Agile/Soft. Skill di bawah ini tidak masuk ke bidang mana pun, jadi tidak ikut di grafik. Skill ini tetap tersimpan di profilmu dan dipakai untuk menghitung kecocokan lowongan.";

/** Nama skill untuk daftar "di luar enam bidang": tanpa nama kosong dan tanpa duplikat (huruf besar-kecil diabaikan), dengan tingkat 1-5 bila ada. */
export function unmatchedSkillLabels(skills: UserSkillRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skills) {
    const name = (s.name ?? "").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const level = Number(s.proficiency_level);
    out.push(Number.isInteger(level) && level >= 1 && level <= 5 ? `${name} (${level}/5)` : name);
  }
  return out;
}

export function buildRadarData(skills: UserSkillRow[]): RadarBuild {
  if (!skills.length) return { data: [], status: "empty", matchedCount: 0, unmatched: [] };
  const maxP = Math.max(...skills.map((s) => Number(s.proficiency_level) || 0), 0);
  // Skala 1-5 diubah ke persen; nilai di atas 5 dianggap sudah persen.
  const norm = (v: number) => (maxP <= 5 ? v * 20 : v);
  const used = new Set<UserSkillRow>();
  const data: SkillAxis[] = AXES.map((ax, i) => {
    const matched = skills.filter((s) => {
      const hay = `${s.name || ""} ${s.category || ""}`.toLowerCase();
      return ax.kw.some((k) => hay.includes(k));
    });
    matched.forEach((m) => used.add(m));
    const userLevel = matched.length
      ? Math.round(Math.min(100, norm(matched.reduce((a, s) => a + (Number(s.proficiency_level) || 0), 0) / matched.length)))
      : 0;
    return { id: i + 1, name: ax.name, userLevel, marketDemand: ax.market };
  });
  if (!data.some((d) => d.userLevel > 0)) return { data: [], status: "unmatched", matchedCount: 0, unmatched: [...skills] };
  return { data, status: "ok", matchedCount: used.size, unmatched: skills.filter((s) => !used.has(s)) };
}

/** Bidang yang tingkat skill-mu lebih dari 10 poin di bawah patokan, diurutkan dari selisih terbesar. */
export const findGaps = (data: SkillAxis[]): SkillAxis[] =>
  data
    .filter((s) => s.marketDemand > s.userLevel + 10)
    .sort((a, b) => b.marketDemand - b.userLevel - (a.marketDemand - a.userLevel));

/** Ringkasan teks untuk pembaca layar dan untuk tabel angka. */
export const describeRadar = (data: SkillAxis[]): string =>
  data.map((d) => `${d.name}: skill kamu ${d.userLevel} persen, patokan ${d.marketDemand} persen`).join("; ");
