import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// Pemeriksaan pengaitan impor PDF LinkedIn yang hidup di komponen React dan layanan (suite ini tanpa DOM, jadi
// membaca teks sumber seperti tes lain di folder ini). Logika murninya dites di linkedinImport.test.ts.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const CARD = "../src/components/profile/LinkedInImportCard.tsx";
const NEW_UI_FILES = [CARD, "../src/lib/linkedinImport.ts", "../src/services/linkedinImportService.ts"];

test("Profil: kartu impor dipasang di halaman, mengisi ulang data lewat getFullProfile, dan dimatikan saat profil gagal dimuat", () => {
  const src = read("../src/routes/profile.tsx");
  assert.match(src, /import LinkedInImportCard from "@\/components\/profile\/LinkedInImportCard"/);
  assert.match(src, /<LinkedInImportCard\b[\s\S]*?userId=\{user\.id\}[\s\S]*?onImported=\{handleImported\}/);
  assert.match(src, /existing=\{\{ basic: formData, experiences: workExps, education: educations, certifications: certs, skills: userSkills \}\}/);
  // profil yang gagal dimuat tidak boleh dipakai untuk mendeteksi duplikat
  assert.match(src, /disabledReason=\{loadError \?/);
  // sesudah impor: data diambil ulang dari database, ketikan yang belum disimpan tidak tertimpa
  const handler = src.slice(src.indexOf("const handleImported"), src.indexOf("if (loading)"));
  assert.match(handler, /applyProfilePatch\(prev, result\.profilePatch\)/);
  assert.match(handler, /profileService\.getFullProfile\(user!\.id\)/);
  assert.match(handler, /setWorkExps\(full\.workExperiences\)/);
  assert.match(handler, /setUserSkills\(full\.skills\)/);
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
  for (const group of ["Profil dasar", "Pengalaman kerja", "Pendidikan", "Sertifikasi", "Skill dan bahasa"]) assert.match(src, new RegExp(group));
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
  for (const fn of ["createWorkExperience", "createEducation", "createCertification", "createSkill"]) assert.match(src, new RegExp(`profileService\\.${fn}\\(row\\)`));
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

test("Teks antarmuka impor: tanpa em dash, dan landing page serta popup waitinglist tidak tersentuh", () => {
  for (const f of NEW_UI_FILES) assert.doesNotMatch(read(f), /—/, `${f} memuat em dash`);
  for (const f of ["../src/routes/index.tsx", "../src/components/WaitinglistPopup.tsx"]) assert.doesNotMatch(read(f), /LinkedInImport|Impor dari PDF/, f);
});
