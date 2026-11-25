import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GMAIL_CONNECTED_TEXT,
  GMAIL_DENIED_TEXT,
  GMAIL_SCOPE_DENIED_TEXT,
  GMAIL_FAILED_TEXT,
  GMAIL_SESSION_TEXT,
  GMAIL_NO_REFRESH_TEXT,
  GMAIL_UNAVAILABLE_TEXT,
  GMAIL_UNKNOWN_ERROR_TEXT,
  gmailBanner,
  parseGmailCallback,
  validateGmailSearch,
} from "../src/lib/gmailCallback.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("validateGmailSearch: hanya connected atau error yang dikenal; alasan hanya untuk error dan berbentuk kode", () => {
  assert.deepEqual(validateGmailSearch({ gmail: "connected" }), { gmail: "connected" });
  assert.deepEqual(validateGmailSearch({ gmail: "connected", reason: "access_denied" }), { gmail: "connected" });
  assert.deepEqual(validateGmailSearch({ gmail: "error", reason: "access_denied" }), { gmail: "error", reason: "access_denied" });
  assert.deepEqual(validateGmailSearch({ gmail: "error" }), { gmail: "error" });
  assert.deepEqual(validateGmailSearch({ gmail: "lain", reason: "x" }), {});
  assert.deepEqual(validateGmailSearch({}), {});
  // alasan bukan kode (spasi, tanda tag, terlalu panjang): dibuang, tidak pernah sampai ke layar
  assert.deepEqual(validateGmailSearch({ gmail: "error", reason: "<script>alert(1)</script>" }), { gmail: "error" });
  assert.deepEqual(validateGmailSearch({ gmail: "error", reason: "x".repeat(65) }), { gmail: "error" });
  assert.deepEqual(validateGmailSearch({ gmail: "error", reason: 42 }), { gmail: "error" });
});

test("parseGmailCallback dan gmailBanner: berhasil, ditolak, gagal teknis, dan alasan tak dikenal", () => {
  assert.equal(parseGmailCallback({}), null);
  assert.equal(parseGmailCallback(undefined), null);
  assert.deepEqual(parseGmailCallback({ gmail: "connected" }), { kind: "connected" });
  assert.deepEqual(parseGmailCallback({ gmail: "error", reason: "storage" }), { kind: "error", reason: "storage" });
  assert.deepEqual(parseGmailCallback({ gmail: "error" }), { kind: "error", reason: null });

  assert.deepEqual(gmailBanner({ kind: "connected" }), { tone: "success", text: GMAIL_CONNECTED_TEXT });
  assert.deepEqual(gmailBanner({ kind: "error", reason: "access_denied" }), { tone: "error", text: GMAIL_DENIED_TEXT });
  assert.deepEqual(gmailBanner({ kind: "error", reason: "scope_denied" }), { tone: "error", text: GMAIL_SCOPE_DENIED_TEXT });
  for (const reason of ["token_exchange", "storage"]) {
    assert.deepEqual(gmailBanner({ kind: "error", reason }), { tone: "error", text: GMAIL_FAILED_TEXT }, reason);
  }
  for (const reason of ["invalid_state", "session_mismatch", "missing_params"]) {
    assert.deepEqual(gmailBanner({ kind: "error", reason }), { tone: "error", text: GMAIL_SESSION_TEXT }, reason);
  }
  assert.deepEqual(gmailBanner({ kind: "error", reason: "no_refresh_token" }), { tone: "error", text: GMAIL_NO_REFRESH_TEXT });
  assert.deepEqual(gmailBanner({ kind: "error", reason: "not_configured" }), { tone: "error", text: GMAIL_UNAVAILABLE_TEXT });
  assert.deepEqual(gmailBanner({ kind: "error", reason: "kode_baru_dari_google" }), { tone: "error", text: GMAIL_UNKNOWN_ERROR_TEXT });
  assert.deepEqual(gmailBanner({ kind: "error", reason: null }), { tone: "error", text: GMAIL_UNKNOWN_ERROR_TEXT });
  for (const text of [GMAIL_CONNECTED_TEXT, GMAIL_DENIED_TEXT, GMAIL_SCOPE_DENIED_TEXT, GMAIL_FAILED_TEXT, GMAIL_SESSION_TEXT, GMAIL_NO_REFRESH_TEXT, GMAIL_UNAVAILABLE_TEXT, GMAIL_UNKNOWN_ERROR_TEXT]) {
    assert.doesNotMatch(text, /oauth|token|GOOGLE|server|administrator|reason/i);
  }
});

test("kontrak backend: callback mengarahkan ke /settings dengan gmail=connected atau gmail=error&reason, dan semua kode alasannya dikenal", () => {
  const oauth = read("../../backend/api/routes/oauth.ts");
  assert.match(oauth, /\/settings\?gmail=connected/);
  assert.match(oauth, /\/settings\?gmail=error&reason=/);
  // Setiap kode alasan tetap yang ditulis backend punya pesan sendiri di sini (bukan pesan umum).
  const own = new Set(["token_exchange", "storage", "invalid_state", "session_mismatch", "missing_params", "no_refresh_token", "not_configured", "scope_denied"]);
  // Bentuk sekarang: fail('kode'); bentuk lama: ...&reason=kode di alamat tujuan.
  const fromBackend = [...oauth.matchAll(/(?:fail\('|reason=)([a-z_]+)/g)].map((m) => m[1]);
  assert.ok(fromBackend.length > 0, "backend tidak menulis kode alasan");
  for (const reason of new Set(fromBackend)) {
    assert.ok(own.has(reason), `kode alasan baru dari backend belum punya pesan: ${reason}`);
    assert.notDeepEqual(gmailBanner({ kind: "error", reason }), gmailBanner({ kind: "error", reason: "tidak_dikenal" }), reason);
  }
});

test("wiring: halaman Pengaturan membaca parameter, menampilkan kabar, lalu membersihkan alamat", () => {
  const page = read("../src/routes/settings.tsx");
  assert.match(page, /validateSearch: validateGmailSearch/);
  assert.match(page, /parseGmailCallback\(search\)/);
  assert.match(page, /navigate\(\{ to: "\/settings", search: \{\}/);
  assert.match(page, /data-testid="gmail-banner"/);
  // Mode demo mengarahkan ke bentuk alamat yang sama.
  assert.match(read("../src/services/automationApi.ts"), /\/settings\?gmail=connected/);
});
