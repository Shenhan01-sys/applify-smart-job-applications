import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
  PASSWORD_POLICY_MESSAGE,
  isPasswordPolicyMet,
  passwordPolicyError,
} from "../src/lib/passwordPolicy.ts";
import { describeAuthError } from "../src/lib/authErrors.ts";

const srcDir = new URL("../src/", import.meta.url);
const readSrc = (rel: string) => readFileSync(new URL(rel, srcDir), "utf8");

test("aturan sandi: minimal 8 karakter, memuat huruf dan angka (selaras Supabase 'Letters and digits')", () => {
  assert.equal(PASSWORD_MIN_LENGTH, 8);
  for (const ok of ["abcdefg1", "Sandi1234", "1234abcd", "P4ssw0rd!", "kata sandi 1 yang panjang sekali", "a1".repeat(40)]) {
    assert.equal(isPasswordPolicyMet(ok), true, ok);
    assert.equal(passwordPolicyError(ok), null, ok);
  }
});

test("aturan sandi: pendek, tanpa angka, tanpa huruf, atau bukan string ditolak dengan pesan yang sama", () => {
  const bad: unknown[] = [
    "", "abc12", "abcdef1", "1234567", // kurang dari 8 karakter (7 karakter berisi huruf dan angka pun ditolak)
    "abcdefgh", "ABCDEFGHIJ", // tanpa angka
    "12345678", "0000000000", // tanpa huruf
    "!!!!!!!!", "        ", // simbol atau spasi saja
    "éééééé12", // huruf non-ASCII tidak dihitung: Supabase memakai a-z dan A-Z
    undefined, null, 12345678, {}, ["abcdefg1"],
  ];
  for (const pw of bad) {
    assert.equal(isPasswordPolicyMet(pw), false, String(pw));
    assert.equal(passwordPolicyError(pw), PASSWORD_POLICY_MESSAGE, String(pw));
  }
  // Tepat 8 karakter lolos, 7 karakter tidak.
  assert.equal(isPasswordPolicyMet("abcdefg1"), true);
  assert.equal(isPasswordPolicyMet("abcdef1"), false);
});

test("pesan aturan sandi berbahasa Indonesia dan menyebut batas 8, huruf, serta angka", () => {
  assert.match(PASSWORD_POLICY_MESSAGE, /minimal 8 karakter/);
  assert.match(PASSWORD_POLICY_MESSAGE, /huruf serta angka/);
  assert.match(PASSWORD_POLICY_HINT, /8 karakter.*huruf dan angka/);
});

test("galat weak_password dari Supabase dipetakan ke pesan aturan yang sama dengan validasi klien", () => {
  const cases: unknown[] = [
    { code: "weak_password", message: "Password should contain at least one character of each", status: 422 },
    { code: "weak_password", message: "Password is known to be weak and easy to guess" },
    { message: "Password should be at least 8 characters." },
    { message: "Weak password" },
  ];
  for (const err of cases) {
    assert.equal(describeAuthError(err), PASSWORD_POLICY_MESSAGE, JSON.stringify(err));
  }
  // Galat masuk (sandi lama salah) tidak ikut berubah.
  assert.match(describeAuthError({ code: "invalid_credentials", message: "Invalid login credentials" }), /Email atau kata sandi salah/);
});

test("login.tsx: aturan sandi baru hanya menjaga pendaftaran, masuk dengan sandi lama tidak divalidasi", () => {
  const login = readSrc("routes/login.tsx");
  const gate = login.indexOf("passwordPolicyError(password)");
  assert.ok(gate > 0, "pendaftaran harus memeriksa aturan sandi");
  assert.equal(login.split("passwordPolicyError(").length - 1, 1, "aturan hanya diperiksa satu kali, di cabang daftar");
  // Pemeriksaan ada di dalam cabang daftar dan sebelum permintaan ke Supabase.
  assert.match(login.slice(Math.max(0, gate - 200), gate), /if \(isSignUp\)/);
  assert.ok(gate < login.indexOf("supabase.auth.signUp("), "pemeriksaan harus mendahului signUp");
  assert.ok(gate < login.indexOf("setLoading(true)"), "pemeriksaan harus mendahului keadaan memuat");
  assert.ok(gate < login.indexOf("supabase.auth.signInWithPassword("));
  // Kolom sandi tidak boleh punya batas panjang HTML: masuk dengan sandi 6 karakter tetap boleh dikirim.
  assert.doesNotMatch(login, /minLength=/);
});

test("reset-password.tsx memakai aturan yang sama dan tidak lagi memeriksa 6 karakter", () => {
  const reset = readSrc("routes/reset-password.tsx");
  assert.match(reset, /passwordPolicyError\(password\)/);
  assert.doesNotMatch(reset, /length < 6/);
  assert.doesNotMatch(reset, /minLength=/);
  assert.doesNotMatch(reset, /Minimal 6 karakter/);
});

test("setiap berkas yang membuat atau mengganti sandi di src memakai passwordPolicy", () => {
  const files = readdirSync(srcDir, { recursive: true, encoding: "utf8" }).filter((f) => /\.(ts|tsx)$/.test(f));
  const creators = files.filter((f) => {
    const text = readSrc(f);
    return /auth\.signUp\(/.test(text) || /auth\.updateUser\(\s*\{[^}]*password/.test(text);
  });
  assert.deepEqual(creators.sort(), ["routes/login.tsx", "routes/reset-password.tsx"], "tempat baru yang membuat sandi harus ditambahkan ke tes ini");
  for (const f of creators) assert.match(readSrc(f), /passwordPolicyError/, f);
});
