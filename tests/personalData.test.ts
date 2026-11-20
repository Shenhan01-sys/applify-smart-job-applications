import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PERSONAL_DATA_LINK_LABEL,
  isPersonalDataLabel,
  listPersonalLabels,
  personalDataHint,
  personalDataLabels,
} from "../src/lib/personalData.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Uji E2E klik 20 November 2026 (temuan 14): Country dan Phone kosong karena Data Pribadi di Pengaturan Agen kosong,
// tanpa petunjuk bahwa keduanya cukup diisi sekali di sana.
const GAPS = [
  "Country",
  "Phone",
  "I consent to the processing of my personal data for recruitment purposes",
  "Are you legally authorized to work in the country",
  "Which cities are you available to work in",
  "Languages",
];

test("isPersonalDataLabel: label pendek dari Data Pribadi dikenali, Inggris dan Indonesia", () => {
  for (const label of ["Country", "Phone", "Phone number", "Mobile", "First Name", "Last name", "City", "Address", "Zip code", "Postal Code", "Negara", "Nomor telepon", "Kota", "Alamat", "Kode pos", "Nama depan"]) {
    assert.equal(isPersonalDataLabel(label), true, label);
  }
});

test("isPersonalDataLabel: pertanyaan panjang, email, dan nilai bukan teks bukan data pribadi", () => {
  for (const label of GAPS.slice(2)) assert.equal(isPersonalDataLabel(label), false, label);
  assert.equal(isPersonalDataLabel("Email address"), false);
  assert.equal(isPersonalDataLabel("E-mail"), false);
  assert.equal(isPersonalDataLabel("Cover letter"), false);
  assert.equal(isPersonalDataLabel(""), false);
  assert.equal(isPersonalDataLabel("   "), false);
  assert.equal(isPersonalDataLabel(null), false);
  assert.equal(isPersonalDataLabel(42), false);
});

test("personalDataLabels: urutan asli dijaga, kembar dan yang bukan teks dibuang", () => {
  assert.deepEqual(personalDataLabels(GAPS), ["Country", "Phone"]);
  assert.deepEqual(personalDataLabels(["  Phone ", "Phone", 3, null, "City"]), ["Phone", "City"]);
  assert.deepEqual(personalDataLabels([]), []);
  assert.deepEqual(personalDataLabels(null), []);
  assert.deepEqual(personalDataLabels(undefined), []);
});

test("listPersonalLabels: satu, dua, tiga, dan lebih dari tiga label", () => {
  assert.equal(listPersonalLabels(["Phone"]), "Phone");
  assert.equal(listPersonalLabels(["Country", "Phone"]), "Country dan Phone");
  assert.equal(listPersonalLabels(["Country", "Phone", "City"]), "Country, Phone dan City");
  assert.equal(listPersonalLabels(["Country", "Phone", "City", "Address", "Zip"]), "Country, Phone, City, dan 2 lainnya");
});

test("personalDataHint: menyebut isian yang kosong dan tempat mengisinya, kosong bila tidak ada isian pribadi", () => {
  const hint = personalDataHint(GAPS);
  assert.match(hint, /^Country dan Phone diisi dari Data Pribadi di Pengaturan Agen\./);
  assert.match(hint, /Isi sekali di sana/);
  assert.doesNotMatch(hint, /—/);
  assert.equal(personalDataHint(GAPS.slice(2)), "");
  assert.equal(personalDataHint([]), "");
  assert.equal(personalDataHint(null), "");
});

test("detail Lamaran Saya menampilkan petunjuk dan tautan ke Pengaturan Agen di bawah daftar isian kosong", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /import \{ PERSONAL_DATA_LINK_LABEL, personalDataHint \} from "@\/lib\/personalData"/);
  const block = src.slice(src.indexOf("detail-form-gaps-heading"), src.indexOf("approvalUi.state === \"unknown\""));
  assert.match(block, /personalDataHint\(selectedGaps\.remaining\)/);
  assert.match(block, /to="\/automation-settings"[^>]*>\{PERSONAL_DATA_LINK_LABEL\}/);
  // daftar isian tetap membungkus label panjang, tanpa truncate atau line-clamp
  const list = block.slice(block.indexOf("<ol"), block.indexOf("</ol>"));
  assert.match(list, /break-words/);
  assert.doesNotMatch(list, /truncate|line-clamp|text-ellipsis|overflow-hidden/);
  assert.equal(PERSONAL_DATA_LINK_LABEL, "Isi Data Pribadi");
});

test("Gerbang Persetujuan menampilkan petunjuk untuk jawaban kosong dari Data Pribadi, dan label pertanyaan membungkus", () => {
  const src = read("../src/components/ApprovalReviewModal.tsx");
  assert.match(src, /personalDataHint\(answers\.filter\(\(a\) => a\.answer\.trim\(\) === ''\)\.map\(\(a\) => a\.question\)\)/);
  assert.match(src, /data-testid="approval-personal-data-hint"/);
  assert.match(src, /to="\/automation-settings"/);
  assert.match(src, /onClick=\{onClose\}/);
  // hanya tampil bila ada petunjuk
  assert.match(src, /\{personalHint && \(/);
  // label pertanyaan panjang membungkus, tidak dipotong
  assert.match(src, /min-w-0 break-words text-sm font-medium">\{answer\.question\}/);
});

test("Pengaturan Agen membuka tab Data Pribadi lebih dulu, jadi tautan petunjuk tidak perlu parameter tab", () => {
  const src = read("../src/routes/automation-settings.tsx");
  assert.match(src, /useState\('personal'\)/);
  assert.match(src, /\{ id: 'personal', label: 'Data Pribadi'/);
});
