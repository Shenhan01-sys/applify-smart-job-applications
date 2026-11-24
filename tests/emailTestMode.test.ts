import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMAIL_TEST_MODE_HINT,
  EMAIL_TEST_MODE_LABEL,
  isRealSubmitOffLog,
} from "../src/lib/emailTestMode.ts";
import { isEmailTestMode, queueDisplayLabel, queueStatusHint } from "../src/lib/statusLabels.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("label dan penjelasan mode uji: bukan Selesai, tanpa istilah teknis", () => {
  assert.equal(EMAIL_TEST_MODE_LABEL, "Belum dikirim (mode uji)");
  assert.match(EMAIL_TEST_MODE_HINT, /tidak dikirim ke rekruter/);
  assert.match(EMAIL_TEST_MODE_HINT, /belum terkirim/);
  assert.doesNotMatch(EMAIL_TEST_MODE_LABEL + EMAIL_TEST_MODE_HINT, /ALLOW_REAL_SUBMIT|real_submit|worker|env/i);
});

test("isRealSubmitOffLog: skipped dengan reason real_submit_off, atau catatan lama ALLOW_REAL_SUBMIT=false", () => {
  assert.equal(isRealSubmitOffLog({ status: "skipped", details: { reason: "real_submit_off", to: "hrd@x.co" } }), true);
  assert.equal(isRealSubmitOffLog({ status: "skipped", details: { note: "email tidak dikirim (ALLOW_REAL_SUBMIT=false)" } }), true);
  // alasan skipped lain (kuota habis) bukan mode uji
  assert.equal(isRealSubmitOffLog({ status: "skipped", details: { note: "kuota harian habis (10/10, paket free); email tidak dikirim" } }), false);
  assert.equal(isRealSubmitOffLog({ status: "skipped", details: { reason: "daily_quota" } }), false);
  // status lain tidak dihitung walau alasannya sama
  assert.equal(isRealSubmitOffLog({ status: "success", details: { reason: "real_submit_off" } }), false);
  assert.equal(isRealSubmitOffLog({ status: "failed", details: { reason: "real_submit_off" } }), false);
  assert.equal(isRealSubmitOffLog({ status: "skipped", details: null }), false);
  assert.equal(isRealSubmitOffLog({ status: "skipped" }), false);
  assert.equal(isRealSubmitOffLog(null), false);
  assert.equal(isRealSubmitOffLog(undefined), false);
});

test("antrean: email selesai tetapi mode uji tampil Belum dikirim, bukan Selesai; jenis lain tidak berubah", () => {
  assert.equal(isEmailTestMode("completed", "email_apply", true), true);
  assert.equal(queueDisplayLabel("completed", null, "email_apply", null, true), "Belum dikirim (mode uji)");
  assert.equal(queueStatusHint("completed", "email_apply", null, null, true), EMAIL_TEST_MODE_HINT);
  // tanpa tanda mode uji (log belum terbaca atau email benar-benar terkirim): perilaku lama
  assert.equal(queueDisplayLabel("completed", null, "email_apply", null, false), "Selesai");
  assert.equal(queueDisplayLabel("completed", null, "email_apply"), "Selesai");
  // tanda hanya berlaku untuk tugas email yang selesai
  assert.equal(isEmailTestMode("completed", "apply", true), false);
  assert.equal(isEmailTestMode("failed", "email_apply", true), false);
  assert.equal(isEmailTestMode("pending", "email_apply", true), false);
  assert.equal(queueDisplayLabel("completed", null, "apply", 4, true), "Selesai");
  assert.equal(queueDisplayLabel("failed", "x", "email_apply", null, true), "Gagal");
});

test("wiring: antrean membaca log skipped untuk tugas email selesai, panel email memakai tandanya", () => {
  const queue = read("../src/services/automationQueue.ts");
  assert.match(queue, /\.eq\("action", "email_apply"\)\s*\.eq\("status", "skipped"\)\s*\.in\("details->>approval_request_id", emailApprovalIds\)/);
  assert.match(queue, /r\.job_type === "email_apply" && r\.status === "completed"/);
  assert.match(queue, /email_test_mode: true/);
  const panelQueue = read("../src/components/QueuePanel.tsx");
  assert.match(panelQueue, /isEmailTestMode\(q\.status, q\.job_type, q\.email_test_mode\)/);

  const service = read("../src/services/emailApplyService.ts");
  assert.match(service, /\.eq\("action", "email_apply"\)\s*\.eq\("status", "skipped"\)/);
  assert.match(service, /!data\.used\.has\(id\) && data\.jobs\[id\]\?\.status === "completed"/);
  const email = read("../src/components/EmailApplyPanel.tsx");
  assert.match(email, /data-testid="email-test-mode"/);
  assert.match(email, /EMAIL_TEST_MODE_LABEL/);
  assert.match(read("../src/routes/approvals.tsx"), /testMode=\{emailData\.testMode\.has\(request\.id\)\}/);
});

test("kontrak worker: log email_apply skipped ditulis saat ALLOW_REAL_SUBMIT mati", () => {
  const handler = read("../../worker/src/handlers/emailApply.ts");
  assert.match(handler, /"skipped"/);
  assert.match(handler, /!deps\.allowRealSubmit/);
  assert.match(handler, /action: "email_apply"/);
  assert.match(handler, /approval_request_id: approvalId/);
});
