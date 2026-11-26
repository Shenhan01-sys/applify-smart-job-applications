import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  describeAuthError,
  describeError,
  detectAuthProvider,
  recallAuthProvider,
  rememberAuthProvider,
} from "../src/lib/authErrors.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const ENGLISH_LEAK = /invalid login|not confirmed|already registered|rate limit|failed to fetch|row-level|non-2xx/i;

test("galat masuk dan daftar Supabase menjadi pesan Indonesia yang menjelaskan cara memperbaiki", () => {
  const cases: Array<[unknown, RegExp]> = [
    [{ message: "Invalid login credentials", code: "invalid_credentials", status: 400 }, /Email atau kata sandi salah.*Lupa kata sandi/],
    [{ message: "Email not confirmed", code: "email_not_confirmed" }, /Email belum diverifikasi.*folder spam/],
    [{ message: "User already registered", code: "user_already_exists" }, /sudah terdaftar/],
    [{ message: "Password should be at least 8 characters." }, /minimal 8 karakter dan berisi huruf serta angka/],
    [{ message: "Password is known to be weak", code: "weak_password", status: 422 }, /minimal 8 karakter dan berisi huruf serta angka/],
    [{ message: "Unable to validate email address: invalid format" }, /Format email tidak valid/],
    [{ message: "email rate limit exceeded", code: "over_email_send_rate_limit", status: 429 }, /Tunggu beberapa menit/],
    [{ message: "Signups not allowed for this instance" }, /Pendaftaran akun baru sedang ditutup/],
    [{ message: "Database error saving new user" }, /gangguan di server/],
    [{ message: "New password should be different from the old password.", code: "same_password" }, /harus berbeda/],
    [{ message: "Unsupported provider: provider is not enabled" }, /akun pihak ketiga belum diaktifkan/],
    [{ message: "access_denied", code: "access_denied" }, /Proses masuk dibatalkan/],
    [{ message: "Email link is invalid or has expired", code: "otp_expired" }, /kedaluwarsa/],
    [new TypeError("Failed to fetch"), /Tidak ada koneksi ke server/],
  ];
  for (const [err, expected] of cases) {
    const msg = describeAuthError(err);
    assert.match(msg, expected);
    assert.doesNotMatch(msg, ENGLISH_LEAK);
  }
});

test("galat auth tak dikenal memakai teks cadangan, bukan pesan Inggris mentah", () => {
  assert.equal(describeAuthError({ message: "Something exotic broke" }, "Gagal masuk."), "Gagal masuk.");
  assert.equal(describeAuthError(undefined, "Gagal masuk."), "Gagal masuk.");
  assert.match(describeAuthError({ message: "x", status: 502 }), /Server sedang bermasalah/);
});

test("pesan yang sudah berbahasa Indonesia ditampilkan apa adanya", () => {
  assert.equal(describeAuthError({ message: "Session tidak ditemukan setelah login." }), "Session tidak ditemukan setelah login.");
  assert.equal(describeError(new Error("Gagal membuat draft AI")), "Gagal membuat draft AI");
});

test("galat umum: sesi berakhir, izin, kuota, AI, jaringan", () => {
  assert.match(describeError({ message: "Invalid token", status: 401 }), /Masuk lagi/);
  assert.match(describeError(new Error("Missing auth token")), /Masuk lagi/);
  assert.match(describeError({ message: "new row violates row-level security policy", code: "42501" }), /tidak punya izin/);
  assert.match(describeError({ message: "duplicate key value", code: "23505" }), /sudah ada/);
  assert.match(describeError(new Error("Edge Function returned a non-2xx status code")), /Layanan AI sedang sibuk/);
  assert.match(describeError(new Error("AI not configured (OPENROUTER_API_KEY missing)")), /masalah konfigurasi/);
  assert.match(describeError(new TypeError("Failed to fetch")), /Tidak ada koneksi/);
  const quota = describeError(new Error("Kuota bulanan habis. Upgrade ke Pro untuk lebih banyak lamaran."));
  assert.match(quota, /direset bulan depan/);
  assert.doesNotMatch(quota, /Upgrade|Pro/);
  assert.equal(describeError(new Error("weird english"), "Gagal."), "Gagal.");
});

test("OAuth: pesan menyebut penyedia yang benar (Google atau LinkedIn), tidak selalu Google", () => {
  const denied = { message: "access_denied", code: "access_denied" };
  assert.match(describeAuthError(denied, undefined, "google"), /masuk dengan Google dibatalkan/);
  assert.match(describeAuthError(denied, undefined, "linkedin"), /masuk dengan LinkedIn dibatalkan/);
  assert.doesNotMatch(describeAuthError(denied, undefined, "linkedin"), /Google/);
  const disabled = { message: "Unsupported provider: provider is not enabled", code: "provider_disabled" };
  const google = describeAuthError(disabled, undefined, "google");
  assert.match(google, /Google belum diaktifkan/);
  assert.match(google, /Pakai LinkedIn atau email/);
  const linkedin = describeAuthError(disabled, undefined, "linkedin");
  assert.match(linkedin, /LinkedIn belum diaktifkan/);
  assert.match(linkedin, /Pakai Google atau email/);
  assert.doesNotMatch(linkedin, /Google belum/);
  // Penyedia dikenali dari pesan Supabase bila tidak diberikan.
  assert.match(describeAuthError({ message: "Unsupported provider: linkedin_oidc provider is not enabled" }), /LinkedIn belum diaktifkan/);
  assert.equal(detectAuthProvider("error from google"), "google");
  assert.equal(detectAuthProvider("linkedin_oidc"), "linkedin");
  assert.equal(detectAuthProvider("something else"), null);
});

test("halaman masuk mengingat penyedia sebelum pindah, dan halaman callback memakainya", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  assert.equal(recallAuthProvider(storage), null);
  rememberAuthProvider("linkedin", storage);
  assert.equal(recallAuthProvider(storage), "linkedin");
  store.set("applify_oauth_provider", "facebook");
  assert.equal(recallAuthProvider(storage), null);
  // penyimpanan yang melempar galat (mode privat) tidak merusak alur masuk
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => {} };
  assert.doesNotThrow(() => rememberAuthProvider("google", broken));
  assert.equal(recallAuthProvider(broken), null);

  const login = read("../src/routes/login.tsx");
  assert.match(login, /rememberAuthProvider\("google"\)/);
  assert.match(login, /rememberAuthProvider\("linkedin"\)/);
  assert.match(login, /Coba lagi, atau pakai email dan kata sandi\.", "google"\)/);
  assert.match(login, /pakai Google atau email\.", "linkedin"\)/);
  assert.match(read("../src/routes/auth.callback.tsx"), /recallAuthProvider\(\)/);
  assert.match(read("../src/routes/auth.callback.tsx"), /describeOAuthCallbackError\(/);
});

test("47.6 FE-20: describeOAuthCallbackError tidak memantulkan teks URL error_description sewenang-wenang", async () => {
  const { describeOAuthCallbackError } = await import("../src/lib/authErrors.ts");
  const fallback = "Proses masuk tidak berhasil. Kembali ke halaman masuk lalu coba lagi.";
  const phish = describeOAuthCallbackError({
    error: "server_error",
    errorDescription: "Proses gagal masuk, silakan kunjungi https://evil.example untuk melanjutkan.",
  });
  assert.equal(phish, fallback);
  assert.doesNotMatch(phish, /evil\.example/);

  assert.match(
    describeOAuthCallbackError({ error: "access_denied", errorDescription: "User denied" }, fallback, "google"),
    /masuk dengan Google dibatalkan/,
  );
  assert.match(
    describeOAuthCallbackError({ error: "invalid_request", errorDescription: "Unsupported provider: linkedin_oidc provider is not enabled" }),
    /LinkedIn belum diaktifkan/,
  );
});
