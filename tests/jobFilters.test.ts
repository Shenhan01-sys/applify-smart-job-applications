import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isRealJobUrl, isTestSource, isVisibleJob, visibleJobs, jobSearchFilters, matchesJobSearch, searchTerms, JOBS_PAGE_LIMIT, JOB_MAX_AGE_DAYS, freshSinceDate, freshJobsFilter, savedFilterEmpty, SAVED_EMPTY_TITLE, SAVED_EMPTY_TEXT } from "../src/lib/jobFilters.ts";

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
  assert.match(src, /noJobsAtAll \? "Belum ada lowongan"/);
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
  assert.match(src, /savedFilterEmpty\(\{ filter: activeFilter, savedCount: savedJobs\.size, loadFailed: savedLoadFailed \}\)/);
  assert.match(src, /savedEmpty \? savedEmpty\.title : "Tidak ada lowongan yang cocok"/);
  assert.match(src, /savedEmpty\s*\? savedEmpty\.text/);
  assert.match(src, /noJobsAtAll \? "Belum ada lowongan"/);
  // kegagalan memuat daftar tersimpan dicatat, dan dibersihkan lagi saat berhasil
  assert.match(src, /setSavedLoadFailed\(true\)/);
  assert.match(src, /setSavedLoadFailed\(false\)/);
});
