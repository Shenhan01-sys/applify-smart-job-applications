import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REMINDER_DISMISSED_KEY,
  WELCOME_CV_LINE,
  WELCOME_NO_SEND_LINE,
  WELCOME_SEEN_KEY,
  browserStore,
  readFlag,
  welcomeMode,
  writeFlag,
  type FlagStore,
} from "../src/lib/profileWelcome.ts";
import { TITLE_FIELD_HINT, TITLE_FIELD_LABEL, TITLE_FIELD_PLACEHOLDER, TITLE_MISSING_MESSAGE, profileGaps, saveFailureMessage, saveHintFor } from "../src/lib/profileForms.ts";
import { applyBlockers } from "../src/lib/onboarding.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const PROFILE = "../src/routes/profile.tsx";

function memoryStore(): FlagStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

// ---- ON-03 ----

test("ON-03: kolom jabatan berlabel ramah lulusan baru dan wajib, sama dengan syarat draf AI", () => {
  assert.equal(TITLE_FIELD_LABEL, "Jabatan terakhir atau bidang yang kamu tuju");
  assert.match(TITLE_FIELD_PLACEHOLDER, /Fresh graduate Akuntansi/);
  assert.match(TITLE_FIELD_PLACEHOLDER, /Staf Admin/);
  // Petunjuk tidak lagi bilang "Disarankan": jabatan memang syarat draf AI (applyBlockers).
  assert.doesNotMatch(TITLE_FIELD_HINT, /Disarankan/);
  assert.match(TITLE_FIELD_HINT, /Wajib/);
  assert.match(TITLE_FIELD_HINT, /Lulusan baru boleh menulis bidang yang dituju/);
  const empty = { full_name: "Budi", current_title: "  ", skills: 2, experiences: 0, education: 1 };
  assert.deepEqual(applyBlockers(empty), [TITLE_MISSING_MESSAGE]);
  assert.deepEqual(profileGaps(empty).missing, [TITLE_MISSING_MESSAGE]);
  const src = read(PROFILE);
  assert.match(src, /field\.key === 'full_name' \|\| field\.key === 'current_title'\) && <span className="text-red-600"/);
  assert.match(src, /aria-required=\{field\.key === 'full_name' \|\| field\.key === 'current_title' \? true : undefined\}/);
  assert.match(src, /label: TITLE_FIELD_LABEL/);
  assert.doesNotMatch(src, /Posisi \/ Jabatan Terakhir/);
});

// ---- ON-14 ----

test("ON-14: stepper menampilkan nama langkah, 'Langkah N dari 5: Nama', dan langkah 4 opsional", () => {
  const src = read(PROFILE);
  assert.match(src, /\{ id: 4, label: "Preferensi", icon: Target, optional: true \}/);
  assert.match(src, /\{ id: 5, label: "Periksa", icon: CheckCircle2, optional: false \}/);
  assert.doesNotMatch(src, /label: "Review"/);
  // Nama langkah tampil sebagai teks di bawah ikon, bukan hanya `title`.
  assert.match(src, /\{s\.label\}\s*\n\s*\{s\.optional && <span className="block font-normal">opsional<\/span>\}/);
  assert.doesNotMatch(src, /title=\{s\.label\}/);
  assert.match(src, /Langkah \{step\} dari \{steps\.length\}: \{steps\[step - 1\]\.label\}/);
  assert.match(src, /Opsional, boleh dilewati/);
  assert.match(src, /\{saveHintFor\(step\)\}/);
});

test("ON-14: keterangan tombol Simpan menjelaskan apa yang disimpan di tiap langkah", () => {
  for (const step of [2, 3]) {
    assert.match(saveHintFor(step), /tersimpan lewat tombol Simpan di kartunya/);
    assert.match(saveHintFor(step), /data dasar dan preferensi/);
  }
  assert.match(saveHintFor(4), /opsional/);
  assert.match(saveHintFor(1), /data dasar dan preferensi/);
  assert.match(saveHintFor(5), /Simpan & Selesai/);
  for (let i = 1; i <= 5; i++) assert.doesNotMatch(saveHintFor(i), /—|!/);
});

// ---- ON-04 ----

test("ON-04: kartu unggah CV muncul sebelum kartu impor LinkedIn dan sebelum form; impor LinkedIn jadi opsi kedua", () => {
  const src = read(PROFILE);
  const resume = src.indexOf("<ResumeCard userId={user.id}");
  const linkedin = src.indexOf("<LinkedInImportCard");
  const grid = src.indexOf('<div className="grid gap-6 lg:grid-cols-[1fr_1fr]">');
  assert.ok(resume > 0 && linkedin > resume && grid > linkedin, "urutan: CV, impor LinkedIn, lalu form");
  assert.equal((src.match(/<ResumeCard userId=/g) ?? []).length, 1, "satu titik unggah CV");
  assert.match(src, /<LinkedInImportCard\s+ref=\{importRef\}\s+secondary\b/);
  const card = read("../src/components/profile/LinkedInImportCard.tsx");
  assert.match(card, /Opsi lain: /);
  assert.match(card, /secondary\?: boolean/);
  // Pratinjau CV dilipat di ponsel dan selalu terbuka di layar lebar.
  assert.match(src, /className=\{previewOpen \? "" : "hidden lg:block"\}/);
  assert.match(src, /className="lg:hidden min-h-11/);
  assert.match(src, /aria-expanded=\{previewOpen\}/);
});

test("ON-04: banner sambutan menyebut unggah CV PDF dan tidak ada lamaran terkirim sebelum Setujui", () => {
  assert.equal(WELCOME_CV_LINE.startsWith("Unggah CV PDF untuk mengisi profil otomatis"), true);
  assert.match(WELCOME_NO_SEND_LINE, /Tidak ada lamaran yang dikirim sebelum kamu menekan Setujui/);
  const src = read(PROFILE);
  assert.match(src, /\{WELCOME_CV_LINE\}/);
  assert.match(src, /\{WELCOME_NO_SEND_LINE\}/);
});

// ---- ON-17 ----

test("ON-17: banner penuh hanya sekali; sesudahnya pengingat ringkas selama profil belum lengkap", () => {
  const base = { welcomeParam: true, seen: false, reminderDismissed: false, incomplete: true };
  assert.equal(welcomeMode(base), "full");
  assert.equal(welcomeMode({ ...base, seen: true }), "reminder");
  assert.equal(welcomeMode({ ...base, seen: true, reminderDismissed: true }), "none");
  assert.equal(welcomeMode({ ...base, seen: true, incomplete: false }), "none");
  // Tanpa ?welcome=1: tidak pernah banner penuh, hanya pengingat bila belum lengkap.
  assert.equal(welcomeMode({ ...base, welcomeParam: false }), "reminder");
  assert.equal(welcomeMode({ ...base, welcomeParam: false, incomplete: false }), "none");
  // Pertama kali dengan profil sudah lengkap tetap boleh menyapa sekali.
  assert.equal(welcomeMode({ ...base, incomplete: false }), "full");
});

test("ON-17: status disimpan di localStorage dengan penjaga galat", () => {
  const store = memoryStore();
  assert.equal(readFlag(store, WELCOME_SEEN_KEY), false);
  writeFlag(store, WELCOME_SEEN_KEY);
  assert.equal(readFlag(store, WELCOME_SEEN_KEY), true);
  assert.equal(readFlag(store, REMINDER_DISMISSED_KEY), false);
  // Penyimpanan yang melempar galat (mode privat, kuota penuh) tidak merusak halaman.
  const broken: FlagStore = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } };
  assert.equal(readFlag(broken, WELCOME_SEEN_KEY), false);
  assert.doesNotThrow(() => writeFlag(broken, WELCOME_SEEN_KEY));
  assert.equal(readFlag(null, WELCOME_SEEN_KEY), false);
  assert.doesNotThrow(() => writeFlag(null, WELCOME_SEEN_KEY));
  // Tanpa window (node): tidak ada penyimpanan, bukan galat.
  assert.equal(browserStore(), null);
});

test("ON-17: profile.tsx menulis status saat banner tampil dan saat ditutup, dan pengingat bisa ditutup", () => {
  const src = read(PROFILE);
  assert.match(src, /writeFlag\(browserStore\(\), WELCOME_SEEN_KEY\)/);
  assert.match(src, /writeFlag\(browserStore\(\), REMINDER_DISMISSED_KEY\)/);
  assert.match(src, /data-testid="profile-reminder"/);
  assert.match(src, /REMINDER_HEADING/);
  assert.doesNotMatch(src, /Selamat datang di Applify/, "teks sambutan hanya ada di profileWelcome.ts");
});

// ---- ON-19, ON-20, ON-21 ----

test("ON-19: tombol Unduh PDF, Cek ATS, dan Mode Anonim yang belum berfungsi tidak tampil di Profil", () => {
  const src = read(PROFILE);
  for (const gone of ["Unduh PDF", "Cek ATS", "Mode Anonim", "segera hadir"]) assert.ok(!src.includes(gone), gone);
});

test("ON-20: galat simpan menjelaskan sebab dan langkah berikutnya", () => {
  const plain = saveFailureMessage(new Error(""));
  assert.match(plain, /Koneksimu mungkin terputus atau server sedang sibuk/);
  assert.match(plain, /Isianmu masih ada/);
  assert.match(plain, /Periksa koneksi internetmu, lalu tekan Simpan lagi/);
  assert.match(saveFailureMessage(undefined), /Periksa koneksi internetmu/);
  const withDetail = saveFailureMessage({ message: "duplicate key value." });
  assert.match(withDetail, /^Belum tersimpan: duplicate key value\. Isianmu masih ada/);
  assert.doesNotMatch(withDetail, /\.\./);
  for (const m of [plain, withDetail]) assert.doesNotMatch(m, /—|!/);
  const editors = read("../src/components/profile/ProfileEditors.tsx");
  assert.doesNotMatch(editors, /"Gagal menyimpan\. Coba lagi\."/);
  assert.equal((editors.match(/setFormError\(saveFailureMessage\(e\)\)/g) ?? []).length, 4);
});

test("ON-21: istilah di Profil sama dengan menu: Ke Beranda dan Periksa", () => {
  const src = read(PROFILE);
  assert.match(src, /Ke Beranda/);
  assert.doesNotMatch(src, /Ke dashboard/);
  assert.doesNotMatch(src, /label: "Review"/);
  assert.doesNotMatch(src, /Posisi belum diisi/);
});

test("teks UI baru tanpa em dash dan tanpa tanda seru", () => {
  const lines = [WELCOME_CV_LINE, WELCOME_NO_SEND_LINE, TITLE_FIELD_LABEL, TITLE_FIELD_HINT, TITLE_FIELD_PLACEHOLDER, TITLE_MISSING_MESSAGE];
  for (const l of lines) assert.doesNotMatch(l, /—|!/, l);
});
