import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OFF_PORTAL_SOCIAL_CAPTION_HINT,
  POSTER_MAX_BYTES,
  describeOffPortalChannel,
  describeUnreadFields,
  detectPosterMagicBytes,
  detectSocialPostUrl,
  isLinkedInLink,
  savedRowToJobData,
  validatePosterUpload,
} from "../src/lib/offPortal.ts";
import { classifyJobChannel } from "../src/lib/applyChannel.ts";
import { isOffPortalSource, isVisibleJob } from "../src/lib/jobFilters.ts";
import { ApiError, describeApiError } from "../src/lib/apiErrors.ts";
import { platformLabel } from "../src/lib/platforms.ts";

test("Gelombang 3 offPortal: validasi magic bytes PNG/JPG/WebP dan batas 5 MB", () => {
  const pngHead = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpgHead = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webpHead = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const pdfHead = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0]);

  assert.equal(detectPosterMagicBytes(pngHead), "image/png");
  assert.equal(detectPosterMagicBytes(jpgHead), "image/jpeg");
  assert.equal(detectPosterMagicBytes(webpHead), "image/webp");
  assert.equal(detectPosterMagicBytes(pdfHead), null);

  assert.equal(validatePosterUpload({ size: 1024, headBytes: pngHead }).ok, true);
  assert.equal(validatePosterUpload({ size: 0, headBytes: pngHead }).ok, false);
  assert.equal(validatePosterUpload({ size: POSTER_MAX_BYTES + 1, headBytes: pngHead }).ok, false);
  assert.equal(validatePosterUpload({ size: 1024, headBytes: pdfHead }).ok, false);
});

test("Gelombang 3 offPortal: label kanal Google Form, WhatsApp Manual, Email HR, dan Situs Web konsisten", () => {
  const gf = describeOffPortalChannel({
    formProvider: "google_forms",
    applyUrl: "https://forms.gle/abc",
    applyEmail: null,
    whatsappUrl: null,
    channel: {
      channel: "external_web",
      platform: "off_portal_poster",
      applyUrl: "https://forms.gle/abc",
      applyEmail: null,
      autoWorkerSupported: false,
      emailApplySupported: false,
      extensionSupported: false,
      manualOnly: false,
      reason: "",
    },
  });
  assert.equal(gf.label, "Google Form");

  const wa = describeOffPortalChannel({
    formProvider: null,
    applyUrl: "https://wa.me/6281234567890",
    applyEmail: null,
    whatsappUrl: "https://wa.me/6281234567890",
    channel: {
      channel: "external_web",
      platform: "whatsapp",
      applyUrl: "https://wa.me/6281234567890",
      applyEmail: null,
      autoWorkerSupported: false,
      emailApplySupported: false,
      extensionSupported: false,
      manualOnly: true,
      reason: "",
    },
  });
  assert.equal(wa.label, "WhatsApp Manual");

  const waClass = classifyJobChannel({ platform_source: "off_portal_poster", external_url: "https://wa.me/6281234567890" });
  assert.equal(waClass.manualOnly, true);
  assert.equal(waClass.badgeLabel, "WhatsApp Manual");

  const gfClass = classifyJobChannel({ platform_source: "off_portal_poster", external_url: "https://forms.gle/abc123" });
  assert.match(gfClass.badgeLabel, /Google Form/);

  assert.equal(platformLabel("off_portal_poster"), "Poster Pribadi");
  assert.equal(platformLabel("off_portal_caption"), "Caption Pribadi");
  assert.equal(platformLabel("off_portal_link"), "Tautan Pribadi");
});

test("Gelombang 3 visibilitas & apiErrors: lowongan off-portal berbasis email tampil di /jobs dan kode migrasi terpetakan", () => {
  assert.equal(isOffPortalSource("off_portal_poster"), true);
  assert.equal(isOffPortalSource("jobstreet"), false);
  // Off-portal email-only (tanpa external_url) tetap tampil di /jobs
  assert.equal(
    isVisibleJob({
      status: "active",
      platform_source: "off_portal_poster",
      external_url: null,
      description: "Kirim CV ke hr@nusantara.id",
    }),
    true,
  );
  // Portal biasa tanpa external_url tetap dibuang
  assert.equal(
    isVisibleJob({
      status: "active",
      platform_source: "jobstreet",
      external_url: null,
      description: "Kirim CV ke hr@nusantara.id",
    }),
    false,
  );

  const migMsg = describeApiError(new ApiError(503, JSON.stringify({ code: "private_jobs_migration_required" })));
  assert.match(migMsg, /migrasi belum dijalankan/i);
  const limitMsg = describeApiError(new ApiError(409, JSON.stringify({ code: "private_jobs_limit_reached" })));
  assert.match(limitMsg, /maksimal 200/i);
  const ocrLimitMsg = describeApiError(new ApiError(429, JSON.stringify({ code: "rate_limited", retryAfterSec: 30 })));
  assert.match(ocrLimitMsg, /Terlalu banyak permintaan/i);

  const jobData = savedRowToJobData({
    id: "priv-1",
    title: "UI Designer",
    company: "PT Karya",
    location: "Bandung",
    type: "full-time",
    workplace_type: "hybrid",
    description: "Kirim CV ke hr@karya.id",
    platform_source: "off_portal_poster",
    external_url: null,
    status: "active",
    posted_at: "2026-11-26T00:00:00Z",
    created_by: "u1",
    visibility: "private",
    source_type: "off_portal_poster",
    source_group_id: "g1",
    publication_fingerprint: "a".repeat(64),
  });
  assert.equal(jobData.id, "priv-1");
  assert.equal(jobData.visibility, "private");
});

test("Gelombang 3 wiring: halaman Lowongan memasang tombol & OffPortalImportModal memakai Radix Dialog dan alur buat draf", () => {
  const jobsSrc = readFileSync(new URL("../src/routes/jobs.tsx", import.meta.url), "utf8");
  assert.match(jobsSrc, /OffPortalImportModal/);
  assert.match(jobsSrc, /Impor Poster \/ Link Off-Portal/);
  assert.match(jobsSrc, /onApplySavedJob=\{handleApply\}/);

  const modalSrc = readFileSync(new URL("../src/components/OffPortalImportModal.tsx", import.meta.url), "utf8");
  assert.match(modalSrc, /from "@\/components\/ui\/dialog"/);
  assert.match(modalSrc, /automationApi\.parseOffPortal/);
  assert.match(modalSrc, /automationApi\.saveOffPortalJobs/);
  assert.match(modalSrc, /migrationRequired/);
  assert.match(modalSrc, /Buat Draf &amp; Persetujuan/);
});

test("E2E 26 Nov offPortal: link postingan Instagram, X, Facebook, dan LinkedIn posts dikenali sebagai sumber, bukan tautan lamaran", () => {
  assert.equal(detectSocialPostUrl("https://www.instagram.com/p/DgH95gJmZos/")?.label, "Instagram");
  assert.equal(detectSocialPostUrl("https://x.com/Nikitont/status/2125539436477792758?a=eAWn3mU7OqAnqPf0rXo&s=19")?.label, "X (Twitter)");
  assert.equal(detectSocialPostUrl("https://twitter.com/a/status/1")?.label, "X (Twitter)");
  assert.equal(detectSocialPostUrl("https://m.facebook.com/groups/1/posts/2")?.label, "Facebook");
  assert.equal(detectSocialPostUrl("https://www.linkedin.com/posts/acme_hiring-activity-1")?.label, "LinkedIn");
  assert.equal(detectSocialPostUrl("instagram.com/p/abc")?.label, "Instagram");
  // Halaman lowongan bukan postingan sosial.
  assert.equal(detectSocialPostUrl("https://www.linkedin.com/jobs/view/123"), null);
  assert.equal(detectSocialPostUrl("https://www.kast.xyz/en/careers"), null);
  assert.equal(detectSocialPostUrl("https://notx.com/a"), null);
  assert.equal(detectSocialPostUrl("javascript:alert(1)"), null);
  assert.equal(detectSocialPostUrl(""), null);
  assert.equal(detectSocialPostUrl(undefined), null);
  assert.match(OFF_PORTAL_SOCIAL_CAPTION_HINT("Instagram"), /meminta login.*tempel di kolom caption.*bukan tautan lamaran/s);
});

test("E2E 26 Nov offPortal: kartu LinkedIn berlabel lamar manual; bidang tak terbaca dijelaskan dengan bahasa biasa", () => {
  const linkedin = describeOffPortalChannel({
    formProvider: null,
    applyUrl: "https://www.linkedin.com/company/bitget-wallet/jobs/",
    applyEmail: null,
    whatsappUrl: null,
    channel: {
      channel: "auth_portal",
      platform: "off_portal_caption",
      applyUrl: "https://www.linkedin.com/company/bitget-wallet/jobs/",
      applyEmail: null,
      autoWorkerSupported: false,
      emailApplySupported: false,
      extensionSupported: false,
      manualOnly: true,
      reason: "",
    },
  });
  assert.equal(linkedin.label, "LinkedIn · Lamar Manual");
  assert.equal(linkedin.tone, "manual");
  assert.equal(isLinkedInLink("https://www.linkedin.com/jobs/view/1"), true);
  assert.equal(isLinkedInLink("https://notlinkedin.com/jobs"), false);

  assert.equal(describeUnreadFields([]), "");
  assert.equal(describeUnreadFields(undefined), "");
  assert.match(describeUnreadFields(["title"]), /^Belum terbaca dari teks: posisi\./);
  assert.match(describeUnreadFields(["title", "company", "location"]), /posisi, perusahaan dan lokasi/);
});

test("E2E 26 Nov offPortal: modal membuang isian saat ditutup, punya tombol Tutup terlihat, dan menolak jawaban terlambat", () => {
  const modalSrc = readFileSync(new URL("../src/components/OffPortalImportModal.tsx", import.meta.url), "utf8");
  assert.match(modalSrc, /<Dialog open=\{open\} onOpenChange=\{handleOpenChange\}>/);
  assert.match(modalSrc, /data-testid="offportal-close"/);
  assert.match(modalSrc, /runId\.current !== |myRun !== runId\.current/);
  assert.match(modalSrc, /offportal-needs-caption/);
});
