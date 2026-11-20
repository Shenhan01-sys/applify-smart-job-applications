import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REJECT_REASON_HINT,
  rejectReasonHint,
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

// Uji E2E klik 20 November 2026 (temuan 9): kolom alasan tolak ada di dasar jendela panjang tanpa petunjuk.
test("temuan 9: petunjuk alasan wajib tampil selama formulir tolak terbuka dan alasan masih kosong", () => {
  assert.equal(rejectReasonHint(true, ""), REJECT_REASON_HINT);
  assert.equal(rejectReasonHint(true, "   \n "), REJECT_REASON_HINT);
  assert.equal(rejectReasonHint(true, "gaji terlalu rendah"), null);
  // formulir tolak tertutup: tidak ada petunjuk
  assert.equal(rejectReasonHint(false, ""), null);
  assert.match(REJECT_REASON_HINT, /wajib diisi/);
  assert.match(REJECT_REASON_HINT, /Kenapa ditolak\?/);
  assert.match(REJECT_REASON_HINT, /Konfirmasi Tolak/);
});

test("temuan 9: tombol Tolak menggulir kolom alasan ke tampilan, memberi fokus, dan petunjuk dipasang di footer dekat tombol", () => {
  const src = readFileSync(new URL("../src/components/ApprovalReviewModal.tsx", import.meta.url), "utf8");
  assert.match(src, /const rejectReasonRef = useRef<HTMLTextAreaElement>\(null\)/);
  const effect = src.slice(src.indexOf("useEffect(() => {"), src.indexOf("const handleApprove"));
  assert.match(effect, /if \(!showRejectForm\) return/);
  assert.match(effect, /field\.scrollIntoView\(\{ block: .center. \}\)/);
  assert.match(effect, /field\.focus\(\{ preventScroll: true \}\)/);
  assert.match(effect, /\[showRejectForm\]/);
  assert.match(src, /<textarea\s+ref=\{rejectReasonRef\}/);
  assert.match(src, /aria-required="true"/);
  assert.match(src, /aria-describedby=\{rejectHint \? .reject-reason-hint. : undefined\}/);
  // petunjuk ada di footer, sebelum deretan tombol, dan hilang begitu alasan terisi
  assert.match(src, /const rejectHint = rejectReasonHint\(showRejectForm, rejectReason\)/);
  const footer = src.slice(src.indexOf("border-t-2 border-[#16150F]/10 px-6 py-4"));
  assert.ok(footer.indexOf("{rejectHint &&") > -1 && footer.indexOf("{rejectHint &&") < footer.indexOf("Konfirmasi Tolak"));
  assert.match(footer, /id="reject-reason-hint" role="status"/);
  // tombol konfirmasi tetap nonaktif tanpa alasan
  assert.match(src, /disabled=\{loading \|\| !rejectReason\.trim\(\)\}/);
});
