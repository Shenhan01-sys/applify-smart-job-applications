/**
 * Skor kecocokan lowongan per pengguna, dihitung deterministik di klien.
 *
 * `jobs.match_score` adalah satu angka global untuk semua orang, jadi seorang Apoteker bisa tampil 90% untuk
 * profil Frontend Developer. Skor di sini dihitung dari irisan skill profil pengguna dengan teks lowongan, dan
 * bisa dijelaskan:
 *
 *   skor = skill yang disebut lowongan DAN ada di profil / semua skill yang disebut lowongan
 *
 * "Skill yang disebut lowongan" diambil dari tiga tempat, tanpa AI dan tanpa angka karangan:
 *   1. kamus skill umum (teknologi, IT support dan jaringan, administrasi dan keuangan, desain, pemasaran,
 *      data, serta beberapa kemampuan umum) yang muncul di judul, deskripsi, requirements, dan skill_matches
 *      lowongan;
 *   2. daftar skill yang ditulis eksplisit: item `requirements` yang pendek, dan baris "Requirements: A, B, C"
 *      (atau Persyaratan, Kualifikasi, Skills, Keahlian) di deskripsi;
 *   3. skill profil di luar kamus yang disebut langsung di teks lowongan.
 *
 * Keterbatasan: yang terbaca hanya skill yang tertulis. Lowongan yang tidak menyebut satu skill pun
 * (`no-job-skills`) tidak diberi skor, dan profil tanpa skill (`no-profile-skills`) juga tidak. Kamus
 * hanya mengenali "Go" lewat nama "Golang", karena "go" biasa adalah kata Inggris.
 *
 * TypeScript murni tanpa impor, supaya jalan di bawah `node --test`.
 */

/** Batas "Kecocokan tinggi" yang dipakai penyaring, urutan, lencana, dan hitungan di halaman Lowongan. */
export const HIGH_MATCH_THRESHOLD = 80;

export type MatchStatus = "ok" | "no-profile-skills" | "no-job-skills";

export interface JobMatch {
  status: MatchStatus;
  /** 0..100 hanya bila status "ok"; selain itu null (tidak pernah 0 atau angka bawaan). */
  score: number | null;
  /** Skill yang disebut lowongan dan ada di profil. */
  matched: string[];
  /** Skill yang disebut lowongan tetapi belum ada di profil. */
  missing: string[];
  /** Jumlah skill yang disebut lowongan (matched + missing). */
  total: number;
}

export interface MatchJobInput {
  title?: unknown;
  description?: unknown;
  requirements?: unknown;
  skill_matches?: unknown;
}

// ---- kamus skill: [nama tampilan, ...alias tambahan] (nama tampilan otomatis menjadi alias) ----------------

const SKILL_DICTIONARY: string[][] = [
  ["JavaScript", "js", "ecmascript", "es6"],
  ["TypeScript"],
  ["React", "reactjs", "react.js", "react js"],
  ["React Native"],
  ["Next.js", "nextjs", "next js"],
  ["Vue", "vuejs", "vue.js", "vue js"],
  ["Nuxt", "nuxt.js", "nuxtjs"],
  ["Angular", "angularjs"],
  ["Svelte", "sveltekit"],
  ["Node.js", "nodejs", "node js", "node"],
  ["Express.js", "expressjs"],
  ["NestJS", "nest.js", "nest js"],
  ["Python"],
  ["Django"],
  ["Flask"],
  ["FastAPI", "fast api"],
  ["Java"],
  ["Spring Boot", "spring framework"],
  ["Kotlin"],
  ["Swift", "swiftui"],
  ["Flutter"],
  ["Dart"],
  ["PHP"],
  ["Laravel"],
  ["C#", "csharp"],
  [".NET", "dotnet", "asp.net"],
  ["C++"],
  ["Rust"],
  ["Ruby"],
  ["Ruby on Rails", "rails"],
  ["SQL"],
  ["PostgreSQL", "postgres"],
  ["MySQL"],
  ["MongoDB", "mongo"],
  ["Redis"],
  ["GraphQL"],
  ["REST API", "restful", "restful api"],
  ["gRPC"],
  ["Docker"],
  ["Kubernetes", "k8s"],
  ["AWS", "amazon web services"],
  ["GCP", "google cloud"],
  ["Azure"],
  ["Terraform"],
  ["Linux"],
  ["Git", "github", "gitlab"],
  ["CI/CD", "cicd"],
  ["Jenkins"],
  ["HTML", "html5"],
  ["CSS", "css3"],
  ["Tailwind CSS", "tailwind", "tailwindcss"],
  ["Sass", "scss"],
  ["Bootstrap"],
  ["Redux"],
  ["Figma"],
  ["Tableau"],
  ["Power BI", "powerbi"],
  ["Excel", "microsoft excel", "ms excel"],
  ["Microsoft Office", "ms office"],
  ["Machine Learning"],
  ["Deep Learning"],
  ["TensorFlow"],
  ["PyTorch"],
  ["Pandas"],
  ["NumPy"],
  ["Data Analysis", "analisis data", "data analytics"],
  ["Scrum"],
  ["Agile"],
  ["Microservices", "microservice"],
  ["Supabase"],
  ["Firebase"],
  ["Jira"],
  ["SEO"],
  ["Komunikasi", "communication", "communication skills"],
  ["Kepemimpinan", "leadership"],
  ["Kerja Tim", "teamwork", "kerja sama tim", "kerjasama tim"],
  ["Bahasa Inggris", "english"],

  // IT support dan operasional. "jaringan" polos dihitung sebagai jaringan komputer (di lowongan IT hampir
  // selalu begitu); "network" polos tidak, karena sering berarti relasi bisnis.
  ["IT Support", "helpdesk", "help desk", "service desk", "technical support", "dukungan teknis"],
  ["Hardware", "perangkat keras"],
  ["Jaringan Komputer", "jaringan", "networking", "computer network", "computer networking"],
  ["Troubleshooting", "troubleshoot"],
  ["Windows", "microsoft windows"],
  ["Windows Server"],
  ["Active Directory"],
  ["TCP/IP", "tcpip"],
  ["LAN/WAN", "lan", "wan", "local area network", "wide area network"],
  ["MikroTik", "routeros"],
  ["Cisco", "ccna", "ccnp"],
  ["CCTV"],
  ["Printer"],
  ["VMware"],
  ["Microsoft 365", "office 365", "m365", "o365"],
  ["Google Workspace", "g suite", "gsuite", "google docs", "google sheets", "google spreadsheet"],
  ["PowerPoint", "microsoft powerpoint", "ms powerpoint", "power point"],
  ["Microsoft Word", "ms word"],

  // Administrasi, keuangan, dan layanan
  ["Administrasi", "administration", "administrative", "administratif"],
  ["Akuntansi", "accounting", "pembukuan", "bookkeeping"],
  ["Perpajakan", "pajak", "taxation", "tax"],
  ["Data Entry", "input data", "pengisian data"],
  ["Customer Service", "layanan pelanggan", "pelayanan pelanggan", "customer support", "customer care"],
  ["Negosiasi", "negotiation"],
  ["Problem Solving", "pemecahan masalah", "pemecah masalah"],
  ["Manajemen Waktu", "time management"],
  ["Public Speaking"],

  // Desain
  ["Desain Grafis", "graphic design", "graphic designer"],
  ["Adobe Photoshop", "photoshop"],
  ["Adobe Illustrator", "illustrator"],
  ["Adobe Premiere", "premiere pro"],
  ["After Effects", "adobe after effects"],
  ["Canva"],
  ["CorelDRAW", "corel draw"],
  ["UI/UX Design", "ui ux", "uiux", "ux design", "ui design", "ux research"],
  ["Video Editing", "edit video", "pengeditan video"],

  // Pemasaran dan konten
  ["Copywriting", "copywriter", "copy writing"],
  ["Social Media", "media sosial", "sosial media", "social media marketing", "social media management"],
  ["Digital Marketing", "pemasaran digital", "online marketing"],
  ["Content Creation", "content creator", "pembuatan konten", "pembuat konten", "content production", "produksi konten"],
  ["Content Writing", "content writer", "penulisan konten"],
  ["Email Marketing"],
  ["Google Analytics", "ga4"],
  ["Google Ads", "google adwords"],
  ["Meta Ads", "facebook ads", "instagram ads"],

  // Data
  ["Data Visualization", "visualisasi data"],
  ["Looker Studio", "google data studio"],
  ["Statistika", "statistik", "statistics"],
  ["ETL"],
];

/**
 * Go: di lowongan hanya "golang" yang dihitung, karena "go" biasa adalah kata Inggris ("go-to-market").
 * Di profil, "Go" yang ditulis persis begitu tetap dikenali sebagai Go.
 */
const GO_ALIAS = "golang";
const PROFILE_ONLY_ALIASES: Record<string, string> = { go: "Go" };

export const NO_PROFILE_SKILLS_TEXT = "Lengkapi skill di Profil untuk melihat kecocokan";
export const NO_JOB_SKILLS_TEXT = "Skill yang diminta lowongan ini belum terbaca";

// ---- normalisasi dan pencarian ------------------------------------------------------------------------

/** Huruf kecil; hanya a-z, 0-9, + # . yang dipertahankan (untuk "c++", "c#", "node.js"); sisanya jadi spasi. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").replace(/\s+/g, " ").trim();
}

const isAlnum = (c: string): boolean => /[a-z0-9]/.test(c);

/** Posisi kemunculan `term` yang berdiri sendiri (bukan potongan kata lain: "java" tidak ada di "javascript"). */
function findTerm(hay: string, term: string): number[] {
  const out: number[] = [];
  if (!term) return out;
  let from = 0;
  for (;;) {
    const i = hay.indexOf(term, from);
    if (i < 0) break;
    const before = i > 0 ? hay[i - 1] : " ";
    const after = i + term.length < hay.length ? hay[i + term.length] : " ";
    const startOk = !(isAlnum(term[0]) && isAlnum(before));
    const endOk = !(isAlnum(term[term.length - 1]) && isAlnum(after));
    if (startOk && endOk) out.push(i);
    from = i + 1;
  }
  return out;
}

const containsTerm = (hay: string, term: string): boolean => findTerm(hay, term).length > 0;

const ALIAS_TO_NAME = new Map<string, string>();
for (const [name, ...aliases] of SKILL_DICTIONARY) {
  for (const a of [name, ...aliases]) ALIAS_TO_NAME.set(normalize(a), name);
}
ALIAS_TO_NAME.set(GO_ALIAS, "Go");
/** Alias terpanjang lebih dulu, supaya "react native" menelan "react". */
const ALIASES_LONGEST_FIRST = [...ALIAS_TO_NAME.keys()].sort((a, b) => b.length - a.length);

interface Hit {
  start: number;
  end: number;
  name: string;
}

/** Nama skill kamus yang disebut `hay` (sudah dinormalkan); hit di dalam hit yang lebih panjang dibuang. */
function dictionarySkills(hay: string): string[] {
  const hits: Hit[] = [];
  for (const alias of ALIASES_LONGEST_FIRST) {
    for (const start of findTerm(hay, alias)) hits.push({ start, end: start + alias.length, name: ALIAS_TO_NAME.get(alias)! });
  }
  const kept = hits.filter(
    (h) => !hits.some((o) => o !== h && o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start),
  );
  return [...new Set(kept.sort((a, b) => a.start - b.start).map((h) => h.name))];
}

// ---- skill profil -------------------------------------------------------------------------------------

function stringsOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(stringsOf);
  if (typeof v === "string") return [v];
  if (v && typeof v === "object") {
    const o = v as { skill?: unknown; name?: unknown };
    return stringsOf(o.skill ?? o.name);
  }
  return [];
}

/**
 * Daftar skill profil: `user_skills.name` dan `work_experiences.skills_used` (jsonb berisi teks; teks berisi
 * koma juga dibaca). Tanpa duplikat (huruf besar-kecil diabaikan), ejaan pertama dipertahankan.
 */
export function profileSkillList(source: { skills?: unknown; experiences?: unknown }): string[] {
  const names: string[] = [];
  for (const row of Array.isArray(source.skills) ? source.skills : []) names.push(...stringsOf((row as { name?: unknown } | null)?.name));
  for (const row of Array.isArray(source.experiences) ? source.experiences : []) {
    for (const s of stringsOf((row as { skills_used?: unknown } | null)?.skills_used)) names.push(...s.split(/[,;]/));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const t = raw.trim();
    const k = t.toLowerCase();
    if (t && !seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

interface ProfileEntry {
  raw: string;
  n: string;
  /** Nama kamus bila skill ini ada di kamus. */
  canon?: string;
}

function profileEntries(skills: readonly string[]): ProfileEntry[] {
  const out: ProfileEntry[] = [];
  const push = (raw: string) => {
    const n = normalize(raw);
    if (n.length < 2) return;
    out.push({ raw: raw.trim(), n, canon: ALIAS_TO_NAME.get(n) ?? PROFILE_ONLY_ALIASES[n] });
  };
  for (const raw of skills) {
    const whole = normalize(raw);
    // "CI/CD" dibaca utuh; "HTML/CSS" dipecah menjadi HTML dan CSS.
    if (ALIAS_TO_NAME.has(whole)) push(raw);
    else for (const part of raw.split("/")) push(part);
  }
  return out;
}

/** Apakah daftar ini punya skill yang bisa dipakai menghitung (bukan kosong atau hanya spasi dan satu huruf). */
export function hasUsableSkills(skills: readonly string[]): boolean {
  return profileEntries(skills).length > 0;
}

// ---- skill yang disebut lowongan ----------------------------------------------------------------------

const NOT_A_SKILL = /\b(tahun|years?|pengalaman|experience|minimal|maksimal|usia|umur|domisili|fresh graduate|lulusan|gaji|salary)\b/i;

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, " ").replace(/&[a-z]+;|&#\d+;/gi, " ");
}

/** Skill yang ditulis eksplisit: item requirements yang pendek, dan baris "Requirements: A, B, C" di deskripsi. */
function explicitTerms(requirements: string[], description: string): string[] {
  const out: string[] = [];
  const add = (raw: string) => {
    const t = raw.trim().replace(/^[-•*\s]+/, "").replace(/[.;:\s]+$/, "").trim();
    if (!t || t.length > 40 || t.split(/\s+/).length > 4) return;
    if (!/[a-z]/i.test(t) || /\d/.test(t) || NOT_A_SKILL.test(t)) return;
    out.push(t);
  };
  for (const r of requirements) add(r);
  const lists = /\b(?:requirements?|persyaratan|kualifikasi|kompetensi|keahlian|skills?)\s*[:：]\s*([^\n]+)/gi;
  for (const m of description.matchAll(lists)) {
    // daftar berhenti di akhir kalimat (titik lalu spasi); "Node.js" tidak terpotong
    const list = m[1].split(/\.\s/)[0];
    for (const part of list.split(/[,;•|]|\s+(?:dan|and)\s+/i)) add(part);
  }
  return out;
}

export function computeMatch(job: MatchJobInput, profileSkills: readonly string[]): JobMatch {
  const entries = profileEntries(profileSkills);
  if (entries.length === 0) return { status: "no-profile-skills", score: null, matched: [], missing: [], total: 0 };

  const description = stripHtml(typeof job.description === "string" ? job.description : "");
  const requirements = stringsOf(job.requirements);
  const title = typeof job.title === "string" ? job.title : "";
  const hay = normalize([title, description, ...requirements, ...stringsOf(job.skill_matches)].join(" \n "));

  const profileCanon = new Set(entries.flatMap((e) => (e.canon ? [e.canon.toLowerCase()] : [])));
  // kunci -> { label, covered }; Map mempertahankan urutan ditemukan
  const found = new Map<string, { label: string; covered: boolean }>();

  for (const name of dictionarySkills(hay)) {
    found.set(name.toLowerCase(), { label: name, covered: profileCanon.has(name.toLowerCase()) });
  }

  for (const term of explicitTerms(requirements, description)) {
    const n = normalize(term);
    // istilah yang sudah memuat skill kamus diwakili oleh skill kamus itu, supaya tidak dihitung dua kali
    if (!n || found.has(n) || dictionarySkills(n).length > 0) continue;
    const covered = entries.some((e) => !e.canon && e.n.length >= 3 && (e.n === n || containsTerm(n, e.n) || containsTerm(e.n, n)));
    found.set(n, { label: term, covered });
  }

  // skill profil di luar kamus yang disebut langsung di teks lowongan
  for (const e of entries) {
    if (e.canon || e.n.length < 3 || found.has(e.n)) continue;
    if ([...found.keys()].some((k) => containsTerm(k, e.n))) continue;
    if (containsTerm(hay, e.n)) found.set(e.n, { label: e.raw, covered: true });
  }

  const all = [...found.values()];
  if (all.length === 0) return { status: "no-job-skills", score: null, matched: [], missing: [], total: 0 };
  const matched = all.filter((s) => s.covered).map((s) => s.label);
  const missing = all.filter((s) => !s.covered).map((s) => s.label);
  return {
    status: "ok",
    score: Math.round((matched.length / all.length) * 100),
    matched,
    missing,
    total: all.length,
  };
}

/** Keterangan skor yang jujur tentang dasarnya: "3 dari 5 skill cocok", atau mengapa skor belum ada. */
export function matchCaption(m: JobMatch): string {
  if (m.status === "ok") return `${m.matched.length} dari ${m.total} skill cocok`;
  if (m.status === "no-profile-skills") return NO_PROFILE_SKILLS_TEXT;
  return NO_JOB_SKILLS_TEXT;
}

/** Urutan halaman Lowongan: skor tinggi dulu, tanpa skor di akhir. Tidak mengubah urutan asal bila skor sama. */
export function sortByMatch<T>(jobs: readonly T[], scoreOf: (job: T) => number | null): T[] {
  return jobs
    .map((job, i) => ({ job, i, s: scoreOf(job) }))
    .sort((a, b) => (b.s ?? -1) - (a.s ?? -1) || a.i - b.i)
    .map((x) => x.job);
}
