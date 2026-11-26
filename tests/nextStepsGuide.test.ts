import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { agentLogFacts, cleanNextSteps } from "../src/lib/agentEvidence.ts";
import { AGENT_EXPIRED_LABEL, describeAgentApply, describeExpiredApproval, type AgentApplyRow } from "../src/lib/agentApplyStatus.ts";
import { parseQuestions, questionsToAnswer, questionsToUpload } from "../src/lib/formQuestions.ts";
import { FINAL_STEP_LABEL, GENERIC_NEXT_PAGE_LABEL, buildNextStepGuide, nextStepGuideFor, nextStepItemText } from "../src/lib/nextStepsGuide.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

// Uji live 26 November 2026 (JobStreet, QA Tester Intern): ekstensi mengisi 12 isian di editor Riwayat karier lalu
// berhenti tanpa tombol kirim akhir. Kartu Persetujuan menunjukkan langkah berikutnya, bukan satu kalimat umum.

const JOBSTREET_LOG = {
  status: "incomplete",
  created_at: "2026-11-26T04:00:00Z",
  details: {
    channel: "extension",
    reason: "partly_filled",
    fields_filled: 12,
    approval_request_id: "4b5b7c44",
    next_steps: [
      { kind: "subform_save", label: "Simpan jabatan" },
      { kind: "next_page", label: "Review dan kirim" },
    ],
  },
};

const extensionRow = (log = JOBSTREET_LOG): AgentApplyRow => ({ status: "completed", job_type: "extension_apply", ...agentLogFacts(log) });

test("agentLogFacts: next_steps log ekstensi dibaca; log worker dan log tanpa kunci itu tidak membawanya", () => {
  assert.deepEqual(agentLogFacts(JOBSTREET_LOG).next_steps, [
    { kind: "subform_save", label: "Simpan jabatan" },
    { kind: "next_page", label: "Review dan kirim" },
  ]);
  assert.equal("next_steps" in agentLogFacts({ ...JOBSTREET_LOG, details: { ...JOBSTREET_LOG.details, next_steps: [] } }), false);
  assert.equal("next_steps" in agentLogFacts({ ...JOBSTREET_LOG, details: { ...JOBSTREET_LOG.details, channel: undefined } }), false);
});

test("cleanNextSteps: jenis tak dikenal, label kosong, duplikat, dan bukan larik dibuang", () => {
  assert.deepEqual(cleanNextSteps("bukan larik"), []);
  assert.deepEqual(
    cleanNextSteps([
      { kind: "upload_file", label: " Unggah CV secara manual " },
      { kind: "upload_file", label: "Unggah CV secara manual" },
      { kind: "hack", label: "x" },
      { kind: "next_page", label: "   " },
      "teks",
      null,
    ]),
    [{ kind: "upload_file", label: "Unggah CV secara manual" }],
  );
  assert.equal(cleanNextSteps(Array.from({ length: 12 }, (_, i) => ({ kind: "next_page", label: `Langkah ${i}` }))).length, 6);
});

test("buildNextStepGuide: JobStreet Riwayat karier menjadi empat langkah bernomor, dari buka tab sampai Kirim Sekarang", () => {
  const items = buildNextStepGuide(agentLogFacts(JOBSTREET_LOG).next_steps)!;
  assert.deepEqual(items.map(nextStepItemText), [
    "Buka tab lowongan yang dibuka ekstensi.",
    "Klik Simpan jabatan untuk menyimpan isian yang sedang terbuka di halaman itu.",
    "Klik Review dan kirim untuk lanjut ke halaman berikutnya.",
    "Tekan Kirim Sekarang di panel ekstensi setelah kamu memeriksa isiannya.",
  ]);
  assert.equal(items[0].openTab, true);
  assert.equal(items[items.length - 1].label, FINAL_STEP_LABEL);
});

test("buildNextStepGuide: berkas, jawaban, dan langkah halaman umum ditulis dalam bahasa Indonesia tanpa em dash", () => {
  const items = buildNextStepGuide([
    { kind: "answer_required", label: "Jawab: Lokasi" },
    { kind: "upload_file", label: "Unggah CV secara manual" },
    { kind: "subform_save", label: "Simpan jabatan" },
    { kind: "next_page", label: GENERIC_NEXT_PAGE_LABEL },
  ])!;
  const texts = items.map(nextStepItemText);
  assert.ok(texts.includes("Jawab: Lokasi. Kolom jawabannya ada di kartu ini."), JSON.stringify(texts));
  assert.ok(texts.includes("Unggah CV sendiri di tab lowongan."), JSON.stringify(texts));
  assert.ok(texts.includes("Lanjut ke halaman berikutnya sampai tiba di halaman terakhir sebelum kirim."), JSON.stringify(texts));
  assert.ok(!texts.join(" ").includes("—"), "tanpa em dash");
});

test("buildNextStepGuide: tanpa langkah, atau hanya login, tidak menghasilkan daftar", () => {
  assert.equal(buildNextStepGuide(undefined), null);
  assert.equal(buildNextStepGuide([]), null);
  assert.equal(buildNextStepGuide([{ kind: "login", label: "Masuk ke akunmu di tab lowongan" }]), null);
});

test("kartu agen: log ekstensi berhenti sebelum kirim dengan next_steps menampilkan daftar; tanpa next_steps tetap kalimat lama", () => {
  const row = extensionRow();
  const view = describeAgentApply(row);
  assert.equal(view.tone, "ready");
  assert.match(view.label, /12 isian/);
  const guide = nextStepGuideFor(row, view.tone);
  assert.ok(guide && guide.length === 4);

  const old = extensionRow({ ...JOBSTREET_LOG, details: { ...JOBSTREET_LOG.details, next_steps: undefined } } as typeof JOBSTREET_LOG);
  assert.equal(nextStepGuideFor(old, describeAgentApply(old).tone), null);
  assert.match(describeAgentApply(old).hint, /Kirim Sekarang/, "kalimat lama menjadi cadangan");
  // log worker tidak pernah memakai daftar ini
  assert.equal(nextStepGuideFor({ ...row, channel: undefined }, "ready"), null);
});

test("persetujuan kedaluwarsa: label Persetujuan kedaluwarsa dan penjelasan tanpa langkah lanjutan", () => {
  const view = describeExpiredApproval();
  assert.equal(view.label, AGENT_EXPIRED_LABEL);
  assert.equal(view.label, "Persetujuan kedaluwarsa");
  assert.doesNotMatch(view.hint, /Lanjutkan di ekstensi|Perlu tindakanmu/);
  assert.ok(!view.hint.includes("—"));
});

test("parseQuestions: log lama File PDF (pilihan) menjadi petunjuk unggah, dan IDN (kode negara) tidak ditanyakan (Dealls)", () => {
  const questions = parseQuestions([
    { key: "file pdf", label: "File PDF (opsional)", kind: "select", options: ["File PDF"], required: false },
    { key: "idn", label: "IDN (opsional)", kind: "select", options: ["Singapura (+65)", "Indonesia (+62)", "Malaysia (+60)"], required: false },
    { key: "lokasi", label: "Lokasi (wajib)", kind: "text", required: true },
    { key: "pendidikan", label: "Pendidikan terakhir", kind: "select", options: ["SMA", "S1"], required: true },
  ]);
  assert.deepEqual(
    questions.map((q) => [q.key, q.kind]),
    [
      ["file pdf", "file"],
      ["lokasi", "text"],
      ["pendidikan", "select"],
    ],
  );
  assert.equal("options" in questions[0], false);
  const facts = { log_status: "incomplete", questions };
  assert.deepEqual(questionsToUpload(facts).map((q) => q.key), ["file pdf"]);
  assert.deepEqual(questionsToAnswer(facts).map((q) => q.key), ["lokasi", "pendidikan"]);
});

test("kartu Persetujuan memakai daftar langkah, gerbang kedaluwarsa, dan tidak mengklik apa pun", () => {
  const status = read("../src/components/AgentApplyStatus.tsx");
  assert.match(status, /nextStepGuideFor\(row, view\.tone\)/);
  assert.match(status, /<AgentNextSteps items=\{nextSteps\}/);
  assert.match(status, /expired \? describeExpiredApproval\(\)/);
  const steps = read("../src/components/AgentNextSteps.tsx");
  assert.match(steps, /Langkah berikutnya|NEXT_STEPS_TITLE/);
  assert.doesNotMatch(steps, /onClick|<button/, "daftar hanya petunjuk dan tautan buka tab");
  const page = read("../src/routes/approvals.tsx");
  assert.match(page, /const expired = approved && placement\.stage === 'expired'/);
  assert.match(page, /\{approved && !expired && \(\s*<AgentQuestions/);
  assert.match(page, /\{approved && !expired && \(\s*<AgentSecurityCode/);
  assert.match(page, /\{approved && !expired && \(\s*<AgentManualSubmit/);
  assert.match(page, /expired=\{expired\}/);
});
