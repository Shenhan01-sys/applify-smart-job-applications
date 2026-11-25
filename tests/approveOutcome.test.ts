import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AFTER_APPROVE_TEXT,
  EMAIL_APPROVED_TOAST,
  MANUAL_APPROVED_TOAST,
  NOT_QUEUED_HEADING,
  NOT_QUEUED_TEXT,
  QUEUED_APPROVED_TOAST,
  UNQUEUED_APPROVED_TOAST,
  afterApproveText,
  approveRouteFor,
  approvedToast,
  notQueuedRouteForJob,
  notQueuedRouteFrom,
} from "../src/lib/approveOutcome.ts";
import { EXTENSION_CONSENT_REQUIRED_TOAST } from "../src/lib/extensionConsent.ts";

test("jalur kirim dari platform persetujuan (nilai nyata di approval_requests.platform)", () => {
  for (const p of ["greenhouse", "Lever", "smartrecruiters", "applify-uji"]) assert.equal(approveRouteFor(p), "server_agent", p);
  for (const p of ["jobstreet", "dealls", "Glints", "kalibrr"]) assert.equal(approveRouteFor(p), "extension", p);
  for (const p of ["web", "linkedin", "LinkedIn", "e2e-mock", "", null, undefined, 3]) assert.equal(approveRouteFor(p), "other", String(p));
});

test("teks sesudah Setujui: agen server mengirim sendiri, ekstensi berhenti sebelum kirim, lainnya tetap jujur", () => {
  assert.match(afterApproveText("greenhouse"), /menekan kirim/);
  assert.match(afterApproveText("greenhouse"), /tidak bisa ditarik/);
  assert.match(afterApproveText("jobstreet"), /berhenti sebelum kirim/);
  assert.match(afterApproveText("jobstreet"), /laptop/);
  assert.match(afterApproveText("web"), /tidak bisa ditarik/);
  for (const t of Object.values(AFTER_APPROVE_TEXT)) assert.doesNotMatch(t, /—|!/);
});

test("modal Persetujuan memakai teks per jalur dan tanpa em dash", () => {
  const src = readFileSync(new URL("../src/components/ApprovalReviewModal.tsx", import.meta.url), "utf8");
  assert.match(src, /data-testid="real-submit-warning">\s*\{afterApproveText\(request\.platform\)\}/);
  assert.doesNotMatch(src, /Edit dulu bila perlu —/);
});

test("HitlTrack di layar sempit memberi Langkah N dari 5; modal AI hanya punya satu aksi utama di footer", () => {
  const track = readFileSync(new URL("../src/components/HitlTrack.tsx", import.meta.url), "utf8");
  assert.match(track, /Langkah \{current \+ 1\} dari \{STEPS\.length\}/);
  assert.doesNotMatch(track, /label: "Antrean"/);
  const modal = readFileSync(new URL("../src/components/AIApplyModal.tsx", import.meta.url), "utf8");
  const footer = modal.slice(modal.indexOf('<div className="flex flex-wrap items-center gap-3">'), modal.indexOf('<p id="apply-fill-hint"'));
  assert.doesNotMatch(footer, /Isi Formulir Saja/);
  assert.match(modal.slice(modal.indexOf('<p id="apply-fill-hint"')), /onClick=\{handleAutoApply\}/);
});

// ---- E2E-01: jawaban approve queued false (LinkedIn, email langsung) ---------------------------------

// Bentuk jawaban nyata backend/api/routes/approval.ts.
const MANUAL_RESPONSE = { success: true, queue_job_id: null, apply_channel: "manual", queued: false, manual_only: true };
const EMAIL_RESPONSE = { success: true, queue_job_id: null, apply_channel: "email_direct", queued: false };
const QUEUED_RESPONSE = { success: true, queue_job_id: "q-1", apply_channel: "worker" };
const CONSENT_RESPONSE = { success: true, queue_job_id: null, apply_channel: "extension", extension_consent_required: true };

test("jawaban approve: manual_only dan email_direct dikenali, antrean dan izin ekstensi bukan jalur tanpa antrean", () => {
  assert.equal(notQueuedRouteFrom(MANUAL_RESPONSE), "manual");
  assert.equal(notQueuedRouteFrom({ apply_channel: "manual" }), "manual");
  assert.equal(notQueuedRouteFrom({ manual_only: true }), "manual");
  assert.equal(notQueuedRouteFrom(EMAIL_RESPONSE), "email_direct");
  for (const r of [QUEUED_RESPONSE, CONSENT_RESPONSE, { apply_channel: "extension", queued: true }, {}, null, undefined, "manual", 3]) {
    assert.equal(notQueuedRouteFrom(r), null, JSON.stringify(r));
  }
});

test("toast sesudah Setujui hanya menyebut antrean agen bila lamaran memang diantre", () => {
  assert.equal(approvedToast(MANUAL_RESPONSE), "Disetujui. Lamar sendiri di situs lowongan.");
  assert.equal(approvedToast(EMAIL_RESPONSE), "Disetujui. Kirim lewat panel Email.");
  assert.equal(approvedToast(QUEUED_RESPONSE), QUEUED_APPROVED_TOAST);
  assert.equal(approvedToast(undefined), QUEUED_APPROVED_TOAST);
  assert.equal(approvedToast(CONSENT_RESPONSE), EXTENSION_CONSENT_REQUIRED_TOAST);
  // queued false tanpa jalur yang dikenal: tetap tidak berjanji antrean
  assert.equal(approvedToast({ success: true, queued: false }), UNQUEUED_APPROVED_TOAST);
  for (const t of [MANUAL_APPROVED_TOAST, EMAIL_APPROVED_TOAST, QUEUED_APPROVED_TOAST, UNQUEUED_APPROVED_TOAST]) assert.doesNotMatch(t, /—|!/);
  for (const t of [MANUAL_APPROVED_TOAST, EMAIL_APPROVED_TOAST]) assert.doesNotMatch(t, /antrean/, t);
  assert.match(UNQUEUED_APPROVED_TOAST, /belum masuk antrean/);
});

test("jalur tanpa antrean dibaca dari data lowongan seperti approvalDispatchTarget di backend", () => {
  assert.equal(notQueuedRouteForJob({ platform: "linkedin", external_url: "https://www.linkedin.com/jobs/view/1" }), "manual");
  assert.equal(notQueuedRouteForJob({ platform: "linkedin" }), "manual");
  assert.equal(notQueuedRouteForJob({ platform: "jooble", external_url: "https://jooble.example.test/x", description: "Kirim CV ke hr@perusahaan-contoh.co.id" }), "email_direct");
  // LinkedIn menang atas email di deskripsi, sama seperti backend (manualOnly dulu)
  assert.equal(notQueuedRouteForJob({ platform: "linkedin", external_url: "https://www.linkedin.com/jobs/view/1", description: "hr@perusahaan-contoh.co.id" }), "manual");
  // ATS publik, portal ekstensi, dan situs lain diantre (worker atau ekstensi)
  assert.equal(notQueuedRouteForJob({ platform: "greenhouse", external_url: "https://boards.greenhouse.io/acme/jobs/1" }), null);
  assert.equal(notQueuedRouteForJob({ platform: "jobstreet", external_url: "https://id.jobstreet.com/job/1" }), null);
  assert.equal(notQueuedRouteForJob({ platform: "web", external_url: "https://karier.example.test/1" }), null);
  assert.equal(notQueuedRouteForJob({}), null);
});

test("penjelasan kartu tanpa antrean: tanpa em dash dan tanda seru, tidak menjanjikan agen atau tombol sudah terkirim", () => {
  for (const route of ["manual", "email_direct"] as const) {
    for (const t of [NOT_QUEUED_HEADING[route], NOT_QUEUED_TEXT[route]]) {
      assert.doesNotMatch(t, /—|!/, route);
      assert.doesNotMatch(t, /sudah kukirim|tandai terkirim/i, route);
    }
  }
  assert.match(NOT_QUEUED_TEXT.manual, /Applify tidak mengirim apa pun/);
  assert.match(NOT_QUEUED_TEXT.email_direct, /panel Email/);
});

test("kabel: modal memakai approvedToast dan meneruskan jalur tanpa antrean; toast antrean tidak lagi tertulis mati", () => {
  const modal = readFileSync(new URL("../src/components/ApprovalReviewModal.tsx", import.meta.url), "utf8");
  assert.match(modal, /toast\.success\(approvedToast\(result\)\)/);
  assert.match(modal, /onApproved\(\{ consentRequired, notQueued: notQueuedRouteFrom\(result\) \}\)/);
  assert.doesNotMatch(modal, /Disetujui — lamaran masuk antrean agen/);
  const page = readFileSync(new URL("../src/routes/approvals.tsx", import.meta.url), "utf8");
  assert.match(page, /notQueued: notQueuedFor\(a\.id\)/);
  assert.match(page, /notQueued=\{notQueuedFor\(request\.id\)\}/);
  const svc = readFileSync(new URL("../src/services/emailApplyService.ts", import.meta.url), "utf8");
  assert.match(svc, /notQueuedRouteForJob\(/);
});
