import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GMAIL_CONNECTED_TEXT,
  GMAIL_DENIED_TEXT,
  GMAIL_FAILED_TEXT,
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
  for (const reason of ["token_exchange", "storage"]) {
    assert.deepEqual(gmailBanner({ kind: "error", reason }), { tone: "error", text: GMAIL_FAILED_TEXT }, reason);
  }
  assert.deepEqual(gmailBanner({ kind: "error", reason: "kode_baru_dari_google" }), { tone: "error", text: GMAIL_UNKNOWN_ERROR_TEXT });
  assert.deepEqual(gmailBanner({ kind: "error", reason: null }), { tone: "error", text: GMAIL_UNKNOWN_ERROR_TEXT });
  for (const text of [GMAIL_CONNECTED_TEXT, GMAIL_DENIED_TEXT, GMAIL_FAILED_TEXT, GMAIL_UNKNOWN_ERROR_TEXT]) {
    assert.doesNotMatch(text, /oauth|token|GOOGLE|server|administrator|reason/i);
  }
});

test("kontrak backend: callback mengarahkan ke /settings dengan gmail=connected atau gmail=error&reason", () => {
  const oauth = read("../../backend/api/routes/oauth.ts");
  assert.match(oauth, /\/settings\?gmail=connected/);
  assert.match(oauth, /\/settings\?gmail=error&reason=/);
  for (const reason of ["token_exchange", "storage"]) assert.match(oauth, new RegExp(`reason=${reason}`));
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
