import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/test";

/**
 * Aturan kata sandi baru (src/lib/passwordPolicy.ts): minimal 8 karakter, berisi huruf dan angka, selaras dengan
 * pengaturan Supabase Auth. Berlaku untuk daftar dan reset sandi. Masuk dengan sandi lama (6 karakter) tidak boleh
 * diblokir di klien. Kode aplikasi asli; Supabase Auth dipalsukan (tests/e2e/helpers).
 */

const POLICY = "Kata sandi minimal 8 karakter dan berisi huruf serta angka.";

const policyAlert = (page: Page) => page.getByRole("alert").filter({ hasText: POLICY });

/** Catat panggilan ke endpoint kata sandi Supabase Auth (daftar, masuk, ganti sandi). */
function watchAuthCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on("request", (r) => {
    const { pathname } = new URL(r.url());
    if (/\/auth\/v1\/(signup|token|user)$/.test(pathname) && r.method() !== "GET") calls.push(`${r.method()} ${pathname.replace(/^.*\/auth\/v1/, "/auth/v1")}`);
  });
  return calls;
}

test.describe("Aturan kata sandi baru", () => {
  test("daftar: sandi terlalu pendek, tanpa angka, atau tanpa huruf ditolak sebelum dikirim", async ({ app }) => {
    // Halaman daftar dibuka tanpa sesi: skrip ini dijalankan sesudah skrip fixture dan mengosongkan sesi palsunya.
    await app.addInitScript(() => window.localStorage.clear());
    const calls = watchAuthCalls(app);
    await app.goto("/login?mode=daftar");
    await app.locator("#login-email").fill("baru@example.test");

    for (const weak of ["abc12", "abcdefgh", "12345678"]) {
      await app.locator("#login-password").fill(weak);
      await app.getByRole("button", { name: "Daftar Sekarang" }).click();
      await expect(policyAlert(app)).toBeVisible();
    }
    await expect(app.locator("#login-password-hint")).toContainText("Minimal 8 karakter");
    expect(calls, "tidak boleh ada permintaan ke Supabase Auth").toEqual([]);
  });

  test("daftar: sandi memenuhi aturan dikirim ke Supabase, dan galat weak_password dari server memakai pesan yang sama", async ({ app, backend }) => {
    await app.addInitScript(() => window.localStorage.clear());
    backend.override("POST /auth/v1/signup", {
      status: 422,
      body: { code: 422, error_code: "weak_password", msg: "Password is known to be weak and easy to guess", weak_password: { reasons: ["characters"] } },
    });
    const calls = watchAuthCalls(app);
    await app.goto("/login?mode=daftar");
    await app.locator("#login-email").fill("baru@example.test");
    await app.locator("#login-password").fill("abcdefg1");
    await app.getByRole("button", { name: "Daftar Sekarang" }).click();

    await expect(policyAlert(app)).toBeVisible();
    expect(calls).toEqual(["POST /auth/v1/signup"]);
  });

  test("masuk: sandi lama 6 karakter tidak divalidasi aturan baru dan tetap dikirim ke Supabase", async ({ app, backend }) => {
    await app.addInitScript(() => window.localStorage.clear());
    backend.override("POST /auth/v1/token", {
      status: 400,
      body: { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" },
    });
    const calls = watchAuthCalls(app);
    await app.goto("/login");
    await app.locator("#login-email").fill("lama@example.test");
    await app.locator("#login-password").fill("abc123");
    await expect(app.locator("#login-password-hint")).toHaveCount(0);
    await app.getByRole("button", { name: "Masuk", exact: true }).click();

    // Jawaban server yang diterjemahkan, bukan pesan aturan sandi baru.
    await expect(app.getByRole("alert").filter({ hasText: "Email atau kata sandi salah" })).toBeVisible();
    await expect(policyAlert(app)).toHaveCount(0);
    expect(calls).toEqual(["POST /auth/v1/token"]);
  });

  test("reset sandi: aturan yang sama sebelum dikirim, dan weak_password dari server dipetakan ke pesan itu", async ({ app, backend }) => {
    backend.override("PUT /auth/v1/user", {
      status: 422,
      body: { code: 422, error_code: "weak_password", msg: "Password should contain letters and digits", weak_password: { reasons: ["characters"] } },
    });
    const calls = watchAuthCalls(app);
    await app.goto("/reset-password?type=recovery");
    const submit = app.getByRole("button", { name: "Simpan kata sandi baru" });
    await expect(submit).toBeVisible();

    await app.locator("#new-password").fill("abc12");
    await app.locator("#confirm-password").fill("abc12");
    await submit.click();
    await expect(policyAlert(app)).toBeVisible();
    expect(calls, "sandi yang melanggar aturan tidak dikirim").toEqual([]);

    // Memenuhi aturan klien tetapi ditolak server: pesan yang sama, bukan teks Inggris mentah.
    await app.locator("#new-password").fill("abcdefg1");
    await app.locator("#confirm-password").fill("abcdefg1");
    await submit.click();
    await expect(policyAlert(app)).toBeVisible();
    expect(calls).toEqual(["PUT /auth/v1/user"]);
  });
});
