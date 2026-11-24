/**
 * Form <-> database mapping and validation for the profile editors (work experience, education, skills).
 * Column names and types follow database/schema.sql (work_experiences, education, user_skills); the draft
 * Edge Function reads skills and the three most recent work experiences from those tables.
 *
 * Plain TypeScript with no imports, so it runs under `node --test` without a bundler.
 */

// ---------------------------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------------------------

export type FieldErrors<F> = Partial<Record<keyof F, string>>;
export type ValidationResult<F, R> = { ok: true; row: R } | { ok: false; errors: FieldErrors<F> };

export const LIMITS = {
  name: 120,
  longText: 2000,
  shortText: 100,
  skillName: 60,
  listItem: 200,
  maxAchievements: 10,
  maxSkillsUsed: 20,
  skillUsedLength: 40,
} as const;

const trim = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** "3,75" and "3.75" both become 3.75. Anything else (empty, text, Infinity) becomes undefined. */
export function parseDecimal(raw: unknown): number | undefined {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  const s = trim(raw).replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** A four digit year, or undefined. */
export function parseYear(raw: unknown): number | undefined {
  const s = typeof raw === "number" ? String(raw) : trim(raw);
  return /^\d{4}$/.test(s) ? Number(s) : undefined;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/;

/** "2023-06" or "2023-06-15" -> "2023-06-01" (the form uses month inputs, the column is a date). Invalid -> undefined. */
export function toDbDate(raw: unknown): string | undefined {
  const m = MONTH_RE.exec(trim(raw));
  if (!m) return undefined;
  const [, y, mo, d] = m;
  if (d) {
    // reject 31 February and friends
    const t = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    if (t.getUTCMonth() !== Number(mo) - 1) return undefined;
  }
  return `${y}-${mo}-01`;
}

/** "2023-06-01" (or a timestamp) -> "2023-06" for a month input; empty for null or garbage. */
export function toMonthInput(raw: unknown): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])/.exec(trim(raw));
  return m ? `${m[1]}-${m[2]}` : "";
}

const MONTHS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/** "2023-06-01" -> "Jun 2023". Empty string when the value is missing or invalid. */
export function formatMonthYear(raw: unknown): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])/.exec(trim(raw));
  return m ? `${MONTHS_ID[Number(m[2]) - 1]} ${m[1]}` : "";
}

const currentMonth = (now: Date) => `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

/** One entry per line, trimmed, blank lines dropped, duplicates (case-insensitive) dropped. */
export function splitLines(raw: unknown): string[] {
  return dedupe(trim(raw).split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
}

/** Comma, semicolon or newline separated list, trimmed, duplicates (case-insensitive) dropped. */
export function splitList(raw: unknown): string[] {
  return dedupe(trim(raw).split(/[,;\n]/).map((s) => s.trim()).filter(Boolean));
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const k = it.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(it);
    }
  }
  return out;
}

/**
 * work_experiences.achievements is jsonb. The UI writes plain strings; the UAT seed wrote objects
 * ({ title, detail }). Both must render, otherwise an object child crashes the page.
 */
export function normalizeAchievements(raw: unknown): string[] {
  const list = typeof raw === "string" ? safeJson(raw) : raw;
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const it of list) {
    if (typeof it === "string" && it.trim()) out.push(it.trim());
    else if (it && typeof it === "object") {
      const o = it as Record<string, unknown>;
      const text = [trim(o.title), trim(o.detail)].filter(Boolean).join(": ");
      if (text) out.push(text);
    }
  }
  return out;
}

/** skills_used is jsonb; keep only non-empty strings. */
export function normalizeStringList(raw: unknown): string[] {
  const list = typeof raw === "string" ? safeJson(raw) : raw;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------------------------
// Work experience  (table work_experiences)
// ---------------------------------------------------------------------------------------------

export const EMPLOYMENT_TYPES = [
  { value: "full-time", label: "Penuh waktu" },
  { value: "part-time", label: "Paruh waktu" },
  { value: "contract", label: "Kontrak" },
  { value: "internship", label: "Magang" },
  { value: "freelance", label: "Freelance" },
] as const;

export const LOCATION_TYPES = [
  { value: "on-site", label: "Di kantor" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
] as const;

export interface ExperienceForm {
  company_name: string;
  role_title: string;
  employment_type: string;
  location_type: string;
  /** month input, YYYY-MM */
  start_date: string;
  /** month input, YYYY-MM; ignored when is_current */
  end_date: string;
  is_current: boolean;
  description: string;
  /** one per line */
  achievements: string;
  /** comma separated */
  skills_used: string;
}

/** Columns the editor writes (user_id is added by the service). */
export interface ExperienceRow {
  company_name: string;
  role_title: string;
  employment_type: string;
  location_type: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  achievements: string[];
  skills_used: string[];
}

export const emptyExperienceForm = (): ExperienceForm => ({
  company_name: "",
  role_title: "",
  employment_type: "full-time",
  location_type: "on-site",
  start_date: "",
  end_date: "",
  is_current: false,
  description: "",
  achievements: "",
  skills_used: "",
});

export function experienceToForm(row: Record<string, any>): ExperienceForm {
  return {
    company_name: trim(row.company_name),
    role_title: trim(row.role_title),
    employment_type: trim(row.employment_type) || "full-time",
    location_type: trim(row.location_type) || "on-site",
    start_date: toMonthInput(row.start_date),
    end_date: row.is_current ? "" : toMonthInput(row.end_date),
    is_current: row.is_current === true,
    description: trim(row.description),
    achievements: normalizeAchievements(row.achievements).join("\n"),
    skills_used: normalizeStringList(row.skills_used).join(", "),
  };
}

export function validateExperience(form: ExperienceForm, now: Date = new Date()): ValidationResult<ExperienceForm, ExperienceRow> {
  const errors: FieldErrors<ExperienceForm> = {};
  const company = trim(form.company_name);
  const role = trim(form.role_title);
  if (!company) errors.company_name = "Nama perusahaan wajib diisi.";
  else if (company.length > LIMITS.name) errors.company_name = `Maksimal ${LIMITS.name} karakter.`;
  if (!role) errors.role_title = "Posisi wajib diisi.";
  else if (role.length > LIMITS.name) errors.role_title = `Maksimal ${LIMITS.name} karakter.`;

  if (!EMPLOYMENT_TYPES.some((t) => t.value === form.employment_type)) errors.employment_type = "Pilih jenis pekerjaan.";
  if (!LOCATION_TYPES.some((t) => t.value === form.location_type)) errors.location_type = "Pilih model kerja.";

  const nowMonth = currentMonth(now);
  const start = toDbDate(form.start_date);
  if (!trim(form.start_date)) errors.start_date = "Tanggal mulai wajib diisi.";
  else if (!start) errors.start_date = "Tanggal mulai tidak valid.";
  else if (start.slice(0, 7) > nowMonth) errors.start_date = "Tanggal mulai tidak boleh di masa depan.";

  let end: string | null = null;
  if (!form.is_current) {
    const e = toDbDate(form.end_date);
    if (!trim(form.end_date)) errors.end_date = "Tanggal selesai wajib diisi, atau centang \"Masih bekerja di sini\".";
    else if (!e) errors.end_date = "Tanggal selesai tidak valid.";
    else if (e.slice(0, 7) > nowMonth) errors.end_date = "Tanggal selesai tidak boleh di masa depan. Centang \"Masih bekerja di sini\" bila masih berjalan.";
    else if (start && e < start) errors.end_date = "Tanggal selesai tidak boleh sebelum tanggal mulai.";
    else end = e;
  }

  const description = trim(form.description);
  if (description.length > LIMITS.longText) errors.description = `Maksimal ${LIMITS.longText} karakter.`;

  const achievements = splitLines(form.achievements);
  if (achievements.length > LIMITS.maxAchievements) errors.achievements = `Maksimal ${LIMITS.maxAchievements} pencapaian.`;
  else if (achievements.some((a) => a.length > LIMITS.listItem)) errors.achievements = `Tiap pencapaian maksimal ${LIMITS.listItem} karakter.`;

  const skillsUsed = splitList(form.skills_used);
  if (skillsUsed.length > LIMITS.maxSkillsUsed) errors.skills_used = `Maksimal ${LIMITS.maxSkillsUsed} skill.`;
  else if (skillsUsed.some((s) => s.length > LIMITS.skillUsedLength)) errors.skills_used = `Tiap skill maksimal ${LIMITS.skillUsedLength} karakter.`;

  if (Object.keys(errors).length > 0 || !start) return { ok: false, errors };
  return {
    ok: true,
    row: {
      company_name: company,
      role_title: role,
      employment_type: form.employment_type,
      location_type: form.location_type,
      start_date: start,
      end_date: form.is_current ? null : end,
      is_current: form.is_current,
      description: description || null,
      achievements,
      skills_used: skillsUsed,
    },
  };
}

/** Newest start first; a current job outranks a finished one that started on the same date. */
export function sortExperiences<T extends { start_date?: unknown; is_current?: unknown }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const da = trim(a.start_date);
    const db = trim(b.start_date);
    if (da !== db) return da < db ? 1 : -1;
    return (b.is_current === true ? 1 : 0) - (a.is_current === true ? 1 : 0);
  });
}

// ---------------------------------------------------------------------------------------------
// Education  (table education)
// ---------------------------------------------------------------------------------------------

export const DEGREE_SUGGESTIONS = ["SMA/SMK", "D3", "D4", "S1", "S2", "S3"] as const;
export const MIN_YEAR = 1950;
/** Expected graduation may lie a few years ahead. */
export const MAX_YEARS_AHEAD = 8;

export interface EducationForm {
  institution: string;
  degree: string;
  field_of_study: string;
  start_year: string;
  end_year: string;
  is_current: boolean;
  gpa: string;
  max_gpa: string;
  description: string;
}

export interface EducationRow {
  institution: string;
  degree: string;
  field_of_study: string | null;
  start_year: number;
  end_year: number | null;
  is_current: boolean;
  gpa: number | null;
  max_gpa: number | null;
  description: string | null;
}

export const emptyEducationForm = (): EducationForm => ({
  institution: "",
  degree: "",
  field_of_study: "",
  start_year: "",
  end_year: "",
  is_current: false,
  gpa: "",
  max_gpa: "4",
  description: "",
});

export function educationToForm(row: Record<string, any>): EducationForm {
  const num = (v: unknown) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? String(v) : "");
  return {
    institution: trim(row.institution),
    degree: trim(row.degree),
    field_of_study: trim(row.field_of_study),
    start_year: num(row.start_year),
    end_year: row.is_current ? "" : num(row.end_year),
    is_current: row.is_current === true,
    gpa: num(row.gpa),
    max_gpa: num(row.max_gpa) || "4",
    description: trim(row.description),
  };
}

export function validateEducation(form: EducationForm, now: Date = new Date()): ValidationResult<EducationForm, EducationRow> {
  const errors: FieldErrors<EducationForm> = {};
  const year = now.getUTCFullYear();

  const institution = trim(form.institution);
  if (!institution) errors.institution = "Nama institusi wajib diisi.";
  else if (institution.length > LIMITS.name) errors.institution = `Maksimal ${LIMITS.name} karakter.`;

  const degree = trim(form.degree);
  if (!degree) errors.degree = "Jenjang wajib diisi, misalnya S1 atau D3.";
  else if (degree.length > LIMITS.shortText) errors.degree = `Maksimal ${LIMITS.shortText} karakter.`;

  const field = trim(form.field_of_study);
  if (field.length > LIMITS.shortText) errors.field_of_study = `Maksimal ${LIMITS.shortText} karakter.`;

  const start = parseYear(form.start_year);
  if (!trim(form.start_year)) errors.start_year = "Tahun masuk wajib diisi.";
  else if (start === undefined) errors.start_year = "Tahun masuk harus empat digit, misalnya 2021.";
  else if (start < MIN_YEAR || start > year) errors.start_year = `Tahun masuk harus antara ${MIN_YEAR} dan ${year}.`;

  let end: number | null = null;
  if (!form.is_current) {
    const e = parseYear(form.end_year);
    if (!trim(form.end_year)) errors.end_year = "Tahun lulus wajib diisi, atau centang \"Masih menempuh\".";
    else if (e === undefined) errors.end_year = "Tahun lulus harus empat digit, misalnya 2025.";
    else if (e > year + MAX_YEARS_AHEAD) errors.end_year = `Tahun lulus tidak boleh lebih dari ${year + MAX_YEARS_AHEAD}.`;
    else if (start !== undefined && start >= MIN_YEAR && e < start) errors.end_year = "Tahun lulus tidak boleh sebelum tahun masuk.";
    else end = e;
  }

  // GPA: both numbers or neither. Indonesian users write 3,75.
  let gpa: number | null = null;
  let maxGpa: number | null = null;
  if (trim(form.gpa) !== "") {
    const g = parseDecimal(form.gpa);
    const mx = trim(form.max_gpa) === "" ? 4 : parseDecimal(form.max_gpa);
    if (g === undefined) errors.gpa = "IPK harus berupa angka, misalnya 3,75.";
    else if (mx === undefined || mx <= 0 || mx > 100) errors.max_gpa = "Skala IPK harus angka lebih dari 0 dan paling banyak 100, misalnya 4.";
    else if (g > mx) errors.gpa = `IPK tidak boleh lebih besar dari skala (${mx}).`;
    else {
      gpa = g;
      maxGpa = mx;
    }
  }

  const description = trim(form.description);
  if (description.length > LIMITS.longText) errors.description = `Maksimal ${LIMITS.longText} karakter.`;

  if (Object.keys(errors).length > 0 || start === undefined) return { ok: false, errors };
  return {
    ok: true,
    row: {
      institution,
      degree,
      field_of_study: field || null,
      start_year: start,
      end_year: form.is_current ? null : end,
      is_current: form.is_current,
      gpa,
      max_gpa: maxGpa,
      description: description || null,
    },
  };
}

/** Newest start year first. */
export function sortEducation<T extends { start_year?: unknown }>(items: T[]): T[] {
  const y = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  return [...items].sort((a, b) => y(b.start_year) - y(a.start_year));
}

// ---------------------------------------------------------------------------------------------
// Skills  (table user_skills)
// ---------------------------------------------------------------------------------------------

export const SKILL_CATEGORIES = [
  { value: "technical", label: "Teknis" },
  { value: "tool", label: "Tools" },
  { value: "language", label: "Bahasa" },
  { value: "soft", label: "Soft skill" },
] as const;

export const PROFICIENCY_LEVELS = [
  { value: 1, label: "Pemula" },
  { value: 2, label: "Dasar" },
  { value: 3, label: "Menengah" },
  { value: 4, label: "Mahir" },
  { value: 5, label: "Ahli" },
] as const;

export const MAX_SKILLS = 50;
/** `user_skills.source` value for a skill typed in the UI (the seed script leaves it empty). */
export const SKILL_SOURCE_MANUAL = "manual";

export interface SkillForm {
  name: string;
  category: string;
  /** 1..5 as text from a select */
  proficiency_level: string;
  /** optional, years */
  years_experience: string;
}

export interface SkillRow {
  name: string;
  category: string;
  proficiency_level: number;
  years_experience: number | null;
  is_verified: boolean;
  source: string;
}

export const emptySkillForm = (): SkillForm => ({
  name: "",
  category: "technical",
  proficiency_level: "3",
  years_experience: "",
});

export function skillToForm(row: Record<string, any>): SkillForm {
  const level = Number(row.proficiency_level);
  return {
    name: trim(row.name),
    category: trim(row.category) || "technical",
    proficiency_level: Number.isInteger(level) && level >= 1 && level <= 5 ? String(level) : "3",
    years_experience: row.years_experience === null || row.years_experience === undefined ? "" : String(row.years_experience),
  };
}

export interface SkillContext {
  /** names of the skills the user already has */
  existing: Array<{ id?: string; name?: string }>;
  /** id of the skill being edited, so it does not clash with itself */
  editingId?: string | null;
}

export function validateSkill(form: SkillForm, ctx: SkillContext = { existing: [] }): ValidationResult<SkillForm, SkillRow> {
  const errors: FieldErrors<SkillForm> = {};
  const name = trim(form.name).replace(/\s+/g, " ");
  if (!name) errors.name = "Nama skill wajib diisi.";
  else if (name.length > LIMITS.skillName) errors.name = `Maksimal ${LIMITS.skillName} karakter.`;
  else {
    const clash = ctx.existing.some((s) => s.id !== ctx.editingId && trim(s.name).toLowerCase() === name.toLowerCase());
    if (clash) errors.name = "Skill ini sudah ada di daftarmu.";
    else if (!ctx.editingId && ctx.existing.length >= MAX_SKILLS) errors.name = `Maksimal ${MAX_SKILLS} skill.`;
  }

  if (!SKILL_CATEGORIES.some((c) => c.value === form.category)) errors.category = "Pilih kategori.";

  const level = Number(form.proficiency_level);
  if (!Number.isInteger(level) || level < 1 || level > 5) errors.proficiency_level = "Pilih tingkat 1 sampai 5.";

  let years: number | null = null;
  if (trim(form.years_experience) !== "") {
    const y = parseDecimal(form.years_experience);
    if (y === undefined || y > 60) errors.years_experience = "Lama pengalaman harus angka antara 0 dan 60 tahun.";
    else years = y;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    row: {
      name,
      category: form.category,
      proficiency_level: level,
      years_experience: years,
      is_verified: false,
      source: SKILL_SOURCE_MANUAL,
    },
  };
}

/** Highest level first, then name. */
export function sortSkills<T extends { name?: unknown; proficiency_level?: unknown }>(items: T[]): T[] {
  const lv = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  return [...items].sort((a, b) => lv(b.proficiency_level) - lv(a.proficiency_level) || trim(a.name).localeCompare(trim(b.name)));
}

// ---------------------------------------------------------------------------------------------
// Achievements: penghargaan dan publikasi  (table achievements)
// ---------------------------------------------------------------------------------------------

/**
 * `achievements.category` adalah teks bebas di database. Nilai yang dipakai: "award" dan "publication" (impor PDF
 * LinkedIn dan editor), "other" (pilihan Lainnya di editor), serta nilai lama dari data contoh seperti "competition"
 * dan "community". Nilai lama itu tampil sebagai Lainnya dan tetap dipertahankan saat barisnya diubah.
 */
export const ACHIEVEMENT_CATEGORIES = [
  { value: "award", label: "Penghargaan" },
  { value: "publication", label: "Publikasi" },
  { value: "other", label: "Lainnya" },
] as const;

export const ACHIEVEMENT_TITLE_MAX = 200;
export const ACHIEVEMENT_ISSUER_MAX = 120;
export const ACHIEVEMENT_DESCRIPTION_MAX = LIMITS.longText;

/** Baris `achievements` yang ditulis (kolom `url` tidak disentuh, user_id ditambahkan layanan). */
export interface AchievementRow {
  title: string;
  category: string;
  issuer: string | null;
  /** `YYYY-MM-01` */
  achievement_date: string | null;
  description: string | null;
  is_featured: boolean;
}

export interface AchievementInput {
  title: unknown;
  category: unknown;
  issuer: unknown;
  achievement_date: unknown;
  description: unknown;
  is_featured?: unknown;
}

export type AchievementField = "title" | "category" | "issuer" | "achievement_date" | "description";
export type AchievementErrors = Partial<Record<AchievementField, string>>;

/** Jenis yang dihasilkan impor PDF LinkedIn (Honors-Awards dan Publications). Editor juga menerima "other". */
export const IMPORT_ACHIEVEMENT_CATEGORIES: readonly string[] = ["award", "publication"];

/**
 * Satu-satunya aturan penghargaan dan publikasi, dipakai editor Profil dan impor PDF LinkedIn: judul wajib dan paling
 * banyak 200 karakter, jenis termasuk `categories`, penyelenggara paling banyak 120, deskripsi paling banyak 2000,
 * tanggal (bila ada) sah, tidak sebelum tahun 1950, dan tidak di masa depan. Tanggal dinormalkan ke `YYYY-MM-01`.
 * Galat diurutkan judul, jenis, penyelenggara, deskripsi, tanggal.
 */
export function checkAchievement(
  a: AchievementInput,
  now: Date = new Date(),
  categories: readonly string[] = IMPORT_ACHIEVEMENT_CATEGORIES,
): { ok: true; row: AchievementRow } | { ok: false; errors: AchievementErrors } {
  const errors: AchievementErrors = {};
  const title = trim(a.title);
  const issuer = trim(a.issuer);
  const description = trim(a.description);
  const dateRaw = trim(a.achievement_date);
  if (!title) errors.title = "Judul kosong.";
  else if (title.length > ACHIEVEMENT_TITLE_MAX) errors.title = `Judul maksimal ${ACHIEVEMENT_TITLE_MAX} karakter.`;
  if (typeof a.category !== "string" || !categories.includes(a.category)) {
    errors.category = categories.includes("other") ? "Pilih jenis: penghargaan, publikasi, atau lainnya." : "Jenis harus penghargaan atau publikasi.";
  }
  if (issuer.length > ACHIEVEMENT_ISSUER_MAX) errors.issuer = `Penyelenggara maksimal ${ACHIEVEMENT_ISSUER_MAX} karakter.`;
  if (description.length > ACHIEVEMENT_DESCRIPTION_MAX) errors.description = `Deskripsi maksimal ${ACHIEVEMENT_DESCRIPTION_MAX} karakter.`;
  let date: string | null = null;
  if (dateRaw) {
    const d = toDbDate(dateRaw);
    if (!d) errors.achievement_date = "Tanggal tidak valid.";
    else if (Number(d.slice(0, 4)) < MIN_YEAR) errors.achievement_date = `Tahun tidak boleh sebelum ${MIN_YEAR}.`;
    else if (d.slice(0, 7) > currentMonth(now)) errors.achievement_date = "Tanggal tidak boleh di masa depan.";
    else date = d;
  }
  if (Object.keys(errors).length > 0 || typeof a.category !== "string") return { ok: false, errors };
  return {
    ok: true,
    row: { title, category: a.category, issuer: issuer || null, achievement_date: date, description: description || null, is_featured: a.is_featured === true },
  };
}

/** Validator impor PDF LinkedIn: hasilnya alasan pertama yang gagal, bukan peta galat per kolom. */
export function validateAchievement(
  a: AchievementInput,
  now: Date = new Date(),
): { ok: true; row: AchievementRow } | { ok: false; reason: string } {
  const r = checkAchievement(a, now, IMPORT_ACHIEVEMENT_CATEGORIES);
  if (r.ok) return r;
  return { ok: false, reason: Object.values(r.errors).find((m) => !!m) ?? "Data tidak valid." };
}

export interface AchievementForm {
  title: string;
  /** "award", "publication", atau "other" (nilai pilihan di formulir) */
  category: string;
  issuer: string;
  /** month input, YYYY-MM; boleh kosong */
  achievement_date: string;
  description: string;
  /** dibawa dari baris yang diubah; editor tidak mengubahnya */
  is_featured: boolean;
  /** nilai category lama di luar tiga pilihan ("competition", "community"), dipertahankan saat tetap memilih Lainnya */
  legacy_category: string;
}

export const emptyAchievementForm = (): AchievementForm => ({
  title: "",
  category: "award",
  issuer: "",
  achievement_date: "",
  description: "",
  is_featured: false,
  legacy_category: "",
});

export function achievementToForm(row: Record<string, any>): AchievementForm {
  const raw = trim(row.category);
  const known = raw === "award" || raw === "publication";
  return {
    title: trim(row.title),
    category: known ? raw : "other",
    issuer: trim(row.issuer),
    achievement_date: toMonthInput(row.achievement_date),
    description: trim(row.description),
    is_featured: row.is_featured === true,
    legacy_category: known || raw === "other" ? "" : raw,
  };
}

export function validateAchievementForm(form: AchievementForm, now: Date = new Date()): ValidationResult<AchievementForm, AchievementRow> {
  const res = checkAchievement(form, now, ACHIEVEMENT_CATEGORIES.map((c) => c.value));
  if (!res.ok) return { ok: false, errors: res.errors };
  // Memilih Lainnya pada baris lama tidak boleh menimpa nilai aslinya ("competition" tetap "competition").
  const legacy = trim(form.legacy_category);
  const category = res.row.category === "other" && legacy ? legacy : res.row.category;
  return { ok: true, row: { ...res.row, category } };
}

/** "award" -> "Penghargaan", "publication" -> "Publikasi", selain itu (juga null) -> "Lainnya". */
export function achievementCategoryLabel(raw: unknown): string {
  const v = trim(raw);
  return ACHIEVEMENT_CATEGORIES.find((c) => c.value === v && c.value !== "other")?.label ?? "Lainnya";
}

/**
 * Teks yang ditampilkan untuk satu penghargaan, dipakai bersama oleh daftar di langkah 3 dan pratinjau CV
 * supaya keduanya tidak berbeda: meta = jenis · penyelenggara · bulan tahun, description = keterangan
 * (kosong bila NULL atau hanya spasi, sehingga pemanggil cukup memeriksa string kosong).
 */
export function achievementDetails(row: { category?: unknown; issuer?: unknown; achievement_date?: unknown; description?: unknown }): { meta: string; description: string } {
  return {
    meta: [achievementCategoryLabel(row.category), trim(row.issuer), formatMonthYear(row.achievement_date)].filter(Boolean).join(" · "),
    description: trim(row.description),
  };
}

/** Unggulan dulu, lalu tanggal terbaru (tanpa tanggal paling akhir), lalu judul. */
export function sortAchievements<T extends { title?: unknown; achievement_date?: unknown; is_featured?: unknown }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const fa = a.is_featured === true ? 1 : 0;
    const fb = b.is_featured === true ? 1 : 0;
    if (fa !== fb) return fb - fa;
    const da = trim(a.achievement_date);
    const db = trim(b.achievement_date);
    if (da !== db) return !da ? 1 : !db ? -1 : da < db ? 1 : -1;
    return trim(a.title).localeCompare(trim(b.title));
  });
}

// ---------------------------------------------------------------------------------------------
// Basic profile  (table profiles)
// ---------------------------------------------------------------------------------------------

/** Columns of `profiles` the basic-info step may write. `email` is NOT a column: it comes from auth. */
export const PROFILE_COLUMNS = ["full_name", "current_title", "location", "experience_years", "phone", "linkedin_url", "portfolio_url"] as const;

export interface ProfileFormData {
  full_name: string;
  current_title: string;
  location: string;
  experience_years: number;
  phone: string;
  email?: string;
  linkedin_url: string;
  portfolio_url: string;
}

export interface ProfileGapsInput {
  full_name: string;
  current_title: string;
  skills: number;
  experiences: number;
  education: number;
}

/**
 * What the review step tells the user. `missing` blocks "Profil siap" (the draft prompt always uses name,
 * title and skills); `tips` never blocks: a fresh graduate may have no work experience.
 */
export function profileGaps(p: ProfileGapsInput): { missing: string[]; tips: string[] } {
  const missing: string[] = [];
  const tips: string[] = [];
  if (!trim(p.full_name)) missing.push("Nama lengkap belum diisi.");
  if (!trim(p.current_title)) missing.push("Posisi atau jabatan belum diisi.");
  if (p.skills === 0) missing.push("Belum ada skill. Draf lamaran memakai daftar skill.");
  if (p.experiences === 0) tips.push("Belum ada pengalaman kerja. Boleh dikosongkan bila belum pernah bekerja; magang atau kerja paruh waktu tetap membantu.");
  if (p.education === 0) tips.push("Belum ada riwayat pendidikan. CV hasil AI memakainya.");
  return { missing, tips };
}

/**
 * Kotak sesudah "Simpan & Selesai". Hijau "Profilmu tersimpan" hanya bila langkah Tinjau tidak menemukan yang kurang
 * (nama, jabatan, skill); bila ada, kotaknya kuning dan menyebut yang kurang, bukan merayakan profil yang belum siap.
 */
export const FINISHED_COMPLETE_HEADING = "Profilmu tersimpan";
export const FINISHED_INCOMPLETE_HEADING = "Profilmu tersimpan, tetapi belum lengkap";
export const FINISHED_INCOMPLETE_LEAD = "Lengkapi dulu hal berikut supaya draf lamaran AI tidak kosong:";
export const FINISHED_INCOMPLETE_ACTION = "Lengkapi data dasar";

export function finishedKind(gaps: { missing: readonly string[] }): "complete" | "incomplete" {
  return gaps.missing.length === 0 ? "complete" : "incomplete";
}

const isHttpUrl = (s: string) => {
  if (!/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(s)) return false;
  return s.length <= 300;
};

export type ProfileValidation =
  | { ok: true; row: Record<(typeof PROFILE_COLUMNS)[number], string | number | null> }
  | { ok: false; errors: Partial<Record<(typeof PROFILE_COLUMNS)[number], string>> };

/** Whitelist and validate the basic profile. The form's read-only `email` never reaches the upsert. */
export function buildProfileRow(form: ProfileFormData): ProfileValidation {
  const errors: Partial<Record<(typeof PROFILE_COLUMNS)[number], string>> = {};
  const name = trim(form.full_name);
  if (!name) errors.full_name = "Nama lengkap wajib diisi.";
  else if (name.length > LIMITS.name) errors.full_name = `Maksimal ${LIMITS.name} karakter.`;

  const title = trim(form.current_title);
  if (title.length > LIMITS.name) errors.current_title = `Maksimal ${LIMITS.name} karakter.`;
  const location = trim(form.location);
  if (location.length > LIMITS.name) errors.location = `Maksimal ${LIMITS.name} karakter.`;

  const years = Number(form.experience_years);
  if (!Number.isInteger(years) || years < 0 || years > 60) errors.experience_years = "Tahun pengalaman harus bilangan bulat 0 sampai 60.";

  const phone = trim(form.phone);
  if (phone && !/^\+?[0-9\s\-()]{6,25}$/.test(phone)) errors.phone = "Nomor telepon tidak valid.";

  const linkedin = trim(form.linkedin_url);
  if (linkedin && !isHttpUrl(linkedin)) errors.linkedin_url = "Alamat harus diawali http:// atau https://.";
  const portfolio = trim(form.portfolio_url);
  if (portfolio && !isHttpUrl(portfolio)) errors.portfolio_url = "Alamat harus diawali http:// atau https://.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    row: {
      full_name: name,
      current_title: title || null,
      location: location || null,
      experience_years: years,
      phone: phone || null,
      linkedin_url: linkedin || null,
      portfolio_url: portfolio || null,
    },
  };
}
