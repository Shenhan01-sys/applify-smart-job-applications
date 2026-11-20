import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { validateAchievement } from "../src/lib/linkedinImport.ts";

// Pemeriksaan pengaitan impor PDF LinkedIn yang hidup di komponen React dan layanan (suite ini tanpa DOM, jadi
// membaca teks sumber seperti tes lain di folder ini). Logika murninya dites di linkedinImport.test.ts.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const CARD = "../src/components/profile/LinkedInImportCard.tsx";
const NEW_UI_FILES = [CARD, "../src/lib/linkedinImport.ts", "../src/services/linkedinImportService.ts"];

test("Profil: kartu impor dipasang di halaman, mengisi ulang data lewat getFullProfile, dan dimatikan saat profil gagal dimuat", () => {
  const src = read("../src/routes/profile.tsx");
  assert.match(src, /import LinkedInImportCard from "@\/components\/profile\/LinkedInImportCard"/);
  assert.match(src, /<LinkedInImportCard\b[\s\S]*?userId=\{user\.id\}[\s\S]*?onImported=\{handleImported\}/);
  assert.match(src, /existing=\{\{ basic: formData, experiences: workExps, education: educations, certifications: certs, achievements, skills: userSkills \}\}/);
  // profil yang gagal dimuat tidak boleh dipakai untuk mendeteksi duplikat
  assert.match(src, /disabledReason=\{loadError \?/);
  // sesudah impor: data diambil ulang dari database, ketikan yang belum disimpan tidak tertimpa
  const handler = src.slice(src.indexOf("const handleImported"), src.indexOf("if (loading)"));
  assert.match(handler, /applyProfilePatch\(prev, result\.profilePatch\)/);
  assert.match(handler, /profileService\.getFullProfile\(user!\.id\)/);
  assert.match(handler, /setWorkExps\(full\.workExperiences\)/);
  assert.match(handler, /setAchievements\(full\.achievements\)/, "daftar penghargaan ikut disegarkan agar duplikat impor berikutnya terdeteksi");
  assert.match(handler, /setAchievements\(\(prev\) => \[\.\.\.\(result\.created\.achievements as any\[\]\), \.\.\.prev\]\)/, "mode demo menambah baris di memori");
  assert.match(handler, /setUserSkills\(full\.skills\)/);
  // daftar awal dan sesudah dimuat berasal dari profileService.getFullProfile (tabel achievements), bukan dikarang di halaman
  assert.match(src, /setAchievements\(full\.achievements\)/);
  assert.match(src, /useState<any\[\]>\(\(\) => \(isMockMode\(\) \? \[\.\.\.mockAchievements\] : \[\]\)\)/);
  assert.match(handler, /isMockMode\(\)/, "mode demo tidak menyentuh database");
});

test("Kartu impor: judul, petunjuk Lainnya > Simpan ke PDF, pemilih hanya PDF, dialog Radix dengan centang per item", () => {
  const src = read(CARD);
  assert.match(src, /Impor dari PDF LinkedIn/);
  assert.match(src, /LINKEDIN_PDF_HINT/);
  assert.match(src, /type="file"/);
  assert.match(src, /accept="application\/pdf,\.pdf"/);
  assert.match(src, /from "@\/components\/ui\/dialog"/);
  assert.match(src, /from "@\/components\/ui\/checkbox"/);
  assert.match(src, /Tambahkan ke profil/);
  assert.match(src, /Membaca PDF\.\.\./, "keadaan memuat");
  assert.match(src, /role="alert"/, "galat diumumkan");
  assert.match(src, /Sudah ada/);
  assert.match(src, /Pilih semua/);
  for (const group of ["Profil dasar", "Pengalaman kerja", "Pendidikan", "Sertifikasi", "Penghargaan dan publikasi", "Skill dan bahasa"]) assert.match(src, new RegExp(group));
  // urutan grup di dialog: Sertifikasi, lalu Penghargaan dan publikasi, lalu Skill dan bahasa; kuncinya `achievements`
  assert.match(src, /\{ key: "certifications", title: "Sertifikasi" \},\s*\{ key: "achievements", title: "Penghargaan dan publikasi" \},\s*\{ key: "skills", title: "Skill dan bahasa" \}/);
});

test("Kartu impor: tidak ada yang ditulis sebelum konfirmasi; penulisan hanya dari onConfirm dengan item yang dicentang", () => {
  const src = read(CARD);
  assert.equal(src.match(/commitLinkedInImport\(/g)?.length, 1, "satu-satunya pemanggil penulisan");
  const pick = src.slice(src.indexOf("const onPick"), src.indexOf("const onConfirm"));
  assert.doesNotMatch(pick, /commitLinkedInImport|profileService|upsert|onImported/);
  assert.match(pick, /automationApi\.importLinkedInPdf\(file\)/);
  assert.match(pick, /validateLinkedInPdfFile\(file\)/);
  assert.match(pick, /hasPdfMagic\(/);
  const confirm = src.slice(src.indexOf("const onConfirm"), src.indexOf("const saving"));
  assert.match(confirm, /selectionFromPlan\(plan, selected\)/);
  assert.match(confirm, /commitLinkedInImport\(userId, selection\)/);
  assert.match(confirm, /if \(selectionSize\(selection\) === 0\) return/);
  // dialog tidak bisa ditutup saat menyimpan, dan tombol konfirmasi mati saat tidak ada pilihan
  assert.match(src, /disabled=\{saving \|\| total === 0\}/);
  assert.match(src, /if \(saving\) e\.preventDefault\(\)/);
});

test("API: PDF dikirim mentah ke /api/profile/import/linkedin-pdf dengan token dan Content-Type application/pdf", () => {
  const src = read("../src/services/automationApi.ts");
  const fn = src.slice(src.indexOf("async importLinkedInPdf"), src.indexOf("// Sessions"));
  assert.match(fn, /\/api\/profile\/import\/linkedin-pdf/);
  assert.match(fn, /method: 'POST'/);
  assert.match(fn, /\.\.\.auth, 'Content-Type': 'application\/pdf'/);
  assert.match(fn, /body: file/);
  assert.match(fn, /AbortSignal\.timeout\(LINKEDIN_IMPORT_TIMEOUT_MS\)/);
  assert.match(fn, /mockLinkedInImportPreview/, "mode demo tidak memanggil server");
  assert.match(fn, /parseImportPreview\(body\)/);
});

test("Layanan tulis: memakai CRUD profileService yang ada dan upsert profiles yang sama dengan tombol Simpan", () => {
  const src = read("../src/services/linkedinImportService.ts");
  for (const fn of ["createWorkExperience", "createEducation", "createCertification", "createAchievement", "createSkill"]) assert.match(src, new RegExp(`profileService\\.${fn}\\(row\\)`));
  assert.match(src, /createAchievement: async \(row\) => made\("ach", row\)/, "mode demo tidak menyentuh database");
  assert.match(src, /supabase\.from\("profiles"\)\.upsert\(\{ id: userId, \.\.\.patch, updated_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(src, /isMockMode\(\) \? demoWriter\(userId\) : supabaseWriter\(userId\)/);
  // tidak ada penulisan lain ke tabel profil di luar jalur itu
  assert.doesNotMatch(src, /\.insert\(|\.delete\(|\.update\(/);
});

test("Kontrak dengan backend: alamat, metode, dan Content-Type sama dengan rute di backend", (t) => {
  const route = new URL("../../backend/api/routes/profile-import.ts", import.meta.url);
  const index = new URL("../../backend/api/index.ts", import.meta.url);
  if (!existsSync(route) || !existsSync(index)) return t.skip("folder backend tidak ada di checkout ini");
  const routeSrc = readFileSync(route, "utf8");
  const indexSrc = readFileSync(index, "utf8");
  const prefix = /register\(profileImportRoutes, \{ prefix: '([^']+)' \}\)/.exec(indexSrc)?.[1];
  const path = /app\.post\('([^']+)'/.exec(routeSrc)?.[1];
  assert.ok(prefix && path);
  assert.match(read("../src/services/automationApi.ts"), new RegExp(`\\$\\{apiBase\\(\\)\\}${(prefix + path).replace(/[/]/g, "\\/")}`));
  assert.match(routeSrc, /application\/pdf/);
  // kode galat yang dipetakan frontend ada di backend
  for (const code of ["not_pdf", "empty_file", "file_too_large", "pdf_unreadable", "pdf_no_text", "nothing_found"]) {
    assert.match(read("../../backend/services/linkedin-pdf.ts") + read("../../backend/services/linkedin-import.service.ts") + routeSrc, new RegExp(`'${code}'`), code);
    assert.match(read("../src/lib/linkedinImport.ts"), new RegExp(`case "${code}"`), code);
  }
});

test("Kontrak dengan basis data dan backend: kolom baris achievements ada di schema.sql, nilai category dan judul seksi sama dengan backend", (t) => {
  const schema = new URL("../../database/schema.sql", import.meta.url);
  const backend = new URL("../../backend/services/linkedin-import.ts", import.meta.url);
  if (!existsSync(schema) || !existsSync(backend)) return t.skip("folder database atau backend tidak ada di checkout ini");
  const ddl = /create table if not exists public\.achievements \(([\s\S]*?)\n\);/.exec(readFileSync(schema, "utf8"))?.[1] ?? "";
  const columns = [...ddl.matchAll(/^\s{2}(\w+)\s/gm)].map((m) => m[1]);
  assert.ok(columns.includes("achievement_date") && columns.includes("category"), "tabel achievements terbaca dari schema.sql");
  const v = validateAchievement({ title: "T", category: "award", issuer: "I", achievement_date: "2024-01-01", description: "D" }, new Date("2026-11-20T10:00:00Z"));
  assert.ok(v.ok);
  if (v.ok) for (const key of Object.keys(v.row)) assert.ok(columns.includes(key), `kolom ${key} tidak ada di tabel achievements`);
  // kolom wajib tabel (not null tanpa default) terisi oleh baris: hanya title dan user_id (user_id ditambahkan profileService.createAchievement)
  assert.match(read("../src/services/profileService.ts"), /async createAchievement\([^)]*\) \{[\s\S]*?\.insert\(\{ \.\.\.data, user_id: user\.id \}\)/);
  const be = readFileSync(backend, "utf8");
  assert.match(be, /export type AchievementCategory = 'award' \| 'publication'/);
  assert.match(be, /'Honors-Awards'/);
  assert.match(be, /'Publications'/);
  assert.match(read("../src/lib/linkedinImport.ts"), /export type AchievementCategory = "award" \| "publication"/);
});

test("Teks antarmuka impor: tanpa em dash, dan landing page serta popup waitinglist tidak tersentuh", () => {
  for (const f of NEW_UI_FILES) assert.doesNotMatch(read(f), /—/, `${f} memuat em dash`);
  for (const f of ["../src/routes/index.tsx", "../src/components/WaitinglistPopup.tsx"]) assert.doesNotMatch(read(f), /LinkedInImport|Impor dari PDF/, f);
});
