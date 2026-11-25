import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const admin = read("../src/routes/admin.waitinglist.tsx");

// Pola alamat email umum. Tes ini tidak memuat alamat asli: cukup memastikan tidak ada yang tertulis di berkas admin.
const EMAIL_LIKE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

test("admin: tidak ada daftar email hardcoded di bundle klien", () => {
  assert.doesNotMatch(admin, /ADMIN_EMAILS/);
  assert.doesNotMatch(admin, EMAIL_LIKE);
});

test("admin: peran dicek dari profiles.is_admin milik pengguna yang login", () => {
  assert.match(admin, /from\("profiles"\)\s*\.select\("is_admin"\)\s*\.eq\("id", user\.id\)/);
  assert.match(admin, /data\?\.is_admin !== true/);
});

test("admin: kueri waitinglist hanya dijalankan setelah status admin, bukan saat halaman dibuka", () => {
  // Status admin ditetapkan di efek cek peran, dan load() hanya dipanggil dari efek yang menunggu status itu.
  const setAdmin = admin.indexOf('setAdminState("admin")');
  const loadGate = admin.indexOf('if (adminState !== "admin") return;');
  assert.ok(setAdmin > 0 && loadGate > setAdmin, "status admin ditetapkan sebelum efek load memeriksanya");
  assert.match(admin, /if \(adminState !== "admin"\) return;\s*load\(\);/);
  assert.doesNotMatch(admin, /useEffect\(\(\) => \{\s*load\(\);\s*\}, \[\]\);/);
});

test("admin: status checking tidak menampilkan data, dan kegagalan cek berakhir di 403", () => {
  assert.match(admin, /adminState === "checking"/);
  assert.match(admin, /if \(error \|\| data\?\.is_admin !== true\) \{\s*setAdminState\("forbidden"\);/);
  assert.match(admin, /adminState === "forbidden"/);
  // mode demo tidak punya database: tanpa cek peran, halaman tidak membuka data sama sekali
  assert.match(admin, /if \(isMockMode\(\) \|\| !user\) \{\s*setAdminState\("forbidden"\);/);
});
