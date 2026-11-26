/**
 * Helper murni alur impor lowongan off-portal (tempel caption/link, unggah poster/screenshot,
 * pratinjau 1..N kandidat + kanal + anti-scam, simpan privat aman-migrasi, dan buka AIApplyModal).
 *
 * Tanpa impor React/Supabase agar dapat diuji langsung lewat `node --test`.
 */

import type { JobSafetyReport } from "./jobSafety.ts";

export type OffPortalSourceType = "off_portal_link" | "off_portal_poster" | "off_portal_caption";

export type OffPortalFormProvider = "google_forms" | "typeform" | "tally" | "airtable" | null;

export interface ParsedOffPortalJob {
  title: string;
  company: string;
  location: string;
  description: string;
  sourceType: OffPortalSourceType;
  sourceGroupId: string;
  publicationFingerprint: string;
  applyUrl: string | null;
  applyEmail: string | null;
  whatsappUrl: string | null;
  formProvider: OffPortalFormProvider;
  channel: {
    channel: "public_ats" | "email_direct" | "auth_portal" | "external_web";
    platform: string;
    applyUrl: string | null;
    applyEmail: string | null;
    autoWorkerSupported: boolean;
    emailApplySupported: boolean;
    extensionSupported: boolean;
    manualOnly: boolean;
    reason: string;
  };
  safety: JobSafetyReport;
}

export interface OffPortalParseResponse {
  sourceGroupId: string;
  sourceType: OffPortalSourceType;
  acceptedUrls: string[];
  rejectedUrls: string[];
  jobs: ParsedOffPortalJob[];
  ocr?: {
    ran: boolean;
    status: "ok" | "empty" | "unavailable" | "failed" | "skipped";
    textLength: number;
    truncated: boolean;
  };
  qr?: {
    decodedUrls: string[];
    method: "png_native" | "chromium_canvas" | "none";
  };
  warnings?: string[];
}

export interface SavedOffPortalJobRow {
  id: string;
  title: string;
  company: string;
  location: string;
  type: string;
  workplace_type: string | null;
  description: string;
  platform_source: string;
  external_url: string | null;
  status: string;
  posted_at: string | null;
  created_by: string;
  visibility: "private";
  source_type: OffPortalSourceType;
  source_group_id: string;
  publication_fingerprint: string;
  alreadySaved?: boolean;
}

export interface SaveOffPortalResponse {
  saved: boolean;
  migrationRequired: boolean;
  code?: string;
  message: string;
  insertedCount: number;
  duplicateCount: number;
  jobs: SavedOffPortalJobRow[];
}

export const POSTER_MAX_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_POSTER_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Deteksi jenis gambar poster dari magic bytes awal berkas (PNG, JPEG, WebP). */
export function detectPosterMagicBytes(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (!bytes || bytes.length < 12) return null;
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function validatePosterUpload(input: {
  size: number;
  headBytes: Uint8Array;
}): { ok: true; mimeType: "image/png" | "image/jpeg" | "image/webp" } | { ok: false; error: string } {
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, error: "Berkas gambar kosong. Pilih gambar poster PNG, JPG, atau WebP." };
  }
  if (input.size > POSTER_MAX_BYTES) {
    return { ok: false, error: "Ukuran gambar poster melebihi 5 MB. Kompres gambar lalu unggah lagi." };
  }
  const mime = detectPosterMagicBytes(input.headBytes);
  if (!mime) {
    return { ok: false, error: "Format berkas tidak dikenali sebagai gambar PNG, JPG, atau WebP yang sah." };
  }
  return { ok: true, mimeType: mime };
}

export interface OffPortalChannelBadge {
  label: string;
  tone: "ats" | "email" | "extension" | "manual";
  detail: string;
}

/** Label kanal yang mudah dipahami pelamar pada kartu pratinjau off-portal. */
export function describeOffPortalChannel(job: Pick<ParsedOffPortalJob, "formProvider" | "applyEmail" | "whatsappUrl" | "applyUrl" | "channel">): OffPortalChannelBadge {
  if (job.formProvider === "google_forms") {
    if (job.channel.autoWorkerSupported) {
      return {
        label: "Google Form · Agen",
        tone: "ats",
        detail: "Formulir Google Form publik; diisi agen server setelah disetujui dan beralih ke Ekstensi Browser bila perlu login, unggah berkas, atau jawaban tambahan.",
      };
    }
    return {
      label: job.channel.extensionSupported ? "Google Form · Ekstensi" : "Google Form",
      tone: job.channel.extensionSupported ? "extension" : "manual",
      detail: job.channel.extensionSupported
        ? "Formulir Google Form terdeteksi; dapat dibantu pengisian lewat Ekstensi Browser setelah disetujui."
        : "Formulir Google Form terdeteksi; kamu bisa menyiapkan draf jawaban & surat lalu membukanya langsung.",
    };
  }
  if (job.formProvider === "typeform" || job.formProvider === "tally" || job.formProvider === "airtable") {
    return {
      label: "Formulir Online",
      tone: "manual",
      detail: "Tautan formulir pendaftaran eksternal terdeteksi; siapkan draf di Applify lalu isi di situs formulir.",
    };
  }
  if (job.channel.channel === "public_ats") {
    return {
      label: "Formulir ATS · Agen",
      tone: "ats",
      detail: "Situs karier perusahaan yang didukung pengisian agen setelah kamu menyetujui draf.",
    };
  }
  if (job.applyEmail || job.channel.channel === "email_direct") {
    return {
      label: "Email HR (Gmail)",
      tone: "email",
      detail: job.applyEmail
        ? `Alamat email HR (${job.applyEmail}) terdeteksi; dapat dikirim lewat Gmail setelah disetujui.`
        : "Lamaran dikirim lewat Gmail setelah persetujuan.",
    };
  }
  if (job.whatsappUrl || job.channel.platform === "whatsapp") {
    return {
      label: "WhatsApp Manual",
      tone: "manual",
      detail: "Tautan WhatsApp terdeteksi; siapkan draf pesan di Applify lalu kirim manual langsung lewat WhatsApp.",
    };
  }
  if (job.channel.extensionSupported) {
    return {
      label: "Situs Web · Ekstensi",
      tone: "extension",
      detail: "Situs karier ini didukung Ekstensi Browser khusus laptop (Chrome atau Edge).",
    };
  }
  return {
    label: job.applyUrl ? "Situs Web · Manual" : "Manual",
    tone: "manual",
    detail: job.applyUrl
      ? "Situs karier eksternal; siapkan draf lamaran lalu kirim manual di situs perusahaannya."
      : "Belum ada tautan atau email lamaran terdeteksi; lengkapi teks atau tautan sebelum melamar.",
  };
}

/** Ubah baris lowongan privat hasil simpan server menjadi bentuk yang diterima JobCard & AIApplyModal. */
export function savedRowToJobData(row: SavedOffPortalJobRow) {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: row.location,
    type: row.type || "full-time",
    workplace_type: row.workplace_type ?? "",
    salary_currency: "IDR",
    salary_period: "month",
    description: row.description,
    requirements: [] as string[],
    responsibilities: [] as string[],
    benefits: [] as string[],
    platform_source: row.platform_source || row.source_type,
    external_url: row.external_url ?? undefined,
    match_score: 0,
    acceptance_potential: 0,
    company_culture_score: 0,
    growth_potential: 0,
    ai_strategy: "",
    ai_actions: [] as Array<{
      step: number;
      title: string;
      description: string;
      status: "pending" | "in-progress" | "done";
      estimated_time: string;
    }>,
    skill_gaps: [] as Array<{ skill: string; required_level: number; user_level: number; gap: number }>,
    skill_matches: [] as Array<{ skill: string; level: number; matched: boolean }>,
    salary_benchmark: { market_average: 0, market_high: 0, market_low: 0, percentile: 0 },
    status: row.status || "active",
    posted_at: row.posted_at ?? new Date().toISOString(),
    visibility: row.visibility,
  };
}
