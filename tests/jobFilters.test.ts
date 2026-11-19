import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isRealJobUrl, isTestSource, isVisibleJob, visibleJobs, jobSearchFilter, JOBS_PAGE_LIMIT } from "../src/lib/jobFilters.ts";

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

test("pencarian lowongan: saringan server mencakup judul, perusahaan, lokasi dan membuang karakter sintaks", () => {
  assert.equal(jobSearchFilter("  "), null);
  assert.equal(jobSearchFilter("%*,()"), null);
  assert.equal(
    jobSearchFilter(" Frontend  Dev "),
    "title.ilike.*Frontend Dev*,company.ilike.*Frontend Dev*,location.ilike.*Frontend Dev*",
  );
  assert.equal(jobSearchFilter("a,b(c):d"), "title.ilike.*a b c d*,company.ilike.*a b c d*,location.ilike.*a b c d*");
  assert.ok(JOBS_PAGE_LIMIT >= 100);
});

test("halaman Lowongan mencari di server, bukan hanya di 100 baris terbaru", () => {
  const src = readFileSync(new URL("../src/routes/jobs.tsx", import.meta.url), "utf8");
  assert.match(src, /jobSearchFilter\(search\)/);
  assert.match(src, /query\.or\(filter\)/);
  assert.doesNotMatch(src, /\.limit\(100\)/);
});
