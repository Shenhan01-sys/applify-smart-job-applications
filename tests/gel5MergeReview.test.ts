import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf8");

// Prasyarat DRAFT_2026-11-26_private_offportal_jobs.sql: Edge Function memakai klien admin (melewati RLS),
// jadi lowongan privat milik pengguna lain harus dijawab 404 di kode, dan kode tetap jalan sebelum kolomnya ada.
for (const fn of ["generate-application", "green-career-assessment"]) {
  test(`Edge Function ${fn}: lowongan privat milik pengguna lain dijawab 404 (undefined sebelum migrasi = publik)`, () => {
    const src = read("supabase", "functions", fn, "index.ts");
    assert.match(src, /job\.visibility === "private" && job\.created_by !== userId\) return json\(\{ error: "Job not found" \}, 404\)/);
  });
}

test("greenCareerService.listCompletedAssessments membaca umpan balik dari kolom feedback yang ditulis Edge Function", () => {
  const svc = read("src", "services", "greenCareerService.ts");
  const edge = read("supabase", "functions", "green-career-assessment", "index.ts");
  assert.match(edge, /\.update\(\{ status, readiness_score: score, transcript: answers, feedback,/);
  assert.match(svc, /\.select\("job_id, status, readiness_score, feedback, updated_at"\)/);
  assert.doesNotMatch(svc, /row\?\.assessment\?\.feedback/);
});

test("enqueueAutoApply menampilkan pesan error backend (bukan JSON mentah) dan membawa status HTTP", () => {
  const src = read("src", "services", "automationQueue.ts");
  assert.match(src, /JSON\.parse\(text\)/);
  assert.match(src, /status: resp\.status/);
});
