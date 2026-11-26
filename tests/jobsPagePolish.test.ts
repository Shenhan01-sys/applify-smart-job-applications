import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_SCAN_PROGRESS_LINES, appendScanStage, settleScanStages, type ScanStage } from "../src/lib/scanStages.ts";
import { classifyJobChannel, CORPORATE_COMPLEX_ATS_DOMAINS } from "../src/lib/applyChannel.ts";
import { HELP_EXTRA_FAQ } from "../src/components/help/helpContent.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("E2E 26 Nov pemindai: sesudah Selesai, baris kemajuan 'Menghubungi 9 situs lowongan...' tidak tampil lagi", () => {
  let stages: ScanStage[] = [];
  stages = appendScanStage(stages, "Menghubungi 9 situs lowongan...", "info");
  stages = appendScanStage(stages, "Mencari lowongan...", "info");
  stages = appendScanStage(stages, "Menyaring lokasi dan menghapus duplikat dari 4 sumber...", "analysis");
  stages = appendScanStage(stages, "Mengurutkan berdasarkan kecocokan...", "analysis");
  assert.equal(stages.length, 4);
  assert.equal(stages[0].message, "Menghubungi 9 situs lowongan...");

  const done = settleScanStages(stages, "Selesai. 28 lowongan ditemukan dan diurutkan. Daftar di bawah sudah diperbarui.", "success");
  assert.deepEqual(done, [{ message: "Selesai. 28 lowongan ditemukan dan diurutkan. Daftar di bawah sudah diperbarui.", type: "success" }]);
  assert.equal(done.some((s) => /Menghubungi/.test(s.message)), false);
});

test("pemindai: galat per situs tetap tampil sesudah selesai, di bawah kalimat hasil; hasil galat membuang baris kemajuan", () => {
  let stages: ScanStage[] = [];
  stages = appendScanStage(stages, "Menghubungi 9 situs lowongan...", "info");
  stages = appendScanStage(stages, "Situs yang tidak merespons: kalibrr", "error");
  stages = appendScanStage(stages, "Mencari lowongan...", "info");

  const ok = settleScanStages(stages, "Selesai. 3 lowongan ditemukan dan diurutkan.", "success");
  assert.deepEqual(ok.map((s) => s.type), ["success", "error"]);
  assert.equal(ok[1].message, "Situs yang tidak merespons: kalibrr");

  const none = settleScanStages(stages, "Pencarian selesai, tetapi tidak ada lowongan yang cocok.", "error");
  assert.deepEqual(none.map((s) => s.type), ["error", "error"]);
  assert.equal(none.some((s) => /Menghubungi|Mencari lowongan/.test(s.message)), false);

  const cancelled = settleScanStages(stages, "Pencarian dibatalkan.", "info");
  assert.deepEqual(cancelled.map((s) => s.message), ["Pencarian dibatalkan.", "Situs yang tidak merespons: kalibrr"]);
});

test("appendScanStage: paling banyak lima baris kemajuan, galat tidak ikut terpotong", () => {
  let stages: ScanStage[] = [{ message: "galat", type: "error" }];
  for (let i = 0; i < 9; i++) stages = appendScanStage(stages, `langkah ${i}`, "info");
  assert.equal(stages.filter((s) => s.type !== "error").length, MAX_SCAN_PROGRESS_LINES);
  assert.equal(stages.filter((s) => s.type === "error").length, 1);
  assert.equal(stages[0].message, "langkah 4");
});

test("kabel: pemindai memakai settleStage di semua jalur akhir, dan halaman Lowongan menandai 'memperbarui' seketika saat penyaring berubah", () => {
  const scanner = read("../src/components/AIJobScanner.tsx");
  assert.match(scanner, /settleStage\(`Selesai\. \$\{total\} lowongan ditemukan/);
  assert.match(scanner, /settleStage\('Pencarian dibatalkan\.'/);
  assert.match(scanner, /settleStage\('Pencarian selesai, tetapi tidak ada lowongan yang cocok/);
  assert.doesNotMatch(scanner, /addStage\(`Selesai/);

  const jobs = read("../src/routes/jobs.tsx");
  const effect = jobs.slice(jobs.indexOf("// Pencarian dan penyaring tempat kerja"), jobs.indexOf("// Skill dari user_skills"));
  assert.match(effect, /setFetching\(true\);/);
  assert.match(effect, /fetchSeq\.current \+= 1;/);
  assert.match(effect, /\[searchQuery, activeFilter\]/);
  // "Semua" hanya menyetel penyaring ke all, tanpa sisa penyaring lain yang menempel.
  assert.match(jobs, /onClick=\{\(\) => setActiveFilter\(filter\.key\)\}/);
  assert.match(jobs, /\{ key: "all", label: "Semua" \}/);
});

test("E2E-07 label Eksperimental: hanya ATS korporat (Workday, iCIMS, Taleo, SuccessFactors), bukan lima sumber ATS publik di pemindai", () => {
  // Lima tombol sumber di pemindai (Greenhouse, Lever, Ashby, SmartRecruiters, Workable) adalah ATS publik yang
  // didukung penuh agen dan ekstensi. Label Eksperimental memang tidak boleh ada di sana.
  for (const url of [
    "https://boards.greenhouse.io/acme/jobs/1",
    "https://jobs.lever.co/acme/1",
    "https://jobs.ashbyhq.com/acme/1",
    "https://jobs.smartrecruiters.com/acme/1",
    "https://apply.workable.com/acme/j/1",
  ]) {
    const res = classifyJobChannel({ external_url: url });
    assert.equal(res.experimentalExtension, undefined, url);
    assert.doesNotMatch(res.badgeLabel, /Eksperimental/, url);
  }
  // Domain korporat tepat sama dengan daftar backend, dan kartu lowongan mereka berlabel Eksperimental.
  assert.deepEqual([...CORPORATE_COMPLEX_ATS_DOMAINS], ["myworkdayjobs.com", "workday.com", "icims.com", "taleo.net", "successfactors.com", "successfactors.eu"]);
  for (const url of [
    "https://acme.wd3.myworkdayjobs.com/en-US/External/job/Jakarta/Analyst_R1",
    "https://careers-acme.icims.com/jobs/1/analyst/job",
    "https://acme.taleo.net/careersection/2/jobdetail.ftl?job=1",
    "https://career2.successfactors.com/career?company=acme",
    "https://career5.successfactors.eu/career?company=acme",
  ]) {
    const res = classifyJobChannel({ external_url: url });
    assert.equal(res.experimentalExtension, true, url);
    assert.match(res.badgeLabel, /\(Eksperimental\)$/, url);
  }
  // Penjelasan label ada di Bantuan.
  assert.ok(HELP_EXTRA_FAQ.some((f) => /Eksperimental/.test(f.question) && /Workday/.test(f.answer)));
});
