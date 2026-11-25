import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { backSearchFor, clearAuthMode, recallAuthMode, rememberAuthMode } from "../src/lib/authMode.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

test("mode auth: catat, baca, dan hapus; nilai asing dianggap tidak ada", () => {
  const storage = memoryStorage();
  assert.equal(recallAuthMode(storage), null);
  rememberAuthMode("daftar", storage);
  assert.equal(recallAuthMode(storage), "daftar");
  rememberAuthMode("masuk", storage);
  assert.equal(recallAuthMode(storage), "masuk");
  clearAuthMode(storage);
  assert.equal(recallAuthMode(storage), null);
  storage.setItem("applify_auth_mode", "lain");
  assert.equal(recallAuthMode(storage), null);
});

test("mode auth: penyimpanan yang melempar galat tidak merusak alur masuk", () => {
  const broken = {
    getItem: () => { throw new Error("denied"); },
    setItem: () => { throw new Error("denied"); },
    removeItem: () => { throw new Error("denied"); },
  };
  assert.doesNotThrow(() => rememberAuthMode("daftar", broken));
  assert.doesNotThrow(() => clearAuthMode(broken));
  assert.equal(recallAuthMode(broken), null);
});

test("tombol kembali: asal daftar membawa mode=daftar, selain itu tanpa parameter", () => {
  assert.deepEqual(backSearchFor("daftar"), { mode: "daftar" });
  assert.deepEqual(backSearchFor("masuk"), {});
  assert.deepEqual(backSearchFor(null), {});
});

test("halaman masuk menyimpan mode terakhir saat Google atau LinkedIn ditekan, dan tidak mengubah blok peringatan peramban", () => {
  const login = read("../src/routes/login.tsx");
  assert.match(login, /import \{ rememberAuthMode \} from "@\/lib\/authMode"/);
  assert.match(login, /rememberAuthProvider\("google"\);\s*rememberAuthMode\(isSignUp \? "daftar" : "masuk"\);/);
  assert.match(login, /rememberAuthProvider\("linkedin"\);\s*rememberAuthMode\(isSignUp \? "daftar" : "masuk"\);/);
  // blok peringatan peramban tetap di atas tombol Google
  assert.ok(login.indexOf("inAppBrowserWarning(inApp)") < login.indexOf("{/* Google OAuth Button */}"));
});

test("mode Daftar menampilkan gambaran 3 langkah sesudah daftar, hanya saat isSignUp", () => {
  const login = read("../src/routes/login.tsx");
  const start = login.indexOf("Setelah daftar, kamu akan:");
  assert.ok(start > 0, "gambaran 3 langkah ada");
  const block = login.slice(login.lastIndexOf("{isSignUp && (", start), login.indexOf("<div className=\"mt-6 text-center\">", start));
  assert.match(block, /^\{isSignUp && \(/);
  assert.equal((block.match(/<li>/g) ?? []).length, 3);
  assert.match(block, /Tidak ada lamaran yang dikirim sebelum kamu menyetujuinya/);
});

test("halaman galat callback memakai mode tersimpan untuk tombol kembali dan menghapusnya setelah berhasil", () => {
  const cb = read("../src/routes/auth.callback.tsx");
  assert.match(cb, /recallAuthMode\(\)/);
  assert.match(cb, /search=\{backSearch\}/);
  assert.match(cb, /clearAuthMode\(\);/);
  // penghapusan terjadi di jalur sukses, sebelum navigasi
  assert.ok(cb.indexOf("clearAuthMode();") < cb.indexOf("resolvePostLoginTarget(session.user.id)"));
  // pemulihan penyedia dan penunggu sesi tetap ada
  assert.match(cb, /recallAuthProvider\(\)/);
  assert.match(cb, /waitForSession\(supabase/);
});

test("ON-20: pesan cadangan tidak lagi berupa 'Gagal ...' polos di sumber yang disentuh", () => {
  const sources = [
    "../src/services/linkedinImportService.ts",
    "../src/lib/linkedinImport.ts",
    "../src/services/aiApplicationService.ts",
    "../src/routes/admin.waitinglist.tsx",
  ];
  for (const rel of sources) {
    const src = read(rel);
    assert.doesNotMatch(src, /"Gagal (menyimpan|membuat draft AI|memuat data)[.:]?"/, rel);
    assert.doesNotMatch(src, /Gagal memuat data: "/, rel);
  }
});

test("ON-15/16/20: teks baru tidak memakai em dash atau tanda seru", () => {
  const login = read("../src/routes/login.tsx");
  const start = login.indexOf("Setelah daftar, kamu akan:");
  const block = login.slice(login.lastIndexOf("{isSignUp && (", start), login.indexOf("<div className=\"mt-6 text-center\">", start));
  assert.doesNotMatch(block, /—|!/);
  const callback = read("../src/routes/auth.callback.tsx");
  assert.doesNotMatch(callback, /—/);
  const messages = [
    "Data dari PDF belum tersimpan. Coba simpan lagi. Bila tetap gagal, muat ulang halaman Profil lalu impor ulang PDF LinkedIn.",
    "Sebagian data impor belum tersimpan. Coba simpan lagi, lalu cek koneksi internetmu.",
    "Draf AI belum bisa dibuat. Cek sisa kuota draf dan kelengkapan profilmu, lalu coba lagi.",
    "Daftar tunggu belum bisa dimuat. Muat ulang halaman, lalu coba lagi. Rincian: ",
  ];
  for (const m of messages) assert.doesNotMatch(m, /—|!/, m);
});
