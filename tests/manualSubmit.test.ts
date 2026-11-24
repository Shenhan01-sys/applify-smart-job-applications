import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as manual from "../src/lib/manualSubmit.ts";
import {
  MANUAL_NOT_ALLOWED_TEXT,
  cleanCoverLetter,
  copyText,
  copyableFields,
  isManualSent,
  manualSentRow,
  manualSubmitState,
  markSentErrorMessage,
  safeJobUrl,
} from "../src/lib/manualSubmit.ts";
import { agentLogFacts } from "../src/lib/agentEvidence.ts";
import {
  AGENT_MANUAL_SENT_HINT,
  AGENT_MANUAL_SENT_LABEL,
  AGENT_SENT_LABEL,
  describeAgentApply,
  describeLogOutcome,
} from "../src/lib/agentApplyStatus.ts";
import { ApiError } from "../src/lib/apiErrors.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

/** Log "ready" dari worker: formulir terisi, tombol kirim tidak ditekan karena situs belum diizinkan. */
const READY_NOT_ALLOWED = {
  job_id: "job-1",
  status: "ready",
  created_at: "2026-11-23T14:05:00Z",
  details: {
    approval_request_id: "a1",
    queue_job_id: "q1",
    submit_blocked: "not_allowed",
    fields_filled: 2,
    filled_fields: [
      { label: "Email", kind: "text", value: "u1@contoh.test" },
      { label: "Resume", kind: "upload", value: "cv-u1.pdf" },
    ],
  },
};

// Log yang ditulis POST /api/approvals/:id/mark-sent (backend/services/manual-submit-guard.ts).
const MANUAL_LOG = {
  job_id: "job-1",
  status: "success",
  created_at: "2026-11-23T15:00:00Z",
  details: {
    approval_request_id: "a1",
    manual: true,
    reason: "manual_submit",
    note: "ditandai terkirim oleh pengguna; dikirim sendiri di situs lowongan",
  },
};

// ---- log manual dibaca dan dijelaskan jujur --------------------------------------------------------

test("agentLogFacts: details.manual dan approval_request_id dibaca; kunci tidak ada bila log tidak memuatnya", () => {
  const facts = agentLogFacts(MANUAL_LOG);
  assert.equal(facts.log_status, "success");
  assert.equal(facts.manual, true);
  assert.equal(facts.approval_request_id, "a1");
  assert.equal(facts.reason, "manual_submit");
  assert.equal(facts.screenshots ?? null, null, "log manual tidak punya tangkapan layar");

  const agent = agentLogFacts({ status: "success", created_at: "2026-11-23T14:05:00Z", details: { fields_filled: 1 } });
  assert.equal("manual" in agent, false);
  assert.equal("approval_request_id" in agent, false);
  // manual hanya benar bila persis true
  for (const manualValue of ["true", 1, "ya", null, {}]) {
    assert.equal("manual" in agentLogFacts({ status: "success", details: { manual: manualValue } }), false, String(manualValue));
  }
  assert.equal(agentLogFacts(READY_NOT_ALLOWED).approval_request_id, "a1");
});

test("describeLogOutcome: success manual diberi label dikirim sendiri tanpa mengaku agen yang mengirim", () => {
  const facts = agentLogFacts(MANUAL_LOG);
  const v = describeLogOutcome(facts);
  assert.equal(v?.label, AGENT_MANUAL_SENT_LABEL);
  assert.equal(v?.label, "Terkirim (dikirim sendiri)");
  assert.equal(v?.hint, AGENT_MANUAL_SENT_HINT);
  assert.equal(v?.tone, "sent");
  assert.equal(v?.suggestEmail, false);
  assert.doesNotMatch(v?.hint ?? "", /Agen menekan kirim dan halaman konfirmasi/);
  assert.match(v?.hint ?? "", /Agen tidak menekan kirim/);
  assert.match(v?.hint ?? "", /menandai/);
  // tanpa kalimat konfirmasi dan tanpa saran bahwa portal mengirim email konfirmasi seolah agen yang mengirim
  assert.doesNotMatch(v?.hint ?? "", /Tulisan di halaman itu/);
});

test("describeLogOutcome: success tanpa manual tetap Terkirim oleh agen", () => {
  const v = describeLogOutcome({ log_status: "success", confirmation_phrase: "terima kasih" });
  assert.equal(v?.label, AGENT_SENT_LABEL);
  assert.match(v?.hint ?? "", /Agen menekan kirim/);
});

test("describeAgentApply: tugas selesai dengan log manual dan tugas gagal dengan log manual sama-sama Terkirim (dikirim sendiri)", () => {
  const facts = agentLogFacts(MANUAL_LOG);
  for (const status of ["completed", "failed"]) {
    const v = describeAgentApply({ ...facts, status });
    assert.equal(v.label, "Terkirim (dikirim sendiri)", status);
    assert.equal(v.tone, "sent");
  }
});

test("manualSentRow: log manual menggantikan hasil percobaan agen, isian agen tetap ikut", () => {
  const previous = {
    status: "completed",
    queue_job_id: "q1",
    log_status: "ready",
    submit_blocked: "not_allowed",
    filled_fields: [{ label: "Email", kind: "text" as const, value: "u1@contoh.test" }],
    logged_at: "2026-11-23T14:05:00Z",
  };
  const row = manualSentRow(previous, "2026-11-23T15:00:00Z");
  assert.equal(row.log_status, "success");
  assert.equal(row.manual, true);
  assert.equal(row.submit_blocked, null);
  assert.equal(row.status, "completed");
  assert.equal(row.queue_job_id, "q1");
  assert.equal(row.logged_at, "2026-11-23T15:00:00Z");
  assert.equal(row.filled_fields?.length, 1);
  assert.equal(describeAgentApply(row).label, AGENT_MANUAL_SENT_LABEL);
  assert.equal(manualSubmitState(row), null, "sesudah ditandai tidak ada lagi tombol kirim sendiri");

  // tanpa tugas agen sama sekali (tidak pernah dijalankan): tetap terbaca, status tugas diisi completed
  const bare = manualSentRow(undefined, null);
  assert.equal(bare.status, "completed");
  assert.equal(bare.logged_at, null);
  assert.equal(describeAgentApply(bare).label, AGENT_MANUAL_SENT_LABEL);
});

test("isManualSent: hanya log success dengan manual true", () => {
  assert.equal(isManualSent(agentLogFacts(MANUAL_LOG)), true);
  assert.equal(isManualSent({ log_status: "success" }), false);
  assert.equal(isManualSent({ log_status: "ready", manual: true }), false);
  assert.equal(isManualSent(null), false);
  assert.equal(isManualSent(undefined), false);
});

// ---- kapan jalan keluar ditawarkan -----------------------------------------------------------------

test("manualSubmitState: ready dengan submit_blocked not_allowed menawarkan semuanya, termasuk coba lagi", () => {
  const s = manualSubmitState({ status: "completed", ...agentLogFacts(READY_NOT_ALLOWED) });
  assert.equal(s?.kind, "not_allowed");
  assert.equal(s?.canRerun, true);
  assert.equal(s?.text, MANUAL_NOT_ALLOWED_TEXT);
  assert.equal(
    MANUAL_NOT_ALLOWED_TEXT,
    "Situs lowongan ini belum didukung untuk kirim otomatis, jadi agen berhenti sebelum tombol kirim. Lamaran belum terkirim.",
  );
  // fakta tanpa status tugas (jendela detail Lamaran Saya) juga lolos
  assert.equal(manualSubmitState(agentLogFacts(READY_NOT_ALLOWED))?.kind, "not_allowed");
});

test("manualSubmitState: isian wajib kosong dan ready lain: tombol kirim sendiri ada, coba kirim otomatis lagi tidak", () => {
  const remaining = manualSubmitState({ log_status: "ready", submit_blocked: "required_remaining" });
  assert.equal(remaining?.kind, "required_remaining");
  assert.equal(remaining?.canRerun, false);
  assert.match(remaining?.text ?? "", /belum terkirim/);
  const other = manualSubmitState({ log_status: "ready", submit_blocked: null });
  assert.equal(other?.kind, "other");
  assert.equal(other?.canRerun, false);
  assert.match(other?.text ?? "", /belum terkirim/);
  assert.equal(manualSubmitState({ log_status: "ready" })?.kind, "other");
});

test("manualSubmitState: alur yang sudah punya komponen sendiri tidak ikut tampil", () => {
  const ready = { log_status: "ready", submit_blocked: "not_allowed" };
  // pertanyaan untuk dijawab: AgentQuestions
  assert.equal(manualSubmitState({ ...ready, questions: [{ key: "k", label: "Gaji", kind: "text" }] }), null);
  // kode keamanan tidak dimasukkan atau ditolak: AgentSecurityCode
  assert.equal(manualSubmitState({ ...ready, reason: "code_timeout" }), null);
  assert.equal(manualSubmitState({ ...ready, reason: "code_rejected" }), null);
  // kirim sebelumnya belum terkonfirmasi, klaim kirim: jangan ajak pengguna mengirim ulang atau menandai dari sini
  for (const blocked of ["prior_unverified", "already_claimed", "claim_failed", "nothing_filled"]) {
    assert.equal(manualSubmitState({ log_status: "ready", submit_blocked: blocked }), null, blocked);
  }
  // menunggu kode keamanan
  const until = new Date(Date.now() + 600_000).toISOString();
  assert.equal(manualSubmitState({ status: "processing", log_status: "awaiting_code", awaiting_until: until }), null);
});

test("manualSubmitState: bukan log ready, agen masih bekerja, atau tugas tidak selesai: tidak tampil", () => {
  for (const log_status of ["success", "submit_unverified", "incomplete", "awaiting_code", "skipped", undefined, null]) {
    assert.equal(manualSubmitState({ log_status, submit_blocked: "not_allowed" }), null, String(log_status));
  }
  assert.equal(manualSubmitState({ log_status: "ready", manual: true, submit_blocked: "not_allowed" }), null);
  for (const status of ["pending", "processing", "failed", "skipped"]) {
    assert.equal(manualSubmitState({ status, log_status: "ready", submit_blocked: "not_allowed" }), null, status);
  }
  assert.equal(manualSubmitState(null), null);
  assert.equal(manualSubmitState(undefined), null);
  assert.equal(manualSubmitState({}), null);
});

// ---- tautan lowongan, isian, papan klip -------------------------------------------------------------

test("safeJobUrl: hanya http dan https", () => {
  assert.equal(safeJobUrl("https://id.jobstreet.com/job/123"), "https://id.jobstreet.com/job/123");
  assert.equal(safeJobUrl("  http://contoh.test/lowongan?id=5  "), "http://contoh.test/lowongan?id=5");
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://contoh.test/x", "contoh.test/x", "", "   ", null, undefined, 42, {}]) {
    assert.equal(safeJobUrl(bad), null, String(bad));
  }
  assert.equal(safeJobUrl(`https://contoh.test/${"a".repeat(2100)}`), null);
});

test("copyableFields: nilai disalin apa adanya, berkas memakai nama berkas, kotak centang tanpa nilai tidak bisa disalin", () => {
  const rows = copyableFields([
    { label: "Email", kind: "text", value: "u1@contoh.test" },
    { label: "Negara", kind: "select", value: "Indonesia" },
    { label: "Resume", kind: "upload", value: "cv-u1.pdf" },
    { label: "Saya setuju", kind: "check" },
    { label: "Catatan", kind: "text" },
    { label: "Spasi", kind: "text", value: "   " },
  ]);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map((r) => r.copy), ["u1@contoh.test", "Indonesia", "cv-u1.pdf", null, null, null]);
  assert.deepEqual(rows.map((r) => r.kind), ["Teks", "Pilihan", "Berkas", "Kotak centang", "Teks", "Teks"]);
  assert.equal(rows[2].shown, "cv-u1.pdf");
  assert.equal(rows[3].shown, "dicentang");
  assert.equal(rows[4].shown, "tidak dicatat");
  assert.equal(new Set(rows.map((r) => r.key)).size, 6, "kunci unik walau label sama");
  assert.equal(new Set(copyableFields([{ label: "A", kind: "text", value: "1" }, { label: "A", kind: "text", value: "2" }]).map((r) => r.key)).size, 2);
  assert.deepEqual(copyableFields(null), []);
  assert.deepEqual(copyableFields(undefined), []);
  assert.deepEqual(copyableFields("bukan daftar" as any), []);
});

test("cleanCoverLetter: teks yang dipangkas, atau null", () => {
  assert.equal(cleanCoverLetter("  Yth. Tim Rekrutmen,\n\nSaya melamar.  "), "Yth. Tim Rekrutmen,\n\nSaya melamar.");
  for (const bad of ["", "   \n ", null, undefined, 5, {}]) assert.equal(cleanCoverLetter(bad), null, String(bad));
});

test("copyText: berhasil lewat Clipboard API, gagal dengan pesan jujur bila tidak ada atau ditolak", async () => {
  const written: string[] = [];
  const host = { clipboard: { writeText: async (t: string) => void written.push(t) } };
  assert.deepEqual(await copyText("halo", host), { ok: true });
  assert.deepEqual(written, ["halo"]);

  const unavailable = { ok: false, error: manual.COPY_UNAVAILABLE_TEXT };
  assert.deepEqual(await copyText("halo", {}), unavailable);
  assert.deepEqual(await copyText("halo", { clipboard: null }), unavailable);
  assert.deepEqual(await copyText("halo", null), unavailable);
  assert.deepEqual(await copyText("halo", undefined), unavailable);
  const denied = { clipboard: { writeText: async () => { throw new Error("NotAllowedError"); } } };
  assert.deepEqual(await copyText("halo", denied), unavailable);
  assert.match(manual.COPY_UNAVAILABLE_TEXT, /Pilih teksnya/);
});

// ---- galat endpoint tandai terkirim ----------------------------------------------------------------

test("markSentErrorMessage: setiap penolakan backend dijelaskan satu per satu", () => {
  const body = (status: number, code: string, error = "x") => new ApiError(status, JSON.stringify({ error, code }));
  assert.match(markSentErrorMessage(body(409, "already_sent")), /sudah tercatat terkirim/);
  assert.match(markSentErrorMessage(body(409, "agent_working")), /Agen sedang bekerja/);
  assert.match(markSentErrorMessage(body(409, "not_approved")), /belum disetujui/);
  assert.match(markSentErrorMessage(body(422, "no_job")), /tidak punya lowongan/);
  assert.match(markSentErrorMessage(new ApiError(404, JSON.stringify({ error: "Approval request not found", code: "not_found" }))), /tidak ditemukan/);
  assert.match(markSentErrorMessage(new ApiError(401, JSON.stringify({ error: "Unauthorized" }))), /Masuk lagi/);
  assert.match(markSentErrorMessage(new ApiError(500, JSON.stringify({ error: "Failed to mark as sent: x", code: "mark_failed" }))), /server bermasalah/);
  assert.match(markSentErrorMessage(new Error("Failed to fetch")), /tidak dapat dihubungi/);
  assert.equal(markSentErrorMessage(new Error("aneh")), "Lamaran belum bisa ditandai terkirim. Coba lagi.");
  assert.equal(markSentErrorMessage(undefined), "Lamaran belum bisa ditandai terkirim. Coba lagi.");
});

test("teks pengguna: tanpa tanda seru dan tanpa em dash, kalimat wajib dari spesifikasi ada", () => {
  const texts = Object.entries(manual)
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => [k, v as string] as const);
  assert.ok(texts.length >= 20);
  for (const [name, text] of texts) {
    assert.doesNotMatch(text, /!/, name);
    assert.doesNotMatch(text, /—/, name);
  }
  assert.equal(manual.OPEN_FORM_LABEL, "Buka formulir lowongan");
  assert.equal(manual.COPY_PANEL_LABEL, "Salin isian agen");
  assert.equal(manual.COPY_LETTER_LABEL, "Salin cover letter");
  assert.equal(manual.COPIED_TEXT, "Tersalin");
  assert.equal(manual.MARK_SENT_LABEL, "Saya sudah mengirimnya sendiri");
  assert.equal(manual.MARK_CONFIRM_TEXT, "Tandai lamaran ini sudah terkirim? Agen tidak akan mengirimnya lagi.");
  assert.equal(manual.MARKED_TEXT, "Ditandai terkirim manual");
  assert.equal(manual.RERUN_LABEL, "Coba kirim otomatis lagi");
  for (const body of [AGENT_MANUAL_SENT_LABEL, AGENT_MANUAL_SENT_HINT]) {
    assert.doesNotMatch(body, /!|—/);
  }
});

// ---- kabel layar (suite ini tidak punya DOM: membaca teks sumber) -----------------------------------

test("kabel: komponen membuka formulir di tab baru dengan rel aman, menyalin lewat Clipboard API, dan meminta konfirmasi", () => {
  const src = read("../src/components/AgentManualSubmit.tsx");
  assert.match(src, /target="_blank" rel="noopener noreferrer"/);
  assert.match(src, /safeJobUrl\(jobUrl\)/);
  assert.match(src, /copyText\(text, typeof navigator !== "undefined" \? navigator : null\)/);
  assert.match(src, /MARK_CONFIRM_TEXT/);
  assert.match(src, /role="group" aria-labelledby=\{confirmId\}/);
  assert.match(src, /await markApprovalSent\(approvalId\)/);
  assert.match(src, /markSentErrorMessage\(err\)/);
  // coba kirim otomatis lagi: endpoint rerun yang sudah ada, hanya bila situs belum diizinkan (canRerun)
  assert.match(src, /state\.canRerun && !confirming/);
  assert.match(src, /await rerunApproval\(approvalId\)/);
  assert.match(src, /describeRerunError\(err\)/);
  // aksesibel: tombol bertipe, ukuran sentuh, status terbaca pembaca layar, galat sebagai alert
  assert.doesNotMatch(src, /<button(?![^>]*type=)/);
  assert.match(src, /min-h-11/);
  assert.match(src, /aria-live="polite"/);
  assert.match(src, /role="alert"/);
  assert.match(src, /aria-label=\{copied === f\.key \? `\$\{COPIED_TEXT\}: \$\{f\.label\}` : `Salin isian \$\{f\.label\}`\}/);
  // tidak menulis ke database dari layar
  assert.doesNotMatch(src, /supabase/);
  assert.doesNotMatch(src, /!\s*["'`][^"'`]*["'`]/);
});

test("kabel: kartu Persetujuan memasang panel kirim sendiri sesudah pertanyaan agen dan sebelum email", () => {
  const page = read("../src/routes/approvals.tsx");
  const questionsAt = page.indexOf("<AgentQuestions");
  const manualAt = page.indexOf("<AgentManualSubmit");
  const emailAt = page.indexOf("<EmailApplyPanel");
  assert.ok(questionsAt > 0 && manualAt > questionsAt && emailAt > manualAt);
  assert.match(page, /activeTab === 'history' && request\.status === 'approved' && \(\s*<AgentManualSubmit/);
  assert.match(page, /jobUrl=\{emailData\.jobUrls\[request\.id\]\}/);
  assert.match(page, /coverLetter=\{request\.cover_letter \?\? null\}/);
  assert.match(page, /onMarked=\{handleManualMarked\}/);
  assert.match(page, /onRerun=\{handleAgentRerun\}/);
  const card = read("../src/components/AgentApplyStatus.tsx");
  assert.match(card, /manualSubmitState\(row\)\?\.kind !== "not_allowed"/);
});

test("kabel: Lamaran Saya memasang panel di jendela detail dan memuat ulang papan sesudah penandaan", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /const selectedManualState = manualSubmitState\(selectedFacts\);/);
  assert.match(src, /const selectedManualSent = isManualSent\(selectedFacts\);/);
  const at = src.indexOf("<AgentManualSubmit");
  assert.ok(at > 0);
  const block = src.slice(at, at + 700);
  assert.match(block, /approvalId=\{selectedFacts\?\.approval_request_id\}/);
  assert.match(block, /jobUrl=\{selectedJob\?\.external_url\}/);
  assert.match(block, /loadCoverLetter/);
  assert.match(block, /reloadAfterApply\(\)/);
});

test("kabel: layanan membaca log manual dan alamat lowongan, dan memanggil endpoint mark-sent lewat automationApi", () => {
  const svc = read("../src/services/emailApplyService.ts");
  assert.match(svc, /\.select\("action, details, created_at"\)\.eq\("status", "success"\)/);
  assert.match(svc, /details\?\.manual === true/);
  assert.match(svc, /\.select\("id, title, description, requirements, responsibilities, external_url"\)/);
  assert.match(svc, /safeJobUrl\(/);
  const api = read("../src/services/automationApi.ts");
  assert.match(api, /\/api\/approvals\/\$\{encodeURIComponent\(id\)\}\/mark-sent/);
  const svc2 = read("../src/services/manualSubmitService.ts");
  assert.match(svc2, /automationApi\.markApprovalSent\(approvalId\)/);
  assert.match(svc2, /automationApi\.getApproval\(approvalId\)/);
  assert.doesNotMatch(svc2, /supabase/);
});
