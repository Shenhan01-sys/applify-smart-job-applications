import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_NOT_STARTED_HINT, describeAgentApply, isAgentApplyActive } from "../src/lib/agentApplyStatus.ts";
import { NO_FIELDS_FILLED_TEXT, QUEUE_NEEDS_MANUAL_LABEL } from "../src/lib/statusLabels.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("tanpa tugas agen: label belum dijalankan dan email ditawarkan", () => {
  const v = describeAgentApply(undefined);
  assert.equal(v.label, "Agen belum dijalankan");
  assert.equal(v.hint, AGENT_NOT_STARTED_HINT);
  assert.equal(v.tone, "none");
  assert.equal(v.suggestEmail, true);
});

test("menunggu dan sedang berjalan: email tidak ditonjolkan, status aktif", () => {
  const p = describeAgentApply({ status: "pending" });
  assert.equal(p.label, "Menunggu agen");
  assert.equal(p.suggestEmail, false);
  const w = describeAgentApply({ status: "processing" });
  assert.equal(w.label, "Agen sedang mengisi formulir");
  assert.equal(w.tone, "working");
  assert.equal(isAgentApplyActive({ status: "pending" }), true);
  assert.equal(isAgentApplyActive({ status: "processing" }), true);
  assert.equal(isAgentApplyActive({ status: "completed" }), false);
  assert.equal(isAgentApplyActive(undefined), false);
});

test("selesai tanpa isian (uji klik Cermati 23 Nov): Perlu diisi sendiri", () => {
  const v = describeAgentApply({ status: "completed", fields_filled: 0 });
  assert.equal(v.label, QUEUE_NEEDS_MANUAL_LABEL);
  assert.equal(v.hint, NO_FIELDS_FILLED_TEXT);
  assert.equal(v.tone, "manual");
  assert.equal(v.suggestEmail, true);
});

test("selesai dengan isian: jumlah isian dan berhenti sebelum kirim", () => {
  const v = describeAgentApply({ status: "completed", fields_filled: 14 });
  assert.equal(v.label, "Formulir terisi (14 isian), berhenti sebelum kirim");
  assert.equal(v.tone, "ready");
  assert.equal(v.suggestEmail, false);
  assert.match(v.hint, /berhenti sebelum tombol kirim/);
  // Log belum terbaca: tidak mengarang jumlah isian.
  assert.equal(describeAgentApply({ status: "completed", fields_filled: null }).label, "Formulir diisi, berhenti sebelum kirim");
});

test("gagal dan dilewati: email ditawarkan sebagai cadangan", () => {
  const f = describeAgentApply({ status: "failed", error_message: "timeout" });
  assert.equal(f.label, "Agen gagal");
  assert.equal(f.tone, "failed");
  assert.equal(f.suggestEmail, true);
  const s = describeAgentApply({ status: "failed", error_message: "Lowongan ini tidak punya tautan untuk dilamar" });
  assert.equal(s.label, "Dilewati");
  assert.equal(s.suggestEmail, true);
});

test("halaman Approvals: status agen tampil sebelum opsi email pada riwayat approved", () => {
  const page = read("../src/routes/approvals.tsx");
  const agentAt = page.indexOf("<AgentApplyStatus row={emailData.agent[request.id]} />");
  const emailAt = page.indexOf("<EmailApplyPanel");
  assert.ok(agentAt > 0 && emailAt > agentAt, "AgentApplyStatus harus dirender sebelum EmailApplyPanel");
  assert.match(page, /activeTab === 'history' && request\.status === 'approved' && \(\s*<AgentApplyStatus/);
  const panel = read("../src/components/EmailApplyPanel.tsx");
  assert.match(panel, /Opsi lain: Kirim lewat Email/);
});

test("layanan: status agen dibaca dari tugas apply per approval_request_id dan log fields_filled", () => {
  const svc = read("../src/services/emailApplyService.ts");
  assert.match(svc, /\.eq\("job_type", "apply"\)\s*\.in\("payload->>approval_request_id", ids\)/);
  assert.match(svc, /\.eq\("action", "apply"\)\s*\.in\("details->>queue_job_id", queueIds\)/);
  assert.doesNotMatch(svc, /from\("automation_queue"\)\s*\.(insert|update|delete)/);
});
