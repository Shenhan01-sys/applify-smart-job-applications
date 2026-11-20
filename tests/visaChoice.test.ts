import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VISA_OPTIONS, VISA_UNSET, visaSelectValue, visaValueToStore } from "../src/lib/visaChoice.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Uji E2E klik 20 November 2026 (temuan 15): "No" bawaan database tampil seperti pilihan "Tidak" dari pengguna.

test("nilai tersimpan kosong, null, atau \"No\" huruf besar dibaca sebagai Belum dipilih", () => {
  for (const stored of [null, undefined, "", "   ", "No"]) {
    assert.equal(visaSelectValue(stored), VISA_UNSET, JSON.stringify(stored));
  }
});

test("hanya no dan yes huruf kecil yang dianggap pilihan pengguna", () => {
  assert.equal(visaSelectValue("no"), "no");
  assert.equal(visaSelectValue("yes"), "yes");
  // bentuk lain tidak bisa ditampilkan sebagai pilihan, jadi tampil Belum dipilih
  for (const stored of ["Yes", "NO", "YES", " no", "tidak", "ya", 0, false, {}]) {
    assert.equal(visaSelectValue(stored), VISA_UNSET, JSON.stringify(stored));
  }
});

test("pilihan di layar: Belum dipilih lebih dulu, lalu Tidak dan Ya, dengan nilai huruf kecil", () => {
  assert.deepEqual(VISA_OPTIONS, [
    { value: "", label: "Belum dipilih" },
    { value: "no", label: "Tidak" },
    { value: "yes", label: "Ya" },
  ]);
  // setiap nilai tersimpan yang sah punya pilihan yang cocok, jadi <select> tidak menampilkan nilai di luar daftar
  const values = VISA_OPTIONS.map((o) => o.value);
  for (const stored of [null, "", "No", "no", "yes", "Yes"]) assert.ok(values.includes(visaSelectValue(stored)));
});

test("yang ditulis ke database: no, yes, atau kosong, tidak pernah \"No\"", () => {
  assert.equal(visaValueToStore("no"), "no");
  assert.equal(visaValueToStore("yes"), "yes");
  assert.equal(visaValueToStore(""), "");
  assert.equal(visaValueToStore("No"), "");
  assert.equal(visaValueToStore("Yes"), "");
  assert.equal(visaValueToStore(undefined), "");
  for (const option of VISA_OPTIONS) assert.notEqual(visaValueToStore(option.value), "No");
});

test("Pengaturan Agen memakai pilihan ini dan tidak lagi memaksa 'no' saat nilainya kosong", () => {
  const src = read("../src/routes/automation-settings.tsx");
  assert.match(src, /import \{ VISA_OPTIONS, visaSelectValue, visaValueToStore \} from "@\/lib\/visaChoice"/);
  const field = src.slice(src.indexOf('label="Butuh sponsor visa kerja?"'), src.indexOf("Gaji yang diharapkan"));
  assert.match(field, /value=\{visaSelectValue\(settings\.require_visa\)\}/);
  assert.match(field, /options=\{VISA_OPTIONS\}/);
  assert.match(field, /updateField\('require_visa', visaValueToStore\(v\)\)/);
  assert.doesNotMatch(src, /require_visa \|\| 'no'/);
  assert.doesNotMatch(src, /require_visa[^\n]*'No'/);
});
