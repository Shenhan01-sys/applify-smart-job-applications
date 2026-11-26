import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRecruiterEmail } from "../src/lib/emailApply.ts";
import { PRIVACY_SECTIONS } from "../src/lib/privacyContent.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

test("FE-14: vercel.json memasang header keamanan HTTP lengkap", () => {
  const cfg = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
  const hdrs = new Map<string, string>(
    (cfg.headers?.[0]?.headers ?? []).map((h: { key: string; value: string }) => [h.key.toLowerCase(), h.value])
  );
  assert.equal(hdrs.get("x-content-type-options"), "nosniff");
  assert.equal(hdrs.get("x-frame-options"), "DENY");
  assert.equal(hdrs.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.ok(hdrs.get("permissions-policy"));
  assert.ok(hdrs.get("strict-transport-security"));
});

test("F-04: privacyContent mencantumkan Kapso dan Resend dalam daftar pihak ketiga", () => {
  const sec = PRIVACY_SECTIONS.find((s) => s.id === "pihak-ketiga");
  assert.ok(sec);
  const joined = (sec!.items ?? []).join("\n");
  assert.match(joined, /Kapso/i);
  assert.match(joined, /Resend/i);
});

test("BS-09: __root.tsx memakai DefaultNotFoundComponent bersama tanpa duplikasi 404", () => {
  const src = readFileSync(path.join(root, "src", "routes", "__root.tsx"), "utf8");
  assert.match(src, /DefaultNotFoundComponent/);
  assert.doesNotMatch(src, /function NotFoundComponent/);
});

test("BS-U4-08: validateRecruiterEmail menolak TLD > 63 huruf selaras backend dan worker", () => {
  const longTld = `hr@company.${"a".repeat(64)}`;
  assert.equal(validateRecruiterEmail(longTld).ok, false);
  const okTld = `hr@company.${"a".repeat(63)}`;
  assert.equal(validateRecruiterEmail(okTld).ok, true);
});
