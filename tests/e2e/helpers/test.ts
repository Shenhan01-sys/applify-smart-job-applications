import { expect, test as base, type Page } from "@playwright/test";
import { SUPABASE_STORAGE_KEY, TEST_USER_EMAIL, TEST_USER_ID } from "./constants";
import { MockBackend, authUser } from "./mockBackend";
import { OfflineGuard } from "./offlineGuard";

/** JWT palsu (tanpa tanda tangan sungguhan) supaya supabase-js bisa membacanya. */
function fakeJwt(expSeconds: number): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: TEST_USER_ID, role: "authenticated", email: TEST_USER_EMAIL, exp: expSeconds })}.fake-signature`;
}

export const TEST_ACCESS_TOKEN = fakeJwt(Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600);

function sessionJson(): string {
  const expiresAt = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
  return JSON.stringify({
    access_token: TEST_ACCESS_TOKEN,
    token_type: "bearer",
    expires_in: 10 * 365 * 24 * 3600,
    expires_at: expiresAt,
    refresh_token: "fake-refresh-token",
    user: authUser(),
  });
}

interface Fixtures {
  backend: MockBackend;
  guard: OfflineGuard;
  /** Halaman dengan sesi login palsu di localStorage, tiruan backend, dan penjaga luring terpasang. */
  app: Page;
}

export const test = base.extend<Fixtures>({
  backend: async ({}, use) => {
    await use(new MockBackend());
  },
  guard: async ({}, use) => {
    await use(new OfflineGuard());
  },
  app: async ({ page, context, backend, guard }, use) => {
    await guard.install(context, page);
    await backend.install(page);
    await page.addInitScript(
      ([key, value]) => {
        try {
          window.localStorage.setItem(key, value);
        } catch {
          /* halaman tanpa localStorage: tes akan gagal dengan sendirinya */
        }
      },
      [SUPABASE_STORAGE_KEY, sessionJson()] as const,
    );

    await use(page);

    // Pemeriksaan wajib di setiap tes: tidak ada permintaan ke luar 127.0.0.1, tidak ada panggilan yang tidak
    // ditiru, dan tidak ada galat JavaScript yang tak tertangkap.
    expect(guard.blocked, "permintaan ke host selain 127.0.0.1 (dibatalkan)").toEqual([]);
    expect(backend.unmocked, "panggilan API atau Supabase yang tidak ditiru").toEqual([]);
    expect(guard.pageErrors, "galat JavaScript yang tak tertangkap").toEqual([]);
  },
});

export { expect };
