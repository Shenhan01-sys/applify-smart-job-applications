import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AFTER_APPROVE_TEXT, afterApproveText, approveRouteFor } from "../src/lib/approveOutcome.ts";

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
