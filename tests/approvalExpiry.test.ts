import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { APPROVAL_VALID_HOURS, APPROVAL_VALID_TEXT } from "../src/lib/approvalExpiry.ts";
import { PRIVACY_SECTIONS } from "../src/lib/privacyContent.ts";
import { getEmailApplyState } from "../src/lib/emailApply.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("satu konstanta masa berlaku: 24 jam", () => {
  assert.equal(APPROVAL_VALID_HOURS, 24);
  assert.equal(APPROVAL_VALID_TEXT, "24 jam");
});

test("sama dengan masa berlaku di server (APPROVAL_TTL_MS), bila backend ada di sebelah frontend", { skip: !existsSync(new URL("../../backend/services/approval-shared.ts", import.meta.url)) }, () => {
  const src = read("../../backend/services/approval-shared.ts");
  const m = src.match(/export const APPROVAL_TTL_MS = (\d+) \* 60 \* 60 \* 1000/);
  assert.ok(m, "APPROVAL_TTL_MS tidak ditemukan di backend/services/approval-shared.ts");
  assert.equal(Number(m[1]), APPROVAL_VALID_HOURS, "frontend dan server harus memakai masa berlaku yang sama");
});

test("jendela detail lamaran memakai konstanta, bukan angka yang diketik sendiri (temuan Gemini: 'berlaku 1 jam')", () => {
  const page = read("../src/routes/applications.tsx");
  assert.doesNotMatch(page, /berlaku 1 jam/);
  assert.match(page, /berlaku \{APPROVAL_VALID_TEXT\}/);
  const modal = read("../src/components/AIApplyModal.tsx");
  assert.match(modal, /berlaku \$\{APPROVAL_VALID_TEXT\}/);
});

test("tidak ada teks layar yang menyebut persetujuan berlaku jam selain 24", () => {
  for (const file of ["../src/routes/applications.tsx", "../src/components/AIApplyModal.tsx", "../src/lib/emailApply.ts", "../src/lib/privacyContent.ts", "../src/components/ApprovalReviewModal.tsx", "../src/routes/approvals.tsx"]) {
    const text = read(file);
    for (const m of text.matchAll(/(?:berlaku|masa berlakunya|batas waktu)[^.\n]{0,24}?\b(\d+)\s*jam/gi)) {
      assert.equal(Number(m[1]), APPROVAL_VALID_HOURS, `${file}: "${m[0]}"`);
    }
  }
});

test("kebijakan privasi dan panel email menyebut masa berlaku dari konstanta", () => {
  const all = JSON.stringify(PRIVACY_SECTIONS);
  assert.ok(all.includes(`batas waktu ${APPROVAL_VALID_TEXT}`));
  const state = getEmailApplyState(
    { id: "a", status: "approved", job_id: "j", expires_at: "2020-01-01T00:00:00Z", cover_letter: "x" } as never,
    { used: false, job: null, gmailConnected: true, applyEmail: "hrd@contoh.co.id", agentBlockedReason: null } as never,
  );
  assert.ok((state.message ?? "").includes(`(${APPROVAL_VALID_TEXT})`), state.message);
});
