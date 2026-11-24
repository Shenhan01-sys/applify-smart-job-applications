import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NO_COMPANY_LABEL, NO_TITLE_LABEL, duplicateApplications, duplicateLabel, formatCreated, jobDisplay } from "../src/lib/applicationCards.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const TZ = "Asia/Jakarta";

// Uji E2E klik 20 November 2026 (temuan 18): dua kartu berjudul sama di satu kolom tidak bisa dibedakan.

test("temuan 18: formatCreated menulis tanggal dan jam singkat, kosong bila tanggal tidak terbaca", () => {
  assert.equal(formatCreated("2026-11-20T16:10:00Z", TZ), "20 Nov, 23.10");
  assert.equal(formatCreated("2026-11-20T23:05:00Z", TZ), "21 Nov, 06.05");
  assert.equal(formatCreated("bukan tanggal", TZ), "");
  assert.equal(formatCreated(null, TZ), "");
  assert.equal(formatCreated(undefined, TZ), "");
});

test("temuan 18: dua lamaran untuk lowongan yang sama diberi urutan menurut waktu dibuat, bukan menurut urutan daftar", () => {
  // daftar dari server terbaru lebih dulu
  const apps = [
    { id: "b", created_at: "2026-11-20T16:10:00Z", job_id: "j1", title: "Strategic Account Executive", company: "Datadog" },
    { id: "a", created_at: "2026-11-20T15:20:00Z", job_id: "j1", title: "Strategic Account Executive", company: "Datadog" },
    { id: "c", created_at: "2026-11-20T15:30:00Z", job_id: "j2", title: "Web3 Developer", company: "Acme" },
  ];
  const d = duplicateApplications(apps, TZ);
  assert.deepEqual(d.get("a"), { position: 1, total: 2, created: "20 Nov, 22.20" });
  assert.deepEqual(d.get("b"), { position: 2, total: 2, created: "20 Nov, 23.10" });
  // kartu tanpa kembaran tidak diberi apa pun
  assert.equal(d.has("c"), false);
  assert.equal(d.size, 2);
  assert.equal(duplicateLabel(d.get("b")!), "Lamaran ke-2 dari 2 · dibuat 20 Nov, 23.10");
});

test("temuan 18: lowongan yang sama dikenali dari judul dan perusahaan (huruf besar-kecil dan spasi diabaikan), walau job_id beda", () => {
  const d = duplicateApplications(
    [
      { id: "1", created_at: "2026-11-01T01:00:00Z", job_id: "j1", title: "Data Analyst", company: "Gojek" },
      { id: "2", created_at: "2026-11-02T01:00:00Z", job_id: "j9", title: "  data  analyst ", company: "GOJEK" },
      { id: "3", created_at: "2026-11-03T01:00:00Z", job_id: "j1", title: "Data Analyst", company: "Tokopedia" },
    ],
    TZ,
  );
  assert.deepEqual([...d.keys()].sort(), ["1", "2"]);
  assert.equal(d.get("1")?.position, 1);
  assert.equal(d.get("2")?.position, 2);
});

test("temuan 18: tiga lamaran, tanggal tak terbaca di akhir, kartu tanpa judul memakai id lowongan", () => {
  const d = duplicateApplications(
    [
      { id: "x", created_at: null, title: "Writer", company: "Kompas" },
      { id: "y", created_at: "2026-11-05T01:00:00Z", title: "Writer", company: "Kompas" },
      { id: "z", created_at: "2026-11-04T01:00:00Z", title: "Writer", company: "Kompas" },
    ],
    TZ,
  );
  assert.deepEqual([d.get("z")?.position, d.get("y")?.position, d.get("x")?.position], [1, 2, 3]);
  assert.equal(d.get("x")?.total, 3);
  assert.equal(d.get("x")?.created, "");
  assert.equal(duplicateLabel(d.get("x")!), "Lamaran ke-3 dari 3");
  // tanpa judul dan perusahaan: dua lamaran dengan job_id sama dianggap satu lowongan, id lowongan beda tidak
  const noTitle = duplicateApplications([
    { id: "p", job_id: "j1", created_at: "2026-11-01T00:00:00Z" },
    { id: "q", job_id: "j1", created_at: "2026-11-02T00:00:00Z" },
    { id: "r", job_id: "j2", created_at: "2026-11-02T00:00:00Z" },
  ], TZ);
  assert.deepEqual([...noTitle.keys()].sort(), ["p", "q"]);
  assert.equal(duplicateApplications([], TZ).size, 0);
});

test("temuan 18: papan dan daftar memasang baris pembeda hanya lewat duplicates, tanpa mengubah kartu lain", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /const duplicates = useMemo\(\s*\n\s*\(\) => duplicateApplications\(applications\.map/);
  assert.equal([...src.matchAll(/duplicate=\{duplicates\.get\(app\.id\)\}/g)].length, 3, "kartu papan, daftar layar sempit, daftar utama");
  assert.match(src, /<DuplicateNote info=\{duplicate\} className="mt-1 leading-snug" \/>/);
  assert.match(src, /if \(!info\) return null;/);
  // kecil dan pudar, bukan lencana
  assert.match(src, /text-xs text-muted-foreground\/80/);
});

// Uji E2E 24 November 2026: kartu berjudul "Lowongan" dan "Perusahaan". Penyebabnya RLS tabel jobs (hanya status active):
// lamaran untuk lowongan yang sudah closed kembali dengan jobs: null.
test("jobDisplay: judul dan perusahaan dari join dipakai apa adanya (dirapikan), bukan teks cadangan", () => {
  assert.deepEqual(jobDisplay({ title: "  Data Scientist Intern ", company: "GoToGroup" }), { title: "Data Scientist Intern", company: "GoToGroup", known: true });
});

test("jobDisplay: lowongan tidak terbawa join atau kolomnya kosong -> teks cadangan yang jelas, bukan 'Lowongan' atau 'Perusahaan'", () => {
  for (const job of [null, undefined, {}, { title: "", company: "" }, { title: "   ", company: null }, { title: 5, company: {} }]) {
    const d = jobDisplay(job as any);
    assert.equal(d.title, NO_TITLE_LABEL);
    assert.equal(d.company, NO_COMPANY_LABEL);
    assert.equal(d.known, false);
  }
  assert.equal(NO_TITLE_LABEL, "Lowongan tanpa judul");
  assert.notEqual(NO_TITLE_LABEL, "Lowongan");
  assert.notEqual(NO_COMPANY_LABEL, "Perusahaan");
  // judul ada, perusahaan kosong: judul asli tetap tampil
  assert.deepEqual(jobDisplay({ title: "Web3 Developer", company: "" }), { title: "Web3 Developer", company: NO_COMPANY_LABEL, known: true });
});

test("Lamaran Saya: kartu, baris, seretan, pembaca layar, dan jendela detail memakai jobDisplay, tanpa teks 'Lowongan' atau 'Perusahaan' polos", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /import \{[^}]*\bjobDisplay\b[^}]*\} from "@\/lib\/applicationCards"/);
  assert.doesNotMatch(src, /\|\| "(Lowongan|Perusahaan|Posisi|Lamaran)"/);
  assert.ok(src.split("jobDisplay(").length - 1 >= 9);
});

test("kembaran tetap dikenali walau lowongannya tersembunyi (jobs null): kuncinya job_id", () => {
  const d = duplicateApplications([
    { id: "a", created_at: "2026-11-20T15:20:00Z", job_id: "j1", title: undefined, company: undefined },
    { id: "b", created_at: "2026-11-20T16:10:00Z", job_id: "j1", title: undefined, company: undefined },
    { id: "c", created_at: "2026-11-20T16:10:00Z", job_id: "j2", title: undefined, company: undefined },
  ], TZ);
  assert.deepEqual([...d.keys()].sort(), ["a", "b"]);
});
