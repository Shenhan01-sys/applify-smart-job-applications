import test from "node:test";
import assert from "node:assert/strict";
import { classifyJobChannel } from "../src/lib/applyChannel.ts";
import { agentLogFacts } from "../src/lib/agentEvidence.ts";
import { describeLogOutcome } from "../src/lib/agentApplyStatus.ts";
import { EXTENSION_HANDOFF_BUTTON, extensionConsentState } from "../src/lib/extensionConsent.ts";
import { describeOffPortalChannel } from "../src/lib/offPortal.ts";

test("Gelombang 4 Google Forms: klasifikasi mengarahkan ke Agen (worker) dengan cadangan ekstensi", () => {
  const c = classifyJobChannel({
    platform_source: "off_portal_poster",
    external_url: "https://docs.google.com/forms/d/e/1FAIpQLSeDemo/viewform",
  });
  assert.equal(c.platform, "google_forms");
  assert.equal(c.autoWorkerSupported, true);
  assert.equal(c.extensionSupported, true);
  assert.equal(c.manualOnly, false);
  assert.equal(c.badgeLabel, "Google Form · Agen");

  const off = describeOffPortalChannel({
    formProvider: "google_forms",
    applyUrl: "https://docs.google.com/forms/d/e/1FAIpQLSeDemo/viewform",
    applyEmail: null,
    whatsappUrl: null,
    channel: c,
  });
  assert.equal(off.label, "Google Form · Agen");
});

test("Gelombang 4 Google Forms handoff: sebelum worker jalan tidak meminta izin ekstensi; setelah handoff muncul 'Lanjutkan di ekstensi' + pertanyaan", () => {
  const jobUrl = "https://docs.google.com/forms/d/e/1FAIpQLSeDemo/viewform";

  // Sebelum worker jalan (Google Form dijalankan worker dulu)
  const before = extensionConsentState({
    approvalStatus: "approved",
    platform: "google_forms",
    jobUrl,
    row: null,
    agentKnown: true,
  });
  assert.equal(before.show, false);

  // Worker berhenti karena unggah berkas / pertanyaan wajib kosong / login Google -> tampil "Lanjutkan di ekstensi"
  const logRow = agentLogFacts({
    status: "incomplete",
    created_at: "2026-11-26T00:25:00Z",
    details: {
      reason: "google_forms_missing_required",
      extension_handoff: true,
      handoff_reason: "missing_required",
      remaining_required: ["Ceritakan proyek sistem terdistribusi tersulitmu"],
      questions: [
        { key: "ceritakan proyek sistem terdistribusi tersulitmu", label: "Ceritakan proyek sistem terdistribusi tersulitmu", kind: "textarea" },
      ],
    },
  });

  assert.equal(logRow.extension_handoff, true);
  assert.equal(logRow.handoff_reason, "missing_required");
  assert.equal(logRow.questions?.length, 1);

  const view = describeLogOutcome(logRow);
  assert.ok(view);
  assert.match(view.label, /lanjutkan di ekstensi/i);

  const after = extensionConsentState({
    approvalStatus: "approved",
    platform: "google_forms",
    jobUrl,
    row: { ...logRow, status: "completed", job_type: "apply" },
    agentKnown: true,
  });
  assert.equal(after.show, true);
  assert.equal(after.reason, "handoff_needed");
  assert.equal(EXTENSION_HANDOFF_BUTTON, "Lanjutkan di ekstensi");
});

test("Gelombang 4 ekstensi partly_filled + questions_pending > 0 memunculkan tombol 'Lanjutkan di ekstensi'", () => {
  const jobUrl = "https://id.jobstreet.com/id/job/999";
  const extLog = agentLogFacts({
    status: "incomplete",
    created_at: "2026-11-26T00:35:00Z",
    details: {
      channel: "extension",
      reason: "partly_filled",
      questions_pending: 2,
      questions: [
        { key: "bersedia shift", label: "Bersedia kerja shift?", kind: "radio", options: ["Ya", "Tidak"] },
      ],
    },
  });
  assert.equal(extLog.questions_pending, 2);

  const stateWithPending = extensionConsentState({
    approvalStatus: "approved",
    platform: "jobstreet",
    jobUrl,
    row: { ...extLog, status: "completed", job_type: "extension_apply" },
    agentKnown: true,
  });
  assert.deepEqual(stateWithPending, { show: true, reason: "handoff_needed" });

  // Bila questions_pending === 0 dan questions kosong: tidak memunculkan handoff
  const stateNoPending = extensionConsentState({
    approvalStatus: "approved",
    platform: "jobstreet",
    jobUrl,
    row: {
      status: "completed",
      job_type: "extension_apply",
      channel: "extension",
      log_status: "incomplete",
      reason: "partly_filled",
      questions_pending: 0,
      questions: [],
    },
    agentKnown: true,
  });
  assert.equal(stateNoPending.show, false);
});
