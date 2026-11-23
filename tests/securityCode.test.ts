import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_POLL_MS,
  CODE_CHARS_MESSAGE,
  CODE_EMPTY_MESSAGE,
  CODE_POLL_MS,
  CODE_RANGE_MESSAGE,
  MAX_WAIT_SECONDS,
  awaitingCodeState,
  codeAccepted,
  codePlaceholder,
  describeSecurityCodeError,
  formatCountdown,
  isCodeTimeout,
  normaliseCode,
  pollIntervalMs,
  securityCodeErrorMessage,
  validCodeLength,
  validateCode,
} from "../src/lib/securityCode.ts";
import { agentLogFacts } from "../src/lib/agentEvidence.ts";
import { describeAgentApply, describeLogOutcome, isAgentApplyActive } from "../src/lib/agentApplyStatus.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const NOW = Date.parse("2026-11-23T10:00:00Z");
const inSeconds = (s: number) => new Date(NOW + s * 1000).toISOString();

test("normaliseCode: spasi dan tanda hubung dibuang, huruf besar kecil dibiarkan, bukan teks jadi kosong", () => {
  assert.equal(normaliseCode("  ab12 CD34  "), "ab12CD34");
  assert.equal(normaliseCode("AB12-CD34"), "AB12CD34");
  assert.equal(normaliseCode("AB12–CD34−EF"), "AB12CD34EF");
  assert.equal(normaliseCode("a b​c\td\n"), "abcd");
  assert.equal(normaliseCode("aBcD"), "aBcD");
  for (const bad of [null, undefined, 12345678, {}, []]) assert.equal(normaliseCode(bad), "");
});

test("validateCode: 4 sampai 12 huruf atau angka", () => {
  assert.deepEqual(validateCode("Ab12Cd34"), { ok: true, code: "Ab12Cd34", message: "" });
  assert.equal(validateCode("1234").ok, true);
  assert.equal(validateCode("123456789012").ok, true);
  assert.deepEqual(validateCode("123"), { ok: false, code: "123", message: CODE_RANGE_MESSAGE });
  assert.equal(validateCode("1234567890123").message, CODE_RANGE_MESSAGE);
  assert.equal(validateCode("").message, CODE_EMPTY_MESSAGE);
  assert.equal(validateCode("  - ").message, CODE_EMPTY_MESSAGE);
  assert.equal(validateCode(null).ok, false);
  assert.equal(validateCode("ab#12345").message, CODE_CHARS_MESSAGE);
  assert.equal(validateCode("ab_12345").message, CODE_CHARS_MESSAGE);
  assert.equal(validateCode("kodeé123").ok, false);
  // spasi dan tanda hubung dari salinan email tidak dihitung
  assert.deepEqual(validateCode("ab12 cd34"), { ok: true, code: "ab12cd34", message: "" });
  assert.equal(CODE_RANGE_MESSAGE, "Kode harus 4 sampai 12 huruf atau angka.");
});

test("validateCode: panjang yang diketahui harus tepat; panjang tidak masuk akal diabaikan", () => {
  assert.equal(validateCode("12345678", 8).ok, true);
  assert.deepEqual(validateCode("1234567", 8), { ok: false, code: "1234567", message: "Kode harus 8 karakter." });
  assert.equal(validateCode("123456789", 8).message, "Kode harus 8 karakter.");
  assert.equal(validateCode("123456", 6).ok, true);
  // null, 0, 3, 13, pecahan, bukan angka: panjang tidak diketahui, aturan 4..12 yang berlaku
  for (const len of [null, undefined, 0, 3, 13, 6.5, NaN, "8" as unknown as number]) {
    assert.equal(validateCode("123456", len).ok, true, String(len));
  }
  assert.equal(validCodeLength(8), 8);
  assert.equal(validCodeLength(4), 4);
  assert.equal(validCodeLength(12), 12);
  assert.equal(validCodeLength(13), null);
  assert.equal(validCodeLength("8"), null);
  assert.equal(codePlaceholder(8), "8 karakter");
  assert.equal(codePlaceholder(null), "Kode dari email");
  assert.equal(codePlaceholder(99), "Kode dari email");
});

test("awaitingCodeState: menunggu hanya bila log terbaru awaiting_code, batas waktu di depan, tugas belum selesai", () => {
  const base = { status: "processing", log_status: "awaiting_code", awaiting_until: inSeconds(90), code_length: 8 };
  assert.deepEqual(awaitingCodeState(base, NOW), { waiting: true, secondsLeft: 90, codeLength: 8 });
  // status antrean belum diketahui (halaman Lamaran Saya hanya punya log)
  assert.equal(awaitingCodeState({ log_status: "awaiting_code", awaiting_until: inSeconds(5) }, NOW).waiting, true);
  // detik dibulatkan ke atas, jadi 0,4 detik tersisa masih tampil 1 detik
  assert.equal(awaitingCodeState({ ...base, awaiting_until: new Date(NOW + 400).toISOString() }, NOW).secondsLeft, 1);
  // panjang kode tidak diketahui
  assert.equal(awaitingCodeState({ ...base, code_length: null }, NOW).codeLength, null);
  assert.equal(awaitingCodeState({ ...base, code_length: 40 }, NOW).codeLength, null);
  // waktunya sudah lewat (tepat sekarang juga lewat)
  assert.deepEqual(awaitingCodeState({ ...base, awaiting_until: inSeconds(0) }, NOW), { waiting: false, secondsLeft: 0, codeLength: null });
  assert.equal(awaitingCodeState({ ...base, awaiting_until: inSeconds(-30) }, NOW).waiting, false);
  // log terbaru bukan awaiting_code
  for (const log_status of ["ready", "success", "incomplete", "submit_unverified", "", null, undefined]) {
    assert.equal(awaitingCodeState({ ...base, log_status }, NOW).waiting, false, String(log_status));
  }
  // tugas antrean sudah selesai, gagal, atau menunggu giliran lagi
  for (const status of ["completed", "failed", "pending", "cancelled"]) {
    assert.equal(awaitingCodeState({ ...base, status }, NOW).waiting, false, status);
  }
  // tanggal rusak atau hilang tidak pernah menjadi "menunggu"
  for (const awaiting_until of [null, undefined, "", "bukan tanggal"]) {
    assert.equal(awaitingCodeState({ ...base, awaiting_until }, NOW).waiting, false, String(awaiting_until));
  }
  assert.equal(awaitingCodeState(null, NOW).waiting, false);
  assert.equal(awaitingCodeState(undefined, NOW).waiting, false);
  assert.equal(awaitingCodeState(base, NaN).waiting, false);
  // tanggal yang terlalu jauh dipotong
  assert.equal(awaitingCodeState({ ...base, awaiting_until: inSeconds(86400) }, NOW).secondsLeft, MAX_WAIT_SECONDS);
});

test("isCodeTimeout: hanya log ready dengan reason code_timeout", () => {
  assert.equal(isCodeTimeout({ log_status: "ready", reason: "code_timeout" }), true);
  assert.equal(isCodeTimeout({ log_status: "incomplete", reason: "code_timeout" }), false);
  assert.equal(isCodeTimeout({ log_status: "ready", reason: "timeout" }), false);
  assert.equal(isCodeTimeout({ log_status: "ready" }), false);
  // 3 kode ditolak situs: belum terkirim, sama-sama bisa dijalankan ulang.
  assert.equal(isCodeTimeout({ log_status: "ready", reason: "code_rejected" }), true);
  assert.equal(isCodeTimeout(null), false);
  assert.equal(isCodeTimeout(undefined), false);
});

test("pollIntervalMs: 5 detik bila ada agen menunggu kode, selain itu 15 detik", () => {
  const waiting = { status: "processing", log_status: "awaiting_code", awaiting_until: inSeconds(60) };
  const working = { status: "processing" };
  assert.equal(CODE_POLL_MS, 5000);
  assert.equal(AGENT_POLL_MS, 15000);
  assert.equal(pollIntervalMs([working, waiting], NOW), 5000);
  assert.equal(pollIntervalMs([working], NOW), 15000);
  assert.equal(pollIntervalMs([], NOW), 15000);
  assert.equal(pollIntervalMs([{ ...waiting, awaiting_until: inSeconds(-1) }], NOW), 15000);
});

test("formatCountdown: mm:ss, tidak pernah negatif", () => {
  assert.equal(formatCountdown(600), "10:00");
  assert.equal(formatCountdown(599), "09:59");
  assert.equal(formatCountdown(61), "01:01");
  assert.equal(formatCountdown(5), "00:05");
  assert.equal(formatCountdown(0), "00:00");
  assert.equal(formatCountdown(-4), "00:00");
  assert.equal(formatCountdown(NaN), "00:00");
  assert.equal(formatCountdown(59.9), "00:59");
});

test("securityCodeErrorMessage: satu pesan Indonesia singkat untuk tiap status dari backend", () => {
  assert.equal(securityCodeErrorMessage(409, "agent_not_waiting"), "Agen sudah tidak menunggu kode. Bila lamaran belum terkirim, jalankan agen lagi untuk meminta kode baru.");
  assert.equal(securityCodeErrorMessage(429, "too_many_codes"), "Batas 3 kode untuk percobaan ini sudah tercapai.");
  assert.equal(securityCodeErrorMessage(503, "feature_unavailable"), "Fitur kode keamanan belum aktif di server.");
  assert.equal(securityCodeErrorMessage(400, "invalid_code"), "Kode harus 4 sampai 12 huruf atau angka.");
  assert.match(securityCodeErrorMessage(400, "invalid_job"), /Muat ulang halaman/);
  assert.match(securityCodeErrorMessage(401), /Masuk lagi/);
  assert.match(securityCodeErrorMessage(404), /tidak ditemukan/);
  assert.match(securityCodeErrorMessage(429, "rate_limited"), /Terlalu sering/);
  assert.match(securityCodeErrorMessage(500), /belum bisa dikirim/);
  assert.match(securityCodeErrorMessage(502), /belum bisa dikirim/);
  assert.match(securityCodeErrorMessage(undefined), /Server belum bisa dihubungi/);
  const all = [400, 401, 404, 409, 429, 500, 503, undefined].map((s) => securityCodeErrorMessage(s as number | undefined, "x"));
  for (const msg of all) {
    assert.ok(msg.length > 0 && msg.length < 140, msg);
    assert.doesNotMatch(msg, /—|!/, msg);
  }
});

test("describeSecurityCodeError: membaca status dan kode galat dari ApiError tanpa menampilkan teks server", () => {
  const err = (status: number, body: string) => Object.assign(new Error(body), { status });
  assert.equal(describeSecurityCodeError(err(409, JSON.stringify({ error: "agent_not_waiting" }))), securityCodeErrorMessage(409));
  assert.equal(describeSecurityCodeError(err(429, JSON.stringify({ error: "too_many_codes" }))), "Batas 3 kode untuk percobaan ini sudah tercapai.");
  assert.equal(describeSecurityCodeError(err(400, JSON.stringify({ error: "invalid_job" }))), securityCodeErrorMessage(400, "invalid_job"));
  assert.equal(describeSecurityCodeError(err(503, "<html>maintenance</html>")), "Fitur kode keamanan belum aktif di server.");
  // teks mentah dari server tidak ikut tampil
  assert.doesNotMatch(describeSecurityCodeError(err(500, "stack trace secret=abc")), /secret|stack/);
  // bukan ApiError: galat jaringan
  assert.equal(describeSecurityCodeError(new TypeError("Failed to fetch")), securityCodeErrorMessage(undefined));
  assert.equal(describeSecurityCodeError(null), securityCodeErrorMessage(undefined));
  assert.equal(describeSecurityCodeError(undefined), securityCodeErrorMessage(undefined));
  assert.equal(describeSecurityCodeError("x"), securityCodeErrorMessage(undefined));
});

test("codeAccepted: hanya { accepted: true }", () => {
  assert.equal(codeAccepted({ accepted: true }), true);
  for (const bad of [null, undefined, {}, { accepted: false }, { accepted: "true" }, true, "accepted", []]) assert.equal(codeAccepted(bad), false);
});

// ---- log awaiting_code dan code_timeout dari worker -> fakta, label, dan polling ----

const AWAITING_LOG = {
  job_id: "job-1",
  status: "awaiting_code",
  created_at: "2026-11-23T10:00:00Z",
  details: {
    queue_job_id: "q1",
    approval_request_id: "ap1",
    awaiting_until: inSeconds(600),
    code_length: 8,
    submit_clicked: true,
  },
};

test("agentLogFacts: log awaiting_code membawa batas waktu dan panjang kode; log lain tidak membawa kuncinya", () => {
  const facts = agentLogFacts(AWAITING_LOG);
  assert.equal(facts.log_status, "awaiting_code");
  assert.equal(facts.awaiting_until, inSeconds(600));
  assert.equal(facts.code_length, 8);
  // kode_length tidak masuk akal atau tanggal rusak: null, tidak melempar
  const bad = agentLogFacts({ ...AWAITING_LOG, details: { awaiting_until: "besok", code_length: "8" } });
  assert.equal(bad.awaiting_until, null);
  assert.equal(bad.code_length, null);
  assert.equal(agentLogFacts({ status: "awaiting_code" }).awaiting_until, null);
  // log selain awaiting_code tidak membawa kunci itu sama sekali
  const ready = agentLogFacts({ status: "ready", created_at: "2026-11-23T10:00:00Z", details: { awaiting_until: inSeconds(600), code_length: 8 } });
  assert.equal("awaiting_until" in ready, false);
  assert.equal("code_length" in ready, false);
});

test("describeAgentApply: tugas processing dengan log awaiting_code = Menunggu kode keamanan (kuning), bukan sedang mengisi", () => {
  const facts = agentLogFacts(AWAITING_LOG);
  const row = { status: "processing", ...facts };
  const now = Date.parse("2026-11-23T10:01:00Z");
  const v = describeAgentApply(row, now);
  assert.equal(v.label, "Menunggu kode keamanan");
  assert.equal(v.tone, "waiting");
  assert.equal(v.suggestEmail, false);
  assert.equal(v.hint, "Situs lowongan mengirim kode ke emailmu. Masukkan kodenya di bawah sebelum waktunya habis.");
  // waktunya sudah lewat tetapi log penutup belum ada: kembali ke teks tugas berjalan
  const late = describeAgentApply(row, Date.parse("2026-11-23T10:20:00Z"));
  assert.equal(late.label, "Agen sedang mengisi formulir");
  assert.equal(late.tone, "working");
  // log awaiting_code yang tertinggal pada tugas yang sudah selesai atau gagal tidak dipakai
  assert.notEqual(describeAgentApply({ ...row, status: "failed" }, now).label, "Menunggu kode keamanan");
  assert.notEqual(describeAgentApply({ ...row, status: "completed" }, now).label, "Menunggu kode keamanan");
  assert.equal(describeAgentApply({ ...row, status: "pending" }, now).label, "Menunggu agen");
  // describeLogOutcome sendiri tidak mengklaim hasil untuk awaiting_code
  assert.equal(describeLogOutcome(facts), null);
});

test("describeLogOutcome: ready dengan reason code_timeout = Kode tidak dimasukkan, lamaran belum terkirim", () => {
  const timeout = agentLogFacts({
    job_id: "job-1",
    status: "ready",
    created_at: "2026-11-23T10:10:00Z",
    details: { reason: "code_timeout", queue_job_id: "q1", submit_clicked: true },
  });
  const v = describeLogOutcome(timeout);
  assert.equal(v?.label, "Kode tidak dimasukkan");
  assert.equal(v?.hint, "Lamaran belum terkirim. Jalankan agen lagi untuk meminta kode baru.");
  assert.equal(v?.tone, "manual");
  const row = describeAgentApply({ status: "completed", fields_filled: 6, ...timeout });
  assert.equal(row.label, "Kode tidak dimasukkan");
  assert.equal(isCodeTimeout(timeout), true);
  // reason lain pada log ready tidak ikut
  assert.equal(describeLogOutcome({ log_status: "ready", reason: "timeout" }), null);
});

test("isAgentApplyActive: tetap aktif selama agen menunggu kode, supaya muat ulang berkala jalan", () => {
  const waiting = { status: "processing", ...agentLogFacts({ ...AWAITING_LOG, details: { ...AWAITING_LOG.details, awaiting_until: new Date(Date.now() + 600_000).toISOString() } }) };
  assert.equal(isAgentApplyActive(waiting), true);
  // status antrean belum diketahui tetapi log menunggu kode: aktif
  assert.equal(isAgentApplyActive({ log_status: "awaiting_code", awaiting_until: new Date(Date.now() + 60_000).toISOString() }), true);
  assert.equal(isAgentApplyActive({ status: "completed", log_status: "awaiting_code", awaiting_until: new Date(Date.now() + 60_000).toISOString() }), false);
  assert.equal(isAgentApplyActive({ status: "completed", log_status: "ready", reason: "code_timeout" }), false);
});

// ---- bentuk kode (tanpa DOM, jadi dijaga lewat sumbernya) ----

test("lib murni: securityCode.ts tanpa impor, tanpa tanda seru dan em dash di teks", () => {
  const src = read("../src/lib/securityCode.ts");
  assert.deepEqual([...src.matchAll(/^\s*import\s.*$/gm)], []);
  assert.doesNotMatch(src, /—/);
  assert.doesNotMatch(src.replace(/^\s*(\*|\/\/|\/\*).*$/gm, ""), /!["'`]/);
});

test("automationApi.submitSecurityCode: POST /api/agent/security-code dengan queue_job_id dan code, mode demo menerima", () => {
  const api = read("../src/services/automationApi.ts");
  assert.match(api, /async submitSecurityCode\(queueJobId: string, code: string\)/);
  assert.match(api, /\/api\/agent\/security-code/);
  assert.match(api, /body: JSON\.stringify\(\{ queue_job_id: queueJobId, code \}\)/);
  assert.match(api, /\(\) => \(\{ accepted: true \}\)/);
  assert.match(api, /method: 'POST', headers: await getAuthHeaders\(\), body: JSON\.stringify\(\{ queue_job_id: queueJobId/);
});

test("AgentSecurityCode: judul, penjelasan, kolom satu isian dengan atribut kode sekali pakai, tombol, hitung mundur", () => {
  const src = read("../src/components/AgentSecurityCode.tsx");
  const lib = read("../src/lib/securityCode.ts");
  assert.match(lib, /export const SECURITY_CODE_HEADING = "Masukkan kode keamanan";/);
  assert.match(lib, /Cek kotak masuk email yang kamu pakai di Applify \(juga folder Spam\)\. Kode hanya diteruskan ke agen untuk lamaran ini, tidak dibaca AI, dan dihapus setelah dipakai\./);
  assert.match(lib, /export const SECURITY_CODE_SEND_LABEL = "Kirim kode ke agen";/);
  assert.match(lib, /export const SECURITY_CODE_FORWARDED_TEXT = "Kode diteruskan\. Agen sedang mengirim lamaran\.";/);
  assert.match(lib, /export const CODE_RERUN_LABEL = "Jalankan agen lagi";/);
  // satu kolom teks, bukan kotak per karakter
  assert.equal([...src.matchAll(/<input\b/g)].length, 1);
  assert.match(src, /autoComplete="one-time-code"/);
  assert.match(src, /inputMode="text"/);
  assert.match(src, /spellCheck=\{false\}/);
  assert.match(src, /maxLength=\{CODE_MAX_LENGTH\}/);
  assert.match(src, /autoCapitalize="none"/);
  assert.doesNotMatch(src, /autoCapitalize="characters"/);
  assert.doesNotMatch(src, /type="password"/);
  assert.match(src, /htmlFor=\{inputId\}/);
  assert.match(src, /placeholder=\{codePlaceholder\(codeLength\)\}/);
  assert.match(src, /role="timer"/);
  assert.match(src, /formatCountdown\(secondsLeft\)/);
  assert.match(src, /disabled=\{busy \|\| !check\.ok\}/);
  assert.match(src, /automationApi\.submitSecurityCode\(queueJobId, check\.code\)/);
  assert.match(src, /describeSecurityCodeError\(err\)/);
  assert.doesNotMatch(src, /—/);
});

test("AgentSecurityCode: kode tidak disimpan, tidak dicatat, dikosongkan sesudah diterima", () => {
  const noComments = (t: string) => t.replace(/^\s*(\*|\/\/|\/\*).*$/gm, "");
  const src = noComments(read("../src/components/AgentSecurityCode.tsx"));
  const api = read("../src/services/automationApi.ts");
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB|document\.cookie|navigator\.clipboard/);
  assert.doesNotMatch(src, /console\.(log|info|warn|error|debug)/);
  assert.doesNotMatch(src, /\b(track|analytics|posthog|gtag|sendBeacon)\b/i);
  const submit = src.slice(src.indexOf("async function submit"), src.indexOf("// Tempelan dari email"));
  assert.ok(submit.indexOf("submitSecurityCode") < submit.indexOf('setValue("")'), "kolom dikosongkan sesudah backend menerima");
  assert.match(submit, /setValue\(""\)/);
  assert.match(submit, /onSent\(\)/);
  // galat tidak memuat kode: pesan hanya dari pemetaan status
  assert.doesNotMatch(submit, /err\.message|String\(err\)|\$\{err/);
  const method = api.slice(api.indexOf("async submitSecurityCode"), api.indexOf("async rejectApplication"));
  assert.doesNotMatch(method, /console\.|localStorage/);
});

test("AgentSecurityCode: tombol Jalankan agen lagi hanya untuk code_timeout tanpa pertanyaan, lewat rerunApproval", () => {
  const src = read("../src/components/AgentSecurityCode.tsx");
  assert.match(src, /isCodeTimeout\(row\) && questionsToAnswer\(row\)\.length === 0/);
  assert.match(src, /await rerunApproval\(approvalId\)/);
  assert.match(src, /describeRerunError\(err\)/);
  assert.match(src, /onRerun\(approvalId\)/);
  // tombol rerun tidak muncul saat tugas berjalan
  assert.match(src, /if \(active\) return rerunStarted/);
});

test("Persetujuan: kolom kode tampil di bawah status agen dan di atas pertanyaan; polling 5 detik saat menunggu kode", () => {
  const page = read("../src/routes/approvals.tsx");
  const status = page.indexOf("<AgentApplyStatus row={emailData.agent[request.id]} />");
  const code = page.indexOf("<AgentSecurityCode approvalId={request.id} row={emailData.agent[request.id]} onRerun={handleAgentRerun} onCodeSent={handleCodeSent} />");
  const questions = page.indexOf("<AgentQuestions");
  const email = page.indexOf("<EmailApplyPanel");
  assert.ok(status > 0 && code > status && questions > code && email > questions);
  assert.match(page, /activeTab === 'history' && request\.status === 'approved' && \(\s*<AgentSecurityCode/);
  assert.match(page, /pollIntervalMs\(agentRows\) === CODE_POLL_MS/);
  assert.match(page, /awaitingCode \? CODE_POLL_MS : AGENT_POLL_MS/);
  assert.doesNotMatch(page, /15_000/);
  // sesudah kode diterima: baca status agen sekarang juga
  assert.match(page, /const handleCodeSent = \(\) => \{[\s\S]*loadEmailApplyData\(history\)\.then\(setEmailData\)/);
});

test("layanan: id tugas antrean ikut di baris status agen supaya kode bisa dikirim ke tugas yang benar", () => {
  const svc = read("../src/services/emailApplyService.ts");
  assert.match(svc, /queue_job_id: String\(\(row as any\)\.id\)/);
  // select log tidak berubah dan tetap hanya membaca
  assert.match(svc, /\.select\("status, details, created_at"\)\s*\.eq\("action", "apply"\)/);
});

test("Lamaran Saya: satu baris tautan ke Persetujuan saat agen menunggu kode, teks berhenti sebelum kirim disembunyikan", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /import \{ awaitingCodeState \} from "@\/lib\/securityCode";/);
  assert.match(src, /const selectedAwaitingCode = awaitingCodeState\(selectedFacts\)\.waiting;/);
  assert.match(src, /Agen menunggu kode keamanan dari emailmu\. Masukkan di halaman\{" "\}\s*<Link to="\/approvals"[^>]*>Persetujuan<\/Link>\./);
  assert.match(src, /\{selectedAwaitingCode && \(\s*<p data-testid="agent-code-link"/);
  assert.match(src, /\{!selectedIssue && !selectedAwaitingCode && !selectedManualState && <p/);
});
