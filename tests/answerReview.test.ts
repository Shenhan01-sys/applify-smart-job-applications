import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SOURCE_LABEL,
  confidenceLevel,
  countNeedingAttention,
  needsAttention,
  normalizeAnswers,
  type ApprovalAnswer,
} from "../src/lib/answerReview.ts";

const answer = (over: Partial<ApprovalAnswer> = {}): ApprovalAnswer => ({
  question: "Nama lengkap",
  answer: "Budi Uji",
  confidence: 0.99,
  needs_review: false,
  source: "rule",
  ...over,
});

test("confidenceLevel: >0,8 tinggi, 0,5 sampai 0,8 sedang, <0,5 rendah (sama dengan backend)", () => {
  assert.equal(confidenceLevel(0.99), "high");
  assert.equal(confidenceLevel(0.81), "high");
  assert.equal(confidenceLevel(0.8), "medium");
  assert.equal(confidenceLevel(0.75), "medium");
  assert.equal(confidenceLevel(0.5), "medium");
  assert.equal(confidenceLevel(0.49), "low");
  assert.equal(confidenceLevel(0), "low");
  assert.equal(confidenceLevel(Number.NaN), "low");
});

test("needsAttention: ditandai bila needs_review, keyakinan tidak tinggi, atau jawaban kosong", () => {
  assert.equal(needsAttention(answer()), false);
  assert.equal(needsAttention(answer({ needs_review: true })), true);
  assert.equal(needsAttention(answer({ confidence: 0.75 })), true, "sedang tetap disorot");
  assert.equal(needsAttention(answer({ confidence: 0.3 })), true);
  assert.equal(needsAttention(answer({ answer: "   " })), true);
});

test("countNeedingAttention menghitung yang disorot", () => {
  const list = [answer(), answer({ confidence: 0.75, needs_review: true, source: "ai" }), answer({ confidence: 0, answer: "" })];
  assert.equal(countNeedingAttention(list), 2);
});

test("normalizeAnswers: menerima array, string JSON, null, dan baris lama tanpa skor", () => {
  const raw = [{ question: "Q", answer: "A", confidence: 0.9, needs_review: false, source: "rule" }];
  assert.deepEqual(normalizeAnswers(raw), raw);
  assert.deepEqual(normalizeAnswers(JSON.stringify(raw)), raw);
  assert.deepEqual(normalizeAnswers(null), []);
  assert.deepEqual(normalizeAnswers("bukan json"), []);
  assert.deepEqual(normalizeAnswers({ question: "Q" }), []);

  const old = normalizeAnswers([{ question: "Q lama", answer: "A" }, { nope: 1 }, null]);
  assert.equal(old.length, 1);
  assert.equal(old[0].confidence, 0, "tanpa skor dianggap rendah supaya dicek");
  assert.equal(old[0].needs_review, true);
  assert.equal(needsAttention(old[0]), true);
});

test("normalizeAnswers: skor di luar 0..1 dipotong dan source asing dibuang", () => {
  const [a] = normalizeAnswers([{ question: "Q", answer: "A", confidence: 5, needs_review: false, source: "magic" }]);
  assert.equal(a.confidence, 1);
  assert.equal(a.source, undefined);
});

test("SOURCE_LABEL: jawaban yang diambil backend dari Profil berlabel Dari Profil", () => {
  assert.equal(SOURCE_LABEL.profile, "Dari Profil");
});

test("SOURCE_LABEL: jawaban aturan memakai nama menu Pengaturan Agen", () => {
  assert.equal(SOURCE_LABEL.rule, "Dari Pengaturan Agen");
});
