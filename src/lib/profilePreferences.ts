/**
 * Preferensi kerja di langkah 4 halaman Profil. Disimpan ke kolom user_automation_settings yang memang ada
 * (database/schema.sql): desired_salary, current_ctc, notice_period, search_location, job_type_filter,
 * work_type_filter. Penyimpanan lewat PUT /api/automation/settings, sama dengan halaman Pengaturan Agen.
 *
 * work_type_filter dipakai backend untuk menyaring hasil pencarian (nilai 'remote' | 'hybrid' | 'on-site',
 * sama dengan jobs.workplace_type). Karena itu tidak ada pilihan bawaan: kosong berarti tidak menyaring.
 *
 * Tanpa impor, supaya bisa dites dengan `node --test`.
 */

export const JOB_TYPE_OPTIONS = [
  { value: "full-time", label: "Penuh waktu" },
  { value: "part-time", label: "Paruh waktu" },
  { value: "contract", label: "Kontrak" },
  { value: "internship", label: "Magang" },
] as const;

export const WORK_TYPE_OPTIONS = [
  { value: "remote", label: "Remote (dari rumah)" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on-site", label: "Di kantor" },
] as const;

export interface PreferencesForm {
  /** 0 = belum diisi */
  desired_salary: number;
  current_ctc: number;
  /** hari; 0 = belum diisi */
  notice_period: number;
  job_types: string[];
  work_types: string[];
  search_location: string;
}

export const EMPTY_PREFERENCES: PreferencesForm = {
  desired_salary: 0,
  current_ctc: 0,
  notice_period: 0,
  job_types: [],
  work_types: [],
  search_location: "",
};

const MAX_MONEY = 10_000_000_000;
const MAX_NOTICE_DAYS = 365;

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

const list = (v: unknown, allowed: readonly string[]): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && allowed.includes(x)) : [];

/** Baca baris user_automation_settings (atau objek kosong bila belum ada) menjadi isian form. */
export function preferencesFromSettings(s: Record<string, unknown> | null | undefined): PreferencesForm {
  const o = s ?? {};
  return {
    desired_salary: num(o.desired_salary),
    current_ctc: num(o.current_ctc),
    notice_period: num(o.notice_period),
    job_types: list(o.job_type_filter, JOB_TYPE_OPTIONS.map((x) => x.value)),
    work_types: list(o.work_type_filter, WORK_TYPE_OPTIONS.map((x) => x.value)),
    search_location: typeof o.search_location === "string" ? o.search_location : "",
  };
}

export type PreferencesErrors = Partial<Record<"desired_salary" | "current_ctc" | "notice_period" | "search_location", string>>;

export function validatePreferences(p: PreferencesForm): PreferencesErrors {
  const errors: PreferencesErrors = {};
  if (p.desired_salary < 0 || p.desired_salary > MAX_MONEY) errors.desired_salary = "Gaji harapan tidak masuk akal. Isi angka rupiah, atau kosongkan.";
  if (p.current_ctc < 0 || p.current_ctc > MAX_MONEY) errors.current_ctc = "Gaji saat ini tidak masuk akal. Isi angka rupiah, atau kosongkan.";
  if (p.notice_period < 0 || p.notice_period > MAX_NOTICE_DAYS) errors.notice_period = `Masa pemberitahuan maksimal ${MAX_NOTICE_DAYS} hari.`;
  if (p.search_location.trim().length > 120) errors.search_location = "Lokasi maksimal 120 karakter.";
  return errors;
}

/**
 * Bagian user_automation_settings yang ditulis langkah 4. Nilai kosong menjadi null supaya mengosongkan isian
 * benar-benar menghapus nilai lama (bukan diam-diam menyimpan 0 yang dibaca formulir sebagai "gaji 0").
 */
export function preferencesToSettings(p: PreferencesForm): {
  desired_salary: number | null;
  current_ctc: number | null;
  notice_period: number | null;
  search_location: string | null;
  job_type_filter: string[];
  work_type_filter: string[];
} {
  const loc = p.search_location.trim();
  return {
    desired_salary: p.desired_salary > 0 ? Math.round(p.desired_salary) : null,
    current_ctc: p.current_ctc > 0 ? Math.round(p.current_ctc) : null,
    notice_period: p.notice_period > 0 ? Math.round(p.notice_period) : null,
    search_location: loc || null,
    job_type_filter: list(p.job_types, JOB_TYPE_OPTIONS.map((x) => x.value)),
    work_type_filter: list(p.work_types, WORK_TYPE_OPTIONS.map((x) => x.value)),
  };
}

export const toggleInList = (items: string[], value: string): string[] =>
  items.includes(value) ? items.filter((x) => x !== value) : [...items, value];
