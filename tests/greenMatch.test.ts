import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GREEN_MATCH_LOADING_TEXT,
  GREEN_MATCH_UNAVAILABLE_TEXT,
  greenMatchScore,
  greenMatchView,
} from "../src/lib/greenMatch.ts";
import { NO_JOB_SKILLS_TEXT, NO_PROFILE_SKILLS_TEXT, computeMatch, sortByMatch } from "../src/lib/matchScore.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Tiga lowongan hijau dengan peran berbeda, semuanya dengan match_score global 90 seperti pada uji klik UAT.
const ANALYST = {
  id: "g1", title: "Sustainability Analyst", company: "A", match_score: 90,
  description: "Analisis emisi karbon memakai Excel dan SQL, laporan ke tim.",
  requirements: ["Excel", "SQL", "Python"],
};
const ENGINEER = {
  id: "g2", title: "Renewable Energy Engineer", company: "B", match_score: 90,
  description: "Merancang instalasi surya. Requirements: AutoCAD, Hardware, Troubleshooting",
  requirements: ["AutoCAD", "Troubleshooting"],
};
const NO_SKILLS = { id: "g3", title: "Staf Lapangan", company: "C", match_score: 90, description: "Bekerja di lapangan.", requirements: [] };

test("greenMatchView: skor per pengguna sama dengan computeMatch halaman Lowongan, bukan jobs.match_score", () => {
  const skills = ["Excel", "SQL"];
  const v = greenMatchView(ANALYST, skills);
  const m = computeMatch(ANALYST, skills);
  assert.equal(v.kind, "score");
  assert.ok(v.kind === "score" && m.score !== null);
  if (v.kind === "score") {
    assert.equal(v.score, m.score);
    assert.notEqual(v.score, ANALYST.match_score);
    assert.equal(v.caption, `${m.matched.length} dari ${m.total} skill cocok`);
    assert.deepEqual(v.matched, m.matched);
  }
});

test("greenMatchView: peran berbeda untuk profil yang sama tidak lagi sama-sama 90%", () => {
  const skills = ["Excel", "SQL", "Python"];
  const a = greenMatchView(ANALYST, skills);
  const e = greenMatchView(ENGINEER, skills);
  assert.equal(a.kind, "score");
  assert.equal(a.kind === "score" && a.score, 100);
  assert.equal(e.kind, "score");
  assert.equal(e.kind === "score" && e.score, 0);
  assert.deepEqual([ANALYST, ENGINEER].map((j) => greenMatchScore(j, skills)), [100, 0]);
});

test("greenMatchView: profil tanpa skill memberi keadaan netral yang sama dengan Lowongan, tanpa angka", () => {
  for (const skills of [[], [" ", "a"]]) {
    const v = greenMatchView(ANALYST, skills);
    assert.deepEqual(v, { kind: "no-profile-skills", text: NO_PROFILE_SKILLS_TEXT });
    assert.equal(greenMatchScore(ANALYST, skills), null);
  }
});

test("greenMatchView: lowongan tanpa skill terbaca tidak diberi angka", () => {
  const v = greenMatchView(NO_SKILLS, ["Excel"]);
  assert.deepEqual(v, { kind: "no-job-skills", text: NO_JOB_SKILLS_TEXT });
  assert.equal(greenMatchScore(NO_SKILLS, ["Excel"]), null);
});

test("greenMatchView: skill belum dimuat atau gagal dimuat tidak pernah menjadi angka", () => {
  assert.deepEqual(greenMatchView(ANALYST, null), { kind: "loading", text: GREEN_MATCH_LOADING_TEXT });
  assert.deepEqual(greenMatchView(ANALYST, null, true), { kind: "unavailable", text: GREEN_MATCH_UNAVAILABLE_TEXT });
  assert.equal(greenMatchScore(ANALYST, null), null);
  assert.doesNotMatch(GREEN_MATCH_UNAVAILABLE_TEXT + GREEN_MATCH_LOADING_TEXT, /—/);
});

test("urutan kartu hijau: skor per pengguna tertinggi dulu, tanpa skor di akhir, urutan asal bila sama", () => {
  const skills = ["Excel", "SQL", "Python"];
  const jobs = [NO_SKILLS, ENGINEER, ANALYST];
  const sorted = sortByMatch(jobs, (j) => greenMatchScore(j, skills));
  assert.deepEqual(sorted.map((j) => j.id), ["g1", "g2", "g3"]);
  // tanpa skill profil semua tanpa skor, urutan asal dipertahankan
  assert.deepEqual(sortByMatch(jobs, (j) => greenMatchScore(j, [])).map((j) => j.id), ["g3", "g2", "g1"]);
});

test("Karier Hijau: kartu tidak membaca job.match_score, memuat skill lewat profileService, memakai greenMatchView", () => {
  const src = read("../src/routes/green-career.tsx");
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ""), /match_score/);
  assert.match(src, /import \{ greenMatchView, type GreenMatchView \} from "@\/lib\/greenMatch"/);
  assert.match(src, /import \{ profileSkillList, sortByMatch \} from "@\/lib\/matchScore"/);
  assert.match(src, /profileSkillList\(await profileService\.getSkillSource\(userId\)\)/);
  assert.match(src, /greenMatchView\(j, profileSkills, skillsFailed\)/);
  assert.match(src, /<MatchBlock view=\{view\} \/>/);
  // label tetap, tetapi angka hanya dari skor per pengguna; tanpa skor tampil strip dan alasan
  assert.match(src, /Kecocokan dengan profilmu/);
  assert.match(src, /score === null \?/);
  // skill dimuat bersama daftar, dan gagal memuat tidak dianggap "tanpa skill"
  assert.match(src, /Promise\.all\(\[greenCareerService\.listGreenJobs\(\), loadProfileSkills\(\)\]\)/);
  assert.match(src, /setProfileSkills\(null\);\s*setSkillsFailed\(true\)/);
  // tautan ke Profil punya target sentuh 44px
  assert.match(src, /to="\/profile" className="inline-flex min-h-11/);
});

test("greenCareerService: match_score global tetap dibaca tetapi diberi keterangan tidak ditampilkan", () => {
  const src = read("../src/services/greenCareerService.ts");
  assert.match(src, /Kolom global untuk semua pengguna; tidak ditampilkan sebagai kecocokan/);
});
