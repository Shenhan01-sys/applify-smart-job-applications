import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JOB_LABELS, jobTypeLabel, marketPositionLabel, salaryPeriodLabel, workplaceLabel } from "../src/lib/jobLabels.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("jenis pekerjaan: kode bahasa Inggris dari database jadi bahasa Indonesia, apa pun huruf dan pemisahnya", () => {
  assert.equal(jobTypeLabel("full-time"), "Penuh waktu");
  assert.equal(jobTypeLabel("Full-Time"), "Penuh waktu");
  assert.equal(jobTypeLabel("full time"), "Penuh waktu");
  assert.equal(jobTypeLabel("full_time"), "Penuh waktu");
  assert.equal(jobTypeLabel("part-time"), "Paruh waktu");
  assert.equal(jobTypeLabel("contract"), "Kontrak");
  assert.equal(jobTypeLabel("internship"), "Magang");
});

test("tempat kerja: On-Site jadi Di kantor, Hybrid dan Remote tetap", () => {
  assert.equal(workplaceLabel("on-site"), "Di kantor");
  assert.equal(workplaceLabel("On-Site"), "Di kantor");
  assert.equal(workplaceLabel("onsite"), "Di kantor");
  assert.equal(workplaceLabel("hybrid"), "Hybrid");
  assert.equal(workplaceLabel("remote"), "Remote");
});

test("periode gaji: monthly jadi bulan (untuk '/bulan'), bukan '/monthly'", () => {
  assert.equal(salaryPeriodLabel("monthly"), "bulan");
  assert.equal(salaryPeriodLabel("Monthly"), "bulan");
  assert.equal(salaryPeriodLabel("yearly"), "tahun");
  assert.equal(salaryPeriodLabel("hourly"), "jam");
});

test("nilai tak dikenal ditampilkan apa adanya (tidak dibuang), kosong menjadi teks kosong", () => {
  assert.equal(jobTypeLabel("Magang Kampus"), "Magang Kampus");
  assert.equal(workplaceLabel("Campuran"), "Campuran");
  for (const v of [undefined, null, "", "   ", 5]) {
    assert.equal(jobTypeLabel(v), "");
    assert.equal(workplaceLabel(v), "");
    assert.equal(salaryPeriodLabel(v), "");
  }
});

test("teks tetap kartu: istilah yang diminta Hans ada dan tidak ada yang masih bahasa Inggris", () => {
  const c = JOB_LABELS.card;
  assert.equal(c.matchLabel, "Cocok");
  assert.equal(c.sourcePrefix, "Sumber:");
  assert.equal(c.seeDetail, "Lihat detail");
  for (const text of Object.values(c)) {
    assert.doesNotMatch(text, /\b(AI Matched|Match|Source|Acceptance|Culture|Growth|monthly|Market|Benchmark|Strategy|Requirements|Detail & )\b/, text);
  }
  assert.equal(marketPositionLabel(80), "Di atas pasar");
  assert.equal(marketPositionLabel(60), "Setara pasar");
  assert.equal(marketPositionLabel(20), "Di bawah pasar");
});

test("JobCard memakai peta label, tidak ada label bahasa Inggris tertinggal di tampilan", () => {
  // komentar kode boleh berbahasa Inggris; yang diperiksa hanya teks yang tampil
  const src = read("../src/components/JobCard.tsx").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /from "@\/lib\/jobLabels"/);
  assert.match(src, /jobTypeLabel\(job\.type\)/);
  assert.match(src, /workplaceLabel\(job\.workplace_type\)/);
  assert.match(src, /salaryPeriodLabel\(job\.salary_period\)/);
  assert.doesNotMatch(src, /AI Matched|"Match"|Source:|Acceptance|"Culture"|"Growth"|>\s*Culture|\/monthly|full-time|On-Site|Lihat Detail|AI Apply Sekarang|Skill Gaps Detected|Salary Benchmark|Market Avg|percentile<|Above Market|Key Requirements|AI Application Plan|AI Strategy|Gaji kompetitif/);
  assert.doesNotMatch(src, /\bcapitalize\b/);
});
