import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAgentApplyRows, latestQueueJobIds } from "../src/lib/agentApplyRows.ts";
import { agentLogFacts, cleanDocumentsAttached, describeDocumentsAttached } from "../src/lib/agentEvidence.ts";
import { describeAgentApply } from "../src/lib/agentApplyStatus.ts";
import {
  ERROR_EMPTY,
  EXTENSION_ANSWERS_SAVED_TEXT,
  SELF_FILL_LABEL,
  answersToRows,
  fileUploadInstruction,
  initialAnswers,
  isRequiredQuestion,
  parseQuestions,
  questionsToAnswer,
  questionsToSelfFill,
  questionsToUpload,
  validateAnswers,
  type PendingQuestion,
} from "../src/lib/formQuestions.ts";

/**
 * Jembatan Ekstensi Browser di sisi frontend (fase 1): status agen dari log ekstensi, kartu pertanyaan tanpa
 * rerun worker, kolom rahasia (`secret_skip`), dan ringkasan berkas terpasang. Bentuk log ekstensi mengikuti
 * `reportExtensionRun` di backend/services/extension-runner.ts.
 */

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const T = (min: number) => new Date(Date.UTC(2026, 10, 24, 3, min, 0)).toISOString();

const queue = (id: string, approvalId: string, status: string, min = 0, over: Record<string, unknown> = {}) => ({
  id,
  status,
  error_message: null,
  created_at: T(min),
  payload: { approval_request_id: approvalId },
  ...over,
});

const workerLog = (queueId: string, approvalId: string, status: string, min: number, details: Record<string, unknown> = {}) => ({
  status,
  created_at: T(min),
  details: { queue_job_id: queueId, approval_request_id: approvalId, fields_filled: 3, ...details },
});

const extLog = (approvalId: string, status: string, min: number, details: Record<string, unknown> = {}) => ({
  status,
  created_at: T(min),
  details: { channel: "extension", run_id: `run-${min}`, approval_request_id: approvalId, fields_filled: 5, ...details },
});

const Q_TEXT = { key: "why us", label: "Why do you want to work here?", kind: "textarea", required: true };
const Q_OPT = { key: "linkedin profile", label: "LinkedIn profile", kind: "text", required: false };
const Q_SECRET = { key: "account password", label: "Account password", kind: "secret_skip", required: true };
const Q_FILE = { key: "unggah cv secara manual", label: "Unggah CV secara manual", kind: "file", required: true };

// ---- pemilihan log terbaru: worker atau ekstensi ----

test("hanya log worker: perilaku lama (status tugas, id tugas, fakta log)", () => {
  const rows = buildAgentApplyRows([queue("q1", "a1", "completed")], [workerLog("q1", "a1", "ready", 5, { reason: null })], []);
  assert.deepEqual(Object.keys(rows), ["a1"]);
  assert.equal(rows.a1.status, "completed");
  assert.equal(rows.a1.queue_job_id, "q1");
  assert.equal(rows.a1.log_status, "ready");
  assert.equal(rows.a1.fields_filled, 3);
  assert.equal(rows.a1.channel, undefined);
});

test("tugas tanpa log tetap punya baris dengan fields_filled null", () => {
  const rows = buildAgentApplyRows([queue("q1", "a1", "pending")], [], []);
  assert.deepEqual(rows.a1, { status: "pending", error_message: null, fields_filled: null, queue_job_id: "q1" });
});

test("log ekstensi lebih baru daripada log worker: fakta dari ekstensi, tanpa id tugas, status completed", () => {
  const rows = buildAgentApplyRows(
    [queue("q1", "a1", "failed", 0, { error_message: "timeout" })],
    [workerLog("q1", "a1", "incomplete", 5)],
    [extLog("a1", "ready", 9, { questions: [Q_TEXT], documents_attached: { resume: true, cover_letter: true } })],
  );
  const row = rows.a1;
  assert.equal(row.channel, "extension");
  assert.equal(row.log_status, "ready");
  assert.equal(row.fields_filled, 5);
  assert.equal(row.status, "completed");
  assert.equal(row.error_message, null);
  assert.equal(row.queue_job_id, undefined);
  assert.equal(row.logged_at, T(9));
  assert.deepEqual(row.documents_attached, { resume: true, cover_letter: true });
  assert.equal(questionsToAnswer(row).length, 1);
  // status tugas "failed" milik percobaan lama tidak lagi menimpa hasil ekstensi
  assert.notEqual(describeAgentApply(row).label, "Agen gagal");
});

test("log worker lebih baru daripada log ekstensi: log worker dipakai", () => {
  const rows = buildAgentApplyRows(
    [queue("q1", "a1", "completed")],
    [workerLog("q1", "a1", "ready", 12, { questions: [{ key: "k", label: "Pertanyaan worker", kind: "text" }] })],
    [extLog("a1", "ready", 9, { questions: [Q_TEXT] })],
  );
  assert.equal(rows.a1.channel, undefined);
  assert.equal(rows.a1.queue_job_id, "q1");
  assert.equal(rows.a1.logged_at, T(12));
  assert.equal(rows.a1.questions?.[0].label, "Pertanyaan worker");
});

test("waktu sama: log worker menang (membawa id tugas)", () => {
  const rows = buildAgentApplyRows([queue("q1", "a1", "completed")], [workerLog("q1", "a1", "ready", 7)], [extLog("a1", "ready", 7)]);
  assert.equal(rows.a1.channel, undefined);
  assert.equal(rows.a1.queue_job_id, "q1");
});

test("urutan baris masukan tidak menentukan: yang terbaru menurut created_at menang", () => {
  const exts = [extLog("a1", "ready", 3), extLog("a1", "success", 20), extLog("a1", "incomplete", 10)];
  assert.equal(buildAgentApplyRows([], [], exts).a1.log_status, "success");
  assert.equal(buildAgentApplyRows([], [], [...exts].reverse()).a1.log_status, "success");
  const workers = [workerLog("q1", "a1", "incomplete", 4), workerLog("q1", "a1", "ready", 8), workerLog("q1", "a1", "awaiting_code", 2)];
  assert.equal(buildAgentApplyRows([queue("q1", "a1", "completed")], workers, []).a1.log_status, "ready");
});

test("persetujuan hanya dengan log ekstensi (tanpa tugas worker) tetap punya baris", () => {
  const rows = buildAgentApplyRows([], [], [extLog("a9", "ready", 4)]);
  assert.deepEqual(Object.keys(rows), ["a9"]);
  assert.equal(rows.a9.status, "completed");
  assert.equal(rows.a9.channel, "extension");
  assert.equal(rows.a9.approval_request_id, "a9");
  assert.equal(describeAgentApply(rows.a9).tone, "ready");
});

test("tugas worker yang masih berjalan dan dibuat sesudah log ekstensi tetap tampil sebagai berjalan", () => {
  const rows = buildAgentApplyRows([queue("q2", "a1", "pending", 15)], [], [extLog("a1", "ready", 9)]);
  assert.equal(rows.a1.status, "pending");
  assert.equal(rows.a1.queue_job_id, "q2");
  assert.equal(rows.a1.channel, "extension");
});

test("tugas worker yang masih berjalan tetapi dibuat sebelum log ekstensi tidak menyembunyikan hasil ekstensi", () => {
  const rows = buildAgentApplyRows([queue("q2", "a1", "pending", 2)], [], [extLog("a1", "ready", 9)]);
  assert.equal(rows.a1.status, "completed");
  assert.equal(rows.a1.queue_job_id, undefined);
});

test("hanya log worker milik tugas terbaru yang dibaca; log tugas lama diabaikan", () => {
  const rows = buildAgentApplyRows(
    [queue("q-old", "a1", "completed", 1), queue("q-new", "a1", "completed", 10)],
    [workerLog("q-old", "a1", "success", 30), workerLog("q-new", "a1", "ready", 11)],
    [],
  );
  assert.equal(rows.a1.queue_job_id, "q-new");
  assert.equal(rows.a1.log_status, "ready");
  assert.deepEqual(latestQueueJobIds([queue("q-old", "a1", "completed", 1), queue("q-new", "a1", "completed", 10), queue("q-b", "b", "pending", 3)]).sort(), ["q-b", "q-new"]);
});

test("log tanpa channel ekstensi atau tanpa approval_request_id tidak masuk jalur ekstensi", () => {
  const noChannel = { status: "ready", created_at: T(9), details: { approval_request_id: "a1", fields_filled: 1 } };
  const noApproval = { status: "ready", created_at: T(9), details: { channel: "extension" } };
  assert.deepEqual(buildAgentApplyRows([], [], [noChannel, noApproval]), {});
});

test("masukan rusak tidak melempar galat", () => {
  for (const bad of [null, undefined, "x", 3, {}, [null, 1, "x", { details: 1 }, { details: { channel: "extension" } }]]) {
    assert.deepEqual(buildAgentApplyRows(bad, bad, bad), {});
  }
  assert.deepEqual(latestQueueJobIds(null), []);
});

// ---- fakta log ekstensi ----

test("agentLogFacts: log ekstensi bertanda channel dan membawa documents_attached tanpa nama berkas", () => {
  const facts = agentLogFacts(
    extLog("a1", "ready", 9, { documents_attached: { resume: "/Users/hans/Documents/cv-hans.pdf", cover_letter: true, transcript: false, portfolio: "", lain: true } }),
  );
  assert.equal(facts.channel, "extension");
  assert.deepEqual(facts.documents_attached, { resume: true, cover_letter: true, transcript: false, portfolio: false });
  assert.equal(JSON.stringify(facts).includes("cv-hans"), false);
  assert.equal(JSON.stringify(facts).includes("/Users"), false);
});

test("agentLogFacts: log worker tidak punya channel dan documents_attached-nya tidak dibaca", () => {
  const facts = agentLogFacts({ status: "ready", created_at: T(1), details: { queue_job_id: "q", documents_attached: { transcript: true, portfolio: false } } });
  assert.equal("channel" in facts, false);
  assert.equal("documents_attached" in facts, false);
});

test("agentLogFacts: log ekstensi tanpa documents_attached atau dengan bentuk tak dikenal tidak membuat kunci itu", () => {
  assert.equal("documents_attached" in agentLogFacts(extLog("a1", "ready", 1)), false);
  for (const bad of [null, "ya", 5, [], {}, { passport: true }]) {
    assert.equal("documents_attached" in agentLogFacts(extLog("a1", "ready", 1, { documents_attached: bad })), false);
  }
  assert.equal(cleanDocumentsAttached({ resume: true })?.resume, true);
});

test("ringkasan berkas terpasang: jenis saja, urutan tetap, tanpa path", () => {
  assert.equal(describeDocumentsAttached({ resume: true, cover_letter: true }), "Ekstensi Browser memasang berkas: CV, surat lamaran.");
  assert.equal(
    describeDocumentsAttached({ portfolio: true, transcript: true, cover_letter: false, resume: true }),
    "Ekstensi Browser memasang berkas: CV, transkrip, portofolio.",
  );
  assert.equal(describeDocumentsAttached({ resume: false, cover_letter: false }), "Ekstensi Browser tidak memasang berkas apa pun.");
  assert.equal(describeDocumentsAttached(null), null);
  assert.equal(describeDocumentsAttached(undefined), null);
  const text = describeDocumentsAttached(cleanDocumentsAttached({ resume: "C:\\Users\\hans\\cv.pdf", transcript: "transkrip.pdf" })) ?? "";
  assert.equal(/[\\/]|\.pdf/.test(text), false);
  assert.match(text, /CV, transkrip/);
});

// ---- pertanyaan: secret_skip dan required ----

test("parseQuestions: secret_skip dan required dibaca; required hanya bila boolean", () => {
  const parsed = parseQuestions([
    Q_TEXT,
    Q_OPT,
    Q_SECRET,
    { key: "a", label: "Tanpa penanda", kind: "text" },
    { key: "b", label: "Penanda salah", kind: "text", required: "ya" },
    { key: "c", label: "Pilihan rahasia", kind: "secret_skip", options: ["x"] },
  ]);
  assert.deepEqual(parsed, [
    { key: "why us", label: "Why do you want to work here?", kind: "textarea", required: true },
    { key: "linkedin profile", label: "LinkedIn profile", kind: "text", required: false },
    { key: "account password", label: "Account password", kind: "secret_skip", required: true },
    { key: "a", label: "Tanpa penanda", kind: "text" },
    { key: "b", label: "Penanda salah", kind: "text" },
    { key: "c", label: "Pilihan rahasia", kind: "secret_skip" },
  ]);
});

test("questionsToAnswer tidak memuat kolom rahasia; questionsToSelfFill hanya kolom rahasia, dengan gerbang yang sama", () => {
  const facts = agentLogFacts(extLog("a1", "ready", 9, { questions: [Q_TEXT, Q_SECRET] }));
  assert.deepEqual(questionsToAnswer(facts).map((q) => q.key), ["why us"]);
  assert.deepEqual(questionsToSelfFill(facts).map((q) => q.key), ["account password"]);
  // sudah terkirim atau kirim belum terkonfirmasi: tidak ada yang perlu dijawab atau diisi lagi
  for (const status of ["success", "submit_unverified"]) {
    const sent = { ...facts, log_status: status };
    assert.deepEqual(questionsToAnswer(sent), []);
    assert.deepEqual(questionsToSelfFill(sent), []);
  }
  assert.deepEqual(questionsToSelfFill(undefined), []);
  assert.deepEqual(questionsToSelfFill({ questions: "bukan daftar" as any }), []);
});

test("kolom rahasia tidak pernah diisi dari jawaban tersimpan, tidak divalidasi, dan tidak masuk baris simpan", () => {
  const qs = parseQuestions([Q_TEXT, Q_SECRET]) as PendingQuestion[];
  const saved = { "why us": "Karena produknya bagus.", "account password": "rahasia-123" };
  assert.deepEqual(initialAnswers(qs, saved), { "why us": "Karena produknya bagus.", "account password": "" });
  assert.deepEqual(validateAnswers(qs, { "why us": "Karena produknya bagus." }), { ok: true, errors: {} });
  const rows = answersToRows(qs, { "why us": "Karena produknya bagus.", "account password": "rahasia-123" });
  assert.deepEqual(rows.map((r) => r.question_key), ["why us"]);
  assert.equal(JSON.stringify(rows).includes("rahasia-123"), false);
});

test("pertanyaan opsional boleh kosong tetapi bila diisi tetap divalidasi; tanpa penanda dianggap wajib", () => {
  const qs = parseQuestions([Q_TEXT, Q_OPT, { key: "plain", label: "Tanpa penanda", kind: "text" }]) as PendingQuestion[];
  assert.deepEqual(qs.map(isRequiredQuestion), [true, false, true]);
  const empty = validateAnswers(qs, { "why us": "Jawaban." });
  assert.deepEqual(empty.errors, { plain: ERROR_EMPTY });
  assert.deepEqual(validateAnswers(qs, { "why us": "Jawaban.", plain: "ok" }), { ok: true, errors: {} });
  const optSelect = parseQuestions([{ key: "opt", label: "Pilihan opsional", kind: "select", options: ["A", "B"], required: false }]) as PendingQuestion[];
  assert.equal(validateAnswers(optSelect, { opt: "" }).ok, true);
  assert.equal(validateAnswers(optSelect, { opt: "C" }).ok, false);
  assert.deepEqual(answersToRows(optSelect, { opt: "" }), []);
});

// ---- pertanyaan berkas (kind file): petunjuk unggah manual, bukan isian ----

test("parseQuestions: kind file dipertahankan (bukan menjadi teks) dan tidak membawa pilihan", () => {
  assert.deepEqual(parseQuestions([Q_FILE, { ...Q_FILE, key: "x", label: "Unggah surat lamaran secara manual", options: ["a.pdf"], required: false }]), [
    Q_FILE,
    { key: "x", label: "Unggah surat lamaran secara manual", kind: "file", required: false },
  ]);
});

test("questionsToAnswer tidak memuat berkas; questionsToUpload hanya berkas, dengan gerbang yang sama", () => {
  const facts = agentLogFacts(extLog("a1", "ready", 9, { questions: [Q_TEXT, Q_SECRET, Q_FILE] }));
  assert.deepEqual(questionsToAnswer(facts).map((q) => q.key), ["why us"]);
  assert.deepEqual(questionsToSelfFill(facts).map((q) => q.key), ["account password"]);
  assert.deepEqual(questionsToUpload(facts).map((q) => q.key), ["unggah cv secara manual"]);
  for (const status of ["success", "submit_unverified"]) {
    assert.deepEqual(questionsToUpload({ ...facts, log_status: status }), []);
  }
  assert.deepEqual(questionsToUpload(undefined), []);
  assert.deepEqual(questionsToUpload({ questions: "bukan daftar" as any }), []);
});

test("berkas tidak pernah diisi dari jawaban tersimpan, tidak divalidasi (walau wajib), dan tidak masuk baris simpan", () => {
  const qs = parseQuestions([Q_TEXT, Q_FILE]) as PendingQuestion[];
  const saved = { "why us": "Karena produknya bagus.", "unggah cv secara manual": "cv-saya.pdf" };
  assert.deepEqual(initialAnswers(qs, saved), { "why us": "Karena produknya bagus.", "unggah cv secara manual": "" });
  assert.deepEqual(validateAnswers(qs, { "why us": "Karena produknya bagus." }), { ok: true, errors: {} });
  const rows = answersToRows(qs, saved);
  assert.deepEqual(rows.map((r) => r.question_key), ["why us"]);
  assert.equal(JSON.stringify(rows).includes("cv-saya.pdf"), false);
});

test("fileUploadInstruction: awalan Unggah dan akhiran secara manual dibuang; label lain dipakai apa adanya; kosong menjadi berkas", () => {
  assert.equal(fileUploadInstruction("Unggah CV secara manual"), "Unggah CV sendiri di tab lowongan yang dibuka ekstensi, lalu tekan Kirim di sana.");
  assert.equal(
    fileUploadInstruction("  Unggah   surat lamaran  secara manual "),
    "Unggah surat lamaran sendiri di tab lowongan yang dibuka ekstensi, lalu tekan Kirim di sana.",
  );
  assert.equal(fileUploadInstruction("Resume"), "Unggah Resume sendiri di tab lowongan yang dibuka ekstensi, lalu tekan Kirim di sana.");
  assert.equal(fileUploadInstruction(""), "Unggah berkas sendiri di tab lowongan yang dibuka ekstensi, lalu tekan Kirim di sana.");
});

// ---- kabel (tanpa DOM, dijaga lewat sumbernya) ----

test("teks: jawaban tersimpan untuk ekstensi dan label isi sendiri persis seperti yang dijanjikan", () => {
  assert.equal(
    EXTENSION_ANSWERS_SAVED_TEXT,
    "Jawaban tersimpan. Kembali ke tab lowongan lalu klik Simpan jawaban dan isi ulang di panel Applify.",
  );
  assert.equal(SELF_FILL_LABEL, "Isi sendiri di halaman lowongan");
});

test("AgentQuestions: log ekstensi menyimpan jawaban lalu berhenti, tanpa memanggil rerun worker", () => {
  const src = read("../src/components/AgentQuestions.tsx");
  assert.match(src, /const extension = row\?\.channel === "extension";/);
  const submit = src.slice(src.indexOf("async function submit"));
  const validate = submit.indexOf("validateAnswers(");
  const save = submit.indexOf("saveAnswers(");
  const branch = submit.indexOf("if (extension) {");
  const rerun = submit.indexOf("rerunApproval(");
  assert.ok(validate > 0 && validate < save && save < branch && branch < rerun, "validasi, simpan, cabang ekstensi, baru rerun");
  // cabang ekstensi keluar sebelum rerun dan tidak memanggil onStarted atau rerunApproval
  const branchBody = submit.slice(branch, submit.indexOf("}\n", branch));
  assert.match(branchBody, /setSavedForExtension\(true\)/);
  assert.match(branchBody, /return;/);
  assert.doesNotMatch(branchBody, /rerunApproval|onStarted/);
  assert.match(src, /EXTENSION_ANSWERS_SAVED_TEXT/);
  // kolom rahasia: tanpa isian, hanya keterangan
  assert.match(src, /questionsToSelfFill\(row\)/);
  assert.match(src, /data-testid="agent-self-fill"/);
  assert.doesNotMatch(src, /type="password"/);
  assert.doesNotMatch(src, /—/);
  // berkas (`file`): petunjuk tanpa isian, dipasang di kartu hanya-isi-sendiri maupun di formulir
  assert.match(src, /questionsToUpload\(row\)/);
  assert.match(src, /data-testid="agent-file-upload"/);
  assert.match(src, /fileUploadInstruction\(q\.label\)/);
  assert.equal(src.match(/<UploadList questions=\{(?:uploads)\} \/>/g)?.length, 2);
  const uploadList = src.slice(src.indexOf("function UploadList"), src.indexOf("function StartedNote"));
  assert.doesNotMatch(uploadList, /<input|<textarea|<select/);
});

test("kartu status agen menampilkan ringkasan berkas hanya untuk log ekstensi", () => {
  const card = read("../src/components/AgentApplyStatus.tsx");
  assert.match(card, /row\?\.channel === "extension" \? describeDocumentsAttached\(row\.documents_attached\) : null/);
  assert.match(card, /data-testid="agent-documents"/);
});

test("layanan: log ekstensi dibaca dengan sesi pengguna, dibatasi action apply, kanal ekstensi, dan id persetujuan; hanya membaca", () => {
  const svc = read("../src/services/emailApplyService.ts");
  assert.match(
    svc,
    /\.from\("application_logs"\)\s*\.select\("status, details, created_at"\)\s*\.eq\("action", "apply"\)\s*\.eq\("details->>channel", "extension"\)\s*\.in\("details->>approval_request_id", ids\)/,
  );
  assert.match(svc, /buildAgentApplyRows\(queueRows, workerLogs, extensionLogs\)/);
  assert.doesNotMatch(svc, /service_role|SERVICE_ROLE/i);
  assert.doesNotMatch(svc, /from\("application_logs"\)\s*\.(insert|update|upsert|delete)/);
  const lib = read("../src/lib/agentApplyRows.ts");
  assert.deepEqual([...lib.matchAll(/^\s*import\s.*$/gm)].map((m) => m[0]), [
    'import { agentLogFacts } from "./agentEvidence.ts";',
    'import { handoffLabels, type AgentApplyRow, type AgentHandoffContext } from "./agentApplyStatus.ts";',
    'import { isExtensionHandoffRow } from "./extensionConsent.ts";',
  ]);
});

test("buildAgentApplyRows: tugas extension_apply berstatus awaiting_login tetap aktif walau log ditulis sesudah antrean dibuat", () => {
  const future = new Date(Date.now() + 10 * 60_000).toISOString();
  const qExt = { id: "q-ext-1", job_type: "extension_apply", status: "processing", error_message: null, created_at: T(5), payload: { approval_request_id: "a-login" } };
  const logLogin = extLog("a-login", "awaiting_login", 8, {
    queue_job_id: "q-ext-1",
    awaiting_until: future,
    login_url: "https://www.kalibrr.com/login",
  });
  const rows = buildAgentApplyRows([qExt], [], [logLogin]);
  assert.equal(rows["a-login"].status, "processing");
  assert.equal(rows["a-login"].job_type, "extension_apply");
  assert.equal(rows["a-login"].log_status, "awaiting_login");
  assert.equal(rows["a-login"].login_url, "https://www.kalibrr.com/login");
  assert.equal(rows["a-login"].awaiting_until, future);
});
