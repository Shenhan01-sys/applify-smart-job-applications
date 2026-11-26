import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildGeneratePrompts } from "../supabase/functions/_shared/green-assessment.ts";

test("UX-P7-11: green-career-assessment membaca skill dari tabel user_skills (bukan kolom profiles.skills yang tidak ada) dan menyertakannya ke prompt", () => {
  const fnSrc = readFileSync(
    new URL("../supabase/functions/green-career-assessment/index.ts", import.meta.url),
    "utf8",
  );
  // Tidak boleh lagi memilih kolom `skills` dari `profiles`
  assert.doesNotMatch(fnSrc, /\.from\(["']profiles["']\)\s*\.select\([^)]*\bskills\b/);
  // Harus membaca `user_skills` dan mencatat galat kueri bila gagal
  assert.match(fnSrc, /\.from\(["']user_skills["']\)\s*\.select\(["']name["']\)/);
  assert.match(fnSrc, /profile_read_failed/);
  assert.match(fnSrc, /user_skills_read_failed/);

  const prompts = buildGeneratePrompts(
    {
      title: "ESG Data Analyst",
      company: "PT Hijau Nusantara",
      description: "Analisis emisi karbon dan laporan keberlanjutan.",
    },
    {
      full_name: "Siti Rahma",
      current_title: "Data Analyst",
      experience_years: 2,
      skills: ["Python", "SQL", "LCA Carbon Accounting"],
    },
  );
  assert.match(prompts.user, /Python/);
  assert.match(prompts.user, /LCA Carbon Accounting/);
});
