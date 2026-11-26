import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("E2E-04: AIApplyModal menyinkronkan sunting dan tulis ulang surat ke pending approval lewat backend", () => {
  const modal = readFileSync(new URL("../src/components/AIApplyModal.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/services/approvalService.ts", import.meta.url), "utf8");
  const api = readFileSync(new URL("../src/services/automationApi.ts", import.meta.url), "utf8");

  assert.match(api, /async updateApprovalCoverLetter[\s\S]{0,300}\/api\/approvals\/\$\{encodeURIComponent\(id\)\}\/cover-letter/);
  assert.match(api, /method:\s*'PATCH'/);
  assert.match(service, /export async function syncPendingApprovalCoverLetter/);
  assert.match(modal, /performRegenerate[\s\S]{0,900}syncPendingApprovalCoverLetter\(approvalId,\s*insights\.coverLetter\)/);
  assert.match(modal, /handleSaveEdit[\s\S]{0,600}syncPendingApprovalCoverLetter\(approvalId,\s*editedCoverLetter\)/);
  assert.match(modal, /persistPendingEdit[\s\S]{0,400}syncPendingApprovalCoverLetter\(approvalId,\s*editedCoverLetter\)/);
});
