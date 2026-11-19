import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCookieInput } from "../src/lib/linkedinCookies.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("cookie LinkedIn: array JSON dari ekstensi cookie diubah menjadi peta yang diminta backend", () => {
  const r = parseCookieInput(JSON.stringify([
    { name: "li_at", value: "AQEDAx", domain: ".linkedin.com" },
    { name: "JSESSIONID", value: "ajax:123" },
  ]));
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.cookies, { li_at: "AQEDAx", JSESSIONID: "ajax:123" });
});

test("cookie LinkedIn: peta JSON dan teks header Cookie diterima", () => {
  const a = parseCookieInput('{"li_at":"x1","bcookie":"b1"}');
  assert.ok(a.ok && a.cookies.li_at === "x1" && a.cookies.bcookie === "b1");
  const b = parseCookieInput("li_at=abc123; JSESSIONID=\"ajax:9\"; bcookie=zz");
  assert.ok(b.ok && b.cookies.li_at === "abc123" && b.cookies.JSESSIONID === '"ajax:9"');
});

test("cookie LinkedIn: tanpa li_at ditolak, nilai cookie tidak pernah masuk pesan galat", () => {
  const secret = "SUPERSECRETVALUE";
  const r = parseCookieInput(JSON.stringify([{ name: "bcookie", value: secret }]));
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.message, /li_at/);
    assert.ok(!r.message.includes(secret));
  }
});

test("cookie LinkedIn: isian kosong, bukan daftar cookie, dan teks tanpa format ditolak dengan pesan Indonesia", () => {
  for (const bad of ["", "   ", "123", "null", "hanya teks biasa tanpa tanda sama dengan"]) {
    const r = parseCookieInput(bad);
    assert.equal(r.ok, false, bad);
    if (!r.ok) assert.ok(r.message.length > 10);
  }
  const noLi = parseCookieInput("JSESSIONID=abc");
  assert.equal(noLi.ok, false);
});

test("halaman sesi LinkedIn: peringatan risiko, label Lanjutan, tanpa klaim hapus sesi satu klik", () => {
  const src = read("../src/routes/linkedin-session.tsx");
  assert.match(src, /Lanjutan, opsional/);
  assert.match(src, /Baca dulu risikonya/);
  assert.doesNotMatch(src, /One-Click Revoke|Encrypted Storage|Session Status|Import Session/);
  assert.match(src, /htmlFor="cookies-linkedin"/);
  assert.match(src, /parseCookieInput\(cookiesText\)/);
  assert.match(src, /role="tablist"/);
  assert.doesNotMatch(src, /text-\[(8|9|10|11)px\]/);
  // status sesi dibaca saat halaman dibuka (sebelumnya selalu tampil "tidak ada sesi")
  assert.match(src, /void checkSession\(\)/);
});
