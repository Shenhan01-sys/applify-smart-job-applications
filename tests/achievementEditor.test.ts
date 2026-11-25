import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_DESCRIPTION_MAX,
  ACHIEVEMENT_ISSUER_MAX,
  ACHIEVEMENT_TITLE_MAX,
  achievementCategoryLabel,
  achievementDetails,
  achievementToForm,
  checkAchievement,
  emptyAchievementForm,
  sortAchievements,
  validateAchievement,
  validateAchievementForm,
  type AchievementForm,
} from "../src/lib/profileForms.ts";
import * as importLib from "../src/lib/linkedinImport.ts";

// Editor penghargaan dan publikasi (tabel achievements). Logika murni dites langsung; bagian React dites dengan
// membaca teks sumber, seperti tes lain di folder ini (suite ini tanpa DOM).
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const NOW = new Date("2026-11-20T10:00:00Z");

const okForm = (over: Partial<AchievementForm> = {}): AchievementForm => ({
  ...emptyAchievementForm(),
  title: "Juara 1 Lomba Karya Tulis",
  issuer: "Kemendikbudristek",
  achievement_date: "2025-08",
  description: "Kategori mahasiswa.",
  ...over,
});

// ---------------------------------------------------------------------------------------------
// validator
// ---------------------------------------------------------------------------------------------

test("validateAchievementForm: formulir sah menjadi baris database (tanggal YYYY-MM-01, kosong menjadi null)", () => {
  const r = validateAchievementForm(okForm(), NOW);
  assert.ok(r.ok);
  assert.deepEqual(r.row, {
    title: "Juara 1 Lomba Karya Tulis",
    category: "award",
    issuer: "Kemendikbudristek",
    achievement_date: "2025-08-01",
    description: "Kategori mahasiswa.",
    is_featured: false,
  });
  const bare = validateAchievementForm(okForm({ title: "  Publikasi X  ", category: "publication", issuer: "", achievement_date: "", description: "  " }), NOW);
  assert.ok(bare.ok);
  assert.deepEqual(bare.row, { title: "Publikasi X", category: "publication", issuer: null, achievement_date: null, description: null, is_featured: false });
});

test("validateAchievementForm: tiga pilihan jenis diterima, selain itu ditolak", () => {
  assert.deepEqual(ACHIEVEMENT_CATEGORIES.map((c) => [c.value, c.label]), [["award", "Penghargaan"], ["publication", "Publikasi"], ["other", "Lainnya"]]);
  for (const c of ACHIEVEMENT_CATEGORIES) assert.ok(validateAchievementForm(okForm({ category: c.value }), NOW).ok, c.value);
  const bad = validateAchievementForm(okForm({ category: "patent" }), NOW);
  assert.ok(!bad.ok);
  assert.match(bad.errors.category ?? "", /penghargaan, publikasi, atau lainnya/);
});

test("validateAchievementForm: galat per kolom untuk judul, penyelenggara, deskripsi, dan tanggal", () => {
  const r = validateAchievementForm(
    okForm({
      title: "",
      issuer: "i".repeat(ACHIEVEMENT_ISSUER_MAX + 1),
      description: "d".repeat(ACHIEVEMENT_DESCRIPTION_MAX + 1),
      achievement_date: "2027-01",
    }),
    NOW,
  );
  assert.ok(!r.ok);
  assert.match(r.errors.title ?? "", /Judul kosong/);
  assert.match(r.errors.issuer ?? "", /maksimal 120/);
  assert.match(r.errors.description ?? "", /maksimal 2000/);
  assert.match(r.errors.achievement_date ?? "", /masa depan/);
  assert.equal(r.errors.category, undefined);

  assert.match((validateAchievementForm(okForm({ title: "x".repeat(ACHIEVEMENT_TITLE_MAX + 1) }), NOW) as any).errors.title, /maksimal 200/);
  assert.ok(validateAchievementForm(okForm({ title: "x".repeat(ACHIEVEMENT_TITLE_MAX) }), NOW).ok);
  assert.match((validateAchievementForm(okForm({ achievement_date: "1949-12" }), NOW) as any).errors.achievement_date, /sebelum 1950/);
  assert.match((validateAchievementForm(okForm({ achievement_date: "bulan lalu" }), NOW) as any).errors.achievement_date, /tidak valid/);
  assert.ok(validateAchievementForm(okForm({ achievement_date: "2026-11" }), NOW).ok, "bulan ini sah");
});

test("Satu sumber aturan: impor PDF LinkedIn dan editor memakai fungsi yang sama", () => {
  // linkedinImport mengekspor ulang validator dan batas dari profileForms, bukan salinan.
  assert.equal(importLib.validateAchievement, validateAchievement);
  assert.equal(importLib.ACHIEVEMENT_TITLE_MAX, ACHIEVEMENT_TITLE_MAX);
  assert.equal(importLib.ACHIEVEMENT_ISSUER_MAX, ACHIEVEMENT_ISSUER_MAX);
  assert.equal(importLib.ACHIEVEMENT_DESCRIPTION_MAX, ACHIEVEMENT_DESCRIPTION_MAX);
  // Impor tetap hanya menerima award dan publication; "other" khusus editor.
  assert.equal(validateAchievement({ title: "x", category: "other", issuer: null, achievement_date: null, description: null }, NOW).ok, false);
  assert.equal(checkAchievement({ title: "x", category: "other", issuer: null, achievement_date: null, description: null }, NOW, ["award", "publication", "other"]).ok, true);
  const src = read("../src/lib/linkedinImport.ts");
  assert.doesNotMatch(src, /export function validateAchievement/, "validator tidak boleh ditulis dua kali");
});

// ---------------------------------------------------------------------------------------------
// baris lama dan pengurutan
// ---------------------------------------------------------------------------------------------

test("achievementToForm: nilai category lama menjadi Lainnya dan tetap dipertahankan saat disimpan", () => {
  const legacy = achievementToForm({ title: "Open Source Contributor", category: "community", issuer: null, achievement_date: null, description: "x", is_featured: true });
  assert.equal(legacy.category, "other");
  assert.equal(legacy.legacy_category, "community");
  assert.equal(legacy.is_featured, true);
  const saved = validateAchievementForm(legacy, NOW);
  assert.ok(saved.ok);
  assert.equal(saved.row.category, "community", "menyimpan tanpa mengganti jenis tidak mengubah nilai lama");
  assert.equal(saved.row.is_featured, true, "tanda unggulan tidak hilang saat diubah");
  // Bila pengguna memilih jenis lain, nilai lama tidak dipakai lagi.
  const moved = validateAchievementForm({ ...legacy, category: "publication" }, NOW);
  assert.ok(moved.ok);
  assert.equal(moved.row.category, "publication");

  const award = achievementToForm({ title: "A", category: "award", issuer: "I", achievement_date: "2024-03-01", description: null });
  assert.deepEqual(award, { title: "A", category: "award", issuer: "I", achievement_date: "2024-03", description: "", is_featured: false, legacy_category: "" });
  assert.equal(achievementToForm({ title: "B", category: null }).category, "other");
  assert.equal(achievementToForm({ title: "B", category: null }).legacy_category, "");
});

test("achievementCategoryLabel dan sortAchievements: unggulan dulu, lalu terbaru, tanpa tanggal terakhir", () => {
  assert.equal(achievementCategoryLabel("award"), "Penghargaan");
  assert.equal(achievementCategoryLabel("publication"), "Publikasi");
  for (const v of ["other", "community", "competition", null, undefined, ""]) assert.equal(achievementCategoryLabel(v), "Lainnya");

  const items = [
    { title: "Tanpa tanggal", achievement_date: null },
    { title: "Lama", achievement_date: "2019-05-01" },
    { title: "Baru", achievement_date: "2025-05-01" },
    { title: "Unggulan lama", achievement_date: "2018-01-01", is_featured: true },
  ];
  assert.deepEqual(sortAchievements(items).map((x) => x.title), ["Unggulan lama", "Baru", "Lama", "Tanpa tanggal"]);
  assert.deepEqual(items.map((x) => x.title), ["Tanpa tanggal", "Lama", "Baru", "Unggulan lama"], "tidak mengubah urutan masukan");
});

// ---------------------------------------------------------------------------------------------
// pengaitan React
// ---------------------------------------------------------------------------------------------

test("Editor: daftar, tambah, ubah, hapus dengan konfirmasi, label Indonesia, pilihan jenis, bulan dan tahun", () => {
  const src = read("../src/components/profile/ProfileEditors.tsx");
  const editor = src.slice(src.indexOf("export function AchievementEditor"));
  assert.match(editor, /validateAchievementForm\(form, now\)/);
  assert.match(editor, /onSave\(res\.row, editing === "new" \? null : editing\)/);
  assert.match(editor, /sortAchievements\(items\)/);
  assert.match(editor, /<DeleteButton onConfirm=\{\(\) => remove\(a\.id\)\}/, "hapus lewat tombol konfirmasi yang sama dengan editor lain");
  assert.match(editor, /achievementToForm\(a\)/);
  assert.match(editor, /ACHIEVEMENT_CATEGORIES\.map\(\(c\) => <option key=\{c\.value\} value=\{c\.value\}>\{c\.label\}<\/option>\)/);
  assert.match(editor, /type="month"/);
  for (const label of ["Judul", "Jenis", "Penyelenggara atau penerbit (opsional)", "Bulan dan tahun (opsional)", "Deskripsi (opsional)", "Tambah Penghargaan atau Publikasi", "Belum ada penghargaan atau publikasi"]) {
    assert.ok(editor.includes(label), label);
  }
  assert.doesNotMatch(editor, /—|–/, "tanpa em dash atau en dash di teks antarmuka");
  // aturan hanya dari profileForms.ts, tidak ditulis ulang di komponen
  assert.doesNotMatch(editor, /maksimal \d+ karakter/i);
});

test("Profil: editor dipasang di langkah 3 dan menyimpan lewat profileService (mode demo tidak menyentuh database)", () => {
  const src = read("../src/routes/profile.tsx");
  assert.match(src, /import \{[^}]*AchievementEditor[^}]*\} from "@\/components\/profile\/ProfileEditors"/);
  const step3 = src.slice(src.indexOf("{step === 3 && ("), src.indexOf("{step === 4 && ("));
  assert.match(step3, /Penghargaan dan Publikasi/);
  assert.match(step3, /<AchievementEditor items=\{achievements\} onSave=\{saveAchievement\} onDelete=\{deleteAchievement\}/);
  const save = src.slice(src.indexOf("const saveAchievement"), src.indexOf("const deleteAchievement"));
  assert.match(save, /isMockMode\(\)/);
  assert.match(save, /profileService\.updateAchievement\(id, row\)/);
  assert.match(save, /profileService\.createAchievement\(row\)/);
  assert.match(save, /if \(res\.error\) throw new Error\(res\.error\.message\)/);
  assert.match(save, /setAchievements\(/);
  const del = src.slice(src.indexOf("const deleteAchievement"), src.indexOf("const saveSkill"));
  assert.match(del, /profileService\.deleteAchievement\(id\)/);
  assert.match(del, /setAchievements\(\(prev\) => prev\.filter/);
  assert.match(src, /serta penghargaan dan publikasi\. Setiap entri langsung tersimpan saat kamu menekan Simpan di kartunya/);
});

test("achievementDetails: keterangan ikut ditampilkan, NULL atau spasi saja menjadi kosong", () => {
  const full = achievementDetails({ category: "award", issuer: " Kemendikbudristek ", achievement_date: "2025-08-01", description: "  Kategori mahasiswa.  " });
  assert.equal(full.description, "Kategori mahasiswa.");
  assert.match(full.meta, /^Penghargaan · Kemendikbudristek · /);
  for (const d of [null, undefined, "", "   \n", 5]) assert.equal(achievementDetails({ category: "award", description: d }).description, "");
  assert.equal(achievementDetails({ category: null, issuer: null, achievement_date: null, description: "x" }).meta, "Lainnya", "baris lama tanpa jenis tetap punya teks");
});

test("Pratinjau CV dan daftar langkah 3 memakai achievementDetails: keterangan tidak lagi hilang di pratinjau", () => {
  const editor = read("../src/components/profile/ProfileEditors.tsx");
  assert.match(editor.slice(editor.indexOf("export function AchievementEditor")), /const \{ meta, description \} = achievementDetails\(a\)/);
  const src = read("../src/routes/profile.tsx");
  const preview = src.slice(src.indexOf("{/* Achievements */}"), src.indexOf("{/* Blind Mode Notice */}"));
  assert.match(preview, /const \{ meta, description \} = achievementDetails\(a\)/);
  assert.match(preview, /\{description && <p [^>]*>\{description\}<\/p>\}/);
});

test("Pratinjau CV: penghargaan dan publikasi tampil, terurut, dengan jenis, penyelenggara, bulan, dan keterangan", () => {
  const src = read("../src/routes/profile.tsx");
  const preview = src.slice(src.indexOf("{/* Achievements */}"), src.indexOf("{/* Blind Mode Notice */}"));
  assert.match(preview, /Penghargaan dan Publikasi/);
  assert.match(preview, /Belum ada penghargaan atau publikasi/);
  assert.match(preview, /sortAchievements\(achievements\)\.map/);
  assert.match(preview, /<p className="text-muted-foreground">\{meta\}<\/p>/);
  // letaknya di dalam panel Pratinjau CV, sesudah Sertifikasi
  assert.ok(src.indexOf("{/* Certifications */}") < src.indexOf("{/* Achievements */}"));
  assert.ok(src.indexOf("Pratinjau CV") < src.indexOf("{/* Achievements */}"));
});

test("Kartu impor: kalimat 'halaman Profil belum punya daftar' sudah dihapus", () => {
  const card = read("../src/components/profile/LinkedInImportCard.tsx");
  assert.doesNotMatch(card, /belum punya daftar/);
  assert.doesNotMatch(card, /halaman Profil belum/);
  assert.match(card, /key === "skills"/, "catatan skill tetap ada");
  const page = read("../src/routes/profile.tsx");
  assert.doesNotMatch(page, /belum punya editor/);
});
