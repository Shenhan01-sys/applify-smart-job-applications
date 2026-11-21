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

/**
 * Kata kunci tiap bidang. Dicocokkan sebagai kata utuh atau frasa (lihat hasKeyword), bukan potongan kata, jadi
 * bentuk lain yang dulu tertangkap sebagai awalan ("front", "prototyp", "tensor") ditulis eksplisit di sini.
 * Daftar diperluas 21 November 2026: profil nyata dengan "Google Gemini", "Web3", dan "Privy Wallet" tidak masuk bidang mana pun,
 * jadi radar tidak tampil. Kata tunggal yang ambigu sengaja tidak dipakai ("wallet", "model", "bot", "agent").
 */
export const AXES = [
  { name: "Frontend", market: 90, kw: ["frontend", "front end", "react", "reactjs", "vue", "vuejs", "css", "css3", "html", "html5", "javascript", "typescript", "tailwind", "tailwindcss", "next.js", "nextjs", "svelte", "angular"] },
  { name: "Backend", market: 80, kw: ["backend", "back end", "node", "nodejs", "api", "server", "golang", "java", "python", "php", "rest", "restful", "graphql", "web3", "blockchain", "solidity", "smart contract", "ethereum", "express", "django", "laravel", "spring"] },
  { name: "UI/UX", market: 70, kw: ["ux", "ui/ux", "ux/ui", "design", "designer", "figma", "wireframe", "prototype", "prototyping", "user research", "usability"] },
  { name: "Cloud/DevOps", market: 65, kw: ["cloud", "devops", "aws", "gcp", "azure", "docker", "kubernetes", "k8s", "ci/cd", "cicd", "terraform", "vercel", "supabase", "firebase", "linux"] },
  { name: "Data/AI", market: 85, kw: ["data", "database", "dataset", "ai", "ml", "machine", "analytic", "analytical", "sql", "mysql", "postgresql", "nosql", "sqlite", "pandas", "tensor", "tensorflow", "llm", "gemini", "openai", "chatgpt", "gpt", "claude", "prompt engineering", "generative ai", "genai", "nlp", "deep learning", "computer vision", "langchain", "rag"] },
  { name: "Agile/Soft", market: 75, kw: ["agile", "scrum", "communication", "leadership", "soft", "management", "kolaborasi", "teamwork", "problem solving", "presentation", "public speaking", "kerja sama"] },
] as const;

/** Huruf kecil; tanda hubung, garis bawah, dan spasi ganda menjadi satu spasi ("Front-End" sama dengan "front end"). */
const normalizeText = (text: string): string => text.toLowerCase().replace(/[\s_-]+/g, " ").trim();
const isAlnum = (c: string | undefined): boolean => c !== undefined && /[a-z0-9]/.test(c);

/**
 * Apakah `keyword` ada di `text` sebagai kata utuh atau frasa. "ai" tidak ada di "Blockchain" dan "java" tidak
 * ada di "JavaScript", tetapi "AI/ML" dan "Java Spring" cocok. Batas kata hanya diperiksa di sisi yang berupa
 * huruf atau angka, jadi kata kunci bersimbol seperti "c++", "node.js", atau "ci/cd" tetap bekerja. Kata kunci
 * sepanjang 3 karakter ke atas boleh diikuti "s" untuk jamak ("APIs", "servers").
 */
export function hasKeyword(text: string, keyword: string): boolean {
  const hay = normalizeText(text);
  const term = normalizeText(keyword);
  if (!term) return false;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(term, from);
    if (i < 0) return false;
    const end = i + term.length;
    const startOk = !(isAlnum(term[0]) && isAlnum(hay[i - 1]));
    let endOk = !(isAlnum(term[term.length - 1]) && isAlnum(hay[end]));
    if (!endOk && term.length >= 3 && hay[end] === "s" && !isAlnum(hay[end + 1])) endOk = true;
    if (startOk && endOk) return true;
    from = i + 1;
  }
}

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
      const hay = `${s.name || ""} ${s.category || ""}`;
      return ax.kw.some((k) => hasKeyword(hay, k));
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
