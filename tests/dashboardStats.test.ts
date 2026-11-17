import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recentActivity, relativeTime, summarizeApplications, STATUS_LABEL, type DashApplication } from "../src/lib/dashboardStats.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const row = (status: string, over: Partial<DashApplication> = {}): DashApplication => ({
  id: `id-${status}-${Math.random()}`,
  status,
  created_at: "2026-11-10T00:00:00.000Z",
  submitted_at: null,
  jobs: { title: "Staf Administrasi", company: "PT Maju Jaya" },
  ...over,
});

test("tanpa data: semua angka 0 dan tidak ada aktivitas (tidak ada angka contoh)", () => {
  assert.deepEqual(summarizeApplications([]), { total: 0, drafts: 0, sent: 0, followUp: 0, responded: 0 });
  assert.deepEqual(summarizeApplications(null), { total: 0, drafts: 0, sent: 0, followUp: 0, responded: 0 });
  assert.deepEqual(summarizeApplications(undefined), { total: 0, drafts: 0, sent: 0, followUp: 0, responded: 0 });
  assert.deepEqual(recentActivity([]), []);
  assert.deepEqual(recentActivity(null), []);
});

test("hitungan per status: draf dan siap = draf; submitted, follow_up, responded = terkirim", () => {
  const s = summarizeApplications([
    row("draft"), row("draft"), row("ready"),
    row("submitted"), row("submitted"),
    row("follow_up"),
    row("responded"),
  ]);
  assert.deepEqual(s, { total: 7, drafts: 3, sent: 4, followUp: 1, responded: 1 });
});

test("closed dihitung terkirim hanya bila pernah dikirim (submitted_at ada)", () => {
  const s = summarizeApplications([row("closed"), row("closed", { submitted_at: "2026-11-11T00:00:00.000Z" })]);
  assert.equal(s.total, 2);
  assert.equal(s.sent, 1);
});

test("baris dengan status tidak dikenal atau rusak diabaikan, bukan dihitung", () => {
  const s = summarizeApplications([row("ATS Lolos"), row("Callback"), row(""), { id: "x" }, null as any, row("draft")]);
  assert.deepEqual(s, { total: 1, drafts: 1, sent: 0, followUp: 0, responded: 0 });
});

test("tidak ada penghitung Lolos ATS atau Callback: sistem tidak bisa mengetahuinya", () => {
  const s = summarizeApplications([row("submitted")]);
  assert.deepEqual(Object.keys(s).sort(), ["drafts", "followUp", "responded", "sent", "total"]);
  assert.equal(Object.values(STATUS_LABEL).some((l) => /ATS|callback/i.test(l)), false);
});

test("aktivitas terbaru: urut waktu kirim atau buat, maksimal 6, judul cadangan bila lowongan hilang", () => {
  const rows = [
    row("draft", { id: "a", created_at: "2026-11-01T00:00:00.000Z" }),
    row("submitted", { id: "b", created_at: "2026-11-02T00:00:00.000Z", submitted_at: "2026-11-15T00:00:00.000Z" }),
    row("ready", { id: "c", created_at: "2026-11-12T00:00:00.000Z", jobs: null }),
    ...Array.from({ length: 6 }, (_, i) => row("draft", { id: `old-${i}`, created_at: `2026-10-0${i + 1}T00:00:00.000Z` })),
  ];
  const act = recentActivity(rows, 6);
  assert.equal(act.length, 6);
  assert.deepEqual(act.slice(0, 3).map((a) => a.id), ["b", "c", "a"]);
  assert.equal(act[0].label, "Terkirim");
  assert.equal(act[1].title, "Lowongan tidak tersedia");
  assert.equal(act[1].company, "");
});

test("waktu relatif", () => {
  const now = new Date("2026-11-18T12:00:00.000Z");
  assert.equal(relativeTime("2026-11-18T11:59:30.000Z", now), "baru saja");
  assert.equal(relativeTime("2026-11-18T11:15:00.000Z", now), "45 mnt lalu");
  assert.equal(relativeTime("2026-11-18T09:00:00.000Z", now), "3 jam lalu");
  assert.equal(relativeTime("2026-11-15T12:00:00.000Z", now), "3 hari lalu");
  assert.equal(relativeTime(undefined, now), "");
  assert.equal(relativeTime("bukan tanggal", now), "");
});

// ---- Dashboard membaca tabel yang benar-benar diisi, tanpa contoh palsu ----

test("Dashboard membaca ai_applications (bergabung dengan jobs), bukan tabel applications yang tidak pernah diisi", () => {
  const page = read("../src/routes/dashboard.tsx");
  assert.match(page, /\.from\("ai_applications"\)/);
  assert.match(page, /jobs\(title, company\)/);
  assert.doesNotMatch(page, /from\("applications"\)/);
  assert.doesNotMatch(page, /applied_at/);
  // kolom yang dibaca ada di schema.sql
  const sql = read("../../database/schema.sql");
  const table = /create table if not exists public\.ai_applications \(([\s\S]*?)\n\);/.exec(sql)![1];
  for (const col of ["status", "submitted_at", "created_at", "user_id"]) assert.match(table, new RegExp(`\\n\\s{2}${col}\\s`), col);
});

test("Dashboard: data contoh hanya di mode demo; tanpa cadangan contoh untuk akun nyata dan tanpa Lolos ATS", () => {
  const page = read("../src/routes/dashboard.tsx");
  assert.doesNotMatch(page, /\|\| mockProfileData/);
  assert.doesNotMatch(page, /\|\| mockSubscription/);
  assert.doesNotMatch(page, /\? apps : mock/);
  assert.doesNotMatch(page, /Lolos ATS/);
  assert.doesNotMatch(page, /Callback/);
  // contoh dipakai hanya di dalam cabang isMockMode()
  const mockBranch = /if \(isMockMode\(\)\) \{[\s\S]*?return;\s*\}/.exec(page);
  assert.ok(mockBranch);
  assert.match(mockBranch![0], /mockAIApplications/);
  assert.equal((page.match(/mockAIApplications/g) ?? []).length, 2); // impor + cabang demo
  assert.match(page, /Mode demo: data contoh/);
  // keadaan kosong dan galat yang jujur
  assert.match(page, /Belum ada lamaran, jadi semua angka masih 0/);
  assert.match(page, /Data lamaran tidak dapat dimuat/);
});

test("Dashboard: kuota dari get_quota_status (bukan kolom monthly_quota/used_quota yang tidak ada) dan paket dari ai_model_tier", () => {
  const page = read("../src/routes/dashboard.tsx");
  assert.match(page, /supabase\.rpc\("get_quota_status", \{ p_user_id: user\.id \}\)/);
  assert.match(page, /parseQuotaStatus\(q\.data\)/);
  assert.match(page, /subscription\?\.ai_model_tier/);
  const sql = read("../../database/schema.sql");
  assert.doesNotMatch(sql, /monthly_quota|used_quota/);
});

test("alur normal menulis ai_applications (Edge Function) dan tidak ada kode yang menulis tabel applications", () => {
  const fn = read("../supabase/functions/generate-application/index.ts");
  assert.match(fn, /\.from\("ai_applications"\)\s*\.insert\(/);
  // tidak ada kode frontend atau Edge Function yang menyentuh tabel `applications` lama
  assert.doesNotMatch(fn, /from\("applications"\)/);
  for (const f of ["../src/services/aiApplicationService.ts", "../src/routes/applications.tsx", "../src/routes/dashboard.tsx"]) {
    assert.doesNotMatch(read(f), /from\("applications"\)/, f);
  }
});
