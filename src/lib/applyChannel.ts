/**
 * Klasifikasi kanal lamaran murni untuk antarmuka pengguna Applify (`public_ats` | `email_direct` | `auth_portal` | `external_web`).
 *
 * Aturan konsisten dengan `backend/services/apply-channel.ts` dan kebijakan keamanan:
 *   - LinkedIn selalu `manualOnly: true` (baik worker maupun ekstensi dinonaktifkan di domain LinkedIn).
 *   - Tanpa impor React/Supabase agar bisa diuji langsung oleh `node --test`.
 */
export type ApplyChannel = "public_ats" | "email_direct" | "auth_portal" | "external_web";

export interface JobChannelInput {
  id?: string | null;
  platform?: string | null;
  platform_source?: string | null;
  external_url?: string | null;
  url?: string | null;
  apply_url?: string | null;
  apply_email?: string | null;
  resolved_apply_url?: string | null;
  apply_channel?: string | null;
  description?: string | null;
}

export interface ChannelClassification {
  channel: ApplyChannel;
  platform: string;
  applyUrl: string | null;
  resolvedApplyUrl: string | null;
  applyEmail: string | null;
  autoWorkerSupported: boolean;
  emailApplySupported: boolean;
  extensionSupported: boolean;
  manualOnly: boolean;
  /** E2E-07: True untuk ATS korporasi kompleks (Workday/iCIMS/Taleo/SuccessFactors) yang bersifat eksperimental di ekstensi. */
  experimentalExtension?: boolean;
  badgeLabel: string;
  badgeTone: "ats" | "email" | "extension" | "manual";
  reason: string;
}

import {
  EXTENSION_LOGIN_PORTAL_DOMAINS,
  KNOWN_ATS_DOMAINS,
  OTHER_AUTH_PORTAL_DOMAINS,
  PUBLIC_ATS_DOMAINS,
} from "./domainManifest.generated.ts";

/** Host yang benar-benar diizinkan di manifest Ekstensi Browser (selaras backend/services/apply-channel.ts, J5-02). */
export const EXTENSION_HOST_DOMAINS: readonly string[] = [...EXTENSION_LOGIN_PORTAL_DOMAINS, ...KNOWN_ATS_DOMAINS];

/**
 * E2E-07: ATS korporasi multi-langkah / Shadow DOM tertutup yang tumpang tindih antara daftar ATS dikenal
 * dan portal autentikasi di shared/domains.json. Tetap didukung ekstensi, namun diberi label eksperimental
 * dan saran melamar manual bila formulir gagal diisi penuh.
 */
export const CORPORATE_COMPLEX_ATS_DOMAINS = [
  "myworkdayjobs.com",
  "workday.com",
  "icims.com",
  "taleo.net",
  "successfactors.com",
  "successfactors.eu",
] as const;

export function isCorporateComplexAtsHost(hostname: string): boolean {
  return Boolean(hostname) && hostMatchesDomain(hostname, CORPORATE_COMPLEX_ATS_DOMAINS);
}

const AUTH_PORTAL_DOMAINS = [
  "linkedin.com",
  ...EXTENSION_LOGIN_PORTAL_DOMAINS,
  ...OTHER_AUTH_PORTAL_DOMAINS,
] as const;

const AUTH_PORTAL_PLATFORMS = new Set([
  "linkedin",
  "jobstreet",
  "kalibrr",
  "glints",
  "karir",
  "dealls",
  "techinasia",
  "workday",
  "indeed",
  "glassdoor",
]);

const PUBLIC_ATS_PLATFORMS = new Set([
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "smartrecruiters",
  "recruitee",
  "breezy",
  "bamboohr",
]);

const IGNORED_EMAIL_LOCAL = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "notification",
  "notifications",
  "support",
  "privacy",
  "security",
  "abuse",
]);

const IGNORED_EMAIL_DOMAINS = [
  "example.com",
  "example.org",
  "example.net",
  "sentry.io",
  "wixpress.com",
  "w3.org",
  "schema.org",
];

const SIMPLE_EMAIL_RE =
  /^(?=.{1,254}$)(?=[^@]{1,64}@)[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

function hostMatchesDomain(hostname: string, domains: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (!host) return false;
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export function sanitizeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Portal Uji Applify: halaman lamaran tiruan milik Applify untuk uji coba, tidak diteruskan ke perusahaan mana pun. */
const TEST_PORTAL_HOST = "applify-smart-job-applications.vercel.app";
const TEST_PORTAL_PATH = "/uji-portal";

/** True untuk alamat Portal Uji Applify. Diisi agen (worker), bukan Ekstensi Browser. */
export function isTestPortalUrl(rawUrl: unknown): boolean {
  const safe = sanitizeHttpUrl(rawUrl);
  if (!safe) return false;
  const u = new URL(safe);
  return u.hostname.toLowerCase() === TEST_PORTAL_HOST && (u.pathname === TEST_PORTAL_PATH || u.pathname.startsWith(`${TEST_PORTAL_PATH}/`));
}

export function isLinkedInUrl(rawUrl: unknown): boolean {
  const safe = sanitizeHttpUrl(rawUrl);
  if (!safe) return false;
  return hostMatchesDomain(new URL(safe).hostname, ["linkedin.com"]);
}

export function isPublicAtsUrl(rawUrl: unknown): boolean {
  const safe = sanitizeHttpUrl(rawUrl);
  if (!safe) return false;
  return hostMatchesDomain(new URL(safe).hostname, PUBLIC_ATS_DOMAINS);
}

/** URL lamaran http(s) yang hostnya terdaftar pada daftar host Ekstensi Browser (LinkedIn tidak pernah masuk). */
export function isExtensionUrl(rawUrl: unknown): boolean {
  const safe = sanitizeHttpUrl(rawUrl);
  if (!safe) return false;
  return hostMatchesDomain(new URL(safe).hostname, EXTENSION_HOST_DOMAINS);
}

const WHATSAPP_HOSTS = ["wa.me", "api.whatsapp.com", "chat.whatsapp.com"] as const;

export function isWhatsAppUrl(rawUrl: unknown): boolean {
  const safe = sanitizeHttpUrl(rawUrl);
  if (!safe) return false;
  return hostMatchesDomain(new URL(safe).hostname, WHATSAPP_HOSTS);
}

export function isGoogleFormUrl(rawUrl: unknown): boolean {
  const safe = sanitizeHttpUrl(rawUrl);
  if (!safe) return false;
  const u = new URL(safe);
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  return host === "forms.gle" || (host === "docs.google.com" && /^\/(?:u\/\d+\/)?forms\//i.test(u.pathname));
}

export function extractPublicAtsUrl(description: string): string | null {
  if (!description) return null;
  const matches = description.match(/https?:\/\/[^\s<>"'\])}`]+/gi) ?? [];
  for (const m of matches) {
    const cleaned = m.replace(/[.,;:!?)]+$/, "");
    if (isPublicAtsUrl(cleaned)) return sanitizeHttpUrl(cleaned);
  }
  return null;
}

export function extractApplyEmail(description: string): string | null {
  if (!description) return null;
  const matches = description.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}/g) ?? [];
  for (const raw of matches) {
    const candidate = raw.trim().replace(/[.,;:!?)]+$/, "");
    if (!SIMPLE_EMAIL_RE.test(candidate)) continue;
    const [local, domain] = candidate.toLowerCase().split("@");
    if (IGNORED_EMAIL_LOCAL.has(local)) continue;
    if (IGNORED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) continue;
    return candidate;
  }
  return null;
}

/** True bila lowongan ini hanya bisa diisi lewat Ekstensi Browser (portal login: JobStreet, Glints, Kalibrr, Dealls, dan sejenisnya). */
export function needsBrowserExtension(c: Pick<ChannelClassification, "channel" | "extensionSupported" | "manualOnly">): boolean {
  return c.channel === "auth_portal" && c.extensionSupported && !c.manualOnly;
}

export function classifyJobChannel(job: JobChannelInput): ChannelClassification {
  const platform = String(job.platform ?? job.platform_source ?? "")
    .trim()
    .toLowerCase();
  const description = String(job.description ?? "");
  const primaryUrl =
    sanitizeHttpUrl(job.external_url) ?? sanitizeHttpUrl(job.url) ?? sanitizeHttpUrl(job.apply_url);
  const storedAts = isPublicAtsUrl(job.resolved_apply_url) ? sanitizeHttpUrl(job.resolved_apply_url) : null;
  const resolvedAtsUrl = isPublicAtsUrl(primaryUrl) ? primaryUrl : storedAts ?? extractPublicAtsUrl(description);
  const applyEmail =
    typeof job.apply_email === "string" && SIMPLE_EMAIL_RE.test(job.apply_email)
      ? job.apply_email
      : extractApplyEmail(description);

  if (isLinkedInUrl(primaryUrl) || (platform === "linkedin" && !primaryUrl)) {
    return {
      channel: "auth_portal",
      platform: platform || "linkedin",
      applyUrl: primaryUrl,
      resolvedApplyUrl: resolvedAtsUrl,
      applyEmail,
      autoWorkerSupported: false,
      emailApplySupported: false,
      extensionSupported: false,
      manualOnly: true,
      badgeLabel: "LinkedIn Manual",
      badgeTone: "manual",
      reason: "Lowongan LinkedIn wajib dilamar manual demi keamanan akun (agen dan ekstensi dinonaktifkan di LinkedIn).",
    };
  }

  // Portal Uji Applify diproses agen (worker), bukan ekstensi: jangan menawarkan Ekstensi Browser untuknya.
  if (isTestPortalUrl(primaryUrl)) {
    return {
      channel: "external_web",
      platform: platform || "portal-uji",
      applyUrl: primaryUrl,
      resolvedApplyUrl: null,
      applyEmail: null,
      autoWorkerSupported: true,
      emailApplySupported: false,
      extensionSupported: false,
      manualOnly: false,
      badgeLabel: "Portal Uji Applify",
      badgeTone: "ats",
      reason: "Formulir uji milik Applify. Agen Applify yang mengisinya, tanpa Ekstensi Browser. Lamaran ini tidak diteruskan ke perusahaan mana pun.",
    };
  }

  // Samakan dengan backend/services/apply-channel.ts: platform ATS pada URL portal login tetap masuk kanal portal ekstensi.
  const primaryHost = primaryUrl ? new URL(primaryUrl).hostname : "";
  const primaryOnLoginPortal = Boolean(primaryHost) && hostMatchesDomain(primaryHost, EXTENSION_LOGIN_PORTAL_DOMAINS);

  if (resolvedAtsUrl || (platform && PUBLIC_ATS_PLATFORMS.has(platform) && primaryUrl && !primaryOnLoginPortal)) {
    const targetUrl = resolvedAtsUrl ?? primaryUrl;
    return {
      channel: "public_ats",
      platform: platform || "ats",
      applyUrl: targetUrl,
      resolvedApplyUrl: resolvedAtsUrl,
      applyEmail,
      autoWorkerSupported: Boolean(targetUrl),
      emailApplySupported: Boolean(applyEmail),
      extensionSupported: isExtensionUrl(targetUrl),
      manualOnly: false,
      badgeLabel: "Formulir ATS · Agen",
      badgeTone: "ats",
      reason: "Situs karier perusahaan yang diizinkan. Agen server mengisi dan mengirimnya setelah kamu menekan Setujui.",
    };
  }

  if (applyEmail) {
    return {
      channel: "email_direct",
      platform: platform || "email",
      applyUrl: primaryUrl,
      resolvedApplyUrl: null,
      applyEmail,
      autoWorkerSupported: false,
      emailApplySupported: true,
      extensionSupported: isExtensionUrl(primaryUrl),
      manualOnly: false,
      badgeLabel: "Email Gmail",
      badgeTone: "email",
      reason: `Alamat rekruter (${applyEmail}) tersedia. Lamaran dapat dikirim lewat Gmail kamu setelah kamu menekan Setujui.`,
    };
  }

  const isPortal =
    (primaryHost && hostMatchesDomain(primaryHost, AUTH_PORTAL_DOMAINS)) ||
    (platform ? AUTH_PORTAL_PLATFORMS.has(platform) : false);

  if (isPortal) {
    const viaExtension = isExtensionUrl(primaryUrl);
    const experimentalExtension = viaExtension && isCorporateComplexAtsHost(primaryHost);
    return {
      channel: "auth_portal",
      platform: platform || primaryHost || "portal",
      applyUrl: primaryUrl,
      resolvedApplyUrl: null,
      applyEmail: null,
      autoWorkerSupported: false,
      emailApplySupported: false,
      extensionSupported: viaExtension,
      manualOnly: false,
      ...(experimentalExtension ? { experimentalExtension: true } : {}),
      badgeLabel: experimentalExtension
        ? "Portal · Ekstensi (Eksperimental)"
        : viaExtension
          ? "Portal · Butuh Ekstensi"
          : "Portal · Manual",
      badgeTone: viaExtension ? "extension" : "manual",
      reason: experimentalExtension
        ? "Portal ATS korporasi kompleks ini bersifat eksperimental untuk Ekstensi Browser (sering memiliki banyak langkah atau Shadow DOM tertutup). Bila isian kurang lengkap, disarankan melamar manual di situs perusahaannya."
        : viaExtension
          ? "Portal ini butuh masuk akun pelamar, jadi diisi Ekstensi Browser khusus laptop (Chrome atau Edge) dan tidak bisa dipasang di HP. Ekstensi berhenti sebelum kirim sehingga kamu yang menekan Kirim Sekarang di panel ekstensi. Bila tanpa ekstensi atau memakai HP, pilih lowongan dari situs karier perusahaan."
          : "Portal ini butuh masuk akun pelamar dan belum didukung Ekstensi Browser Applify, jadi silakan lamar manual di situsnya.",
    };
  }

  if (isWhatsAppUrl(primaryUrl)) {
    return {
      channel: "external_web",
      platform: "whatsapp",
      applyUrl: primaryUrl,
      resolvedApplyUrl: null,
      applyEmail: null,
      autoWorkerSupported: false,
      emailApplySupported: false,
      extensionSupported: false,
      manualOnly: true,
      badgeLabel: "WhatsApp Manual",
      badgeTone: "manual",
      reason: "Lamaran lewat WhatsApp dikirim manual langsung oleh kamu setelah menyiapkan draf di Applify.",
    };
  }

  const externalViaExtension = isExtensionUrl(primaryUrl);
  if (isGoogleFormUrl(primaryUrl)) {
    return {
      channel: "external_web",
      platform: "google_forms",
      applyUrl: primaryUrl,
      resolvedApplyUrl: null,
      applyEmail: null,
      autoWorkerSupported: true,
      emailApplySupported: false,
      extensionSupported: true,
      manualOnly: false,
      badgeLabel: "Google Form · Agen",
      badgeTone: "ats",
      reason:
        "Formulir Google Form publik. Agen server mengisinya setelah kamu menekan Setujui, lalu beralih ke Ekstensi Browser bila formulir meminta login Google, unggah berkas, CAPTCHA, atau pertanyaan wajib tambahan.",
    };
  }

  const externalExperimental = externalViaExtension && isCorporateComplexAtsHost(primaryHost);
  return {
    channel: "external_web",
    platform: platform || primaryHost || "web",
    applyUrl: primaryUrl,
    resolvedApplyUrl: null,
    applyEmail: null,
    autoWorkerSupported: false,
    emailApplySupported: false,
    extensionSupported: externalViaExtension,
    manualOnly: false,
    ...(externalExperimental ? { experimentalExtension: true } : {}),
    badgeLabel: externalExperimental
      ? "Situs Web · Ekstensi (Eksperimental)"
      : externalViaExtension
        ? "Situs Web · Ekstensi"
        : "Situs Web · Manual",
    badgeTone: externalViaExtension ? "extension" : "manual",
    reason: !primaryUrl
      ? "Belum ada tautan lamaran eksternal pada lowongan ini."
      : externalExperimental
        ? "ATS korporasi kompleks ini bersifat eksperimental untuk Ekstensi Browser. Disarankan melamar manual di situs perusahaan bila formulir multi-langkah gagal terisi penuh."
        : externalViaExtension
          ? "Situs karier eksternal yang didukung Ekstensi Browser khusus laptop (Chrome atau Edge) dan tidak bisa dipasang di HP untuk pengisian terpandu."
          : "Situs karier eksternal ini belum didukung Ekstensi Browser Applify, jadi silakan lamar manual langsung di situs perusahaannya.",
  };
}
