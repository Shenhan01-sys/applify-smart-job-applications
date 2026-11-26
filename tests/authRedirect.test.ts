import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loginSearchWithRedirect, safeRedirectPath } from "../src/lib/authRedirect.ts";

const readRoute = (name: string) => readFileSync(new URL(`../src/routes/${name}`, import.meta.url), "utf8");

test("47.6 FE-18: safeRedirectPath hanya menerima rute internal yang aman", () => {
  assert.equal(safeRedirectPath("/approvals"), "/approvals");
  assert.equal(safeRedirectPath("  /jobs?cari=backend#top "), "/jobs?cari=backend#top");
  assert.equal(safeRedirectPath("https://evil.com/phish"), undefined);
  assert.equal(safeRedirectPath("//evil.com/phish"), undefined);
  assert.equal(safeRedirectPath("/\\evil.com"), undefined);
  assert.equal(safeRedirectPath("javascript:alert(1)"), undefined);
  assert.equal(safeRedirectPath("/login?mode=daftar"), undefined);
  assert.equal(safeRedirectPath("/auth/callback"), undefined);
  assert.equal(safeRedirectPath("/dashboard\nLocation: https://evil.com"), undefined);
  assert.equal(safeRedirectPath(null), undefined);
});

test("47.6 FE-18: loginSearchWithRedirect mempertahankan path dan query rute terlindungi", () => {
  assert.deepEqual(loginSearchWithRedirect({ href: "/jobs?cari=react" }), { redirect: "/jobs?cari=react" });
  assert.deepEqual(loginSearchWithRedirect({ pathname: "/approvals", searchStr: "" }), { redirect: "/approvals" });
  assert.deepEqual(loginSearchWithRedirect({ href: "//evil.com" }), {});
});

test("47.6 FE-18: rute utama UAT mempertahankan tujuan redirect saat diarahkan ke /login dan diproses login.tsx", () => {
  const routes = [
    "dashboard.tsx",
    "profile.tsx",
    "jobs.tsx",
    "applications.tsx",
    "approvals.tsx",
    "automation-settings.tsx",
    "settings.tsx",
    "green-career.tsx",
    "skill-radar.tsx",
  ];
  for (const r of routes) {
    const src = readRoute(r);
    assert.match(src, /loginSearchWithRedirect\(location\)/, `${r} harus meneruskan redirect ke /login`);
  }
  const loginSrc = readRoute("login.tsx");
  assert.match(loginSrc, /safeRedirectPath\(search\.redirect\)/);
  assert.match(loginSrc, /navigateArgsForRedirect\(redirectTo\)/);
  assert.match(loginSrc, /rememberPostLoginRedirect\(redirectTo\)/);
  const callbackSrc = readRoute("auth.callback.tsx");
  assert.match(callbackSrc, /consumePostLoginRedirect\(\)/);
  assert.match(callbackSrc, /navigateArgsForRedirect\(savedRedirect\)/);
});

test("47.6 FE-32: /settings menampilkan status galat saat plan.error alih-alih menyamar sebagai paket Gratis", () => {
  const settingsSrc = readRoute("settings.tsx");
  assert.match(settingsSrc, /plan\.error \? "Status paket belum bisa dimuat saat ini/);
});
