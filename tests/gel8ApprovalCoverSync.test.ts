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

test("Gelombang 10 (2): sinkronisasi PATCH /api/approvals/:id/cover-letter jika POST mengembalikan baris pending lama bersurat berbeda", async () => {
  const { syncReturnedPendingCover } = await import("../src/lib/draftApproval.ts");

  const patchCalls: Array<{ id: string; coverLetter: string }> = [];
  const patchFn = async (id: string, coverLetter: string) => {
    patchCalls.push({ id, coverLetter });
    return true;
  };

  // Kasus 1: POST mengembalikan baris pending lama bersurat beda -> wajib PATCH & created = false
  const postReturnedOld = {
    id: "apr-existing-1",
    application_id: "app-other",
    status: "pending",
    cover_letter: "Surat versi tab lama.",
    answers: [],
  };
  const resDiff = await syncReturnedPendingCover(postReturnedOld, "  Surat versi terbaru di modal.  ", patchFn, false);
  assert.deepEqual(patchCalls, [{ id: "apr-existing-1", coverLetter: "Surat versi terbaru di modal." }]);
  assert.equal(resDiff.created, false);
  assert.equal(resDiff.approval.cover_letter, "Surat versi terbaru di modal.");

  // Kasus 2: POST mengembalikan baris baru dengan surat yang sudah identik -> tidak memanggil PATCH
  patchCalls.length = 0;
  const postReturnedFresh = {
    id: "apr-fresh-2",
    application_id: "app-new-2",
    status: "pending",
    cover_letter: "Surat sudah identik.",
    answers: [],
  };
  const resSame = await syncReturnedPendingCover(postReturnedFresh, "  Surat sudah identik. ", patchFn, false);
  assert.deepEqual(patchCalls, []);
  assert.equal(resSame.created, true);

  // Kasus 3: service memanggil syncReturnedPendingCover sesudah createApproval
  const service = readFileSync(new URL("../src/services/approvalService.ts", import.meta.url), "utf8");
  const afterCreate = service.slice(service.indexOf("automationApi.createApproval"));
  assert.match(afterCreate, /syncReturnedPendingCover\(approval,\s*built\.payload\.cover_letter,\s*syncPendingApprovalCoverLetter,\s*false\)/);
});
