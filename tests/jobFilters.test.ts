import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isRealJobUrl, isTestSource, isVisibleJob, visibleJobs, jobSearchFilters, matchesJobSearch, searchTerms, JOBS_PAGE_LIMIT, JOB_MAX_AGE_DAYS, freshSinceDate, freshJobsFilter, savedFilterEmpty, SAVED_EMPTY_TITLE, SAVED_EMPTY_TEXT, workplaceKind, matchesWorkplaceFilter, workplaceCounts, jobsEmptyState, GENERIC_EMPTY_TITLE, GENERIC_EMPTY_TEXT, type JobsEmptyInput } from "../src/lib/jobFilters.ts";

test("freshSinceDate/freshJobsFilter: 30 hari ke belakang (UTC), baris tanpa posted_at tetap dimuat", () => {
  assert.equal(JOB_MAX_AGE_DAYS, 30);
  const now = new Date("2026-11-20T08:00:00.000Z");
  assert.equal(freshSinceDate(now), "2026-10-21");
  assert.equal(freshJobsFilter(now), "posted_at.gte.2026-10-21,posted_at.is.null");
  assert.equal(freshSinceDate(new Date("2026-03-01T00:30:00.000Z")), "2026-01-30");
});

test("halaman Lowongan memasang saringan umur di kueri server", () => {
  const src = readFileSync(new URL("../src/routes/jobs.tsx", import.meta.url), "utf8");
  assert.match(src, /\.eq\("status", "active"\)/);
  assert.match(src, /\.or\(freshJobsFilter\(\)\)/);
});

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("alamat lowongan asli: http dan https dengan host sungguhan", () => {
  assert.equal(isRealJobUrl("https://www.jobstreet.co.id/id/job/12345"), true);
  assert.equal(isRealJobUrl("http://careers.example-corp.com/apply?id=7"), true);
  assert.equal(isRealJobUrl("  https://boards.greenhouse.io/acme/jobs/1  "), true);
});

test("alamat uji dibuang: localhost, 127.0.0.1, httpbin, dan sejenisnya", () => {
  for (const u of [
    "http://127.0.0.1:3000/job/1",
    "http://127.1.2.3/job",
    "http://localhost:5173/jobs/2",
    "https://app.localhost/x",
    "https://httpbin.org/forms/post",
    "http://httpbin.local/get",
    "https://eu.httpbin.org/anything",
    "http://[::1]:8080/a",
    "http://0.0.0.0/a",
    "https://mock.test/job",
  ]) {
    assert.equal(isRealJobUrl(u), false, u);
  }
});

test("alamat kosong, rusak, atau bukan http(s) dibuang", () => {
  for (const u of [undefined, null, "", "   ", 42, "bukan url", "/jobs/1", "ftp://files.example.com/a", "javascript:alert(1)", "mailto:hr@acme.com", "https://"]) {
    assert.equal(isRealJobUrl(u), false, String(u));
  }
});

test("host asli yang namanya mirip tetap lolos (tidak asal mencocokkan potongan teks)", () => {
  assert.equal(isRealJobUrl("https://localhost-careers.com/a"), true);
  assert.equal(isRealJobUrl("https://www.127hours.com/a"), true);
  // userinfo tidak boleh menipu pemeriksaan host
  assert.equal(isRealJobUrl("http://localhost@acme.com/a"), true);
  assert.equal(isRealJobUrl("http://acme.com@localhost/a"), false);
});

test("sumber uji dibuang: e2e-mock dan httpbin, tanpa membedakan huruf", () => {
  assert.equal(isTestSource("e2e-mock"), true);
  assert.equal(isTestSource("E2E-Mock"), true);
  assert.equal(isTestSource("httpbin"), true);
  assert.equal(isTestSource(" httpbin "), true);
  for (const s of ["linkedin", "jobstreet", "glints", "web", "", null, undefined, 3]) assert.equal(isTestSource(s), false, String(s));
});

test("lowongan terlihat hanya bila aktif, beralamat asli, dan bukan dari sumber uji", () => {
  const ok = { id: "ok", status: "active", external_url: "https://www.glints.com/id/opportunities/jobs/1", platform_source: "glints" };
  const rows = [
    ok,
    { ...ok, id: "tak-aktif", status: "closed" },
    { ...ok, id: "tanpa-url", external_url: null },
    { ...ok, id: "host-uji", external_url: "http://127.0.0.1:4010/job" },
    { ...ok, id: "httpbin", external_url: "https://httpbin.org/post" },
    { ...ok, id: "sumber-uji", platform_source: "e2e-mock" },
    { ...ok, id: "sumber-httpbin", platform_source: "httpbin" },
  ];
  assert.deepEqual(visibleJobs(rows).map((r) => r.id), ["ok"]);
  assert.equal(isVisibleJob(ok), true);
  assert.equal(isVisibleJob({ ...ok, status: undefined }), false);
  // hitungan "N lowongan tersimpan" mengikuti hasil saringan, bukan jumlah baris di database
  assert.equal(visibleJobs(rows).length, 1);
});

test("halaman Lowongan menyaring hasil database dan hitungannya mengikuti hasil saringan", () => {
  const page = read("../src/routes/jobs.tsx");
  assert.match(page, /from "@\/lib\/jobFilters"/);
  assert.match(page, /setJobs\(visibleJobs\(\(data \?\? \[\]\) as JobData\[\]\)\)/);
  // data uji di database tidak diubah: tidak ada tulis/hapus ke tabel jobs dari halaman
  assert.doesNotMatch(page, /from\("jobs"\)\s*\.(delete|update|insert|upsert)/);
  // hitungan header memakai daftar yang sudah disaring
  assert.match(page, /\$\{jobs\.length\} lowongan tersimpan/);
});

test("pencarian lowongan: per kata, setiap kata wajib ada, karakter sintaks dibuang", () => {
  assert.deepEqual(jobSearchFilters("  "), []);
  assert.deepEqual(jobSearchFilters("%*,()"), []);
  assert.deepEqual(searchTerms("Frontend Engineer, Ads"), ["Frontend", "Engineer", "Ads"]);
  assert.deepEqual(jobSearchFilters("Frontend Ads"), [
    "title.ilike.*Frontend*,company.ilike.*Frontend*,location.ilike.*Frontend*",
    "title.ilike.*Ads*,company.ilike.*Ads*,location.ilike.*Ads*",
  ]);
  assert.equal(searchTerms("a b c d e f g").length, 5);
  assert.ok(JOBS_PAGE_LIMIT >= 100);
  const job = { title: "Frontend Engineer, Ads", company: "reddit", location: "Remote - United States" };
  assert.equal(matchesJobSearch(job, "Frontend Engineer, Ads"), true);
  assert.equal(matchesJobSearch(job, "frontend reddit"), true);
  assert.equal(matchesJobSearch(job, "frontend gojek"), false);
  assert.equal(matchesJobSearch(job, ""), true);
});

test("halaman Lowongan mencari di server, bukan hanya di 100 baris terbaru", () => {
  const src = readFileSync(new URL("../src/routes/jobs.tsx", import.meta.url), "utf8");
  assert.match(src, /jobSearchFilters\(search\)/);
  assert.match(src, /query = query\.or\(filter\)/);
  assert.match(src, /loadedCount: jobs\.length/);
  assert.doesNotMatch(src, /\.limit\(100\)/);
});

// Uji E2E klik 20 November 2026 (temuan 17): saringan "Tersimpan" yang kosong memakai teks umum.
test("temuan 17: saringan Tersimpan tanpa lowongan tersimpan punya teks sendiri dengan petunjuk menyimpan", () => {
  const copy = savedFilterEmpty({ filter: "saved", savedCount: 0, loadFailed: false });
  assert.deepEqual(copy, { title: SAVED_EMPTY_TITLE, text: SAVED_EMPTY_TEXT });
  assert.equal(`${copy?.title}. ${copy?.text}`, "Belum ada lowongan tersimpan. Tekan ikon simpan pada kartu lowongan untuk menyimpannya.");
});

test("saringan Tersimpan: teks umum tetap dipakai bila ada lowongan tersimpan, daftar gagal dimuat, atau saringan lain", () => {
  // ada yang tersimpan, kosongnya karena pencarian
  assert.equal(savedFilterEmpty({ filter: "saved", savedCount: 3, loadFailed: false }), null);
  // gagal memuat: kosong belum tentu berarti belum menyimpan
  assert.equal(savedFilterEmpty({ filter: "saved", savedCount: 0, loadFailed: true }), null);
  for (const filter of ["all", "remote", "hybrid", "onsite", "high-match"]) {
    assert.equal(savedFilterEmpty({ filter, savedCount: 0, loadFailed: false }), null, filter);
  }
});

test("halaman Lowongan memakai teks kosong Tersimpan, tanpa membuang teks umum dan keadaan belum ada lowongan", () => {
  const src = readFileSync(new URL("../src/routes/jobs.tsx", import.meta.url), "utf8");
  // keadaan kosong dibangun satu fungsi (jobsEmptyState), yang memanggil savedFilterEmpty dan menyimpan teks umum
  assert.match(src, /jobsEmptyState\(\{[\s\S]*?filter: activeFilter,[\s\S]*?savedCount: savedJobs\.size,[\s\S]*?savedLoadFailed,/);
  assert.match(src, /\{emptyState\.title\}/);
  assert.match(src, /\{emptyState\.text\}/);
  assert.match(src, /emptyState\.action === "scanner"/);
  assert.match(src, /emptyState\.action === "profile"/);
  assert.match(readFileSync(new URL("../src/lib/jobFilters.ts", import.meta.url), "utf8"), /savedFilterEmpty\(\{ filter: input\.filter/);
  // kegagalan memuat daftar tersimpan dicatat, dan dibersihkan lagi saat berhasil
  assert.match(src, /setSavedLoadFailed\(true\)/);
  assert.match(src, /setSavedLoadFailed\(false\)/);
});

// Uji E2E klik 20 November 2026 (temuan 7): penyaring Remote dan 80% memberi teks umum tanpa petunjuk.
const emptyBase: JobsEmptyInput = {
  filter: "all",
  searchQuery: "",
  loadedCount: 200,
  savedCount: 0,
  savedLoadFailed: false,
  profileHasSkills: true,
  skillsError: "",
  scoredCount: 120,
  topScore: 67,
  counts: { remote: 0, hybrid: 3, "on-site": 190, unknown: 7 },
};

test("temuan 7: workplaceKind membaca workplace_type seperti label kartu, dan hanya kata jelas bila kolom kosong", () => {
  assert.equal(workplaceKind({ workplace_type: "remote" }), "remote");
  assert.equal(workplaceKind({ workplace_type: " Remote " }), "remote");
  assert.equal(workplaceKind({ workplace_type: "On-Site" }), "on-site");
  assert.equal(workplaceKind({ workplace_type: "onsite" }), "on-site");
  assert.equal(workplaceKind({ workplace_type: "on_site" }), "on-site");
  assert.equal(workplaceKind({ workplace_type: "hybrid" }), "hybrid");
  // nilai asing tidak ditebak, walau lokasinya menyebut remote
  assert.equal(workplaceKind({ workplace_type: "flexible", location: "Remote" }), null);
  // kolom kosong: kata yang jelas di lokasi atau judul
  assert.equal(workplaceKind({ workplace_type: null, location: "Remote - Indonesia" }), "remote");
  assert.equal(workplaceKind({ workplace_type: "", title: "Customer Support (WFH)" }), "remote");
  assert.equal(workplaceKind({ location: "Jakarta (Hybrid)" }), "hybrid");
  assert.equal(workplaceKind({ location: "Jakarta", title: "Accountant" }), null);
  // kolom terisi mengalahkan teks lokasi
  assert.equal(workplaceKind({ workplace_type: "on-site", location: "Remote" }), "on-site");
  assert.equal(workplaceKind({ workplace_type: 5 as unknown as string }), null);
});

test("temuan 7: matchesWorkplaceFilter memetakan kunci penyaring halaman, kunci lain tidak pernah lolos", () => {
  assert.equal(matchesWorkplaceFilter({ workplace_type: "remote" }, "remote"), true);
  assert.equal(matchesWorkplaceFilter({ workplace_type: "hybrid" }, "hybrid"), true);
  assert.equal(matchesWorkplaceFilter({ workplace_type: "on-site" }, "onsite"), true);
  assert.equal(matchesWorkplaceFilter({ workplace_type: "On-Site" }, "onsite"), true);
  assert.equal(matchesWorkplaceFilter({ workplace_type: "on-site" }, "remote"), false);
  for (const key of ["all", "high-match", "saved", ""]) assert.equal(matchesWorkplaceFilter({ workplace_type: "remote" }, key), false, key);
});

test("temuan 7: workplaceCounts menghitung per jenis dan yang tanpa keterangan", () => {
  const jobs = [{ workplace_type: "on-site" }, { workplace_type: "on-site" }, { workplace_type: "hybrid" }, { workplace_type: null, location: "Remote" }, { workplace_type: null }];
  assert.deepEqual(workplaceCounts(jobs), { remote: 1, hybrid: 1, "on-site": 2, unknown: 1 });
  assert.deepEqual(workplaceCounts([]), { remote: 0, hybrid: 0, "on-site": 0, unknown: 0 });
});

test("temuan 7: keadaan kosong Remote menyebut berapa lowongan dicari, apa yang ada, dan apa yang dicoba", () => {
  const s = jobsEmptyState({ ...emptyBase, filter: "remote" });
  assert.equal(s.title, "Belum ada lowongan remote");
  assert.match(s.text, /Tidak ada yang berlabel Remote di antara 200 lowongan yang dimuat\./);
  assert.match(s.text, /Yang ada: Di kantor 190, Hybrid 3, tanpa keterangan 7\./);
  assert.match(s.text, /pilih "Semua" lalu cari kata "remote"/);
  assert.notEqual(s.title, GENERIC_EMPTY_TITLE);
  assert.equal(s.action, null);
});

test("temuan 7: keadaan kosong Hybrid dan Di kantor memakai labelnya sendiri dan menyebut pencarian aktif", () => {
  const hy = jobsEmptyState({ ...emptyBase, filter: "hybrid", searchQuery: " web3 ", loadedCount: 4, counts: { remote: 0, hybrid: 0, "on-site": 4, unknown: 0 } });
  assert.equal(hy.title, "Belum ada lowongan hybrid");
  assert.match(hy.text, /Tidak ada yang berlabel Hybrid di antara 4 lowongan yang dimuat untuk pencarian "web3"\. Yang ada: Di kantor 4\. Pilih salah satunya\.$/);
  const on = jobsEmptyState({ ...emptyBase, filter: "onsite", loadedCount: 2, counts: { remote: 2, hybrid: 0, "on-site": 0, unknown: 0 } });
  assert.equal(on.title, "Belum ada lowongan di kantor");
  assert.match(on.text, /berlabel Di kantor di antara 2 lowongan yang dimuat\. Yang ada: Remote 2\./);
  assert.doesNotMatch(on.text, /kata "remote"/);
});

test("temuan 7: keadaan kosong 80% ke atas menyebut jumlah yang dihitung, skor tertinggi, dan batas muatan", () => {
  const s = jobsEmptyState({ ...emptyBase, filter: "high-match" });
  assert.equal(s.title, "Belum ada kecocokan 80% ke atas");
  assert.match(s.text, /Dari 200 lowongan yang dimuat, 120 punya skor kecocokan dan yang tertinggi 67%\./);
  assert.match(s.text, /hanya menghitung lowongan yang dimuat di layar \(paling banyak 200 yang terbaru\)\./);
  assert.match(s.text, /cari nama skill atau posisi di kotak cari, atau lengkapi skill di Profil\./);
  // di bawah batas muatan, tidak ada catatan batas
  const small = jobsEmptyState({ ...emptyBase, filter: "high-match", loadedCount: 12, scoredCount: 5, topScore: 40, searchQuery: "web3" });
  assert.match(small.text, /Dari 12 lowongan yang dimuat untuk pencarian "web3", 5 punya skor kecocokan dan yang tertinggi 40%\./);
  assert.doesNotMatch(small.text, /paling banyak/);
  // tidak ada skor sama sekali
  const none = jobsEmptyState({ ...emptyBase, filter: "high-match", scoredCount: 0, topScore: null });
  assert.match(none.text, /belum ada yang skor kecocokannya bisa dihitung/);
});

test("temuan 7: 80% tanpa skill profil atau gagal memuat skill menunjuk ke penyebabnya, bukan teks umum", () => {
  const noSkills = jobsEmptyState({ ...emptyBase, filter: "high-match", profileHasSkills: false });
  assert.equal(noSkills.text, "Lengkapi skill di Profil untuk melihat kecocokan.");
  assert.equal(noSkills.action, "profile");
  const failed = jobsEmptyState({ ...emptyBase, filter: "high-match", profileHasSkills: null, skillsError: "Kecocokan belum bisa dihitung. Skill di profilmu belum bisa dimuat." });
  assert.equal(failed.text, "Kecocokan belum bisa dihitung. Skill di profilmu belum bisa dimuat.");
  assert.equal(failed.action, null);
});

test("temuan 7: keadaan kosong tanpa lowongan, pencarian tanpa hasil, Tersimpan, dan penyaring Semua tetap benar", () => {
  const none = jobsEmptyState({ ...emptyBase, loadedCount: 0, scoredCount: 0, topScore: null });
  assert.equal(none.title, "Belum ada lowongan");
  assert.equal(none.action, "scanner");
  const noHit = jobsEmptyState({ ...emptyBase, loadedCount: 0, searchQuery: "zzzz", filter: "remote" });
  assert.equal(noHit.title, GENERIC_EMPTY_TITLE);
  assert.match(noHit.text, /Tidak ada lowongan untuk pencarian "zzzz"\./);
  assert.equal(noHit.action, null);
  const saved = jobsEmptyState({ ...emptyBase, filter: "saved" });
  assert.deepEqual(saved, { title: SAVED_EMPTY_TITLE, text: SAVED_EMPTY_TEXT, action: null });
  // ada yang tersimpan tetapi pencarian menyaringnya: teks umum
  assert.deepEqual(jobsEmptyState({ ...emptyBase, filter: "saved", savedCount: 2 }), { title: GENERIC_EMPTY_TITLE, text: GENERIC_EMPTY_TEXT, action: null });
  assert.deepEqual(jobsEmptyState({ ...emptyBase, filter: "all" }), { title: GENERIC_EMPTY_TITLE, text: GENERIC_EMPTY_TEXT, action: null });
});

test("temuan 7: halaman memakai penyaring tempat kerja bersama, bukan perbandingan string mentah", () => {
  const src = readFileSync(new URL("../src/routes/jobs.tsx", import.meta.url), "utf8");
  assert.match(src, /matchesWorkplaceFilter\(job, activeFilter\)/);
  assert.doesNotMatch(src, /job\.workplace_type === /);
  assert.match(src, /counts: workplaceCounts\(jobs\)/);
});
