import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { listToText, numberToText, parseCommaList, parseIndonesianSalary, parseOptionalNumber, sameList } from "../src/lib/settingsForm.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
/** Komentar JSX dibuang: yang dicek adalah yang tampil atau dikirim, bukan catatan pengembang. */
const stripComments = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const settingsPage = stripComments(read("../src/routes/automation-settings.tsx"));
const profilePage = stripComments(read("../src/routes/profile.tsx"));

test("daftar dipisah koma: spasi dan potongan kosong dirapikan, dan teks mentah tidak dirakit ulang dari array", () => {
  assert.deepEqual(parseCommaList("React, Node ,, Go"), ["React", "Node", "Go"]);
  assert.deepEqual(parseCommaList(""), []);
  assert.deepEqual(parseCommaList(" , ,"), []);
  assert.deepEqual(parseCommaList("Software Engineer"), ["Software Engineer"]);
  assert.equal(listToText(["a", "b"]), "a, b");
  assert.equal(listToText(undefined), "");
  assert.equal(listToText(null), "");
  // Dulu: setiap ketikan "a, " dirakit ulang menjadi "a" dan koma yang baru diketik hilang. Sekarang kolom
  // menyimpan teksnya sendiri, dan sameList menahan penimpaan selama isi luarnya sama dengan yang diketik.
  const typed = "a, ";
  assert.notEqual(listToText(parseCommaList(typed)), typed);
  assert.equal(sameList(parseCommaList(typed), ["a"]), true);
  assert.equal(sameList(parseCommaList("a, b"), ["a"]), false);
  assert.equal(sameList(undefined, []), true);
  assert.equal(sameList(["a"], undefined), false);
});

test("kolom angka kosong dikirim sebagai null, bukan 0", () => {
  assert.equal(parseOptionalNumber(""), null);
  assert.equal(parseOptionalNumber("   "), null);
  assert.equal(parseOptionalNumber("abc"), null);
  assert.equal(parseOptionalNumber("0"), null);
  assert.equal(parseOptionalNumber("-5"), null);
  assert.equal(parseOptionalNumber("Infinity"), null);
  assert.equal(parseOptionalNumber("5000000"), 5000000);
  assert.equal(parseOptionalNumber(" 30 "), 30);
});

test("parser gaji Indonesia membaca pemisah ribuan, Rp, desimal, dan satuan", () => {
  for (const [input, expected] of [
    ["5.000.000", 5_000_000],
    ["6,5 jt", 6_500_000],
    ["6.5 juta", 6_500_000],
    ["Rp 8.500.000", 8_500_000],
    ["7500000", 7_500_000],
    ["6.500", 6_500],
    ["Rp 1,25 juta", 1_250_000],
    ["2 rb", 2_000],
    ["Rp. 7.500.000", 7_500_000],
    ["5.000.000,-", 5_000_000],
    ["IDR 5.000.000", 5_000_000],
    ["5.000.000 per bulan", 5_000_000],
    ["6 jt/bulan", 6_000_000],
  ] as const) assert.equal(parseIndonesianSalary(input), expected, input);
  for (const input of ["", "   ", "Rp", "enam juta", "5,5jt++", "-5000", "Infinity", "6,5", "6.5"]) {
    assert.equal(parseIndonesianSalary(input), null, input);
  }
});

test("masa pemberitahuan tanpa nilai tersimpan tampil kosong, tidak 30", () => {
  assert.equal(numberToText(null), "");
  assert.equal(numberToText(undefined), "");
  assert.equal(numberToText(0), "");
  assert.equal(numberToText(30), "30");
  assert.doesNotMatch(settingsPage, /notice_period\?\.toString\(\) \|\| '30'/);
  assert.match(settingsPage, /value=\{numberToText\(settings\.notice_period\)\}/);
});

test("halaman Pengaturan Agen memakai kolom daftar dengan teks mentah dan angka null", () => {
  assert.match(settingsPage, /<CommaListField\s+label="Kata kunci pencarian/);
  assert.match(settingsPage, /<CommaListField\s+label="Perusahaan yang dihindari/);
  assert.match(settingsPage, /<CommaListField\s+label="Kata yang dihindari di lowongan/);
  assert.doesNotMatch(settingsPage, /\.join\(', '\)/);
  assert.doesNotMatch(settingsPage, /v\.split\(','\)/);
  assert.doesNotMatch(settingsPage, /updateField\('(desired_salary|current_ctc|notice_period)', Number\(v\)\)/);
  assert.match(settingsPage, /parseIndonesianSalary\(salaryText\.desired_salary\)/);
  assert.match(settingsPage, /parseIndonesianSalary\(salaryText\.current_ctc\)/);
  assert.match(settingsPage, /label="Gaji yang diharapkan \(Rp, sesuai isian formulir\)" type="text" inputMode="decimal"/);
  assert.match(settingsPage, /Contoh: 5\.000\.000 atau 6,5 jt/);
  assert.match(settingsPage, /updateField\('notice_period', parseOptionalNumber\(v\)\)/);
  // teks mentah dirapikan saat kolom ditinggalkan
  assert.match(settingsPage, /onBlur=\{\(\) => setText\(listToText\(parseCommaList\(text\)\)\)\}/);
});

test("langkah Preferensi Profil menerima format gaji Rupiah dan mencegah simpan dengan format salah", () => {
  assert.match(profilePage, /type="text"[\s\S]*?inputMode="decimal"/);
  assert.match(profilePage, /parseIndonesianSalary\(raw\)/);
  assert.match(profilePage, /onSalaryError\(key, "Format gaji belum dikenali/);
  // Hanya galat format gaji yang dibawa dari prefErrors; galat lain dihitung ulang (simpan tidak terkunci).
  assert.match(profilePage, /\.\.\.validatePreferences\(preferences\), \.\.\.salaryParseErrors/);
  assert.doesNotMatch(profilePage, /\.\.\.validatePreferences\(preferences\), \.\.\.prefErrors/);
  assert.match(profilePage, /Contoh: 5\.000\.000 atau 6,5 jt/);
});

test("sakelar ekstensi otomatis ada di tab Perilaku Agen, bawaannya mati", () => {
  assert.match(settingsPage, /label="Pakai ekstensi browser otomatis untuk situs yang perlu login"/);
  assert.match(settingsPage, /checked=\{settings\.extension_auto_use \?\? false\}/);
  assert.match(settingsPage, /updateField\('extension_auto_use', v\)/);
  const api = read("../src/services/automationApi.ts");
  assert.match(api, /extension_auto_use\?: boolean/);
});

// ---- kontrol yang nilainya tidak dibaca siapa pun ----

const UNUSED_FIELDS = ["easy_apply_only", "overwrite_previous_answers", "job_type_filter", "whitelist_words"];

/** Semua berkas kode (bukan tes, dependensi, atau skrip isi data contoh) di bawah satu folder saudara. */
function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (["node_modules", "tests", "test", "dist", ".git"].includes(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && !/^(seed|reseed|verify)_/.test(name)) out.push(full);
  }
  return out;
}

test("pengaturan yang tidak dibaca server, worker, maupun ekstensi tidak ditampilkan lagi", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const readers: string[] = [];
  for (const dir of ["backend", "worker/src", "extension"]) {
    for (const file of sourceFiles(join(root, dir))) {
      // Daftar kolom yang boleh ditulis (automation-settings.ts) hanya menyaring badan PUT; itu bukan pembacaan nilainya.
      if (file.endsWith(join("services", "automation-settings.ts"))) continue;
      const text = readFileSync(file, "utf8");
      for (const field of UNUSED_FIELDS) if (text.includes(field)) readers.push(`${file}: ${field}`);
    }
  }
  assert.deepEqual(readers, [], "bila ada yang membaca kolom ini, tampilkan kembali kontrolnya");
  assert.ok(existsSync(join(root, "backend")) && existsSync(join(root, "worker", "src")), "folder backend dan worker harus ada agar pemeriksaan ini berarti");

  assert.doesNotMatch(settingsPage, /easy_apply_only|overwrite_previous_answers|whitelist_words/);
  assert.doesNotMatch(settingsPage, /Easy Apply|Selalu pakai jawaban terbaru/);
  assert.doesNotMatch(profilePage, />\s*Tipe pekerjaan\s*</);
  assert.doesNotMatch(profilePage, /JOB_TYPE_OPTIONS/);
  // Persetujuan selalu wajib (worker maySubmitApply): tidak ada saklar yang bisa mematikan jeda sebelum kirim.
  assert.doesNotMatch(settingsPage, /updateField\('pause_before_submit'/);
  assert.match(settingsPage, /Selalu minta persetujuan sebelum mengirim/);
});
