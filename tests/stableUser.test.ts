import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { keepUserIfUnchanged } from "../src/lib/stableUser.ts";

// ---- objek user stabil: event auth berulang tidak boleh memuat ulang halaman dan menghapus isian form ----

test("user stabil: event auth untuk akun yang sama mempertahankan objek lama", () => {
  const prev = { id: "u1", updated_at: "2026-11-19T10:00:00Z", email: "a@contoh.id" };
  const next = { id: "u1", updated_at: "2026-11-19T10:00:00Z", email: "a@contoh.id" };
  assert.equal(keepUserIfUnchanged(prev, next), prev);
});

test("user stabil: akun diperbarui (updated_at berubah) memakai objek baru", () => {
  const prev = { id: "u1", updated_at: "2026-11-19T10:00:00Z" };
  const next = { id: "u1", updated_at: "2026-11-19T11:00:00Z" };
  assert.equal(keepUserIfUnchanged(prev, next), next);
});

test("user stabil: ganti akun, login pertama, dan logout", () => {
  assert.deepEqual(keepUserIfUnchanged({ id: "u1" }, { id: "u2" }), { id: "u2" });
  assert.deepEqual(keepUserIfUnchanged(null, { id: "u1" }), { id: "u1" });
  assert.equal(keepUserIfUnchanged({ id: "u1" }, null), null);
});

test("AuthContext memakai keepUserIfUnchanged di getSession dan onAuthStateChange", () => {
  const src = readFileSync(new URL("../src/contexts/AuthContext.tsx", import.meta.url), "utf8");
  assert.equal((src.match(/keepUserIfUnchanged\(/g) ?? []).length >= 2, true);
  assert.equal(/setUser\(session\?\.user \?\? null\)/.test(src), false);
});

test("form profil dasar memakai updater fungsional agar isian tidak saling menimpa", () => {
  const src = readFileSync(new URL("../src/routes/profile.tsx", import.meta.url), "utf8");
  assert.equal(src.includes("setFormData({...formData, [field.key]"), false);
});
