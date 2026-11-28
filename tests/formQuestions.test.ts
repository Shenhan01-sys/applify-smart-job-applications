import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANSWERS_TABLE_MISSING_TEXT,
  ERROR_CHOOSE_OPTION,
  ERROR_CHOOSE_YES_NO,
  ERROR_EMPTY,
  ERROR_TOO_LONG,
  MAX_ANSWER_LENGTH,
  RERUN_STARTED_TEXT,
  answersToRows,
  initialAnswers,
  isMissingAnswersTable,
  parseQuestions,
  questionKey,
  questionsToAnswer,
  rerunStatusMessage,
  validateAnswers,
  type PendingQuestion,
} from "../src/lib/formQuestions.ts";
import { agentLogFacts } from "../src/lib/agentEvidence.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const Q_TEXT: PendingQuestion = { key: "kota domisili", label: "Kota Domisili", kind: "text" };
const Q_AREA: PendingQuestion = { key: "why us", label: "Why do you want to work here?", kind: "textarea" };
const Q_SELECT: PendingQuestion = { key: "work authorization", label: "Work authorization", kind: "select", options: ["Citizen", "Visa holder"] };
const Q_RADIO: PendingQuestion = { key: "relocate", label: "Willing to relocate?", kind: "radio", options: ["Yes", "No", "Maybe"] };
const Q_CHECK: PendingQuestion = { key: "agree terms", label: "I agree to the terms *", kind: "check" };
const ALL = [Q_TEXT, Q_AREA, Q_SELECT, Q_RADIO, Q_CHECK];

// ---- questionKey ----

test("questionKey: vektor uji bersama worker", () => {
  assert.equal(
    questionKey("Are you legally authorized to work in the country where you are located? *"),
    "are you legally authorized to work in the country where you are located",
  );
  assert.equal(questionKey("  Kota Domisili (wajib) "), "kota domisili");
  assert.equal(questionKey("Préférence: Télétravail?"), "preference teletravail");
  assert.equal(questionKey("***"), "");
});

test("questionKey: penanda wajib, huruf besar, bintang, dan masukan bukan teks", () => {
  assert.equal(questionKey("Nama Lengkap (Required)"), "nama lengkap");
  assert.equal(questionKey("Alamat (wajib diisi)"), "alamat");
  assert.equal(questionKey("Alamat (WAJIB DIISI) *"), "alamat");
  assert.equal(questionKey("Kota   Domisili"), questionKey("kota domisili"));
  assert.equal(questionKey("Expected salary (IDR/month)"), "expected salary idr month");
  assert.equal(questionKey(null), "");
  assert.equal(questionKey(undefined), "");
  assert.equal(questionKey(42), "42");
  assert.equal(questionKey(""), "");
});

test("questionKey: paling panjang 200 karakter dan tanpa spasi di ujung", () => {
  const key = questionKey(`${"a".repeat(199)} bbbbbb`);
  assert.equal(key.length, 199);
  assert.equal(key, "a".repeat(199));
  assert.equal(questionKey("x".repeat(500)).length, 200);
});

// ---- parseQuestions ----

test("parseQuestions: butir valid dibaca, dipangkas, dan jenis dipertahankan", () => {
  const out = parseQuestions({
    questions: [
      { key: " kota domisili ", label: "  Kota Domisili  ", kind: "text" },
      { key: "work authorization", label: "Work authorization", kind: "select", options: [" Citizen ", "Visa holder", "Citizen", "", 5, null] },
      { key: "agree terms", label: "I agree", kind: "check" },
    ],
    questions_pending: 3,
  });
  assert.deepEqual(out, [
    { key: "kota domisili", label: "Kota Domisili", kind: "text" },
    { key: "work authorization", label: "Work authorization", kind: "select", options: ["Citizen", "Visa holder"] },
    { key: "agree terms", label: "I agree", kind: "check" },
  ]);
});

test("parseQuestions: masukan rusak tidak melempar dan menghasilkan daftar kosong", () => {
  for (const bad of [null, undefined, "x", 5, true, [], {}, { questions: "x" }, { questions: {} }, { questions: null }, { questions_pending: 2 }]) {
    assert.deepEqual(parseQuestions(bad), []);
  }
});

test("parseQuestions: butir tanpa kunci atau label, bukan objek, atau kunci kembar dibuang", () => {
  const out = parseQuestions({
    questions: [
      null,
      "teks",
      7,
      [],
      { label: "Tanpa kunci", kind: "text" },
      { key: "   ", label: "Kunci kosong", kind: "text" },
      { key: "k1", kind: "text" },
      { key: "k2", label: "   ", kind: "text" },
      { key: 3, label: "Kunci angka", kind: "text" },
      { key: "__proto__", label: "Kunci berbahaya", kind: "text" },
      { key: "ok", label: "Pertama", kind: "text" },
      { key: "ok", label: "Kembar", kind: "textarea" },
    ],
  });
  assert.deepEqual(out, [{ key: "ok", label: "Pertama", kind: "text" }]);
});

test("parseQuestions: jenis tak dikenal jadi teks, pilihan hanya untuk select dan radio", () => {
  const out = parseQuestions({
    questions: [
      { key: "a", label: "A", kind: "date" },
      { key: "b", label: "B" },
      { key: "c", label: "C", kind: "text", options: ["x", "y"] },
      { key: "d", label: "D", kind: "check", options: ["x"] },
      { key: "e", label: "E", kind: "radio", options: ["Ya", "Tidak"] },
      { key: "f", label: "F", kind: "select", options: [] },
      { key: "g", label: "G", kind: "select", options: "bukan daftar" },
    ],
  });
  assert.deepEqual(out.map((q) => [q.key, q.kind, q.options]), [
    ["a", "text", undefined],
    ["b", "text", undefined],
    ["c", "text", undefined],
    ["d", "check", undefined],
    ["e", "radio", ["Ya", "Tidak"]],
    ["f", "select", undefined],
    ["g", "select", undefined],
  ]);
  // tanpa kunci "options" sama sekali bila tidak ada pilihan (bukan options: undefined)
  assert.equal("options" in out[0], false);
  assert.equal("options" in out[5], false);
});

test("parseQuestions: label paling 400 karakter, pilihan paling 100 dan masing-masing paling 120", () => {
  const options = [...Array.from({ length: 110 }, (_, i) => `Pilihan ${i}`), "x".repeat(121)];
  const [q] = parseQuestions({ questions: [{ key: "k", label: "L".repeat(900), kind: "select", options: ["z".repeat(121), ...options] }] });
  assert.equal(q.label.length, 400);
  assert.equal(q.options?.length, 100);
  assert.equal(q.options?.[0], "Pilihan 0");
  assert.ok(q.options?.every((o) => o.length <= 120));
  const long = "p".repeat(120);
  assert.deepEqual(parseQuestions({ questions: [{ key: "k", label: "L", kind: "radio", options: [long] }] })[0].options, [long]);
  // semua pilihan terlalu panjang: tidak ada pilihan
  assert.equal(parseQuestions({ questions: [{ key: "k", label: "L", kind: "radio", options: ["q".repeat(121)] }] })[0].options, undefined);
});

test("parseQuestions: hingga 200 pertanyaan dan daftar langsung juga diterima", () => {
  const list = Array.from({ length: 215 }, (_, i) => ({ key: `k${i}`, label: `Label ${i}`, kind: "text" }));
  const out = parseQuestions({ questions: list });
  assert.equal(out.length, 200);
  assert.equal(out[199].key, "k199");
  assert.equal(parseQuestions(list).length, 200);
});

test("parseQuestions: kunci dipangkas ke 200 karakter", () => {
  const [q] = parseQuestions({ questions: [{ key: "k".repeat(300), label: "L", kind: "text" }] });
  assert.equal(q.key.length, 200);
});

// ---- questionsToAnswer ----

test("questionsToAnswer: kosong bila percobaan terbaru sudah terkirim atau kirimnya belum terkonfirmasi", () => {
  const questions = [Q_TEXT];
  assert.deepEqual(questionsToAnswer({ log_status: "ready", questions }), questions);
  assert.deepEqual(questionsToAnswer({ log_status: "incomplete", questions }), questions);
  assert.deepEqual(questionsToAnswer({ log_status: null, questions }), questions);
  assert.deepEqual(questionsToAnswer({ log_status: "success", questions }), []);
  assert.deepEqual(questionsToAnswer({ log_status: "submit_unverified", questions }), []);
  assert.deepEqual(questionsToAnswer({ log_status: "ready" }), []);
  assert.deepEqual(questionsToAnswer(null), []);
  assert.deepEqual(questionsToAnswer(undefined), []);
});

test("agentLogFacts membawa pertanyaan dari details.questions; log lama tanpa pertanyaan kosong", () => {
  const withQ = agentLogFacts({
    status: "ready",
    created_at: "2026-11-23T10:00:00Z",
    details: {
      queue_job_id: "q1",
      approval_request_id: "a1",
      questions: [{ key: "kota domisili", label: "Kota Domisili", kind: "text" }, { oops: true }],
      questions_pending: 1,
    },
  });
  assert.deepEqual(withQ.questions, [{ key: "kota domisili", label: "Kota Domisili", kind: "text" }]);
  assert.equal(questionsToAnswer(withQ).length, 1);

  const old = agentLogFacts({ status: "ready", created_at: "2026-11-20T10:00:00Z", details: { remaining_required: ["Phone"] } });
  assert.deepEqual(old.questions, []);
  assert.deepEqual(agentLogFacts(null).questions ?? [], []);

  const sent = agentLogFacts({ status: "success", created_at: "2026-11-23T11:00:00Z", details: { questions: [{ key: "k", label: "L", kind: "text" }] } });
  assert.equal(sent.questions?.length, 1);
  assert.deepEqual(questionsToAnswer(sent), []);
});

// ---- initialAnswers ----

test("initialAnswers: semua pertanyaan punya isian awal; jawaban tersimpan dipakai bila cocok", () => {
  const out = initialAnswers(ALL, {
    "kota domisili": "  Yogyakarta ",
    "work authorization": "Citizen",
    relocate: "Mungkin",
    "agree terms": "Yes",
    "tidak ada": "x",
  });
  assert.deepEqual(out, {
    "kota domisili": "Yogyakarta",
    "why us": "",
    "work authorization": "Citizen",
    relocate: "",
    "agree terms": "Yes",
  });
});

test("initialAnswers: jawaban tersimpan yang tidak cocok jenisnya diabaikan, masukan rusak tidak melempar", () => {
  assert.deepEqual(initialAnswers([Q_CHECK], { "agree terms": "Ya" }), { "agree terms": "" });
  assert.deepEqual(initialAnswers([Q_SELECT], { "work authorization": "Other" }), { "work authorization": "" });
  assert.deepEqual(initialAnswers([Q_TEXT], { "kota domisili": "x".repeat(MAX_ANSWER_LENGTH + 1) }), { "kota domisili": "" });
  assert.deepEqual(initialAnswers([Q_TEXT], null), { "kota domisili": "" });
  assert.deepEqual(initialAnswers([Q_TEXT], undefined), { "kota domisili": "" });
  assert.deepEqual(initialAnswers([Q_TEXT], { "kota domisili": 5 as unknown as string }), { "kota domisili": "" });
  assert.deepEqual(initialAnswers([], { a: "b" }), {});
  // kunci yang sama dengan properti bawaan objek tidak mengambil nilai dari prototipe
  const q: PendingQuestion = { key: "constructor", label: "Constructor", kind: "text" };
  assert.deepEqual(initialAnswers([q], {}), { constructor: "" });
});

// ---- validateAnswers ----

test("validateAnswers: semua terjawab dan benar", () => {
  const res = validateAnswers(ALL, {
    "kota domisili": "Yogyakarta",
    "why us": "Saya ingin belajar.",
    "work authorization": "Visa holder",
    relocate: "No",
    "agree terms": "No",
  });
  assert.deepEqual(res, { ok: true, errors: {} });
});

test("validateAnswers: kosong, spasi saja, atau tidak ada dianggap belum dijawab", () => {
  const res = validateAnswers(ALL, { "kota domisili": "   ", "why us": "" });
  assert.equal(res.ok, false);
  assert.equal(res.errors["kota domisili"], ERROR_EMPTY);
  assert.equal(res.errors["why us"], ERROR_EMPTY);
  assert.equal(res.errors["work authorization"], ERROR_CHOOSE_OPTION);
  assert.equal(res.errors["relocate"], ERROR_CHOOSE_OPTION);
  assert.equal(res.errors["agree terms"], ERROR_CHOOSE_YES_NO);
  assert.deepEqual(validateAnswers([Q_TEXT], null).errors, { "kota domisili": ERROR_EMPTY });
});

test("validateAnswers: jawaban select atau radio harus salah satu pilihan, check harus Yes atau No", () => {
  const res = validateAnswers([Q_SELECT, Q_RADIO, Q_CHECK], { "work authorization": "Other", relocate: "yes", "agree terms": "Ya" });
  assert.deepEqual(res.errors, {
    "work authorization": ERROR_CHOOSE_OPTION,
    relocate: ERROR_CHOOSE_OPTION,
    "agree terms": ERROR_CHOOSE_YES_NO,
  });
  // select tanpa pilihan di formulir menerima teks bebas
  const free: PendingQuestion = { key: "negara", label: "Country", kind: "select" };
  assert.equal(validateAnswers([free], { negara: "Indonesia" }).ok, true);
  assert.equal(validateAnswers([free], { negara: "" }).errors.negara, ERROR_EMPTY);
});

test("validateAnswers: paling panjang 2000 karakter", () => {
  assert.equal(validateAnswers([Q_AREA], { "why us": "a".repeat(MAX_ANSWER_LENGTH) }).ok, true);
  assert.equal(validateAnswers([Q_AREA], { "why us": "a".repeat(MAX_ANSWER_LENGTH + 1) }).errors["why us"], ERROR_TOO_LONG);
  assert.equal(validateAnswers([], {}).ok, true);
});

// ---- answersToRows ----

test("answersToRows: baris untuk tabel user_form_answers, jawaban dipangkas, tanpa jawaban dilewati", () => {
  const rows = answersToRows(ALL, {
    "kota domisili": "  Yogyakarta  ",
    "why us": "",
    "work authorization": "Citizen",
    relocate: "   ",
    "agree terms": "Yes",
  });
  assert.deepEqual(rows, [
    { question_key: "kota domisili", question_label: "Kota Domisili", answer: "Yogyakarta" },
    { question_key: "work authorization", question_label: "Work authorization", answer: "Citizen" },
    { question_key: "agree terms", question_label: "I agree to the terms *", answer: "Yes" },
  ]);
  assert.deepEqual(answersToRows([Q_TEXT], null), []);
  assert.equal(answersToRows([Q_AREA], { "why us": "z".repeat(3000) })[0].answer.length, MAX_ANSWER_LENGTH);
});

test("answersToRows: kunci dan label dalam batas kolom (200 dan 400)", () => {
  const q: PendingQuestion = { key: "k".repeat(200), label: "L".repeat(400), kind: "text" };
  const [row] = answersToRows([q], { [q.key]: "x" });
  assert.equal(row.question_key.length, 200);
  assert.equal(row.question_label.length, 400);
});

// ---- galat untuk pengguna ----

test("isMissingAnswersTable: kode 42P01 dan PGRST205 atau pesan yang menyebut tabelnya", () => {
  assert.equal(isMissingAnswersTable({ code: "42P01", message: "relation does not exist" }), true);
  assert.equal(isMissingAnswersTable({ code: "PGRST205", message: "Could not find the table" }), true);
  assert.equal(isMissingAnswersTable({ message: 'relation "public.user_form_answers" does not exist' }), true);
  assert.equal(isMissingAnswersTable(new Error("Could not find the table 'public.user_form_answers' in the schema cache")), true);
  assert.equal(isMissingAnswersTable("user_form_answers hilang"), true);
  assert.equal(isMissingAnswersTable({ code: "23505", message: "duplicate key" }), false);
  assert.equal(isMissingAnswersTable({ code: "42501", message: "permission denied" }), false);
  assert.equal(isMissingAnswersTable(null), false);
  assert.equal(isMissingAnswersTable(undefined), false);
  assert.equal(isMissingAnswersTable(500), false);
  assert.equal(ANSWERS_TABLE_MISSING_TEXT, "Jawaban tersimpan belum tersedia.");
});

test("rerunStatusMessage: 404, 409, 410, 422, 429 punya pesan sendiri; status lain undefined", () => {
  for (const status of [404, 409, 410, 422, 429]) {
    const msg = rerunStatusMessage(status);
    assert.ok(msg && msg.length > 10, `status ${status}`);
    assert.doesNotMatch(msg, /!|—/);
  }
  assert.equal(new Set([404, 409, 410, 422, 429].map(rerunStatusMessage)).size, 5);
  for (const status of [200, 401, 500, 503, undefined]) assert.equal(rerunStatusMessage(status), undefined);
});

// ---- bentuk kode (tanpa DOM, jadi dijaga lewat sumbernya) ----

test("lib murni: formQuestions.ts tanpa impor", () => {
  assert.deepEqual([...read("../src/lib/formQuestions.ts").matchAll(/^\s*import\s.*$/gm)], []);
});

test("layanan: upsert dengan onConflict user_id,question_key, user dari auth, galat tabel hilang dijelaskan", () => {
  const svc = read("../src/services/formAnswerService.ts");
  assert.match(svc, /\.upsert\(rows\.map\(\(r\) => \(\{ user_id: user\.id, \.\.\.r, updated_at: now \}\)\), \{ onConflict: "user_id,question_key" \}\)/);
  assert.match(svc, /supabase\.auth\.getUser\(\)/);
  assert.match(svc, /from\(TABLE\)\.delete\(\)\.eq\("id", id\)/);
  assert.match(svc, /isMockMode\(\)/);
  assert.match(svc, /automationApi\.rerunApproval\(approvalId\)/);
  assert.match(svc, /isMissingAnswersTable\(error\)\) throw new AnswersTableMissingError/);
  const api = read("../src/services/automationApi.ts");
  assert.match(api, /\/api\/approvals\/\$\{encodeURIComponent\(id\)\}\/rerun/);
  assert.match(api, /async rerunApproval\(id: string\)/);
});

test("AgentQuestions: judul, penjelasan, tombol, catatan kata sandi, tanpa isian password", () => {
  const src = read("../src/components/AgentQuestions.tsx");
  assert.match(src, /Agen butuh jawabanmu/);
  assert.match(src, /Agen berhenti sebelum kirim karena pertanyaan ini tidak bisa dijawab dari profilmu\. Jawabanmu disimpan dan dipakai lagi untuk lowongan lain\./);
  assert.match(src, /Simpan jawaban dan jalankan agen lagi/);
  assert.match(src, /Jangan menulis kata sandi di sini\./);
  assert.match(src, /Tulis persis seperti pilihan di formulir/);
  assert.doesNotMatch(src, /type="password"/);
  assert.doesNotMatch(src, /—/);
  // label terhubung ke isian, galat terhubung lewat aria-describedby
  assert.match(src, /htmlFor=\{id\}/);
  assert.match(src, /aria-describedby/);
  // urutan: validasi, simpan, jalankan ulang
  const order = ["validateAnswers(", "saveAnswers(", "rerunApproval("].map((s) => src.indexOf(s, src.indexOf("async function submit")));
  assert.ok(order[0] > 0 && order[0] < order[1] && order[1] < order[2], "validasi, simpan, lalu jalankan ulang");
  // hanya tampil bila tugas agen tidak sedang berjalan
  assert.match(src, /if \(active\) return started \? <StartedNote \/> : null;/);
  assert.match(src, /RERUN_STARTED_TEXT/);
  assert.equal(RERUN_STARTED_TEXT, "Agen berjalan lagi dengan jawabanmu.");
});

test("Persetujuan: pertanyaan tampil di bawah status agen dan di atas opsi email", () => {
  const page = read("../src/routes/approvals.tsx");
  const status = page.indexOf("<AgentApplyStatus row={emailData.agent[request.id]}");
  const questions = page.indexOf("<AgentQuestions approvalId={request.id} row={emailData.agent[request.id]} onRerun={handleAgentRerun} />");
  const email = page.indexOf("<EmailApplyPanel");
  assert.ok(status > 0 && questions > status && email > questions);
  assert.match(page, /\{approved && !expired && !isSent && \(\s*<AgentQuestions/);
  // sesudah tugas ulang diterima: status langsung "pending" supaya polling 15 detik jalan
  assert.match(page, /status: 'pending', error_message: null/);
});

test("Pengaturan dan Lamaran Saya: bagian jawaban tersimpan dan tautan ke Persetujuan", () => {
  const settings = read("../src/routes/settings.tsx");
  assert.match(settings, /title="Jawaban formulir tersimpan"/);
  assert.match(settings, /<SavedAnswers \/>/);
  const saved = read("../src/components/SavedAnswers.tsx");
  assert.match(saved, /Belum ada jawaban tersimpan\. Jawaban muncul di sini setelah kamu menjawab pertanyaan agen di halaman Persetujuan\./);
  assert.match(saved, /AnswersTableMissingError/);
  assert.match(saved, /ANSWERS_TABLE_MISSING_TEXT/);
  const apps = read("../src/routes/applications.tsx");
  assert.match(apps, /const selectedQuestionCount = questionsToAnswer\(selectedFacts\)\.length;/);
  assert.match(apps, /Agen butuh jawabanmu untuk \{selectedQuestionCount\} pertanyaan\. Jawab di halaman\{" "\}\s*<Link to="\/approvals"/);
});
