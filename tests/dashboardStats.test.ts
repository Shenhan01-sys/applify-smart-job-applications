import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applicationSentNote, groupByStatus, isApplicationSent, recentActivity, relativeTime, summarizeApplications, NOT_SENT_NOTE, STATUS_LABEL, APPLICATION_STATUS_VALUES, type DashApplication } from "../src/lib/dashboardStats.ts";
import { APPLICATION_STATUS_LABEL } from "../src/lib/statusLabels.ts";

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
  assert.deepEqual(summarizeApplications([]), { total: 0, drafts: 0, ready: 0, sent: 0, followUp: 0, responded: 0 });
  assert.deepEqual(summarizeApplications(null), { total: 0, drafts: 0, ready: 0, sent: 0, followUp: 0, responded: 0 });
  assert.deepEqual(summarizeApplications(undefined), { total: 0, drafts: 0, ready: 0, sent: 0, followUp: 0, responded: 0 });
  assert.deepEqual(recentActivity([]), []);
  assert.deepEqual(recentActivity(null), []);
});

test("hitungan per status: draf dan siap dihitung terpisah; submitted, follow_up, responded = terkirim", () => {
  const s = summarizeApplications([
    row("draft"), row("draft"), row("ready"),
    row("submitted"), row("submitted"),
    row("follow_up"),
    row("responded"),
  ]);
  assert.deepEqual(s, { total: 7, drafts: 2, ready: 1, sent: 4, followUp: 1, responded: 1 });
});

test("Lamaran Saya memakai hitungan Beranda: kartu Terkirim = summarizeApplications().sent, bukan hanya kolom Terkirim", () => {
  const src = readFileSync(new URL("../src/routes/applications.tsx", import.meta.url), "utf8");
  assert.match(src, /const stats = summarizeApplications\(applications\)/);
  assert.match(src, /\{ l: "Terkirim", v: stats\.sent,/);
  assert.doesNotMatch(src, /stats\.submitted/);
  // Arti yang sama: follow_up dan responded ikut terkirim, closed hanya bila pernah dikirim.
  const s = summarizeApplications([
    row("submitted"), row("follow_up"), row("responded"),
    row("closed"), row("closed", { submitted_at: "2026-11-24T00:00:00.000Z" }),
  ]);
  assert.equal(s.sent, 4);
});

test("closed dihitung terkirim hanya bila pernah dikirim (submitted_at ada)", () => {
  const s = summarizeApplications([row("closed"), row("closed", { submitted_at: "2026-11-11T00:00:00.000Z" })]);
  assert.equal(s.total, 2);
  assert.equal(s.sent, 1);
});

test("baris dengan status tidak dikenal atau rusak diabaikan, bukan dihitung", () => {
  const s = summarizeApplications([row("ATS Lolos"), row("Callback"), row(""), { id: "x" }, null as any, row("draft")]);
  assert.deepEqual(s, { total: 1, drafts: 1, ready: 0, sent: 0, followUp: 0, responded: 0 });
});

test("tidak ada penghitung Lolos ATS atau Callback: sistem tidak bisa mengetahuinya", () => {
  const s = summarizeApplications([row("submitted")]);
  assert.deepEqual(Object.keys(s).sort(), ["drafts", "followUp", "ready", "responded", "sent", "total"]);
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
  assert.match(page, /Data lamaran belum bisa dimuat/);
});

test("Dashboard: kuota dari get_quota_status (bukan kolom monthly_quota/used_quota yang tidak ada); tanpa lencana paket, tanpa LIVE palsu", () => {
  const page = read("../src/routes/dashboard.tsx");
  assert.match(page, /supabase\.rpc\("get_quota_status", \{ p_user_id: user\.id \}\)/);
  assert.match(page, /parseQuotaStatus\(q\.data\)/);
  // langganan disembunyikan dari UAT: tidak ada lencana Tier/Free/Pro, dan tidak ada penanda LIVE yang tidak berarti apa-apa
  assert.doesNotMatch(page, /TIER_LABEL|Tier \{tier\}|LIVE|subscriptions/);
  assert.match(page, /Tahap uji coba/);
  // ajakan lengkapi profil memakai aturan onboarding yang sama dengan login
  assert.match(page, /needsOnboarding\(x\)/);
  assert.match(page, /to="\/profile"/);
  assert.match(page, /prefers-reduced-motion/);
  assert.doesNotMatch(page, /text-\[(8|9|10)px\]/);
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

// Uji E2E klik 20 November 2026 (temuan 16): Beranda menulis "Draf 2" padahal papan Lamaran Saya punya 1 Draf dan 1 Siap dikirim.
test("temuan 16: satu draf dan satu siap dikirim = Draf 1 dan Siap 1, sama seperti kolom papan", () => {
  const rows = [row("draft"), row("ready")];
  const s = summarizeApplications(rows);
  assert.equal(s.drafts, 1);
  assert.equal(s.ready, 1);
  assert.equal(s.total, 2);
  const board = groupByStatus(rows);
  assert.equal(s.drafts, board.draft.length);
  assert.equal(s.ready, board.ready.length);
});

test("groupByStatus: satu kolom per status dengan urutan tetap, baris tidak dikenal dibuang, masukan kosong aman", () => {
  const a = row("draft", { id: "a" });
  const b = row("ready", { id: "b" });
  const c = row("draft", { id: "c" });
  const g = groupByStatus([a, b, c, row("ATS Lolos"), { id: "x" }, null as any]);
  assert.deepEqual(Object.keys(g), [...APPLICATION_STATUS_VALUES]);
  assert.deepEqual(g.draft.map((r) => r.id), ["a", "c"]);
  assert.deepEqual(g.ready.map((r) => r.id), ["b"]);
  assert.equal(g.submitted.length + g.follow_up.length + g.responded.length + g.closed.length, 0);
  assert.deepEqual(Object.values(groupByStatus(null)).map((x) => x.length), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(Object.values(groupByStatus(undefined)).map((x) => x.length), [0, 0, 0, 0, 0, 0]);
});

test("setiap status punya hitungan yang sama dengan kolom papan, juga untuk campuran status", () => {
  const rows = ["draft", "draft", "draft", "ready", "ready", "submitted", "follow_up", "responded", "closed"].map((s) => row(s));
  const board = groupByStatus(rows);
  const s = summarizeApplications(rows);
  assert.equal(s.total, rows.length);
  assert.equal(s.drafts, board.draft.length);
  assert.equal(s.ready, board.ready.length);
  assert.equal(s.followUp, board.follow_up.length);
  assert.equal(s.responded, board.responded.length);
});

test("label status di Beranda sama dengan label kolom papan Lamaran Saya", () => {
  for (const status of APPLICATION_STATUS_VALUES) {
    if (status === "follow_up" || status === "responded") continue; // Beranda memakai kata lebih pendek untuk dua status ini
    assert.equal(STATUS_LABEL[status], APPLICATION_STATUS_LABEL[status], status);
  }
  assert.equal(STATUS_LABEL.ready, "Siap dikirim");
});

test("papan Lamaran Saya dan Beranda memakai fungsi pengelompokan yang sama", () => {
  const board = read("../src/routes/applications.tsx");
  assert.match(board, /import \{[^}]*\bgroupByStatus\b[^}]*\bsummarizeApplications\b[^}]*\} from "@\/lib\/dashboardStats"/);
  assert.match(board, /groupedApps[^=]*= groupByStatus\(applications\)/);
  const page = read("../src/routes/dashboard.tsx");
  assert.match(page, /summarizeApplications\(applications\)/);
  assert.match(page, /ready=\{stats\.ready\}/);
  assert.match(page, /lamaran siap dikirim/);
});

// Uji E2E 24 November 2026: penghitung "3 terkirim" tidak sejalan dengan kolom Terkirim dan lencana baris.
// Satu aturan (isApplicationSent) sekarang dipakai penghitung, kartu, baris daftar, dan jendela detail.
const NOW = new Date("2026-11-24T12:00:00.000Z");

test("isApplicationSent: hanya status terkirim yang dihitung; draf dan siap dikirim tidak, walau submitted_at tersisa", () => {
  for (const status of ["submitted", "follow_up", "responded"]) assert.equal(isApplicationSent({ status, submitted_at: null }), true, status);
  for (const status of ["draft", "ready"]) {
    assert.equal(isApplicationSent({ status, submitted_at: null }), false, status);
    // baris produksi: draf yang pernah dikirim lalu dipindah balik masih membawa submitted_at
    assert.equal(isApplicationSent({ status, submitted_at: "2026-11-21T06:11:52.674Z" }), false, `${status} dengan submitted_at tersisa`);
  }
  assert.equal(isApplicationSent({ status: "closed", submitted_at: null }), false);
  assert.equal(isApplicationSent({ status: "closed", submitted_at: "   " }), false);
  assert.equal(isApplicationSent({ status: "closed", submitted_at: "2026-11-11T00:00:00.000Z" }), true);
  for (const bad of [null, undefined, {}, { status: "ATS Lolos" }, { status: "approved" }, { status: "" }]) assert.equal(isApplicationSent(bad as any), false);
});

test("penghitung terkirim = jumlah baris yang lolos isApplicationSent, apa pun campuran statusnya", () => {
  const rows = [
    row("draft", { submitted_at: "2026-11-21T06:11:52.674Z" }), row("draft"), row("ready"), row("ready"),
    row("submitted", { submitted_at: "2026-11-23T10:46:57.543Z" }), row("submitted", { submitted_at: null }),
    row("follow_up"), row("responded"), row("closed"), row("closed", { submitted_at: "2026-11-11T00:00:00.000Z" }),
  ];
  const s = summarizeApplications(rows);
  assert.equal(s.sent, rows.filter((r) => isApplicationSent(r)).length);
  assert.equal(s.sent, 5);
  // tiga yang berstatus submitted/ready/draft tidak bisa "terkirim" hanya karena submitted_at ada
  assert.equal(summarizeApplications([row("draft", { submitted_at: "2026-11-21T06:11:52.674Z" })]).sent, 0);
});

test("teks kartu: terkirim -> 'Terkirim N hari lalu'; belum terkirim -> 'Belum dikirim'; tidak pernah 'Belum dikirim' untuk baris terkirim", () => {
  assert.equal(applicationSentNote({ status: "submitted", submitted_at: "2026-11-24T08:12:13.712Z" }, NOW), "Terkirim hari ini");
  assert.equal(applicationSentNote({ status: "submitted", submitted_at: "2026-11-23T10:46:57.543Z" }, NOW), "Terkirim 1 hari lalu");
  assert.equal(applicationSentNote({ status: "follow_up", submitted_at: "2026-11-14T10:00:00.000Z" }, NOW), "Terkirim 10 hari lalu");
  // status Terkirim tanpa submitted_at (diubah lewat SQL atau kode lama): tetap terkirim, hanya waktunya tidak ada
  assert.equal(applicationSentNote({ status: "submitted", submitted_at: null }, NOW), "Terkirim (waktu tidak tercatat)");
  assert.equal(applicationSentNote({ status: "submitted", submitted_at: "bukan tanggal" }, NOW), "Terkirim (waktu tidak tercatat)");
  assert.equal(applicationSentNote({ status: "ready", submitted_at: null }, NOW), NOT_SENT_NOTE);
  assert.equal(applicationSentNote({ status: "draft", submitted_at: "2026-11-21T06:11:52.674Z" }, NOW), NOT_SENT_NOTE, "submitted_at tersisa di draf tidak membuatnya tampak terkirim");
  assert.equal(applicationSentNote({ status: "closed", submitted_at: null }, NOW), NOT_SENT_NOTE);
  assert.equal(applicationSentNote({ status: "submitted", submitted_at: "2026-11-25T00:00:00.000Z" }, NOW), "Terkirim hari ini", "jam perangkat mundur tidak menghasilkan angka negatif");
});

test("Lamaran Saya: kartu, baris daftar, dan jendela detail memakai aturan terkirim yang sama dengan penghitung", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /import \{[^}]*\bapplicationSentNote\b[^}]*\bisApplicationSent\b[^}]*\} from "@\/lib\/dashboardStats"/);
  assert.equal(src.split("applicationSentNote(app)").length - 1, 2, "kartu papan dan baris daftar");
  // tidak lagi menurunkan "terkirim" dari submitted_at saja
  assert.doesNotMatch(src, /app\.submitted_at \?/);
  assert.doesNotMatch(src, /\{app\.submitted_at && \(/);
  assert.doesNotMatch(src, /daysAgo/);
  assert.match(src, /isApplicationSent\(selectedApp\) && selectedApp\.submitted_at/);
  assert.match(src, /const stats = summarizeApplications\(applications\)/);
  assert.match(src, /\{ l: "Terkirim", v: stats\.sent,/);
});
