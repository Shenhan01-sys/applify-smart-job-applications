import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessJobSafety, isHighRiskJob } from "../src/lib/jobSafety.ts";

const NOW = new Date("2026-11-26T00:00:00Z");

test("P1-05: deteksi pungutan biaya vs sanggahan resmi tidak dipungut biaya", () => {
  const scam = assessJobSafety(
    {
      title: "Staff Gudang",
      description: "Wajib transfer biaya administrasi Rp 200.000 saat panggilan interview.",
      posted_at: "2026-11-24T00:00:00Z",
    },
    NOW,
  );
  assert.equal(scam.riskLevel, "high");
  assert.equal(isHighRiskJob({ title: "Staff Gudang", description: "Wajib bayar biaya seragam Rp 150.000", posted_at: "2026-11-24T00:00:00Z" }, NOW), true);

  const safe = assessJobSafety(
    {
      title: "Software Engineer",
      description: "Proses rekrutmen tidak dipungut biaya apapun. Hati-hati penipuan mengatasnamakan perusahaan.",
      external_url: "https://jobs.lever.co/acme/1",
      posted_at: "2026-11-22T00:00:00Z",
    },
    NOW,
  );
  assert.equal(safe.riskLevel, "low");
  assert.equal(safe.flags.length, 0);
});

test("P1-05 & P2-05: freemail, shortlink, stale (>30 hari), dan tanggal tayang tidak tercantum", () => {
  const caution = assessJobSafety(
    {
      title: "Admin Toko",
      description: "Kirim lamaran ke hr.toko@gmail.com atau klik https://s.id/loker-toko",
      posted_at: "2026-10-10T00:00:00Z",
    },
    NOW,
  );
  assert.equal(caution.riskLevel, "caution");
  assert.ok(caution.flags.some((f) => f.code === "freemail_recruiter"));
  assert.ok(caution.flags.some((f) => f.code === "shortlink_or_messaging"));
  assert.ok(caution.flags.some((f) => f.code === "stale_posting"));

  const unknownDate = assessJobSafety({ title: "Staff Operasional", description: "Operasional gudang.", posted_at: null }, NOW);
  assert.equal(unknownDate.freshness.status, "unknown");
  assert.equal(unknownDate.freshness.label, "Tanggal tayang tidak tercantum");
  assert.equal(unknownDate.riskLevel, "low");
});

test("P1-05 wiring: JobCard menampilkan lencana risiko/tanggal tayang dan halaman Lowongan punya saringan sembunyikan berisiko", () => {
  const card = readFileSync(new URL("../src/components/JobCard.tsx", import.meta.url), "utf8");
  assert.match(card, /assessJobSafety/);
  assert.match(card, /safety\.riskLevel/);
  const jobs = readFileSync(new URL("../src/routes/jobs.tsx", import.meta.url), "utf8");
  assert.match(jobs, /isHighRiskJob/);
  assert.match(jobs, /Sembunyikan indikasi berisiko/);
});
