import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanStringList, listOrEmpty, postedDate, radarFromMatches, scoreOrNull } from "../src/lib/jobCardData.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("skor: hanya angka 0..100 yang dihitung; null, teks, NaN berarti belum diukur (bukan 0 dan bukan bawaan)", () => {
  assert.equal(scoreOrNull(85), 85);
  assert.equal(scoreOrNull("72"), 72);
  assert.equal(scoreOrNull(84.6), 85);
  assert.equal(scoreOrNull(150), 100);
  assert.equal(scoreOrNull(-3), 0);
  for (const v of [null, undefined, "", "abc", NaN, Infinity, {}, []]) assert.equal(scoreOrNull(v), null, String(v));
});

test("daftar jsonb yang null atau salah bentuk menjadi daftar kosong, bukan galat .length atau .find", () => {
  assert.deepEqual(listOrEmpty(null), []);
  assert.deepEqual(listOrEmpty(undefined), []);
  assert.deepEqual(listOrEmpty("[1]"), []);
  assert.deepEqual(listOrEmpty({ a: 1 }), []);
  assert.deepEqual(listOrEmpty(["a"]), ["a"]);
});

test("radar: tanpa hasil pencocokan tidak ada grafik; dengan hasil, sumbu tanpa data bernilai 0 (tidak ada angka karangan)", () => {
  assert.equal(radarFromMatches(undefined), null);
  assert.equal(radarFromMatches(null), null);
  assert.equal(radarFromMatches([]), null);
  assert.equal(radarFromMatches([{ level: 80 }]), null);
  const r = radarFromMatches([{ skill: "Backend Tech", level: 50, matched: false }, { skill: "Experience", level: 85 }]);
  assert.deepEqual(r, [
    { name: "Tech", value: 50 },
    { name: "Exp", value: 85 },
    { name: "Edu", value: 0 },
    { name: "Soft", value: 0 },
    { name: "Lang", value: 0 },
    { name: "Tools", value: 0 },
  ]);
});

test("tanggal tayang: posted_at, lalu created_at, lalu tidak ada (bukan 1 Jan 1970)", () => {
  assert.equal(postedDate({ posted_at: "2026-11-01T00:00:00.000Z" })?.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(postedDate({ posted_at: null, created_at: "2026-10-20T00:00:00.000Z" })?.toISOString(), "2026-10-20T00:00:00.000Z");
  assert.equal(postedDate({ posted_at: "bukan tanggal", created_at: "2026-10-20T00:00:00.000Z" })?.toISOString(), "2026-10-20T00:00:00.000Z");
  assert.equal(postedDate({ posted_at: null, created_at: undefined }), null);
});

test("skillGaps dari model: string, objek {skill}, duplikat, kosong, dan bentuk salah dibersihkan", () => {
  assert.deepEqual(cleanStringList(["SQL", " SQL ", "", "Docker", { skill: "Kubernetes" }, { message: "Bahasa Inggris" }, 5, null]), ["SQL", "Docker", "Kubernetes", "Bahasa Inggris"]);
  assert.deepEqual(cleanStringList(undefined), []);
  assert.deepEqual(cleanStringList("SQL"), []);
});

// ---- kabel antarmuka ----

test("kolom jobs yang tidak ada di schema.sql tidak lagi diasumsikan ada oleh kartu lowongan", () => {
  const sql = read("../../database/schema.sql");
  const jobs = /create table if not exists public\.jobs \(([\s\S]*?)\n\);/.exec(sql)![1];
  for (const col of ["skill_matches", "skill_gaps", "salary_benchmark"]) assert.doesNotMatch(jobs, new RegExp(`\\n\\s{2}${col}\\s`), col);
  const card = read("../src/components/JobCard.tsx");
  assert.doesNotMatch(card, /job\.skill_matches\.find/);
  assert.doesNotMatch(card, /job\.skill_gaps\.(length|map)/);
  assert.doesNotMatch(card, /job\.ai_actions\.(map|length)/);
  assert.doesNotMatch(card, /job\.requirements\.(length|slice)/);
  assert.match(card, /radarFromMatches\(job\.skill_matches\)/);
  // tidak ada angka bawaan karangan lagi pada radar
  assert.doesNotMatch(card, /\|\| 70\b|\|\| 80\b|\|\| 90\b|\|\| 75\b|\|\| 85\b|\|\| 65\b/);
});

test("Job Feed: contoh lowongan hanya di mode demo; tombol Generate Demo Jobs dan fungsi pembuatnya dihapus", () => {
  const page = read("../src/routes/jobs.tsx");
  assert.doesNotMatch(page, /generateMockJobs/);
  assert.doesNotMatch(page, /Generate Demo Jobs/);
  assert.doesNotMatch(page, /data\?\.length \? data : mockJobsData/);
  assert.equal((page.match(/mockSavedJobIds/g) ?? []).length, 2); // impor + cabang mode demo
  assert.doesNotMatch(page, /setUserTier\(mockSubscription[^;]*\);\s*\n\s*setRemainingQuota/);
  assert.doesNotMatch(page, /catch \(err\) \{[^}]*mockSubscription/);
  // mockJobsData dipakai tepat satu kali di luar impor: cabang mode demo
  assert.equal((page.match(/mockJobsData/g) ?? []).length, 2);
  assert.match(page, /if \(isMockMode\(\)\) \{\s*\n\s*setJobs\(mockJobsData as JobData\[\]\)/);
});

test("Job Feed: label kuota memakai get_quota_status (draf per bulan), bukan daily_apply_quota sebagai 'apply tersisa'", () => {
  const page = read("../src/routes/jobs.tsx");
  assert.match(page, /supabase\.rpc\("get_quota_status", \{ p_user_id: user\.id \}\)/);
  assert.match(page, /draf tersisa bulan ini/);
  assert.doesNotMatch(page, /apply tersisa/);
  assert.doesNotMatch(page, /select\("ai_model_tier, daily_apply_quota"\)/);
});

test("modal draf menampilkan skillGaps dari respons Edge Function (analysis.skillGaps), bukan kolom jobs.skill_gaps", () => {
  const svc = read("../src/services/aiApplicationService.ts");
  assert.match(svc, /createDraftWithAnalysis/);
  assert.match(svc, /skillGaps: cleanStringList\(res\.analysis\?\.skillGaps\)/);
  const modal = read("../src/components/AIApplyModal.tsx");
  assert.match(modal, /createDraftWithAnalysis\(\{ jobId, tone: "professional" \}\)/);
  assert.match(modal, /setSkillGaps\(analysis\.skillGaps\)/);
  assert.match(modal, /Model tidak melaporkan kesenjangan skill/);
  const fn = read("../supabase/functions/generate-application/index.ts");
  assert.match(fn, /skillGaps: parsed\.skillGaps \?\? \[\]/);
  assert.match(fn, /return json\(\{ application: app, analysis: result, quota \}\)/);
});
