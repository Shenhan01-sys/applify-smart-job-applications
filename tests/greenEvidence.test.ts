import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STRONG_GREEN_TERMS, WEAK_GREEN_TERMS, hasGreenEvidence } from "../src/lib/greenEvidence.ts";

// Uji klik produksi 21 November 2026, temuan 26: Karier Hijau memuat Tokopedia, McKinsey, dan PwC.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Baris yang ditandai is_green di produksi sebelum aturan bukti ada (judul dan perusahaan dari temuan 26).
const ROWS = [
  { title: "Frontend Engineer", company: "Tokopedia", description: "React, Redux, Webpack, Jest." },
  { title: "AI/ML Engineer", company: "Bukalapak", description: "Melatih model pencarian." },
  { title: "Management Consultant", company: "McKinsey & Company", description: "Strategi untuk klien korporat." },
  { title: "Investment Analyst", company: "X", description: "Analisis portofolio." },
  { title: "Project Manager", company: "Y", description: "Mengelola proyek lintas tim." },
  { title: "Tax Consultant", company: "PwC Indonesia", description: "Pajak dan kepatuhan." },
  { title: "Sustainability Analyst", company: "Xurya Daya Indonesia", description: "Analisis emisi karbon." },
  { title: "Renewable Energy Engineer", company: "PLN Icon Plus", description: "Instalasi energi terbarukan." },
];

test("temuan 26: hanya peran dengan bukti lingkungan di judul atau deskripsi yang lolos penyaring tampilan", () => {
  const shown = ROWS.filter((r) => hasGreenEvidence(r.title, r.description)).map((r) => r.company);
  assert.deepEqual(shown, ["Xurya Daya Indonesia", "PLN Icon Plus"]);
});

test("temuan 26: nama perusahaan tidak dihitung sebagai bukti", () => {
  assert.equal(hasGreenEvidence("Software Engineer", "Mengembangkan layanan."), false);
  assert.equal(hasGreenEvidence(undefined, undefined), false);
  assert.equal(hasGreenEvidence(null, 5), false);
});

test("temuan 26: daftar istilah di frontend sama persis dengan daftar di worker", () => {
  const worker = read("../../worker/src/lib/greenEvidence.ts");
  const termsOf = (src: string, name: string): string[] => {
    const m = src.match(new RegExp(`export const ${name}: readonly string\\[\\] = \\[([\\s\\S]*?)\\];`));
    assert.ok(m, `${name} tidak ditemukan`);
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  };
  assert.deepEqual(termsOf(worker, "STRONG_GREEN_TERMS"), [...STRONG_GREEN_TERMS]);
  assert.deepEqual(termsOf(worker, "WEAK_GREEN_TERMS"), [...WEAK_GREEN_TERMS]);
  assert.ok(STRONG_GREEN_TERMS.length > 40);
});

test("temuan 26: daftar Karier Hijau disaring dengan hasGreenEvidence, bukan hanya kolom is_green", () => {
  const svc = read("../src/services/greenCareerService.ts");
  assert.match(svc, /import \{ hasGreenEvidence \} from "@\/lib\/greenEvidence";/);
  assert.match(svc, /\.filter\(\(j\) => hasGreenEvidence\(j\.title, j\.description\)\)/);
  assert.match(svc, /\.eq\("is_green", true\)/);
});
