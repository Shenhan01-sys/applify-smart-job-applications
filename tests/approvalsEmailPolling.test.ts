import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isEmailApplyActive } from "../src/lib/emailApply.ts";

/**
 * E2E-03 (audit 26 Nov 2026): halaman /approvals wajib melakukan polling berkala saat ada tugas
 * `email_apply` berstatus `pending` atau `processing` (bukan hanya tugas agen form-filling), supaya
 * kartu otomatis berpindah dari "Sedang diproses" ke "Terkirim"/"Gagal" tanpa muat ulang manual.
 */

test("isEmailApplyActive: true hanya untuk status pending dan processing", () => {
  assert.equal(isEmailApplyActive({ status: "pending" }), true);
  assert.equal(isEmailApplyActive({ status: "processing" }), true);
  assert.equal(isEmailApplyActive({ status: "completed" }), false);
  assert.equal(isEmailApplyActive({ status: "failed" }), false);
  assert.equal(isEmailApplyActive({ status: null }), false);
  assert.equal(isEmailApplyActive(null), false);
  assert.equal(isEmailApplyActive(undefined), false);
});

test("approvals.tsx menyertakan emailData.jobs (isEmailApplyActive) sebagai pemicu interval polling", () => {
  const src = readFileSync(new URL("../src/routes/approvals.tsx", import.meta.url), "utf8");
  assert.match(src, /import \{ isEmailApplyActive \} from "@\/lib\/emailApply"/);
  assert.match(src, /Object\.values\(emailData\.jobs\)/);
  assert.match(src, /isEmailApplyActive/);
  assert.match(src, /pollingActive\s*=\s*agentActive\s*\|\|\s*emailActive/);
  assert.match(src, /if \(!pollingActive \|\| isMockMode\(\)\) return;/);
  assert.match(src, /\[pollingActive, awaitingCode, history\]/);
});
