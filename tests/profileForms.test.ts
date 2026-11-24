import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FINISHED_COMPLETE_HEADING,
  FINISHED_INCOMPLETE_HEADING,
  PROFILE_COLUMNS,
  buildProfileRow,
  educationToForm,
  emptyEducationForm,
  emptyExperienceForm,
  emptySkillForm,
  experienceToForm,
  finishedKind,
  formatMonthYear,
  normalizeAchievements,
  parseDecimal,
  parseYear,
  profileGaps,
  skillToForm,
  sortEducation,
  sortExperiences,
  sortSkills,
  splitLines,
  splitList,
  toDbDate,
  toMonthInput,
  validateEducation,
  validateExperience,
  validateSkill,
  type EducationForm,
  type ExperienceForm,
  type SkillForm,
} from "../src/lib/profileForms.ts";

const NOW = new Date("2026-11-18T08:00:00.000Z");
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

/** Column names of one table in database/schema.sql (read only; the file is the source of truth). */
function schemaColumns(table: string): Set<string> {
  const sql = read("../../database/schema.sql");
  const m = new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`).exec(sql);
  assert.ok(m, `tabel ${table} tidak ditemukan di schema.sql`);
  const cols = new Set<string>();
  for (const line of m![1].split("\n")) {
    const c = /^\s{2}([a-z_]+)\s+(?:uuid|text|integer|numeric|boolean|jsonb|date|timestamptz)\b/.exec(line);
    if (c) cols.add(c[1]);
  }
  return cols;
}

const okExperience = (over: Partial<ExperienceForm> = {}): ExperienceForm => ({
  ...emptyExperienceForm(),
  company_name: "PT Maju Jaya",
  role_title: "Staf Administrasi",
  start_date: "2023-06",
  end_date: "2024-08",
  ...over,
});

const okEducation = (over: Partial<EducationForm> = {}): EducationForm => ({
  ...emptyEducationForm(),
  institution: "Universitas Kristen Duta Wacana",
  degree: "S1",
  field_of_study: "Sistem Informasi",
  start_year: "2022",
  end_year: "2026",
  gpa: "3,75",
  ...over,
});

const okSkill = (over: Partial<SkillForm> = {}): SkillForm => ({ ...emptySkillForm(), name: "Microsoft Excel", ...over });

// ---- helpers ----

test("parseDecimal: koma dan titik sama; teks, kosong, dan Infinity ditolak", () => {
  assert.equal(parseDecimal("3,75"), 3.75);
  assert.equal(parseDecimal("3.75"), 3.75);
  assert.equal(parseDecimal(" 4 "), 4);
  assert.equal(parseDecimal(""), undefined);
  assert.equal(parseDecimal("abc"), undefined);
  assert.equal(parseDecimal("-1"), undefined);
  assert.equal(parseDecimal(Infinity), undefined);
});

test("parseYear: hanya empat digit", () => {
  assert.equal(parseYear("2024"), 2024);
  assert.equal(parseYear("24"), undefined);
  assert.equal(parseYear("20245"), undefined);
  assert.equal(parseYear(""), undefined);
});

test("tanggal: bulan menjadi tanggal 1, tanggal mustahil ditolak, kembali ke input bulan", () => {
  assert.equal(toDbDate("2023-06"), "2023-06-01");
  assert.equal(toDbDate("2023-06-15"), "2023-06-01");
  assert.equal(toDbDate("2023-13"), undefined);
  assert.equal(toDbDate("2023-02-31"), undefined);
  assert.equal(toDbDate("bulan lalu"), undefined);
  assert.equal(toMonthInput("2023-06-01"), "2023-06");
  assert.equal(toMonthInput(null), "");
  assert.equal(formatMonthYear("2023-05-01"), "Mei 2023");
  assert.equal(formatMonthYear(undefined), "");
});

test("splitLines dan splitList: pangkas, buang kosong dan duplikat tanpa peduli huruf besar", () => {
  assert.deepEqual(splitLines(" a \n\nA\nb\r\nc "), ["a", "b", "c"]);
  assert.deepEqual(splitList("Excel, excel ; SQL\nPython,, "), ["Excel", "SQL", "Python"]);
});

test("normalizeAchievements: string, objek {title, detail} dari seed, JSON teks, dan sampah", () => {
  assert.deepEqual(normalizeAchievements(["Naik jabatan", " "]), ["Naik jabatan"]);
  assert.deepEqual(normalizeAchievements([{ title: "Target tercapai", detail: "Kontribusi positif tim" }]), ["Target tercapai: Kontribusi positif tim"]);
  assert.deepEqual(normalizeAchievements('["a","b"]'), ["a", "b"]);
  assert.deepEqual(normalizeAchievements(null), []);
  assert.deepEqual(normalizeAchievements("bukan json"), []);
  assert.deepEqual(normalizeAchievements([{ foo: 1 }, 5]), []);
});

// ---- pengalaman kerja ----

test("pengalaman: isian sah menjadi baris yang sesuai kolom work_experiences", () => {
  const r = validateExperience(okExperience({ description: " Mengelola arsip ", achievements: "A\nA\nB", skills_used: "Excel, excel, SQL" }), NOW);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.row, {
    company_name: "PT Maju Jaya",
    role_title: "Staf Administrasi",
    employment_type: "full-time",
    location_type: "on-site",
    start_date: "2023-06-01",
    end_date: "2024-08-01",
    is_current: false,
    description: "Mengelola arsip",
    achievements: ["A", "B"],
    skills_used: ["Excel", "SQL"],
  });
});

test("pengalaman: perusahaan, posisi, dan tanggal mulai wajib; pesan galat per kolom", () => {
  const r = validateExperience({ ...emptyExperienceForm() }, NOW);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.company_name);
  assert.ok(r.errors.role_title);
  assert.ok(r.errors.start_date);
  assert.ok(r.errors.end_date);
});

test("pengalaman: masih bekerja = tanpa tanggal selesai; selesai sebelum mulai ditolak; tanggal masa depan ditolak", () => {
  const cur = validateExperience(okExperience({ is_current: true, end_date: "2020-01" }), NOW);
  assert.equal(cur.ok, true);
  if (cur.ok) {
    assert.equal(cur.row.end_date, null);
    assert.equal(cur.row.is_current, true);
  }
  const before = validateExperience(okExperience({ start_date: "2024-08", end_date: "2023-06" }), NOW);
  assert.equal(before.ok, false);
  if (!before.ok) assert.match(before.errors.end_date!, /sebelum tanggal mulai/);
  const future = validateExperience(okExperience({ start_date: "2027-01", is_current: true }), NOW);
  assert.equal(future.ok, false);
  if (!future.ok) assert.match(future.errors.start_date!, /masa depan/);
  const futureEnd = validateExperience(okExperience({ end_date: "2027-03" }), NOW);
  assert.equal(futureEnd.ok, false);
  // bulan berjalan masih boleh
  assert.equal(validateExperience(okExperience({ start_date: "2026-11", end_date: "2026-11" }), NOW).ok, true);
});

test("pengalaman: batas panjang dan jumlah (nama, deskripsi, pencapaian, skill)", () => {
  const long = "x".repeat(121);
  const r = validateExperience(okExperience({ company_name: long, role_title: long, description: "y".repeat(2001), achievements: Array.from({ length: 11 }, (_, i) => `p${i}`).join("\n"), skills_used: Array.from({ length: 21 }, (_, i) => `s${i}`).join(",") }), NOW);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.company_name && r.errors.role_title && r.errors.description && r.errors.achievements && r.errors.skills_used);
});

test("pengalaman: jenis pekerjaan dan model kerja di luar daftar ditolak", () => {
  const r = validateExperience(okExperience({ employment_type: "hacker", location_type: "bulan" }), NOW);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.employment_type && r.errors.location_type);
});

test("pengalaman: baris dari basis data (termasuk pencapaian objek seed) bisa dibuka ke formulir lalu disimpan ulang", () => {
  const row = {
    company_name: "Kredivo", role_title: "Analis", employment_type: "full-time", location_type: "on-site",
    start_date: "2022-03-01", end_date: null, is_current: true, description: "Bekerja sebagai Analis.",
    achievements: [{ title: "Target tercapai", detail: "Kontribusi positif tim" }], skills_used: ["SQL", "Excel"],
  };
  const form = experienceToForm(row);
  assert.equal(form.start_date, "2022-03");
  assert.equal(form.end_date, "");
  assert.equal(form.achievements, "Target tercapai: Kontribusi positif tim");
  const back = validateExperience(form, NOW);
  assert.equal(back.ok, true);
  if (back.ok) {
    assert.equal(back.row.start_date, "2022-03-01");
    assert.equal(back.row.is_current, true);
    assert.deepEqual(back.row.skills_used, ["SQL", "Excel"]);
  }
});

test("pengalaman: urut terbaru dulu; yang masih berjalan lebih dulu pada tanggal mulai sama", () => {
  const sorted = sortExperiences([
    { id: "a", start_date: "2020-01-01", is_current: false },
    { id: "b", start_date: "2022-05-01", is_current: false },
    { id: "c", start_date: "2022-05-01", is_current: true },
  ]);
  assert.deepEqual(sorted.map((x) => x.id), ["c", "b", "a"]);
});

// ---- pendidikan ----

test("pendidikan: isian sah, IPK memakai koma, skala bawaan 4", () => {
  const r = validateEducation(okEducation(), NOW);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.row, {
    institution: "Universitas Kristen Duta Wacana",
    degree: "S1",
    field_of_study: "Sistem Informasi",
    start_year: 2022,
    end_year: 2026,
    is_current: false,
    gpa: 3.75,
    max_gpa: 4,
    description: null,
  });
});

test("pendidikan: institusi, jenjang, tahun masuk wajib; tahun harus empat digit", () => {
  const r = validateEducation({ ...emptyEducationForm() }, NOW);
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.institution && r.errors.degree && r.errors.start_year && r.errors.end_year);
  const bad = validateEducation(okEducation({ start_year: "22", end_year: "abcd" }), NOW);
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.ok(bad.errors.start_year && bad.errors.end_year);
});

test("pendidikan: lulus sebelum masuk, lulus terlalu jauh, masuk di masa depan ditolak; masih menempuh tanpa tahun lulus", () => {
  const a = validateEducation(okEducation({ start_year: "2024", end_year: "2022" }), NOW);
  assert.equal(a.ok, false);
  if (!a.ok) assert.match(a.errors.end_year!, /sebelum tahun masuk/);
  const b = validateEducation(okEducation({ end_year: "2040" }), NOW);
  assert.equal(b.ok, false);
  const c = validateEducation(okEducation({ start_year: "2030", end_year: "2031" }), NOW);
  assert.equal(c.ok, false);
  if (!c.ok) assert.ok(c.errors.start_year);
  const cur = validateEducation(okEducation({ is_current: true, end_year: "1999" }), NOW);
  assert.equal(cur.ok, true);
  if (cur.ok) {
    assert.equal(cur.row.end_year, null);
    assert.equal(cur.row.is_current, true);
  }
  // masih menempuh dan lulus 2029 (perkiraan) boleh tanpa centang juga
  assert.equal(validateEducation(okEducation({ end_year: "2029" }), NOW).ok, true);
});

test("pendidikan: IPK di atas skala, bukan angka, atau skala tidak masuk akal ditolak; tanpa IPK = tanpa skala", () => {
  const over = validateEducation(okEducation({ gpa: "4,5" }), NOW);
  assert.equal(over.ok, false);
  if (!over.ok) assert.match(over.errors.gpa!, /skala/);
  assert.equal(validateEducation(okEducation({ gpa: "tiga" }), NOW).ok, false);
  assert.equal(validateEducation(okEducation({ gpa: "3", max_gpa: "0" }), NOW).ok, false);
  assert.equal(validateEducation(okEducation({ gpa: "3", max_gpa: "1000" }), NOW).ok, false);
  const none = validateEducation(okEducation({ gpa: "", max_gpa: "4" }), NOW);
  assert.equal(none.ok, true);
  if (none.ok) assert.deepEqual([none.row.gpa, none.row.max_gpa], [null, null]);
  const ten = validateEducation(okEducation({ gpa: "85", max_gpa: "100" }), NOW);
  assert.equal(ten.ok, true);
});

test("pendidikan: dari baris basis data ke formulir dan kembali; urut tahun masuk terbaru", () => {
  const form = educationToForm({ institution: "UGM", degree: "S1", field_of_study: null, start_year: 2018, end_year: 2022, is_current: false, gpa: 3.4, max_gpa: 4, description: null });
  assert.equal(form.gpa, "3.4");
  assert.equal(form.field_of_study, "");
  assert.equal(validateEducation(form, NOW).ok, true);
  assert.deepEqual(sortEducation([{ start_year: 2010 }, { start_year: 2020 }]).map((x) => x.start_year), [2020, 2010]);
});

// ---- skill ----

test("skill: isian sah; sumber manual, belum terverifikasi, lama pemakaian opsional", () => {
  const r = validateSkill(okSkill({ name: "  Microsoft   Excel ", proficiency_level: "4", years_experience: "2,5" }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(r.row, { name: "Microsoft Excel", category: "technical", proficiency_level: 4, years_experience: 2.5, is_verified: false, source: "manual" });
  const noYears = validateSkill(okSkill());
  assert.equal(noYears.ok && noYears.row.years_experience, null);
});

test("skill: nama wajib dan tidak kembar (tanpa peduli huruf besar), tingkat 1 sampai 5, lama 0 sampai 60", () => {
  assert.equal(validateSkill(okSkill({ name: " " })).ok, false);
  const dup = validateSkill(okSkill({ name: "excel" }), { existing: [{ id: "1", name: "Excel" }] });
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.match(dup.errors.name!, /sudah ada/);
  // mengubah skill yang sama tidak bentrok dengan dirinya
  assert.equal(validateSkill(okSkill({ name: "excel" }), { existing: [{ id: "1", name: "Excel" }], editingId: "1" }).ok, true);
  assert.equal(validateSkill(okSkill({ proficiency_level: "0" })).ok, false);
  assert.equal(validateSkill(okSkill({ proficiency_level: "6" })).ok, false);
  assert.equal(validateSkill(okSkill({ proficiency_level: "2,5" })).ok, false);
  assert.equal(validateSkill(okSkill({ years_experience: "61" })).ok, false);
  assert.equal(validateSkill(okSkill({ years_experience: "abc" })).ok, false);
  assert.equal(validateSkill(okSkill({ category: "sihir" })).ok, false);
  assert.equal(validateSkill(okSkill({ name: "x".repeat(61) })).ok, false);
});

test("skill: batas 50 skill hanya berlaku untuk skill baru; urut tingkat tertinggi lalu nama", () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ id: String(i), name: `S${i}` }));
  assert.equal(validateSkill(okSkill({ name: "Baru" }), { existing: many }).ok, false);
  assert.equal(validateSkill(okSkill({ name: "S1x" }), { existing: many, editingId: "1" }).ok, true);
  const sorted = sortSkills([{ name: "B", proficiency_level: 3 }, { name: "A", proficiency_level: 3 }, { name: "C", proficiency_level: 5 }]);
  assert.deepEqual(sorted.map((x) => x.name), ["C", "A", "B"]);
  assert.equal(skillToForm({ name: "Go", category: null, proficiency_level: 9, years_experience: null }).proficiency_level, "3");
});

// ---- profil dasar ----

test("profil dasar: `email` tidak pernah masuk baris profiles (kolomnya tidak ada) dan URL dicek", () => {
  const base = { full_name: " Budi Uji ", current_title: "", location: "Yogyakarta", experience_years: 0, phone: "+62 812-3456-7890", email: "budi@example.test", linkedin_url: "https://linkedin.com/in/budi", portfolio_url: "" };
  const r = buildProfileRow(base);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal("email" in r.row, false);
  assert.deepEqual(Object.keys(r.row).sort(), [...PROFILE_COLUMNS].sort());
  assert.equal(r.row.full_name, "Budi Uji");
  assert.equal(r.row.current_title, null);

  assert.equal(buildProfileRow({ ...base, full_name: "" }).ok, false);
  assert.equal(buildProfileRow({ ...base, linkedin_url: "javascript:alert(1)" }).ok, false);
  assert.equal(buildProfileRow({ ...base, portfolio_url: "www.situs.com" }).ok, false);
  assert.equal(buildProfileRow({ ...base, phone: "abc" }).ok, false);
  assert.equal(buildProfileRow({ ...base, experience_years: -1 }).ok, false);
  assert.equal(buildProfileRow({ ...base, experience_years: 61 }).ok, false);
});

test("ulasan profil: nama, jabatan, skill menghalangi; pengalaman dan pendidikan hanya saran", () => {
  const empty = profileGaps({ full_name: "", current_title: "", skills: 0, experiences: 0, education: 0 });
  assert.equal(empty.missing.length, 3);
  assert.equal(empty.tips.length, 2);
  const freshGrad = profileGaps({ full_name: "Budi", current_title: "Staf", skills: 3, experiences: 0, education: 1 });
  assert.deepEqual(freshGrad.missing, []);
  assert.equal(freshGrad.tips.length, 1);
});

test("kotak sesudah Simpan & Selesai: hijau hanya bila ulasan tidak menemukan yang kurang (jabatan kosong = kuning)", () => {
  const complete = profileGaps({ full_name: "Budi", current_title: "Staf", skills: 3, experiences: 0, education: 1 });
  assert.equal(finishedKind(complete), "complete");
  const noTitle = profileGaps({ full_name: "Budi", current_title: "  ", skills: 3, experiences: 2, education: 1 });
  assert.deepEqual(noTitle.missing, ["Posisi atau jabatan belum diisi."]);
  assert.equal(finishedKind(noTitle), "incomplete");
  assert.equal(finishedKind(profileGaps({ full_name: "Budi", current_title: "Staf", skills: 0, experiences: 1, education: 1 })), "incomplete");
  assert.notEqual(FINISHED_COMPLETE_HEADING, FINISHED_INCOMPLETE_HEADING);
  assert.match(FINISHED_INCOMPLETE_HEADING, /belum lengkap/);

  const page = read("../src/routes/profile.tsx");
  // Kotak hijau memakai ulasan yang sama dengan langkah Tinjau, dan cabang kuning ada sebelum cabang hijau.
  assert.match(page, /<FinishedNextSteps\s+missing=\{profileGaps\(\{/);
  assert.match(page, /finishedKind\(\{ missing \}\) === "incomplete"/);
  const incomplete = page.indexOf('data-testid="profile-finished-incomplete"');
  const complete2 = page.indexOf('data-testid="profile-finished-complete"');
  assert.ok(incomplete > 0 && complete2 > incomplete);
  assert.match(page.slice(incomplete, complete2), /border-amber-300/);
  assert.doesNotMatch(page.slice(incomplete, complete2), /Cari lowongan|border-green/);
});

// ---- cocok dengan schema.sql dan dengan yang dibaca Edge Function ----

test("kolom yang ditulis editor semuanya ada di schema.sql; `profiles` memang tidak punya kolom email", () => {
  const exp = validateExperience(okExperience(), NOW);
  const edu = validateEducation(okEducation(), NOW);
  const sk = validateSkill(okSkill());
  assert.ok(exp.ok && edu.ok && sk.ok);
  if (!exp.ok || !edu.ok || !sk.ok) return;
  const workCols = schemaColumns("work_experiences");
  const eduCols = schemaColumns("education");
  const skillCols = schemaColumns("user_skills");
  const profileCols = schemaColumns("profiles");
  for (const k of Object.keys(exp.row)) assert.ok(workCols.has(k), `work_experiences.${k}`);
  for (const k of Object.keys(edu.row)) assert.ok(eduCols.has(k), `education.${k}`);
  for (const k of Object.keys(sk.row)) assert.ok(skillCols.has(k), `user_skills.${k}`);
  for (const k of PROFILE_COLUMNS) assert.ok(profileCols.has(k), `profiles.${k}`);
  assert.equal(profileCols.has("email"), false);
});

test("Edge Function generate-application membaca kolom yang kini bisa diisi dari layar profil", () => {
  const fn = read("../supabase/functions/generate-application/index.ts");
  assert.match(fn, /from\("user_skills"\)\.select\("name, proficiency_level"\)/);
  assert.match(fn, /from\("work_experiences"\)/);
  assert.match(fn, /select\("role_title, company_name, description, start_date, end_date"\)/);
  assert.match(fn, /order\("start_date", \{ ascending: false \}\)\.limit\(3\)/);
});

test("halaman profil: contoh data hanya di mode demo, simpan lewat kolom bersaring, editor terpasang", () => {
  const page = read("../src/routes/profile.tsx");
  // 5 daftar (pengalaman, pendidikan, sertifikasi, penghargaan, skill) hanya terisi contoh bila isMockMode()
  assert.equal((page.match(/useState<any\[\]>\(\(\) => \(isMockMode\(\) \? \[\.\.\.mock/g) ?? []).length, 5);
  assert.doesNotMatch(page, /const d = data \|\| mockProfileData/);
  assert.match(page, /buildProfileRow\(formData\)/);
  assert.match(page, /if \(error\) throw error/);
  assert.match(page, /<ExperienceEditor /);
  assert.match(page, /<EducationEditor /);
  assert.match(page, /<SkillsEditor /);
  assert.doesNotMatch(page, /alert\(/);
  // tulis ke tabel lewat profileService, yang menyetel user_id dan dilindungi RLS pemilik
  const svc = read("../src/services/profileService.ts");
  for (const t of ["work_experiences", "education", "user_skills"]) assert.match(svc, new RegExp(`from\\("${t}"\\)\\.insert\\(\\{ \\.\\.\\.data, user_id: user\\.id \\}\\)`));
});

// Uji E2E klik 20 November 2026 (temuan 10): hapus skill langsung berlaku, hapus pendidikan memakai konfirmasi di tempat.
test("temuan 10: hapus skill memakai konfirmasi Hapus/Batal yang sama dengan pendidikan, bukan langsung berlaku", () => {
  const src = read("../src/components/profile/ProfileEditors.tsx");
  const skills = src.slice(src.indexOf("export function SkillsEditor"), src.indexOf("export function AchievementEditor"));
  // satu komponen konfirmasi untuk semua editor
  assert.equal([...src.matchAll(/function DeleteButton\(/g)].length, 1);
  assert.match(skills, /<DeleteButton variant="chip" onConfirm=\{\(\) => remove\(skill\.id\)\} busy=\{busyId === skill\.id\} label=\{`Hapus skill \$\{skill\.name\}`\} \/>/);
  // tidak ada lagi tombol yang memanggil remove() langsung
  assert.doesNotMatch(skills, /onClick=\{\(\) => remove\(/);
  const education = src.slice(src.indexOf("export function EducationEditor"), src.indexOf("export function SkillsEditor"));
  assert.match(education, /<DeleteButton onConfirm=\{\(\) => remove\(edu\.id\)\}/);
  // konfirmasi: ikon membuka pertanyaan, "Hapus" menjalankan, "Batal" membatalkan tanpa menghapus
  const del = src.slice(src.indexOf("export function DeleteButton"), src.indexOf("const labelOf"));
  assert.match(del, /onClick=\{\(\) => setAsking\(true\)\}/);
  assert.match(del, /onClick=\{\(\) => \{ setAsking\(false\); onConfirm\(\); \}\}[^>]*>Hapus<\/button>/);
  assert.match(del, /onClick=\{\(\) => setAsking\(false\)\}[^>]*>Batal<\/button>/);
  // varian kapsul biru: tombol terbaca di atas biru dan spinner saat menghapus
  assert.match(del, /variant\?: "row" \| "chip"/);
  assert.match(del, /busy \? <Loader2/);
});
