import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_CODE_REJECTED_LABEL,
  AGENT_CODE_TIMEOUT_LABEL,
  AGENT_NOT_STARTED_HINT,
  AGENT_PARTIAL_LABEL,
  AGENT_PRIOR_UNVERIFIED_LABEL,
  AGENT_SENT_EMAIL_NOTE,
  AGENT_UNVERIFIED_LABEL,
  AGENT_VALIDATION_LABEL,
  LOGIN_TAB_INSTRUCTION,
  OPEN_JOB_PAGE_LABEL,
  describeAgentApply,
  describeLogOutcome,
  isAgentApplyActive,
} from "../src/lib/agentApplyStatus.ts";
import { AGENT_STOPPED_BEFORE_SUBMIT_TEXT, NO_FIELDS_FILLED_TEXT, QUEUE_NEEDS_MANUAL_LABEL } from "../src/lib/statusLabels.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("tanpa tugas agen: label belum dijalankan dan email ditawarkan", () => {
  const v = describeAgentApply(undefined);
  assert.equal(v.label, "Agen belum dijalankan");
  assert.equal(v.hint, AGENT_NOT_STARTED_HINT);
  assert.equal(v.tone, "none");
  assert.equal(v.suggestEmail, true);
});

test("menunggu dan sedang berjalan: email tidak ditonjolkan, status aktif", () => {
  const p = describeAgentApply({ status: "pending" });
  assert.equal(p.label, "Menunggu agen");
  assert.equal(p.suggestEmail, false);
  const w = describeAgentApply({ status: "processing" });
  assert.equal(w.label, "Agen sedang mengisi formulir");
  assert.equal(w.tone, "working");
  assert.equal(isAgentApplyActive({ status: "pending" }), true);
  assert.equal(isAgentApplyActive({ status: "processing" }), true);
  assert.equal(isAgentApplyActive({ status: "completed" }), false);
  assert.equal(isAgentApplyActive(undefined), false);
});

test("selesai tanpa isian (uji klik Cermati 23 Nov): Perlu diisi sendiri", () => {
  const v = describeAgentApply({ status: "completed", fields_filled: 0 });
  assert.equal(v.label, QUEUE_NEEDS_MANUAL_LABEL);
  assert.equal(v.hint, NO_FIELDS_FILLED_TEXT);
  assert.equal(v.tone, "manual");
  assert.equal(v.suggestEmail, true);
});

test("selesai dengan isian: jumlah isian dan berhenti sebelum kirim", () => {
  const v = describeAgentApply({ status: "completed", fields_filled: 14 });
  assert.equal(v.label, "Formulir terisi (14 isian), berhenti sebelum kirim");
  assert.equal(v.tone, "ready");
  assert.equal(v.suggestEmail, false);
  assert.match(v.hint, /berhenti sebelum tombol kirim/);
  // Log belum terbaca: tidak mengarang jumlah isian.
  assert.equal(describeAgentApply({ status: "completed", fields_filled: null }).label, "Formulir diisi, berhenti sebelum kirim");
});

test("gagal dan dilewati: email ditawarkan sebagai cadangan", () => {
  const f = describeAgentApply({ status: "failed", error_message: "timeout" });
  assert.equal(f.label, "Agen gagal");
  assert.equal(f.tone, "failed");
  assert.equal(f.suggestEmail, true);
  const s = describeAgentApply({ status: "failed", error_message: "Lowongan ini tidak punya tautan untuk dilamar" });
  assert.equal(s.label, "Dilewati");
  assert.equal(s.suggestEmail, true);
});

test("halaman Approvals: status agen tampil sebelum opsi email pada persetujuan yang disetujui", () => {
  const page = read("../src/routes/approvals.tsx");
  const agentAt = page.indexOf("<AgentApplyStatus row={emailData.agent[request.id]} jobUrl={emailData.jobUrls[request.id]}");
  const emailAt = page.indexOf("<EmailApplyPanel");
  assert.ok(agentAt > 0 && emailAt > agentAt, "AgentApplyStatus harus dirender sebelum EmailApplyPanel");
  assert.match(page, /\{approved && \(\s*<AgentApplyStatus/);
  const panel = read("../src/components/EmailApplyPanel.tsx");
  assert.match(panel, /Opsi lain: Kirim lewat Email/);
});

test("layanan: status agen dibaca dari tugas apply & extension_apply per approval_request_id dan log fields_filled", () => {
  const svc = read("../src/services/emailApplyService.ts");
  assert.match(svc, /\.in\("job_type", \["apply", "extension_apply"\]\)\s*\.in\("payload->>approval_request_id", ids\)/);
  assert.match(svc, /\.eq\("action", "apply"\)\s*\.in\("details->>queue_job_id", queueIds\)/);
  assert.doesNotMatch(svc, /from\("automation_queue"\)\s*\.(insert|update|delete)/);
});

// ---- Hasil dari log percobaan agen (worker menulis status success, submit_unverified, dan seterusnya) ----

test("log success: Terkirim, hijau, dengan kalimat konfirmasi dan saran cek email; email tidak ditawarkan", () => {
  const v = describeAgentApply({ status: "completed", fields_filled: 6, log_status: "success", submit_check_verdict: "confirmed", confirmation_phrase: "terima kasih telah melamar" });
  assert.equal(v.label, "Terkirim");
  assert.equal(v.tone, "sent");
  assert.equal(v.suggestEmail, false);
  assert.match(v.hint, /Agen menekan kirim dan halaman konfirmasi terdeteksi/);
  assert.match(v.hint, /"terima kasih telah melamar"/);
  assert.ok(v.hint.endsWith(AGENT_SENT_EMAIL_NOTE));
  assert.equal(AGENT_SENT_EMAIL_NOTE, "Cek juga kotak masuk emailmu: portal lowongan biasanya mengirim email konfirmasi.");
  // Tanpa kalimat konfirmasi: tidak ada tanda kutip kosong
  const bare = describeAgentApply({ status: "completed", log_status: "success", confirmation_phrase: null });
  assert.doesNotMatch(bare.hint, /"/);
  assert.match(bare.hint, /halaman konfirmasi terdeteksi/);
  // Tombol kirim sudah ditekan: tugas yang kemudian berstatus failed tetap dilaporkan terkirim, bukan "Agen gagal"
  assert.equal(describeAgentApply({ status: "failed", error_message: "timeout", log_status: "success" }).label, "Terkirim");
  // Hasil ini tidak menggantikan tugas yang masih berjalan
  assert.equal(describeAgentApply({ status: "processing", log_status: "success" }).label, "Agen sedang mengisi formulir");
});

test("log submit_unverified: Perlu dicek, kuning, tidak menyuruh melamar ulang dan tidak menawarkan email", () => {
  const v = describeAgentApply({ status: "completed", fields_filled: 6, log_status: "submit_unverified", submit_check_verdict: "uncertain" });
  assert.equal(v.label, AGENT_UNVERIFIED_LABEL);
  assert.equal(v.label, "Perlu dicek: kirim belum terkonfirmasi");
  assert.equal(v.tone, "unverified");
  assert.equal(v.suggestEmail, false);
  assert.match(v.hint, /menekan tombol kirim/);
  assert.match(v.hint, /halaman konfirmasi tidak terlihat/);
  assert.match(v.hint, /kotak masuk emailmu atau akunmu di situs lowongan sebelum melamar lagi/);
  assert.match(v.hint, /Jangan ajukan ulang tanpa mengecek/);
  // Bukan teks "berhenti sebelum tombol kirim": tombol kirim memang sudah ditekan
  assert.doesNotMatch(v.hint, /berhenti sebelum/);
  assert.doesNotMatch(v.label, /berhenti sebelum/);
  assert.equal(describeAgentApply({ status: "failed", log_status: "submit_unverified" }).label, AGENT_UNVERIFIED_LABEL);
});

test("log incomplete validation_failed: Ditolak formulir, tidak terkirim, lengkapi profil lalu ajukan lagi", () => {
  for (const row of [
    { status: "completed", fields_filled: 5, log_status: "incomplete", reason: "validation_failed" },
    { status: "completed", fields_filled: 5, log_status: "incomplete", submit_check_verdict: "validation_error" },
  ]) {
    const v = describeAgentApply(row);
    assert.equal(v.label, AGENT_VALIDATION_LABEL);
    assert.equal(v.label, "Ditolak formulir (tidak terkirim)");
    assert.equal(v.tone, "manual");
    assert.match(v.hint, /menolak pengiriman/);
    assert.match(v.hint, /pesan validasi/);
    assert.match(v.hint, /Tidak ada lamaran yang terkirim/);
    assert.match(v.hint, /Lengkapi data profilmu, lalu ajukan lagi/);
    assert.equal(v.suggestEmail, true);
  }
  // reason yang sama pada log bukan "incomplete" tidak dianggap ditolak
  assert.notEqual(describeAgentApply({ status: "completed", fields_filled: 5, log_status: "ready", reason: "validation_failed" }).label, AGENT_VALIDATION_LABEL);
});

test("log ready dengan submit_blocked required_remaining: Terisi sebagian, paling banyak tiga label disebut", () => {
  const v = describeAgentApply({
    status: "completed",
    fields_filled: 9,
    log_status: "ready",
    submit_blocked: "required_remaining",
    remaining_required: ["Phone", "City", "Expected salary", "LinkedIn URL", "Portfolio"],
  });
  assert.equal(v.label, AGENT_PARTIAL_LABEL);
  assert.equal(v.label, "Terisi sebagian, belum dikirim");
  assert.equal(v.tone, "manual");
  assert.match(v.hint, /Phone; City; Expected salary; dan 2 isian lain/);
  assert.doesNotMatch(v.hint, /LinkedIn URL|Portfolio/);
  assert.match(v.hint, /belum terkirim/);
  // tepat tiga: tanpa "dan N isian lain"
  const three = describeAgentApply({ status: "completed", log_status: "ready", submit_blocked: "required_remaining", remaining_required: ["A", "B", "C"] });
  assert.match(three.hint, /A; B; C\./);
  assert.doesNotMatch(three.hint, /isian lain/);
  // label panjang (pernyataan persetujuan) dipotong, daftar kosong tidak mengarang label
  const long = describeAgentApply({ status: "completed", log_status: "ready", submit_blocked: "required_remaining", remaining_required: ["x".repeat(300)] });
  assert.ok(long.hint.length < 400);
  const none = describeAgentApply({ status: "completed", log_status: "ready", submit_blocked: "required_remaining", remaining_required: [] });
  assert.equal(none.label, AGENT_PARTIAL_LABEL);
  assert.match(none.hint, /masih ada isian wajib yang kosong/);
});

test("log ready dengan submit_blocked prior_unverified: agen tidak menekan kirim lagi, pengguna diminta mengecek", () => {
  const v = describeAgentApply({ status: "completed", fields_filled: 6, log_status: "ready", submit_blocked: "prior_unverified" });
  assert.equal(v.label, AGENT_PRIOR_UNVERIFIED_LABEL);
  assert.equal(v.tone, "unverified");
  assert.equal(v.suggestEmail, false);
  assert.match(v.hint, /tidak menekan kirim lagi/);
});

test("kasus lain tetap seperti semula: berhenti sebelum kirim, perlu diisi sendiri, gagal, dan tanpa log", () => {
  // pengiriman otomatis belum diizinkan: teks berhenti sebelum kirim yang lama
  const stopped = describeAgentApply({ status: "completed", fields_filled: 14, log_status: "ready", submit_blocked: "not_allowed" });
  assert.equal(stopped.label, "Formulir terisi (14 isian), berhenti sebelum kirim");
  assert.equal(stopped.hint, AGENT_STOPPED_BEFORE_SUBMIT_TEXT);
  assert.equal(stopped.tone, "ready");
  // tidak ada isian: dari jumlah isian atau dari reason no_fields_filled
  assert.equal(describeAgentApply({ status: "completed", fields_filled: 0, log_status: "incomplete", reason: "no_fields_filled", submit_blocked: "nothing_filled" }).label, QUEUE_NEEDS_MANUAL_LABEL);
  assert.equal(describeAgentApply({ status: "completed", fields_filled: null, log_status: "incomplete", reason: "no_fields_filled" }).label, QUEUE_NEEDS_MANUAL_LABEL);
  // gagal tanpa tombol kirim ditekan
  assert.equal(describeAgentApply({ status: "failed", error_message: "timeout", log_status: "incomplete" }).label, "Agen gagal");
  assert.equal(describeAgentApply({ status: "pending" }).label, "Menunggu agen");
  assert.equal(describeAgentApply(undefined).label, "Agen belum dijalankan");
  // log tanpa hasil khusus
  assert.equal(describeLogOutcome(undefined), null);
  assert.equal(describeLogOutcome({ log_status: "ready", submit_blocked: "not_allowed" }), null);
  assert.equal(describeLogOutcome({}), null);
});

test("kartu Persetujuan menampilkan bukti dari agen hanya bila ada, dan layanan membaca status log", () => {
  const card = read("../src/components/AgentApplyStatus.tsx");
  assert.match(card, /hasAgentEvidence\(row\)/);
  assert.match(card, /<AgentEvidence screenshots=\{row\.screenshots\} filledFields=\{row\.filled_fields\} loggedAt=\{row\.logged_at\} \/>/);
  assert.match(card, /sent: "bg-green-100/);
  assert.match(card, /unverified: "bg-amber-100/);
  const svc = read("../src/services/emailApplyService.ts");
  assert.match(svc, /\.select\("status, details, created_at"\)\s*\.eq\("action", "apply"\)/);
  // fakta log dibaca di lib/agentApplyRows.ts (log worker dan log ekstensi lewat agentLogFacts yang sama)
  assert.match(read("../src/lib/agentApplyRows.ts"), /agentLogFacts\(worker\)/);
  assert.match(read("../src/lib/agentApplyRows.ts"), /agentLogFacts\(ext\)/);
  // hanya membaca: tidak ada tulis ke antrean atau log
  assert.doesNotMatch(svc, /from\("application_logs"\)\s*\.(insert|update|upsert|delete)/);
  assert.doesNotMatch(svc, /from\("automation_queue"\)\s*\.(insert|update|upsert|delete)/);
});

test("kode keamanan: tidak dimasukkan (code_timeout) dan ditolak (code_rejected) sama-sama belum terkirim", () => {
  const timeout = describeAgentApply({ status: "completed", log_status: "ready", reason: "code_timeout" } as any);
  assert.equal(timeout.label, AGENT_CODE_TIMEOUT_LABEL);
  const rejected = describeAgentApply({ status: "completed", log_status: "ready", reason: "code_rejected" } as any);
  assert.equal(rejected.label, AGENT_CODE_REJECTED_LABEL);
  assert.match(rejected.hint ?? "", /belum terkirim/);
});

test("antrean ekstensi Fase 2 & jeda login (awaiting_login): status aktif, resolusi URL login aman, dan batas waktu", () => {
  const future = new Date(Date.now() + 10 * 60_000).toISOString();
  const pendingExt = describeAgentApply({ status: "pending", job_type: "extension_apply" });
  assert.equal(pendingExt.label, "Menunggu Ekstensi Browser");
  assert.equal(pendingExt.tone, "waiting");

  const runningExt = describeAgentApply({ status: "processing", job_type: "extension_apply" });
  assert.equal(runningExt.label, "Ekstensi Browser sedang mengisi formulir");
  assert.equal(runningExt.tone, "working");

  const waitLoginRow = {
    status: "processing",
    job_type: "extension_apply",
    channel: "extension" as const,
    log_status: "awaiting_login",
    awaiting_until: future,
    login_url: "https://login.seek.com/login",
  };
  const waiting = describeAgentApply(waitLoginRow);
  assert.equal(waiting.label, "Menunggu login di tab browser");
  assert.equal(waiting.tone, "waiting");
  assert.equal(isAgentApplyActive(waitLoginRow), true);

  // Untuk host OAuth eksternal (login.seek.com), resolveLoginTabUrl mengutamakan halaman lowongan asal (`jobUrl`).
  const card = read("../src/components/AgentApplyStatus.tsx");
  assert.match(card, /data-testid="open-login-tab"/);
  assert.match(card, /OPEN_JOB_PAGE_LABEL/);
  assert.doesNotMatch(card, /Buka tab login/);
  assert.equal(OPEN_JOB_PAGE_LABEL, "Buka halaman lowongan");
  // Petunjuk utama: pindah ke tab yang dibuka ekstensi (tab baru dalam grup tab Applify), login di sana.
  assert.match(LOGIN_TAB_INSTRUCTION, /tab baru/);
  assert.match(LOGIN_TAB_INSTRUCTION, /grup tab Applify/);
  assert.match(LOGIN_TAB_INSTRUCTION, /Pindah ke tab itu/);
  assert.match(card, /data-testid="login-tab-guide"/);

  // Timeout login: dari log incomplete login_timeout maupun processing yang deadline-nya terlewati.
  const timedOutLog = describeAgentApply({ status: "completed", job_type: "extension_apply", log_status: "incomplete", reason: "login_timeout" });
  assert.equal(timedOutLog.label, "Batas waktu login habis (belum terkirim)");
  assert.equal(timedOutLog.tone, "manual");
  const expiredProcessing = describeAgentApply({ ...waitLoginRow, awaiting_until: "2020-01-01T00:00:00Z" }, Date.parse("2026-11-24T12:00:00Z"));
  assert.equal(expiredProcessing.label, "Batas waktu login habis (belum terkirim)");
});

test("page_mismatch: kartu menjelaskan halaman berpindah, bukan pengiriman belum diizinkan", () => {
  const view = describeLogOutcome({ log_status: "incomplete", reason: "page_mismatch" } as any);
  assert.ok(view);
  assert.match(view!.label, /Halaman berpindah/);
  assert.doesNotMatch(view!.hint, /belum diizinkan|uji coba/);
});

test("teks berhenti sebelum kirim tidak lagi menyebut uji coba", () => {
  assert.doesNotMatch(AGENT_STOPPED_BEFORE_SUBMIT_TEXT, /uji coba|dimatikan/);
});
