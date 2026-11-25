import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanStringList, listOrEmpty, postedDate, radarFromMatches, safeExternalHref, scoreOrNull } from "../src/lib/jobCardData.ts";

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
  // Kuota dibaca lewat hook useSubscription, yang memanggil RPC get_quota_status.
  assert.match(page, /useSubscription\(\)/);
  assert.match(read("../src/hooks/useSubscription.ts"), /supabase\.rpc\("get_quota_status", \{ p_user_id: user\.id \}\)/);
  assert.match(page, /draf AI tersisa bulan ini/);
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

test("skor kecocokan per pengguna (lib/matchScore.ts): null tampil —, 0 tampil 0%, bukan jobs.match_score yang global", () => {
  // 0 (skor sah) tidak sama dengan null (belum ada dasar penilaian)
  assert.equal(scoreOrNull(0), 0);
  assert.equal(scoreOrNull(null), null);
  const card = read("../src/components/JobCard.tsx");
  assert.match(card, /value === null \? "—" : `\$\{value\}%`/);
  assert.match(card, /<CircularProgress\s+value=\{matchScore\}\s+label=\{JOB_LABELS\.card\.matchLabel\}/);
  assert.match(card, /const matchScore = match\?\.score \?\? null/);
  const modal = read("../src/components/AIApplyModal.tsx");
  assert.match(modal, /const matchScore: number \| null = match\?\.score \?\? null/);
  assert.match(modal, /matchScore !== null \? `\$\{matchScore\}%` : "—"/);
  assert.doesNotMatch(modal, /match_score \?\? 0|jobData\?\.match_score/);
  // urutan akhir dari skor per pengguna di klien; kolom match_score global tidak dipakai mengurutkan
  const page = read("../src/routes/jobs.tsx");
  assert.doesNotMatch(page, /\.order\("match_score"/);
  assert.match(page, /sortByMatch\(filteredJobs, orderScoreOf\)/);
  assert.match(page, /heldScores\.has\(job\.id\) \? \(heldScores\.get\(job\.id\) as number \| null\) : scoreOf\(job\)/);
  assert.match(page, /match=\{matchOf\(selectedJob\)\}/);
  // backend: kolom jobs.match_score diisi skor deterministik atau null (dibaca, tidak diubah)
  assert.match(read("../../backend/services/job-ingest.service.ts"), /match_score/);
});

test("BS-P1-02: safeExternalHref hanya meloloskan http dan https, selain itu null", () => {
  assert.equal(safeExternalHref("https://id.jobstreet.com/job/123"), "https://id.jobstreet.com/job/123");
  assert.equal(safeExternalHref("http://example.com/x?a=1"), "http://example.com/x?a=1");
  assert.equal(safeExternalHref("  https://example.com/lowongan  "), "https://example.com/lowongan");
  for (const bad of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com/x",
    "//example.com/x",
    "example.com/lowongan",
    "",
    "   ",
    null,
    undefined,
    42,
    {},
    `https://example.com/${"a".repeat(2100)}`,
  ]) {
    assert.equal(safeExternalHref(bad), null, String(bad));
  }
});

test("BS-P1-02: JobCard tidak lagi memasang external_url mentah ke href, dan tidak merender tautan bila tidak aman", () => {
  const card = read("../src/components/JobCard.tsx");
  assert.match(card, /const externalHref = safeExternalHref\(job\.external_url\)/);
  assert.doesNotMatch(card, /href=\{job\.external_url\}/);
  assert.doesNotMatch(card, /\{job\.external_url && \(/);
  assert.equal((card.match(/href=\{externalHref\}/g) ?? []).length, 3);
  assert.equal((card.match(/\{externalHref && \(/g) ?? []).length, 3);
});
