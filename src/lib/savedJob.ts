/**
 * Baris `saved_jobs` untuk tombol simpan (bookmark) di halaman Lowongan.
 *
 * Tabel `saved_jobs` di production tidak hanya menyimpan pasangan (user_id, job_id). Tiga kolomnya NOT NULL
 * tanpa nilai bawaan (company_name, role_title, platform), dan kolom job_type punya CHECK yang hanya menerima
 * 'Full-time', 'Part-time', 'Contract', atau 'Internship' (huruf besar di awal). Insert yang hanya berisi
 * user_id dan job_id ditolak database, dan nilai jobs.type seperti "full-time" atau "freelance" juga akan
 * ditolak. Berkas ini mengisi kolom-kolom itu dari baris lowongan yang sudah ada di kartu.
 *
 * Kolom is_blind, is_golden_window, notes, dan saved_at sengaja tidak dikirim: nilai bawaan database yang
 * berlaku. Kolom `requirements` bertipe text[], jadi hanya string yang diteruskan.
 *
 * TypeScript murni, supaya jalan di bawah `node --test`.
 */

import { platformLabel } from "./platforms.ts";
import { salaryText } from "./jobDetail.ts";

/** Pengganti untuk kolom NOT NULL bila lowongan memang tidak membawa nilainya. */
export const SAVED_JOB_UNKNOWN = "Tidak diketahui";

/** Bagian baris lowongan yang dibaca; cocok dengan JobData dan dengan baris mentah dari tabel `jobs`. */
export interface SavedJobSource {
  id?: unknown;
  title?: unknown;
  company?: unknown;
  platform_source?: unknown;
  external_url?: unknown;
  location?: unknown;
  type?: unknown;
  requirements?: unknown;
  salary_min?: unknown;
  salary_max?: unknown;
  salary_currency?: unknown;
  salary_period?: unknown;
}

export interface SavedJobRow {
  user_id: string;
  job_id: string;
  company_name: string;
  role_title: string;
  platform: string;
  job_url: string | null;
  salary_range: string | null;
  location: string | null;
  job_type: string | null;
  requirements: string[] | null;
}

/** Nilai job_type yang diterima CHECK `saved_jobs_job_type_check`, dengan kunci jobs.type huruf kecil. */
const JOB_TYPE_CHECK: Record<string, string> = {
  "full-time": "Full-time",
  "part-time": "Part-time",
  contract: "Contract",
  internship: "Internship",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Teks tidak kosong atau pengganti. Dipakai untuk kolom NOT NULL, supaya tidak pernah null atau kosong. */
function required(value: unknown): string {
  return text(value) || SAVED_JOB_UNKNOWN;
}

/** Teks tidak kosong atau null. Dipakai untuk kolom yang boleh kosong. */
function optional(value: unknown): string | null {
  return text(value) || null;
}

/**
 * Nilai job_type yang lolos CHECK, atau null bila tipe lowongan di luar empat nilai itu (misalnya "freelance"),
 * karena kolomnya boleh kosong dan lebih baik kosong daripada membuat seluruh simpanan ditolak.
 */
export function savedJobType(type: unknown): string | null {
  const key = text(type).toLowerCase().replace(/[\s_]+/g, "-");
  return JOB_TYPE_CHECK[key] ?? null;
}

/** Nama sumber untuk kolom platform: label tampilan (JobStreet), atau pengganti bila sumbernya tidak ada. */
export function savedJobPlatform(source: unknown): string {
  const raw = text(source);
  return raw ? platformLabel(raw) : SAVED_JOB_UNKNOWN;
}

/** Baris yang dimasukkan ke `saved_jobs` saat pengguna menyimpan lowongan. */
export function buildSavedJobRow(userId: string, job: SavedJobSource, jobId: string = String(job.id ?? "")): SavedJobRow {
  const requirements = Array.isArray(job.requirements)
    ? job.requirements.filter((r): r is string => typeof r === "string" && r.trim() !== "").map((r) => r.trim())
    : [];
  return {
    user_id: userId,
    job_id: jobId,
    company_name: required(job.company),
    role_title: required(job.title),
    platform: savedJobPlatform(job.platform_source),
    job_url: optional(job.external_url),
    salary_range: salaryText(job),
    location: optional(job.location),
    job_type: savedJobType(job.type),
    requirements: requirements.length > 0 ? requirements : null,
  };
}
