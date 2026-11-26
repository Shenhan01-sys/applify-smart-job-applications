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
  /** Bidang yang tidak terbaca dari teks dan memakai nilai bawaan (server 26 Nov 2026). */
  unreadFields?: OffPortalUnreadField[];
  /** Peringatan khusus lowongan ini, mis. LinkedIn wajib dilamar manual. */
  warnings?: string[];
}

export type OffPortalUnreadField = "title" | "company" | "location";

export interface OffPortalSocialPost {
  url: string;
  platform: "instagram" | "x" | "facebook" | "threads" | "tiktok" | "linkedin_post";
  label: string;
}

export interface OffPortalParseResponse {
  sourceGroupId: string;
  sourceType: OffPortalSourceType;
  acceptedUrls: string[];
  rejectedUrls: string[];
  jobs: ParsedOffPortalJob[];
  /** Tautan postingan media sosial yang ditemukan. Hanya sumber, bukan tautan lamaran. */
  socialPosts?: OffPortalSocialPost[];
  /** true bila hanya ada tautan postingan sosial tanpa caption: pengguna harus menempel caption. */
  needsCaption?: boolean;
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

/** Sama dengan `SOCIAL_POST_PLATFORM_LABELS` di backend (services/apply-channel.ts). */
const SOCIAL_HOSTS: Array<{ domains: string[]; label: string }> = [
  { domains: ["instagram.com", "instagr.am"], label: "Instagram" },
  { domains: ["x.com", "twitter.com"], label: "X (Twitter)" },
  { domains: ["facebook.com", "fb.com", "fb.me", "fb.watch"], label: "Facebook" },
  { domains: ["threads.net", "threads.com"], label: "Threads" },
  { domains: ["tiktok.com"], label: "TikTok" },
];

function hostOf(raw: string | null | undefined): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "";
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hostMatches(host: string, domains: string[]): boolean {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

/**
 * Nama platform bila tautan adalah postingan atau profil media sosial (Instagram, X/Twitter, Facebook, Threads,
 * TikTok, postingan LinkedIn). Server tidak bisa membaca isinya karena butuh login, dan tautan ini bukan tautan lamaran.
 */
export function detectSocialPostUrl(raw: string | null | undefined): { label: string } | null {
  const host = hostOf(raw);
  if (!host) return null;
  for (const entry of SOCIAL_HOSTS) if (hostMatches(host, entry.domains)) return { label: entry.label };
  if (hostMatches(host, ["linkedin.com"])) {
    try {
      const text = String(raw).trim();
      const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
      if (/^\/(?:posts|feed\/update|pulse|embed\/feed)(?:\/|$)/i.test(u.pathname)) return { label: "LinkedIn" };
    } catch {
      return null;
    }
  }
  return null;
}

export function isLinkedInLink(raw: string | null | undefined): boolean {
  return hostMatches(hostOf(raw), ["linkedin.com"]);
}

export const OFF_PORTAL_SOCIAL_CAPTION_HINT = (label: string) =>
  `Tautan ${label} tidak bisa dibaca otomatis karena ${label} meminta login. Buka postingannya, salin caption lengkapnya, lalu tempel di kolom caption di bawah. Tautan postingan hanya jadi sumber, bukan tautan lamaran.`;

const UNREAD_FIELD_LABELS: Record<OffPortalUnreadField, string> = {
  title: "posisi",
  company: "perusahaan",
  location: "lokasi",
};

/** Kalimat untuk bidang yang memakai nilai bawaan karena tidak terbaca dari teks. Kosong bila semuanya terbaca. */
export function describeUnreadFields(fields: readonly OffPortalUnreadField[] | undefined): string {
  const list = (fields ?? []).map((f) => UNREAD_FIELD_LABELS[f]).filter(Boolean);
  if (list.length === 0) return "";
  const joined = list.length > 1 ? `${list.slice(0, -1).join(", ")} dan ${list[list.length - 1]}` : list[0];
  return `Belum terbaca dari teks: ${joined}. Isinya memakai nilai bawaan. Periksa captionnya, atau tambahkan baris seperti "Posisi: ...", "Perusahaan: ...", dan "Lokasi: ..." lalu analisis lagi.`;
}

/** Label kanal yang mudah dipahami pelamar pada kartu pratinjau off-portal. */
export function describeOffPortalChannel(job: Pick<ParsedOffPortalJob, "formProvider" | "applyEmail" | "whatsappUrl" | "applyUrl" | "channel">): OffPortalChannelBadge {
  if (isLinkedInLink(job.applyUrl)) {
    return {
      label: "LinkedIn · Lamar Manual",
      tone: "manual",
      detail: "Lowongan LinkedIn wajib dilamar manual di LinkedIn. Applify tidak mengisi atau mengirim lamaran di sana.",
    };
  }
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
