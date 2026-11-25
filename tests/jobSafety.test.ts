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

test("lencana lowongan lama memakai tanggal yang sama dengan kartu: posted_at, lalu created_at, lalu tidak ada", () => {
  const base = { title: "Staff Operasional", description: "Operasional gudang." };

  // posted_at kosong, created_at 57 hari lalu: kartu mencetak tanggal itu, lencana ikut menandai lama.
  const savedOnly = assessJobSafety({ ...base, posted_at: null, created_at: "2026-09-30T00:00:00Z" }, NOW);
  assert.equal(savedOnly.freshness.status, "stale");
  assert.equal(savedOnly.freshness.ageDays, 57);
  assert.equal(savedOnly.freshness.source, "saved");
  // Dari tanggal simpan, label tidak mengaku "tayang" karena tanggal tayang sebenarnya tidak diketahui.
  assert.equal(savedOnly.freshness.label, "Tersimpan 57 hari lalu (mungkin sudah tutup)");
  const savedFlag = savedOnly.flags.find((f) => f.code === "stale_posting");
  assert.ok(savedFlag);
  assert.equal(savedFlag.label, "Lowongan lama (57 hari)");
  assert.match(savedFlag.detail, /tanggal lowongan tersimpan/);
  assert.equal(savedOnly.riskLevel, "caution");
  assert.ok(!savedOnly.flags.some((f) => f.code === "missing_posted_date"));

  // posted_at tidak valid jatuh ke created_at, persis seperti postedDate di kartu.
  const badPosted = assessJobSafety({ ...base, posted_at: "bukan tanggal", created_at: "2026-09-30T00:00:00Z" }, NOW);
  assert.equal(badPosted.freshness.source, "saved");
  assert.equal(badPosted.freshness.status, "stale");

  // created_at baru: tidak ditandai lama.
  const savedRecent = assessJobSafety({ ...base, posted_at: null, created_at: "2026-11-20T00:00:00Z" }, NOW);
  assert.equal(savedRecent.freshness.status, "fresh");
  assert.ok(!savedRecent.flags.some((f) => f.code === "stale_posting"));
  assert.equal(savedRecent.riskLevel, "low");

  // posted_at valid menang atas created_at, dua arah: created_at lama tidak menandai lowongan yang baru tayang.
  const postedWins = assessJobSafety({ ...base, posted_at: "2026-11-20T00:00:00Z", created_at: "2026-08-01T00:00:00Z" }, NOW);
  assert.equal(postedWins.freshness.source, "posted");
  assert.equal(postedWins.freshness.status, "fresh");
  assert.ok(!postedWins.flags.some((f) => f.code === "stale_posting"));
  const postedOld = assessJobSafety({ ...base, posted_at: "2026-10-10T00:00:00Z", created_at: "2026-11-25T00:00:00Z" }, NOW);
  assert.equal(postedOld.freshness.status, "stale");
  assert.equal(postedOld.freshness.label, "Tayang 47 hari lalu (mungkin sudah tutup)");
  assert.match(postedOld.flags.find((f) => f.code === "stale_posting")!.detail, /sudah tayang lebih dari 30 hari/);

  // Tanpa kedua tanggal, kartu mencetak "Tanggal tayang tidak tercantum" dan lencana tidak menandai lama.
  const none = assessJobSafety({ ...base, posted_at: null, created_at: "tidak valid" }, NOW);
  assert.equal(none.freshness.status, "unknown");
  assert.equal(none.freshness.source, null);
  assert.ok(none.flags.some((f) => f.code === "missing_posted_date"));
  assert.ok(!none.flags.some((f) => f.code === "stale_posting"));

  // Kartu meneruskan seluruh baris (termasuk created_at) ke lencana dan ke postedDate.
  const card = readFileSync(new URL("../src/components/JobCard.tsx", import.meta.url), "utf8");
  assert.match(card, /assessJobSafety\(job\)/);
  assert.match(card, /postedDate\(job /);
});

test("P1-05 wiring: JobCard menampilkan lencana risiko/tanggal tayang dan halaman Lowongan punya saringan sembunyikan berisiko", () => {
  const card = readFileSync(new URL("../src/components/JobCard.tsx", import.meta.url), "utf8");
  assert.match(card, /assessJobSafety/);
  assert.match(card, /safety\.riskLevel/);
  const jobs = readFileSync(new URL("../src/routes/jobs.tsx", import.meta.url), "utf8");
  assert.match(jobs, /isHighRiskJob/);
  assert.match(jobs, /Sembunyikan indikasi berisiko/);
});
