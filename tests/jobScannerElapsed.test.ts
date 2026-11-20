import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Uji E2E klik 20 November 2026: selama sekitar 60 detik pertama pemindai hanya menampilkan "Mencari lowongan...".
test("pemindai lowongan menampilkan waktu berjalan selama menunggu backend, bukan persentase tebakan", () => {
  const src = read("../src/components/AIJobScanner.tsx");
  const scan = src.slice(src.indexOf("const startScan"), src.indexOf("return (\n"));
  // penghitung mulai tepat sebelum permintaan dan berhenti di finally, juga saat permintaan gagal
  assert.ok(scan.indexOf("setWaitingSince(Date.now())") < scan.indexOf("await searchJobs("), "mulai sebelum await");
  assert.match(scan, /finally \{\s*setWaitingSince\(null\)\s*\}/);
  // progress bar tidak dinaikkan selama menunggu
  const waiting = scan.slice(scan.indexOf("setWaitingSince(Date.now())"), scan.indexOf("setWaitingSince(null)"));
  assert.doesNotMatch(waiting, /setProgress/);
  // interval dibersihkan saat menunggu selesai atau komponen dilepas
  assert.match(src, /setInterval\([\s\S]{0,120}\)[\s\S]{0,40}return \(\) => clearInterval\(timer\)/);
  // teks tampil hanya selama menunggu dan menjelaskan mengapa jumlah per situs belum ada
  assert.match(src, /\{waitingSince !== null && \(/);
  assert.match(src, /Sudah berjalan \{elapsed\} detik/);
  assert.match(src, /jumlah lowongan per\s+situs tampil sesudah semua situs menjawab/);
});
