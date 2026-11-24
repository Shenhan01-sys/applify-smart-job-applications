/**
 * Impor profil dari PDF LinkedIn, sisi frontend. Server (POST /api/profile/import/linkedin-pdf, lihat
 * backend/api/routes/profile-import.ts) hanya mengembalikan PRATINJAU; tidak ada yang ditulis ke database sebelum
 * pengguna mencentang item dan menekan "Tambahkan ke profil". Berkas ini memuat logika murni di antara keduanya:
 *
 *   respons server -> parseImportPreview -> buildImportPlan (cek duplikat + validasi) -> pilihan pengguna
 *   -> selectionFromPlan -> applyImport (tulis lewat profileService yang sudah ada)
 *
 * Aturan validasi memakai validator yang sama dengan editor Profil (profileForms.ts), jadi baris yang masuk
 * tidak berbeda dari yang diketik manual. Duplikat dilewati dan ditampilkan sebagai "Sudah ada": profil yang
 * sudah terisi tidak pernah ditimpa. Tanpa impor selain berkas lib lain, supaya bisa dites dengan `node --test`.
 */
import {
  PROFICIENCY_LEVELS,
  SKILL_CATEGORIES,
  buildProfileRow,
  formatMonthYear,
  toMonthInput,
  validateAchievement,
  validateEducation,
  validateExperience,
  validateSkill,
  type AchievementRow,
  type EducationRow,
  type ExperienceRow,
  type ProfileFormData,
  type SkillRow,
} from "./profileForms.ts";
import { parseApiError } from "./apiErrors.ts";
import { RESUME_MAX_BYTES } from "./resumeUpload.ts";

// ---------------------------------------------------------------------------------------------
// Teks antarmuka dan unggahan
// ---------------------------------------------------------------------------------------------

/** Petunjuk satu baris di kartu impor. */
export const LINKEDIN_PDF_HINT = "Unggah PDF profil LinkedIn (buka profilmu, pilih Lainnya (More), lalu Simpan ke PDF (Save to PDF)) atau PDF CV biasa yang berisi teks, bukan hasil pindai.";
export const LINKEDIN_PDF_PRIVACY = "PDF tidak disimpan. Isinya dibaca AI, lalu kamu periksa dulu sebelum ada yang ditambahkan ke profil.";
/** Nilai kolom `user_skills.source` untuk skill dari PDF (skill yang diketik di UI memakai "manual"). */
export const IMPORTED_SKILL_SOURCE = "linkedin_pdf";
export const LINKEDIN_PDF_MAX_BYTES = RESUME_MAX_BYTES;
/** Batas tunggu jawaban server (ms). Server sendiri berhenti menunggu AI setelah 75 detik. */
export const LINKEDIN_IMPORT_TIMEOUT_MS = 120_000;

export interface PdfFileInfo {
  name: string;
  size: number;
  type: string;
}

export type PdfCheck = { ok: true } | { ok: false; reason: string };

/** Pemeriksaan cepat di browser sebelum PDF dikirim. Server memeriksa ulang (penanda %PDF, ukuran). */
export function validateLinkedInPdfFile(file: PdfFileInfo): PdfCheck {
  const size = Number(file?.size);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, reason: "Berkas kosong. Pilih PDF lain." };
  const mime = String(file?.type ?? "").split(";")[0].trim().toLowerCase();
  const byName = /\.pdf$/i.test(String(file?.name ?? "").trim());
  const isPdf = mime === "application/pdf" || ((mime === "" || mime === "application/octet-stream") && byName);
  if (!isPdf) return { ok: false, reason: "Berkas harus PDF. Pakai PDF profil LinkedIn (Lainnya, Simpan ke PDF) atau PDF CV biasa." };
  if (size > LINKEDIN_PDF_MAX_BYTES) return { ok: false, reason: "Ukuran PDF terlalu besar, maksimal 5 MB." };
  return { ok: true };
}

/** Lima byte pertama berkas sebagai teks. PDF sungguhan selalu diawali "%PDF". */
export const hasPdfMagic = (head: string): boolean => typeof head === "string" && head.startsWith("%PDF");

const waitText = (sec: number | undefined): string => {
  if (!sec || sec <= 0) return "beberapa saat lagi";
  if (sec < 90) return `${Math.ceil(sec)} detik`;
  return `${Math.ceil(sec / 60)} menit`;
};

/** Pesan untuk pengguna dari kode galat server (lihat daftar kode di backend/api/routes/profile-import.ts). */
export function describeLinkedInImportError(err: unknown, fallback = "PDF belum bisa diimpor. Coba lagi."): string {
  const name = (err as { name?: unknown } | null)?.name;
  if (name === "TimeoutError" || name === "AbortError") {
    return "Server terlalu lama menjawab. PDF yang panjang butuh waktu; coba lagi sebentar lagi.";
  }
  if (err instanceof Error && (err as { code?: unknown }).code === "api_not_configured") return err.message;
  const e = parseApiError(err);
  switch (e.code) {
    case "not_pdf":
      return "Berkas ini bukan PDF. Pakai PDF profil LinkedIn (Lainnya, Simpan ke PDF) atau PDF CV biasa.";
    case "empty_file":
      return "Berkas kosong. Pilih PDF lain.";
    case "file_too_large":
      return "Ukuran PDF terlalu besar, maksimal 5 MB.";
    case "pdf_unreadable":
      return "PDF tidak bisa dibaca. PDF yang rusak atau dikunci kata sandi tidak didukung.";
    case "pdf_too_long":
      return "PDF terlalu panjang untuk CV atau profil LinkedIn. Pastikan itu PDF CV atau profilmu.";
    case "pdf_no_text":
      return "PDF ini tidak berisi teks yang bisa dibaca, mungkin hasil pindai. Pakai PDF CV yang bisa diseleksi teksnya, atau unduh PDF dari LinkedIn: Lainnya, Simpan ke PDF.";
    case "nothing_found":
      return "Tidak ada data profil yang bisa dibaca dari PDF ini. Pastikan itu PDF CV atau PDF profil LinkedIn, dan bukan hasil pindai.";
    case "rate_limited":
      return `Terlalu banyak impor dalam waktu singkat. Coba lagi dalam ${waitText(e.retryAfterSec)}.`;
    case "rate_limit_check_failed":
      return "Batas impor tidak dapat diperiksa saat ini. Coba lagi nanti.";
    case "bad_response":
      return "Jawaban server tidak dikenali. Coba lagi, atau isi profil secara manual.";
  }
  if (e.status === 401) return "Sesi login berakhir atau belum masuk. Masuk lagi, lalu ulangi.";
  if (e.status === 413) return "Ukuran PDF terlalu besar, maksimal 5 MB.";
  if (e.rawText && /failed to fetch|networkerror|load failed|network request failed/i.test(e.rawText)) {
    return "Server Applify tidak dapat dihubungi. Periksa koneksi internetmu, lalu coba lagi.";
  }
  if (e.status !== undefined && e.status >= 500) return `${fallback} Server sedang bermasalah. Coba lagi beberapa saat lagi.`;
  if (e.serverMessage) return `${fallback} (${e.serverMessage})`;
  return fallback;
}

// ---------------------------------------------------------------------------------------------
// Bentuk pratinjau dari server
// ---------------------------------------------------------------------------------------------

export type BasicField = "full_name" | "current_title" | "location" | "linkedin_url";

export interface PreviewProfile {
  full_name: string | null;
  current_title: string | null;
  location: string | null;
  linkedin_url: string | null;
}

export interface PreviewExperience {
  company_name: string;
  role_title: string;
  employment_type: string;
  location_type: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  notes: string[];
}

export interface PreviewEducation {
  institution: string;
  degree: string;
  field_of_study: string | null;
  start_year: number;
  end_year: number | null;
  is_current: boolean;
  /** IPK dan skalanya dari CV; null bila CV tidak mencantumkannya (atau server lama belum mengirim). */
  gpa: number | null;
  max_gpa: number | null;
  notes: string[];
}

export interface PreviewCertification {
  name: string;
  issuer: string;
}

/** Nilai kolom `achievements.category`: seksi "Honors-Awards" PDF = award, seksi "Publications" = publication. */
export type AchievementCategory = "award" | "publication";

export interface PreviewAchievement {
  title: string;
  category: AchievementCategory;
  issuer: string | null;
  /** `YYYY-MM-DD` (selalu tanggal 1), null bila PDF tidak mencantumkan tanggal */
  achievement_date: string | null;
  description: string | null;
  notes: string[];
}

export interface PreviewSkill {
  name: string;
  category: string;
  proficiency_level: number;
}

export interface ImportPreview {
  profile: PreviewProfile;
  experiences: PreviewExperience[];
  education: PreviewEducation[];
  certifications: PreviewCertification[];
  achievements: PreviewAchievement[];
  skills: PreviewSkill[];
  meta: { method: "ai" | "rules"; model: string | null; pages: number; truncated: boolean; dropped: number };
  warnings: string[];
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const textOrNull = (v: unknown): string | null => text(v) || null;
const numberOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strings = (v: unknown): string[] => list(v).filter((x): x is string => typeof x === "string" && x.trim() !== "");

/**
 * Membaca jawaban server `{ success, preview }`. Bentuk yang tidak dikenal menghasilkan null; item yang cacat
 * dibuang satu per satu, sisanya tetap dipakai. Isi tetap divalidasi lagi oleh buildImportPlan.
 */
export function parseImportPreview(raw: unknown): ImportPreview | null {
  const body = obj(raw);
  const p = obj(body?.preview);
  if (!body || body.success !== true || !p) return null;

  const profile = obj(p.profile) ?? {};
  const meta = obj(p.meta) ?? {};
  const dropped = obj(meta.dropped) ?? {};
  const droppedTotal = ["experiences", "education", "certifications", "achievements", "skills"].reduce((n, k) => n + (Number(dropped[k]) || 0), 0);

  const experiences: PreviewExperience[] = [];
  for (const item of list(p.experiences)) {
    const e = obj(item);
    if (!e || !text(e.company_name) || !text(e.role_title) || !text(e.start_date)) continue;
    experiences.push({
      company_name: text(e.company_name),
      role_title: text(e.role_title),
      employment_type: text(e.employment_type) || "full-time",
      location_type: text(e.location_type) || "on-site",
      start_date: text(e.start_date),
      end_date: textOrNull(e.end_date),
      is_current: e.is_current === true,
      description: textOrNull(e.description),
      notes: strings(e.notes),
    });
  }

  const education: PreviewEducation[] = [];
  for (const item of list(p.education)) {
    const e = obj(item);
    if (!e || !text(e.institution) || !text(e.degree) || typeof e.start_year !== "number") continue;
    // IPK dan skalanya hanya dipakai berpasangan, sama seperti kolom `education.gpa` dan `max_gpa`.
    const gpa = numberOrNull(e.gpa);
    const maxGpa = numberOrNull(e.max_gpa);
    education.push({
      institution: text(e.institution),
      degree: text(e.degree),
      field_of_study: textOrNull(e.field_of_study),
      start_year: e.start_year,
      end_year: typeof e.end_year === "number" ? e.end_year : null,
      is_current: e.is_current === true,
      gpa: gpa !== null && maxGpa !== null ? gpa : null,
      max_gpa: gpa !== null && maxGpa !== null ? maxGpa : null,
      notes: strings(e.notes),
    });
  }

  const certifications: PreviewCertification[] = [];
  for (const item of list(p.certifications)) {
    const c = obj(item);
    if (!c || !text(c.name)) continue;
    certifications.push({ name: text(c.name), issuer: text(c.issuer) });
  }

  const achievements: PreviewAchievement[] = [];
  for (const item of list(p.achievements)) {
    const a = obj(item);
    if (!a || !text(a.title) || (a.category !== "award" && a.category !== "publication")) continue;
    achievements.push({
      title: text(a.title),
      category: a.category,
      issuer: textOrNull(a.issuer),
      achievement_date: textOrNull(a.achievement_date),
      description: textOrNull(a.description),
      notes: strings(a.notes),
    });
  }

  const skills: PreviewSkill[] = [];
  for (const item of list(p.skills)) {
    const s = obj(item);
    if (!s || !text(s.name)) continue;
    skills.push({ name: text(s.name), category: text(s.category) || "technical", proficiency_level: Number(s.proficiency_level) || 3 });
  }

  return {
    profile: {
      full_name: textOrNull(profile.full_name),
      current_title: textOrNull(profile.current_title),
      location: textOrNull(profile.location),
      linkedin_url: textOrNull(profile.linkedin_url),
    },
    experiences,
    education,
    certifications,
    achievements,
    skills,
    meta: {
      method: meta.method === "rules" ? "rules" : "ai",
      model: textOrNull(meta.model),
      pages: Number(meta.pages) || 0,
      truncated: meta.truncated === true,
      dropped: droppedTotal,
    },
    warnings: strings(p.warnings),
  };
}

// ---------------------------------------------------------------------------------------------
// Rencana impor: duplikat, validasi, label
// ---------------------------------------------------------------------------------------------

/** Baris `certifications` yang ditulis (kolom lain dibiarkan kosong, user_id ditambahkan layanan). */
export interface CertificationRow {
  name: string;
  issuer: string;
  is_verified: boolean;
}

export const CERT_NAME_MAX = 200;
export const CERT_ISSUER_MAX = 120;

// Aturan, batas, dan tipe baris penghargaan dan publikasi ada di profileForms.ts, satu sumber untuk editor Profil
// dan impor ini. Diekspor ulang di sini supaya pemakai impor tidak perlu tahu letaknya.
export { ACHIEVEMENT_DESCRIPTION_MAX, ACHIEVEMENT_ISSUER_MAX, ACHIEVEMENT_TITLE_MAX, validateAchievement } from "./profileForms.ts";
export type { AchievementRow } from "./profileForms.ts";

const ACHIEVEMENT_LABELS: Record<AchievementCategory, string> = { award: "Penghargaan", publication: "Publikasi" };

export type ItemStatus = "new" | "duplicate" | "invalid";

export interface ImportItem<Row> {
  /** unik di seluruh rencana, dipakai sebagai kunci pilihan */
  key: string;
  status: ItemStatus;
  title: string;
  detail: string;
  /** catatan dari server atau validator, mis. bulan yang tidak tercantum di PDF */
  notes: string[];
  /** alasan bila status bukan "new" */
  reason: string;
  /** baris siap tulis; null bila status bukan "new" */
  row: Row | null;
}

export interface BasicPatchItem {
  field: BasicField;
  value: string;
}

export interface ImportPlan {
  basic: Array<ImportItem<BasicPatchItem>>;
  experiences: Array<ImportItem<ExperienceRow>>;
  education: Array<ImportItem<EducationRow>>;
  certifications: Array<ImportItem<CertificationRow>>;
  achievements: Array<ImportItem<AchievementRow>>;
  skills: Array<ImportItem<SkillRow>>;
}

/** Isi profil yang sudah ada, untuk mendeteksi duplikat. Bentuknya longgar: baris database dan state halaman sama-sama cocok. */
export interface ExistingProfile {
  basic: Partial<Record<BasicField, unknown>>;
  experiences: Array<{ company_name?: unknown; role_title?: unknown }>;
  education: Array<{ institution?: unknown; degree?: unknown }>;
  certifications: Array<{ name?: unknown }>;
  achievements: Array<{ title?: unknown }>;
  skills: Array<{ name?: unknown }>;
}

export const EMPTY_EXISTING: ExistingProfile = { basic: {}, experiences: [], education: [], certifications: [], achievements: [], skills: [] };

/**
 * Kunci perbandingan nama: huruf kecil, tanpa aksen, tanda baca jadi spasi, tetapi `+` dan `#` dipertahankan
 * supaya "C++ Developer" dan "C# Developer" tidak dianggap sama.
 */
export function normKey(s: unknown): string {
  return String(typeof s === "string" ? s : "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim();
}

/** Nama skill dibandingkan seperti validateSkill: huruf kecil, spasi dirapikan, tanda baca TETAP ("C++" bukan "C#"). */
export const skillKey = (s: unknown): string => String(typeof s === "string" ? s : "").trim().replace(/\s+/g, " ").toLowerCase();

export const experienceKey = (company: unknown, title: unknown): string => `${normKey(company)}|${normKey(title)}`;
export const educationKey = (institution: unknown, degree: unknown): string => `${normKey(institution)}|${normKey(degree)}`;

const BASIC_LABELS: Record<BasicField, string> = {
  full_name: "Nama lengkap",
  current_title: "Posisi atau jabatan terakhir",
  location: "Lokasi",
  linkedin_url: "Alamat LinkedIn",
};
const BASIC_ORDER: BasicField[] = ["full_name", "current_title", "location", "linkedin_url"];

const firstError = (errors: Record<string, string | undefined>): string => Object.values(errors).find((m) => !!m) ?? "Data tidak valid.";
const categoryLabel = (v: string) => SKILL_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const levelLabel = (v: number) => PROFICIENCY_LEVELS.find((l) => l.value === v)?.label ?? String(v);

export function validateCertification(c: { name: unknown; issuer: unknown }): { ok: true; row: CertificationRow } | { ok: false; reason: string } {
  const name = text(c.name);
  const issuer = text(c.issuer);
  if (!name) return { ok: false, reason: "Nama sertifikasi kosong." };
  if (name.length > CERT_NAME_MAX) return { ok: false, reason: `Nama sertifikasi maksimal ${CERT_NAME_MAX} karakter.` };
  if (issuer.length > CERT_ISSUER_MAX) return { ok: false, reason: `Penerbit maksimal ${CERT_ISSUER_MAX} karakter.` };
  return { ok: true, row: { name, issuer, is_verified: false } };
}

/**
 * Susun rencana impor dari pratinjau server dan isi profil yang sudah ada. Setiap item mendapat status:
 *   new       lolos validator editor Profil dan belum ada
 *   duplicate sudah ada di profil (atau muncul dua kali di PDF); dilewati
 *   invalid   tidak lolos validator (mis. tanggal di masa depan) atau melewati batas jumlah skill; dilewati
 */
export function buildImportPlan(preview: ImportPreview, existing: ExistingProfile = EMPTY_EXISTING, now: Date = new Date()): ImportPlan {
  const plan: ImportPlan = { basic: [], experiences: [], education: [], certifications: [], achievements: [], skills: [] };

  // --- profil dasar: hanya mengisi kolom yang masih kosong, tidak pernah menimpa
  for (const field of BASIC_ORDER) {
    const value = text(preview.profile[field]);
    if (!value) continue;
    const current = text(existing.basic[field]);
    const key = `basic:${field}`;
    const base = { key, title: BASIC_LABELS[field], detail: value, notes: [] as string[] };
    if (current) {
      plan.basic.push({ ...base, status: "duplicate", reason: "Sudah terisi di profilmu.", row: null });
      continue;
    }
    const probe: ProfileFormData = {
      full_name: text(existing.basic.full_name) || "x",
      current_title: "",
      location: "",
      experience_years: 0,
      phone: "",
      linkedin_url: "",
      portfolio_url: "",
      [field]: value,
    };
    const built = buildProfileRow(probe);
    const problem = !built.ok ? (built.errors as Record<string, string | undefined>)[field] : undefined;
    plan.basic.push(problem ? { ...base, status: "invalid", reason: problem, row: null } : { ...base, status: "new", reason: "", row: { field, value } });
  }

  // --- pengalaman kerja
  const seenExp = new Set(existing.experiences.map((e) => experienceKey(e.company_name, e.role_title)));
  for (const [i, e] of preview.experiences.entries()) {
    const key = `exp:${i}`;
    const range = `${formatMonthYear(e.start_date)} - ${e.is_current ? "Sekarang" : formatMonthYear(e.end_date) || "?"}`;
    const base = { key, title: e.role_title, detail: `${e.company_name} · ${range}`, notes: e.notes };
    const k = experienceKey(e.company_name, e.role_title);
    if (seenExp.has(k)) {
      plan.experiences.push({ ...base, status: "duplicate", reason: "Posisi ini di perusahaan yang sama sudah ada.", row: null });
      continue;
    }
    const v = validateExperience(
      {
        company_name: e.company_name,
        role_title: e.role_title,
        employment_type: e.employment_type,
        location_type: e.location_type,
        start_date: toMonthInput(e.start_date),
        end_date: e.is_current ? "" : toMonthInput(e.end_date),
        is_current: e.is_current,
        description: e.description ?? "",
        achievements: "",
        skills_used: "",
      },
      now,
    );
    if (!v.ok) {
      plan.experiences.push({ ...base, status: "invalid", reason: firstError(v.errors), row: null });
      continue;
    }
    seenExp.add(k);
    plan.experiences.push({ ...base, status: "new", reason: "", row: v.row });
  }

  // --- pendidikan
  const seenEdu = new Set(existing.education.map((e) => educationKey(e.institution, e.degree)));
  for (const [i, e] of preview.education.entries()) {
    const key = `edu:${i}`;
    const years = `${e.start_year} - ${e.is_current ? "Sekarang" : (e.end_year ?? "?")}`;
    const hasGpa = typeof e.gpa === "number" && typeof e.max_gpa === "number";
    const gpaText = hasGpa ? ` · IPK ${String(e.gpa).replace(".", ",")}/${String(e.max_gpa).replace(".", ",")}` : "";
    const base = { key, title: e.institution, detail: `${[e.degree, e.field_of_study].filter(Boolean).join(", ")} · ${years}${gpaText}`, notes: e.notes };
    const k = educationKey(e.institution, e.degree);
    if (seenEdu.has(k)) {
      plan.education.push({ ...base, status: "duplicate", reason: "Jenjang ini di institusi yang sama sudah ada.", row: null });
      continue;
    }
    const form = {
      institution: e.institution,
      degree: e.degree,
      field_of_study: e.field_of_study ?? "",
      start_year: String(e.start_year),
      end_year: e.is_current || e.end_year === null ? "" : String(e.end_year),
      is_current: e.is_current,
      gpa: hasGpa ? String(e.gpa) : "",
      max_gpa: hasGpa ? String(e.max_gpa) : "4",
      description: "",
    };
    let v = validateEducation(form, now);
    // IPK yang tidak sah tidak boleh menghilangkan pendidikannya: ulangi tanpa IPK dan beri catatan.
    if (!v.ok && form.gpa !== "" && (v.errors.gpa || v.errors.max_gpa) && Object.keys(v.errors).every((f) => f === "gpa" || f === "max_gpa")) {
      v = validateEducation({ ...form, gpa: "", max_gpa: "4" }, now);
      if (v.ok) base.notes = [...base.notes, "IPK di PDF tidak dimasukkan karena angkanya tidak sah. Tambahkan manual bila perlu."];
    }
    if (!v.ok) {
      plan.education.push({ ...base, status: "invalid", reason: firstError(v.errors), row: null });
      continue;
    }
    seenEdu.add(k);
    plan.education.push({ ...base, status: "new", reason: "", row: v.row });
  }

  // --- sertifikasi
  const seenCert = new Set(existing.certifications.map((c) => normKey(c.name)));
  for (const [i, c] of preview.certifications.entries()) {
    const key = `cert:${i}`;
    const base = { key, title: c.name, detail: c.issuer || "Penerbit tidak tercantum di PDF", notes: [] as string[] };
    const k = normKey(c.name);
    if (seenCert.has(k)) {
      plan.certifications.push({ ...base, status: "duplicate", reason: "Sertifikasi ini sudah ada.", row: null });
      continue;
    }
    const v = validateCertification(c);
    if (!v.ok) {
      plan.certifications.push({ ...base, status: "invalid", reason: v.reason, row: null });
      continue;
    }
    seenCert.add(k);
    plan.certifications.push({ ...base, status: "new", reason: "", row: v.row });
  }

  // --- penghargaan dan publikasi (achievements): duplikat bila judulnya sama, tanpa peduli huruf besar dan tanda baca.
  // Daftar "ada" bertambah tiap item baru, jadi judul ganda di dalam PDF yang sama juga tertangkap.
  const seenAch = new Set(existing.achievements.map((a) => normKey(a.title)));
  for (const [i, a] of preview.achievements.entries()) {
    const key = `ach:${i}`;
    const date = formatMonthYear(a.achievement_date);
    const base = { key, title: a.title, detail: [ACHIEVEMENT_LABELS[a.category], a.issuer, date].filter(Boolean).join(" · "), notes: a.notes };
    const k = normKey(a.title);
    if (seenAch.has(k)) {
      plan.achievements.push({ ...base, status: "duplicate", reason: "Penghargaan atau publikasi dengan judul ini sudah ada.", row: null });
      continue;
    }
    const v = validateAchievement(a, now);
    if (!v.ok) {
      plan.achievements.push({ ...base, status: "invalid", reason: v.reason, row: null });
      continue;
    }
    seenAch.add(k);
    plan.achievements.push({ ...base, status: "new", reason: "", row: v.row });
  }

  // --- skill dan bahasa (user_skills). Daftar "ada" bertambah tiap item baru, jadi duplikat di PDF dan batas 50 ikut tertangkap.
  const knownSkills: Array<{ id?: string; name?: string }> = existing.skills.map((s) => ({ name: typeof s.name === "string" ? s.name : "" }));
  for (const [i, s] of preview.skills.entries()) {
    const key = `skill:${i}`;
    const category = SKILL_CATEGORIES.some((c) => c.value === s.category) ? s.category : "technical";
    const level = Number.isInteger(s.proficiency_level) && s.proficiency_level >= 1 && s.proficiency_level <= 5 ? s.proficiency_level : 3;
    const base = { key, title: s.name, detail: `${categoryLabel(category)} · ${levelLabel(level)}`, notes: [] as string[] };
    if (knownSkills.some((k) => skillKey(k.name) === skillKey(s.name))) {
      plan.skills.push({ ...base, status: "duplicate", reason: "Skill ini sudah ada di daftarmu.", row: null });
      continue;
    }
    const v = validateSkill({ name: s.name, category, proficiency_level: String(level), years_experience: "" }, { existing: knownSkills });
    if (!v.ok) {
      plan.skills.push({ ...base, status: "invalid", reason: firstError(v.errors), row: null });
      continue;
    }
    knownSkills.push({ name: v.row.name });
    plan.skills.push({ ...base, status: "new", reason: "", row: { ...v.row, source: IMPORTED_SKILL_SOURCE } });
  }

  return plan;
}

export const SECTION_KEYS = ["basic", "experiences", "education", "certifications", "achievements", "skills"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const allItems = (plan: ImportPlan): Array<ImportItem<unknown>> => SECTION_KEYS.flatMap((k) => plan[k] as Array<ImportItem<unknown>>);

/** Item baru dicentang bawaan; duplikat dan tidak valid tidak bisa dicentang. */
export function defaultSelection(plan: ImportPlan): Set<string> {
  return new Set(allItems(plan).filter((i) => i.status === "new").map((i) => i.key));
}

export const countSelected = (plan: ImportPlan, selected: ReadonlySet<string>): number =>
  allItems(plan).filter((i) => i.status === "new" && selected.has(i.key)).length;

/** Centang atau kosongkan semua item baru di satu seksi. */
export function setSectionSelection(plan: ImportPlan, section: SectionKey, selected: ReadonlySet<string>, on: boolean): Set<string> {
  const next = new Set(selected);
  for (const item of plan[section] as Array<ImportItem<unknown>>) {
    if (item.status !== "new") continue;
    if (on) next.add(item.key);
    else next.delete(item.key);
  }
  return next;
}

export function toggleItem(plan: ImportPlan, key: string, selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  const item = allItems(plan).find((i) => i.key === key);
  if (!item || item.status !== "new") return next;
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

// ---------------------------------------------------------------------------------------------
// Pilihan -> baris yang ditulis
// ---------------------------------------------------------------------------------------------

export interface ImportSelection {
  /** hanya kolom `profiles` yang masih kosong dan dicentang */
  profilePatch: Partial<Record<BasicField, string>>;
  experiences: ExperienceRow[];
  education: EducationRow[];
  certifications: CertificationRow[];
  achievements: AchievementRow[];
  skills: SkillRow[];
}

/** Ambil hanya item baru yang dicentang. Duplikat dan item tidak valid tidak pernah ikut, walau kuncinya ada di `selected`. */
export function selectionFromPlan(plan: ImportPlan, selected: ReadonlySet<string>): ImportSelection {
  const pick = <R>(items: Array<ImportItem<R>>): R[] =>
    items.filter((i) => i.status === "new" && i.row !== null && selected.has(i.key)).map((i) => i.row as R);
  const profilePatch: Partial<Record<BasicField, string>> = {};
  for (const p of pick(plan.basic)) profilePatch[p.field] = p.value;
  return {
    profilePatch,
    experiences: pick(plan.experiences),
    education: pick(plan.education),
    certifications: pick(plan.certifications),
    achievements: pick(plan.achievements),
    skills: pick(plan.skills),
  };
}

export const selectionSize = (s: ImportSelection): number =>
  Object.keys(s.profilePatch).length + s.experiences.length + s.education.length + s.certifications.length + s.achievements.length + s.skills.length;

/** Isi hanya kolom formulir profil yang masih kosong; yang sudah terisi (atau sedang diketik) dibiarkan. */
export function applyProfilePatch<T extends Record<string, any>>(prev: T, patch: Partial<Record<BasicField, string>>): T {
  const next: Record<string, any> = { ...prev };
  for (const [field, value] of Object.entries(patch)) {
    if (!String(next[field] ?? "").trim() && value) next[field] = value;
  }
  return next as T;
}

// ---------------------------------------------------------------------------------------------
// Penulisan
// ---------------------------------------------------------------------------------------------

/** Pintu tulis. Aslinya profileService + upsert profiles (lihat services/linkedinImportService.ts); di tes diganti tiruan. */
export interface ImportWriter {
  upsertProfile(patch: Partial<Record<BasicField, string>>): Promise<void>;
  createExperience(row: ExperienceRow): Promise<unknown>;
  createEducation(row: EducationRow): Promise<unknown>;
  createCertification(row: CertificationRow): Promise<unknown>;
  createAchievement(row: AchievementRow): Promise<unknown>;
  createSkill(row: SkillRow): Promise<unknown>;
}

export interface CommitFailure {
  section: "profil" | "pengalaman" | "pendidikan" | "sertifikasi" | "penghargaan" | "skill";
  label: string;
  message: string;
}

export interface CommitResult {
  /** kolom profil yang benar-benar tersimpan */
  profilePatch: Partial<Record<BasicField, string>>;
  added: { basic: number; experiences: number; education: number; certifications: number; achievements: number; skills: number };
  /** baris yang dikembalikan database, untuk mode demo atau pembaruan lokal */
  created: { experiences: unknown[]; education: unknown[]; certifications: unknown[]; achievements: unknown[]; skills: unknown[] };
  failed: CommitFailure[];
}

export const emptyCommit = (): CommitResult => ({
  profilePatch: {},
  added: { basic: 0, experiences: 0, education: 0, certifications: 0, achievements: 0, skills: 0 },
  created: { experiences: [], education: [], certifications: [], achievements: [], skills: [] },
  failed: [],
});

const messageOf = (e: unknown): string => (e instanceof Error && e.message ? e.message : typeof e === "string" && e ? e : "Gagal menyimpan.");

/** Jalankan `fn` untuk tiap item dengan paling banyak `limit` yang berjalan bersamaan. Hasil urut seperti `items`; galat tidak menghentikan item lain. */
export async function runLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const out: Array<{ ok: true; value: R } | { ok: false; error: unknown }> = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { ok: true, value: await fn(items[i]) };
      } catch (error) {
        out[i] = { ok: false, error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return out;
}

/**
 * Tulis pilihan pengguna. Profil dasar dulu (upsert, jadi pengguna tanpa baris `profiles` mendapat satu), lalu
 * pengalaman, pendidikan, sertifikasi, penghargaan dan publikasi, skill. Satu item yang gagal tidak menghentikan yang lain; yang gagal
 * dilaporkan. Impor ulang PDF yang sama aman: item yang sudah masuk terdeteksi sebagai "Sudah ada".
 */
export async function applyImport(sel: ImportSelection, writer: ImportWriter, concurrency = 4): Promise<CommitResult> {
  const result = emptyCommit();

  const patchKeys = Object.keys(sel.profilePatch);
  if (patchKeys.length > 0) {
    try {
      await writer.upsertProfile(sel.profilePatch);
      result.profilePatch = { ...sel.profilePatch };
      result.added.basic = patchKeys.length;
    } catch (e) {
      result.failed.push({ section: "profil", label: "Profil dasar", message: messageOf(e) });
    }
  }

  const run = async <Row>(
    rows: Row[],
    section: CommitFailure["section"],
    label: (r: Row) => string,
    create: (r: Row) => Promise<unknown>,
    bucket: unknown[],
  ): Promise<number> => {
    const outcomes = await runLimited(rows, concurrency, create);
    let ok = 0;
    outcomes.forEach((o, i) => {
      if (o.ok) {
        ok++;
        bucket.push(o.value);
      } else result.failed.push({ section, label: label(rows[i]), message: messageOf(o.error) });
    });
    return ok;
  };

  result.added.experiences = await run(sel.experiences, "pengalaman", (r) => `${r.role_title} di ${r.company_name}`, (r) => writer.createExperience(r), result.created.experiences);
  result.added.education = await run(sel.education, "pendidikan", (r) => `${r.degree} di ${r.institution}`, (r) => writer.createEducation(r), result.created.education);
  result.added.certifications = await run(sel.certifications, "sertifikasi", (r) => r.name, (r) => writer.createCertification(r), result.created.certifications);
  result.added.achievements = await run(sel.achievements, "penghargaan", (r) => r.title, (r) => writer.createAchievement(r), result.created.achievements);
  result.added.skills = await run(sel.skills, "skill", (r) => r.name, (r) => writer.createSkill(r), result.created.skills);
  return result;
}

export const addedTotal = (r: CommitResult): number => Object.values(r.added).reduce((a, b) => a + b, 0);

/** Ringkasan satu kalimat untuk toast sesudah menulis. */
export function summarizeCommit(r: CommitResult): { kind: "success" | "partial" | "failed"; message: string } {
  const parts: string[] = [];
  if (r.added.basic) parts.push(`${r.added.basic} data profil dasar`);
  if (r.added.experiences) parts.push(`${r.added.experiences} pengalaman`);
  if (r.added.education) parts.push(`${r.added.education} pendidikan`);
  if (r.added.certifications) parts.push(`${r.added.certifications} sertifikasi`);
  if (r.added.achievements) parts.push(`${r.added.achievements} penghargaan dan publikasi`);
  if (r.added.skills) parts.push(`${r.added.skills} skill`);
  const added = parts.join(", ");
  if (r.failed.length === 0) return { kind: "success", message: added ? `Ditambahkan ke profil: ${added}.` : "Tidak ada yang ditambahkan." };
  if (!added) return { kind: "failed", message: `Belum ada yang tersimpan. ${r.failed[0].message}` };
  return {
    kind: "partial",
    message: `Ditambahkan: ${added}. ${r.failed.length} item belum tersimpan. Impor PDF yang sama sekali lagi; item yang sudah masuk akan dilewati.`,
  };
}
