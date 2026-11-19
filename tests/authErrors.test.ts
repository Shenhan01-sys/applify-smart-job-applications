import { test } from "node:test";
import assert from "node:assert/strict";
import { describeAuthError, describeError } from "../src/lib/authErrors.ts";

const ENGLISH_LEAK = /invalid login|not confirmed|already registered|rate limit|failed to fetch|row-level|non-2xx/i;

test("galat masuk dan daftar Supabase menjadi pesan Indonesia yang menjelaskan cara memperbaiki", () => {
  const cases: Array<[unknown, RegExp]> = [
    [{ message: "Invalid login credentials", code: "invalid_credentials", status: 400 }, /Email atau kata sandi salah.*Lupa kata sandi/],
    [{ message: "Email not confirmed", code: "email_not_confirmed" }, /Email belum diverifikasi.*folder spam/],
    [{ message: "User already registered", code: "user_already_exists" }, /sudah terdaftar/],
    [{ message: "Password should be at least 6 characters." }, /minimal 6 karakter/],
    [{ message: "Unable to validate email address: invalid format" }, /Format email tidak valid/],
    [{ message: "email rate limit exceeded", code: "over_email_send_rate_limit", status: 429 }, /Tunggu beberapa menit/],
    [{ message: "Signups not allowed for this instance" }, /Pendaftaran akun baru sedang ditutup/],
    [{ message: "Database error saving new user" }, /gangguan di server/],
    [{ message: "New password should be different from the old password.", code: "same_password" }, /harus berbeda/],
    [{ message: "Unsupported provider: provider is not enabled" }, /Google belum diaktifkan/],
    [{ message: "access_denied", code: "access_denied" }, /dibatalkan/],
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
