import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { acquireMonthlyInflightSlot, effectiveMonthlyRemaining } from "../supabase/functions/_shared/quota-reservation.ts";
import { calibrateScoreWithEvidence } from "../supabase/functions/_shared/green-assessment.ts";

test("47.5 U6-P2-09: reservasi kuota bulanan mencegah balapan paralel saat sisa kuota 1 dan melepas di release()", async () => {
  assert.equal(effectiveMonthlyRemaining(1, 0), 1);
  assert.equal(effectiveMonthlyRemaining(1, 1), 0);
  assert.equal(effectiveMonthlyRemaining(0, 2), 0);

  const logs: Array<Record<string, any>> = [];
  const fakeAdmin = {
    from(table: string) {
      assert.equal(table, "application_logs");
      let op: "select" | "insert" | "update" = "select";
      let payload: any = null;
      let filterStatus: string | null = null;
      let filterId: string | null = null;
      const q: any = {
        select() { return q; },
        eq(col: string, val: any) {
          if (col === "status") filterStatus = val;
          if (col === "id") filterId = val;
          return q;
        },
        gte() { return q; },
        insert(row: any) {
          op = "insert";
          payload = row;
          return q;
        },
        update(patch: any) {
          op = "update";
          payload = patch;
          return q;
        },
        maybeSingle: async () => {
          if (op === "insert") {
            const row = { id: `inflight-${logs.length + 1}`, ...payload };
            logs.push(row);
            return { data: row, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve: any) {
          if (op === "update") {
            for (const row of logs) {
              if (!filterId || row.id === filterId) Object.assign(row, payload);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve);
          }
          const count = logs.filter((r) => !filterStatus || r.status === filterStatus).length;
          return Promise.resolve({ count, error: null }).then(resolve);
        },
      };
      return q;
    },
  };

  const first = await acquireMonthlyInflightSlot(fakeAdmin, { userId: "u1", jobId: "j1", quotaRemaining: 1 });
  assert.equal(first.allowed, true);

  // Permintaan paralel untuk lowongan kedua saat sisa 1 ditolak
  const second = await acquireMonthlyInflightSlot(fakeAdmin, { userId: "u1", jobId: "j2", quotaRemaining: 1 });
  assert.equal(second.allowed, false);

  // Setelah slot pertama dilepas, permintaan berikutnya diizinkan lagi
  await first.release();
  const third = await acquireMonthlyInflightSlot(fakeAdmin, { userId: "u1", jobId: "j3", quotaRemaining: 1 });
  assert.equal(third.allowed, true);
});

test("47.5 U6-P3-12: calibrateScoreWithEvidence membatasi skor jawaban kosong/sangat pendek dan menjaga jawaban bermakna", () => {
  const highModelScore = {
    score: 92,
    status: "ready" as const,
    feedback: { strengths: ["Klaim"], gaps: [], developmentPath: ["Lanjut"] },
  };
  const emptyResult = calibrateScoreWithEvidence(highModelScore, [
    { id: "q1", question: "Apa pengalaman energi terbarukan?", answer: "ok" },
    { id: "q2", question: "Bagaimana kelola limbah?", answer: "-" },
  ]);
  assert.ok(emptyResult.score <= 45);
  assert.equal(emptyResult.status, "needs_development");
  assert.ok(emptyResult.feedback.gaps.length >= 1);

  const substantive = calibrateScoreWithEvidence(highModelScore, [
    {
      id: "q1",
      question: "Apa pengalaman energi terbarukan?",
      answer: "Saya pernah melakukan audit efisiensi energi dan menghitung emisi karbon Scope 2 di pabrik.",
    },
  ]);
  assert.equal(substantive.score, 92);
  assert.equal(substantive.status, "ready");
});

test("47.5 U6-P3-14: generate-application menandai draf salvaged agar pengguna meninjau", () => {
  const src = readFileSync(new URL("../supabase/functions/generate-application/index.ts", import.meta.url), "utf8");
  assert.match(src, /parsed\.salvaged/);
  assert.match(src, /Perlu ditinjau: draf dipulihkan/);
  assert.match(src, /acquireMonthlyInflightSlot/);
});
