import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectCareerLevels, jobsEmptyState, matchesCareerLevelFilter } from "../src/lib/jobFilters.ts";

test("P2-06 / GAP-09: detectCareerLevels & matchesCareerLevelFilter mengenali Magang, Fresh Grad, dan SMA/SMK", () => {
  const intern = { title: "Software Engineer Intern (MSIB)", type: "internship", description: "Terbuka untuk mahasiswa akhir." };
  assert.deepEqual(detectCareerLevels(intern), ["internship"]);
  assert.equal(matchesCareerLevelFilter(intern, "internship"), true);
  assert.equal(matchesCareerLevelFilter(intern, "sma-smk"), false);

  const fg = { title: "Junior Backend Developer", description: "Terbuka untuk fresh graduate 0-1 tahun pengalaman." };
  assert.deepEqual(detectCareerLevels(fg), ["fresh-grad"]);
  assert.equal(matchesCareerLevelFilter(fg, "fresh-grad"), true);

  const smk = { title: "Operator Produksi", description: "Minimal SMA/SMK sederajat, tanpa pengalaman dipersilakan melamar." };
  assert.deepEqual(detectCareerLevels(smk), ["fresh-grad", "sma-smk"]);
  assert.equal(matchesCareerLevelFilter(smk, "sma-smk"), true);
  assert.equal(matchesCareerLevelFilter(smk, "fresh-grad"), true);

  const senior = { title: "Staff Engineer", description: "Minimal 7 tahun pengalaman membangun sistem terdistribusi." };
  assert.deepEqual(detectCareerLevels(senior), []);

  const empty = jobsEmptyState({
    filter: "sma-smk",
    searchQuery: "",
    loadedCount: 10,
    savedCount: 0,
    savedLoadFailed: false,
    profileHasSkills: true,
    skillsError: "",
    scoredCount: 5,
    topScore: 70,
  });
  assert.match(empty.title, /SMA\/SMK/);
});

test("P2-06 & P2-01 wiring: /jobs menyediakan chip Magang/Fresh Grad/SMA-SMK dan AIJobScanner menyertakan Workable secara default", () => {
  const jobs = readFileSync(new URL("../src/routes/jobs.tsx", import.meta.url), "utf8");
  assert.match(jobs, /key: "internship", label: "Magang"/);
  assert.match(jobs, /key: "fresh-grad", label: "Fresh Grad"/);
  assert.match(jobs, /key: "sma-smk", label: "SMA\/SMK"/);
  assert.match(jobs, /matchesCareerLevelFilter\(job, activeFilter\)/);

  const scanner = readFileSync(new URL("../src/components/AIJobScanner.tsx", import.meta.url), "utf8");
  assert.match(scanner, /DEFAULT_PLATFORMS = \[[^\]]*'workable'/);
  assert.doesNotMatch(scanner, /workable:\s*'Perlu papan perusahaan'/);
  assert.match(scanner, /linkedin:\s*'Sering butuh login; lamar manual'/);
});
