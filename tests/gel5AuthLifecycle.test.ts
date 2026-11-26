import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

test("BS-07: AuthContext membungkus initSession dengan try/finally agar loading tidak macet", () => {
  const src = read("src/contexts/AuthContext.tsx");
  assert.match(src, /const initSession = async \(\) => \{\s*try \{/);
  assert.match(src, /finally \{\s*if \(active\) setLoading\(false\);/);
});

test("BS-07: useSubscription mengamati user?.id dan mereset state saat sesi kosong", () => {
  const src = read("src/hooks/useSubscription.ts");
  assert.match(src, /useAuth\(\)/);
  assert.match(src, /\[nonce,\s*authUserId\]/);
  assert.match(src, /if \(!authUserId\)/);
});

test("BS-07: dashboard dan skill-radar membersihkan state saat user null, dashboard menandai batas 500 baris", () => {
  const dash = read("src/routes/dashboard.tsx");
  assert.match(dash, /if \(!user\?\.id\) \{\s*\/\/ BS-07/);
  assert.match(dash, /setApplications\(\[\]\)/);
  assert.match(dash, /applications\.length >= 500/);

  const radar = read("src/routes/skill-radar.tsx");
  assert.match(radar, /if \(!user\?\.id\) \{\s*\/\/ BS-07/);
  assert.match(radar, /setSkills\(\[\]\)/);
});

test("BS-07 & UX-P7-15: green-career memuat hasil asesmen tersimpan, mewajibkan min 20 karakter teks, dan menyimpan draf ke sessionStorage", () => {
  const gc = read("src/routes/green-career.tsx");
  const svc = read("src/services/greenCareerService.ts");
  assert.match(svc, /listCompletedAssessments/);
  assert.match(gc, /listCompletedAssessments\(\)/);
  assert.match(gc, /MIN_TEXT_ANSWER_CHARS = 20/);
  assert.match(gc, /sessionStorage\.setItem/);
  assert.match(gc, /sessionStorage\.getItem/);
});
