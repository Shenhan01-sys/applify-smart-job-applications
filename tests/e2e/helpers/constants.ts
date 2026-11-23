/** Nilai bersama antara playwright.config.ts dan helper. Semuanya palsu dan hanya hidup di 127.0.0.1. */

export const APP_PORT = 5199;
export const APP_URL = `http://127.0.0.1:${APP_PORT}`;

/** Awalan jalur yang dicegat page.route. Tidak ada server di belakangnya. */
export const API_PREFIX = "/mock-api";
export const SUPABASE_PREFIX = "/mock-supabase";

export const API_URL = `${APP_URL}${API_PREFIX}`;
export const SUPABASE_URL = `${APP_URL}${SUPABASE_PREFIX}`;

/** Bukan kunci sungguhan. supabase-js hanya membutuhkan string. */
export const SUPABASE_ANON_KEY = "test-anon-key-not-a-secret";

export const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";
export const TEST_USER_EMAIL = "penguji@example.test";

/** supabase-js menyimpan sesi di localStorage dengan kunci `sb-<label pertama hostname>-auth-token`. */
export const SUPABASE_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
