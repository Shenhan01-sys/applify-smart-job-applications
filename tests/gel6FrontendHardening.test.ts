import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasRecoveryUrlParams } from "../src/lib/resetPasswordGuard.ts";
import { HELP_EXTRA_FAQ, HELP_EXTRA_GLOSSARY } from "../src/components/help/helpContent.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("47.6 FE-13: /reset-password mewajibkan event PASSWORD_RECOVERY atau parameter recovery di URL", () => {
  assert.equal(hasRecoveryUrlParams({ hash: "#access_token=abc&type=recovery", search: "" }), true);
  assert.equal(hasRecoveryUrlParams({ hash: "", search: "?code=xyz" }), true);
  assert.equal(hasRecoveryUrlParams({ hash: "", search: "?token_hash=abc&type=recovery" }), true);
  assert.equal(hasRecoveryUrlParams({ hash: "", search: "" }), false);
  assert.equal(hasRecoveryUrlParams({ hash: "#access_token=abc&type=signup", search: "" }), false);

  const src = read("../src/routes/reset-password.tsx");
  assert.match(src, /hasRecoveryUrlParams/);
  assert.match(src, /if \(!recoveryConfirmed\)/);
});

test("47.6 FE-10: /waitinglist memiliki honeypot anti-bot aman autofill, jeda kirim lokal, dan batas panjang", () => {
  const src = read("../src/routes/waitinglist.tsx");
  assert.doesNotMatch(src, /name="website"/);
  assert.doesNotMatch(src, />Situs web</);
  assert.match(src, /name="applify_hp_confirm"/);
  assert.match(src, /autoComplete="new-password"/);
  assert.match(src, /data-lpignore="true"/);
  assert.match(src, /applify:waitinglist-last-submit/);
  assert.match(src, /\.slice\(0, 120\)/);
});

test("waitinglistGuard: WAITLIST_HONEYPOT_NAME aman dari autofill dan shouldBlockHoneypot hanya memblokir isi non-kosong", async () => {
  const { WAITLIST_HONEYPOT_NAME, shouldBlockHoneypot } = await import("../src/lib/waitinglistGuard.ts");
  assert.equal(WAITLIST_HONEYPOT_NAME, "applify_hp_confirm");
  assert.equal(shouldBlockHoneypot(""), false);
  assert.equal(shouldBlockHoneypot("   "), false);
  assert.equal(shouldBlockHoneypot("https://spam.example"), true);
});

test("48.6 UX-P7-09: /profile memasang penjaga perubahan belum tersimpan (beforeunload + indikator)", () => {
  const src = read("../src/routes/profile.tsx");
  assert.match(src, /hasUnsavedChanges/);
  assert.match(src, /beforeunload/);
  assert.match(src, /Ada perubahan belum disimpan/);
});

test("48.6 UX-P7-12, 13, 14: target sentuh min-h-11, info jumlah skill radar, serta glosarium Agen/Draf & FAQ lanjutan", () => {
  assert.match(read("../src/components/EmailApplyPanel.tsx"), /min-h-11/);
  assert.match(read("../src/components/profile/ProfileEditors.tsx"), /min-h-11/);
  assert.match(read("../src/routes/skill-radar.tsx"), /dari \{d\.matchedSkills\.length\} skill/);
  assert.ok(HELP_EXTRA_GLOSSARY.some((g) => g.term === "Agen"));
  assert.ok(HELP_EXTRA_GLOSSARY.some((g) => g.term.includes("Draf")));
  assert.ok(HELP_EXTRA_FAQ.length >= 4);
  for (const item of [...HELP_EXTRA_GLOSSARY.map((g) => g.meaning), ...HELP_EXTRA_FAQ.flatMap((f) => [f.question, f.answer])]) {
    assert.ok(!item.includes("\u2014") && !item.includes("!"), item);
  }
});
