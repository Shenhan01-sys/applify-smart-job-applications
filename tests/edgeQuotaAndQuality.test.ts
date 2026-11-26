import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { acquireMonthlyInflightSlot, effectiveMonthlyRemaining, isValidUuid } from "../supabase/functions/_shared/quota-reservation.ts";
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

test("task-2d: slot.release() idempoten dan pelepasan dilakukan segera setelah consume_monthly_apply serta aman dari double-count SQL", async () => {
  let updates = 0;
  const fakeAdmin = {
    from(table: string) {
      assert.equal(table, "application_logs");
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        gte: async () => ({ count: 0, error: null }),
        insert() {
          return {
            select() {
              return { maybeSingle: async () => ({ data: { id: "log-123" }, error: null }) };
            },
          };
        },
        update() {
          updates += 1;
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
      };
    },
  };

  const slot = await acquireMonthlyInflightSlot(fakeAdmin, { userId: "u-1", jobId: "j-1", quotaRemaining: 1 });
  assert.equal(slot.allowed, true);
  await slot.release();
  await slot.release();
  assert.equal(updates, 1, "release() kedua (dari finally) harus menjadi no-op tanpa query ulang");

  const edgeSrc = readFileSync(new URL("../supabase/functions/generate-application/index.ts", import.meta.url), "utf8");
  const consumeIdx = edgeSrc.indexOf('rpc("consume_monthly_apply"');
  const releaseAfterConsumeIdx = edgeSrc.indexOf("await slot?.release();", consumeIdx);
  const returnIdx = edgeSrc.indexOf("return json({ application: app", consumeIdx);
  assert.ok(consumeIdx > 0 && releaseAfterConsumeIdx > consumeIdx && releaseAfterConsumeIdx < returnIdx);

  const sqlDraft = readFileSync(
    new URL("../../database/migrations/DRAFT_2026-11-26_monthly_quota_reserve.sql", import.meta.url),
    "utf8",
  );
  assert.match(sqlDraft, /NOT EXISTS\s*\(\s*SELECT 1\s+FROM public\.ai_applications/i);
  assert.match(sqlDraft, /~[*]\s*'\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$'/i);
  assert.match(sqlDraft, /THEN\s*\(l\.details ->> 'job_id'\)::uuid\s+ELSE NULL/i);
});

test("Gelombang 11 (2): isValidUuid & generate-application menolak jobId non-UUID sebelum reservasi kuota", () => {
  assert.equal(isValidUuid("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(isValidUuid("  11111111-1111-4111-8111-111111111111  "), true);
  assert.equal(isValidUuid(""), false);
  assert.equal(isValidUuid("not-a-uuid"), false);
  assert.equal(isValidUuid(null), false);

  const edgeSrc = readFileSync(new URL("../supabase/functions/generate-application/index.ts", import.meta.url), "utf8");
  const uuidIdx = edgeSrc.indexOf("isValidUuid(jobId)");
  const reserveIdx = edgeSrc.indexOf("acquireMonthlyInflightSlot(");
  assert.ok(uuidIdx > 0 && reserveIdx > uuidIdx, "validasi UUID harus sebelum reservasi kuota bulanan");
});
