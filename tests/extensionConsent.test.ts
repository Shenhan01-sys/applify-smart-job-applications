import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXTENSION_CONSENT_ALWAYS_LABEL,
  EXTENSION_CONSENT_BUTTON,
  EXTENSION_CONSENT_EXPLAIN,
  EXTENSION_CONSENT_TITLE,
  consentRequestBody,
  consentRequiredFrom,
  describeConsentError,
  extensionConsentState,
  type ExtensionConsentInput,
} from "../src/lib/extensionConsent.ts";
import { ApiError } from "../src/lib/apiErrors.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const PORTAL = "https://id.jobstreet.com/id/job/96011760";
const base = (over: Partial<ExtensionConsentInput> = {}): ExtensionConsentInput => ({
  approvalStatus: "approved",
  platform: "jobstreet",
  jobUrl: PORTAL,
  row: undefined,
  agentKnown: true,
  submitted: false,
  consentRequired: false,
  ...over,
});

test("teks blok izin: judul, tombol, centang, dan penjelasan sesuai permintaan pemilik", () => {
  assert.equal(EXTENSION_CONSENT_TITLE, "Izinkan ekstensi browser mengisi formulir ini");
  assert.equal(EXTENSION_CONSENT_BUTTON, "Izinkan");
  assert.equal(EXTENSION_CONSENT_ALWAYS_LABEL, "Selalu izinkan tanpa bertanya");
  assert.match(EXTENSION_CONSENT_EXPLAIN, /tab baru di browser kamu/);
  assert.match(EXTENSION_CONSENT_EXPLAIN, /berhenti sebelum mengirim/);
  assert.match(EXTENSION_CONSENT_EXPLAIN, /menekan Kirim/);
});

test("izin tampil: disetujui, situs portal login, belum ada tugas, belum terkirim", () => {
  assert.deepEqual(extensionConsentState(base()), { show: true, reason: "not_started" });
  // situs ATS terdaftar di EXTENSION_HOST_DOMAINS didukung ekstensi; host luar manifest tidak (J5-02)
  assert.equal(extensionConsentState(base({ platform: "other", jobUrl: "https://acme.teamtailor.com/jobs/1" })).show, true);
  assert.equal(extensionConsentState(base({ platform: "other", jobUrl: "https://karier.perusahaan.test/lowongan/1" })).show, false);
  const notExt = describeConsentError(new ApiError(409, JSON.stringify({ code: "not_extension_channel" })));
  assert.equal(notExt.alreadyActive, false);
  assert.match(notExt.message, /belum didukung Ekstensi Browser/i);
});

test("izin tersembunyi: belum disetujui, LinkedIn (manual saja), tanpa tautan, atau sudah terkirim", () => {
  assert.equal(extensionConsentState(base({ approvalStatus: "pending" })).show, false);
  assert.equal(extensionConsentState(base({ approvalStatus: "rejected" })).show, false);
  assert.equal(extensionConsentState(base({ platform: "linkedin", jobUrl: "https://www.linkedin.com/jobs/view/999" })).show, false);
  assert.equal(extensionConsentState(base({ platform: "other", jobUrl: null })).show, false);
  assert.equal(extensionConsentState(base({ submitted: true })).show, false);
  assert.equal(extensionConsentState(base({ row: { status: "completed", log_status: "success" } })).show, false);
  assert.equal(extensionConsentState(base({ row: { status: "completed", log_status: "submit_unverified" } })).show, false);
  assert.equal(extensionConsentState(base({ row: { status: "completed", claim_state: "submitted" } })).show, false);
});

test("izin tersembunyi selama tugas apply atau extension_apply masih aktif", () => {
  for (const jobType of ["apply", "extension_apply"]) {
    for (const status of ["pending", "processing"]) {
      assert.equal(extensionConsentState(base({ row: { status, job_type: jobType } })).show, false, `${jobType} ${status}`);
      assert.equal(extensionConsentState(base({ row: { status, job_type: jobType }, consentRequired: true })).show, false, `${jobType} ${status} + flag`);
    }
  }
  // menunggu login di tab ekstensi juga aktif
  assert.equal(
    extensionConsentState(base({ row: { status: "processing", job_type: "extension_apply", log_status: "awaiting_login", awaiting_until: new Date(Date.now() + 60_000).toISOString() } })).show,
    false,
  );
});

test("jawaban approve meminta izin: blok tampil walau situsnya belum dikenali, selama belum ada tugas", () => {
  assert.deepEqual(extensionConsentState(base({ platform: "other", jobUrl: null, consentRequired: true })), { show: true, reason: "flagged" });
  // status agen belum terbaca: bendera dari jawaban approve tetap dipercaya
  assert.equal(extensionConsentState(base({ agentKnown: false, consentRequired: true })).reason, "flagged");
  // sudah ada hasil tugas: yang tampil status tugasnya, bukan izin lagi
  assert.equal(extensionConsentState(base({ consentRequired: true, row: { status: "completed", fields_filled: 7 } })).show, false);
  // tetap tidak tampil untuk persetujuan yang belum disetujui
  assert.equal(extensionConsentState(base({ approvalStatus: "pending", consentRequired: true })).show, false);
});

test("percobaan berhenti karena login atau pengalihan domain: izin ditawarkan lagi untuk situs yang didukung ekstensi", () => {
  for (const reason of ["auth_required", "external_redirect"]) {
    const state = extensionConsentState(base({ row: { status: "completed", log_status: "incomplete", reason, fields_filled: 0 } }));
    assert.deepEqual(state, { show: true, reason: "login_needed" }, reason);
  }
  // alasan lain (CAPTCHA, validasi) bukan urusan izin
  assert.equal(extensionConsentState(base({ row: { status: "completed", log_status: "incomplete", reason: "captcha_blocked" } })).show, false);
  // LinkedIn tidak pernah didukung ekstensi
  assert.equal(
    extensionConsentState(base({ platform: "linkedin", jobUrl: "https://www.linkedin.com/jobs/view/1", row: { status: "completed", log_status: "incomplete", reason: "auth_required" } })).show,
    false,
  );
});

test("status agen belum terbaca: 'belum ada tugas' tidak ditebak, blok izin tidak tampil", () => {
  assert.equal(extensionConsentState(base({ agentKnown: false })).show, false);
});

test("jawaban approve: hanya extension_consent_required true yang dihitung; badan POST memuat always hanya bila dicentang", () => {
  assert.equal(consentRequiredFrom({ success: true, apply_channel: "extension", extension_consent_required: true }), true);
  assert.equal(consentRequiredFrom({ success: true, extension_consent_required: false }), false);
  assert.equal(consentRequiredFrom({ success: true, extension_consent_required: "true" }), false);
  assert.equal(consentRequiredFrom({ success: true }), false);
  assert.equal(consentRequiredFrom(null), false);
  assert.equal(consentRequiredFrom(undefined), false);
  assert.deepEqual(consentRequestBody(true), { always: true });
  assert.deepEqual(consentRequestBody(false), {});
});

test("galat izin: 409 berarti sudah aktif (bukan galat), 410 kedaluwarsa, 404 dan 5xx pesan biasa tanpa teks server", () => {
  const conflict = describeConsentError(new ApiError(409, JSON.stringify({ error: "already active" })));
  assert.equal(conflict.alreadyActive, true);
  assert.match(conflict.message, /sudah berjalan/);
  const gone = describeConsentError(new ApiError(410, "{}"));
  assert.equal(gone.alreadyActive, false);
  assert.match(gone.message, /kedaluwarsa/);
  const missing = describeConsentError(new ApiError(404, JSON.stringify({ error: "not_found" })));
  assert.match(missing.message, /Izin belum bisa diberikan/);
  const server = describeConsentError(new ApiError(500, JSON.stringify({ error: "boom SECRET", code: "internal_error" })));
  assert.doesNotMatch(server.message, /boom|SECRET/);
  assert.match(server.message, /Izin belum bisa diberikan/);
  assert.match(describeConsentError(new TypeError("Failed to fetch")).message, /tidak dapat dihubungi/);
});

test("wiring: modal membaca jawaban approve, halaman Persetujuan menampilkan blok izin sesudah status agen, API memanggil endpoint izin", () => {
  const modal = read("../src/components/ApprovalReviewModal.tsx");
  assert.match(modal, /consentRequiredFrom\(result\)/);
  assert.match(modal, /onApproved\(\{ consentRequired, notQueued: notQueuedRouteFrom\(result\) \}\)/);

  const page = read("../src/routes/approvals.tsx");
  assert.match(page, /import ExtensionConsent from "@\/components\/ExtensionConsent"/);
  const statusAt = page.indexOf("<AgentApplyStatus");
  const consentAt = page.indexOf("<ExtensionConsent");
  const emailAt = page.indexOf("<EmailApplyPanel");
  assert.ok(statusAt > 0 && consentAt > statusAt && emailAt > consentAt, "urutan: status agen, izin ekstensi, opsi email");
  assert.match(page, /agentKnown: emailData\.agentKnown/);
  assert.match(page, /submitted: emailData\.used\.has\(request\.id\)/);
  assert.match(page, /if \(result\?\.consentRequired && approvedId\)/);
  // persetujuan yang belum terkirim tetap di tab Menunggu, jadi tidak ada pindah tab sesudah approve
  assert.doesNotMatch(page, /handleTabChange\('history'\)/);

  const api = read("../src/services/automationApi.ts");
  assert.match(api, /\/api\/approvals\/\$\{encodeURIComponent\(id\)\}\/extension-consent/);
  assert.match(api, /consentRequestBody\(always\)/);

  const card = read("../src/components/ExtensionConsent.tsx");
  assert.match(card, /automationApi\.grantExtensionConsent\(approvalId, always\)/);
  assert.match(card, /to="\/settings"/);
  assert.match(card, /type="checkbox"/);

  const settings = read("../src/routes/settings.tsx");
  assert.match(settings, /id="ekstensi"/);

  const service = read("../src/services/emailApplyService.ts");
  assert.match(service, /agentKnown = res\.complete/);
});

test("teks untuk pengguna tidak memuat istilah pengembang", () => {
  const lib = read("../src/lib/extensionConsent.ts");
  const visible = [...lib.matchAll(/export const EXTENSION_CONSENT_[A-Z_]+ =\s*"([^"]+)"/g)].map((m) => m[1]).join("\n");
  assert.ok(visible.length > 200);
  assert.doesNotMatch(visible, /administrator|env|migration|kapso|token|queue|extension_apply|API/i);
});
