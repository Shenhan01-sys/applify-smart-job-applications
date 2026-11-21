import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMAIL_APPLY_EXPLANATION,
  buildEmailApplyRequest,
  describeQueueError,
  extractRecruiterEmails,
  getEmailApplyState,
  validateRecruiterEmail,
  type ApprovalLike,
  type EmailApplyContext,
} from "../src/lib/emailApply.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const NOW = new Date("2026-11-18T10:00:00.000Z");
const approval = (over: Partial<ApprovalLike> = {}): ApprovalLike => ({
  id: "apr-1",
  status: "approved",
  expires_at: "2026-11-18T10:30:00.000Z",
  job_id: "job-1",
  application_id: "app-1",
  cover_letter: "Yth. Bapak/Ibu HRD, saya melamar posisi Staf Administrasi.",
  ...over,
});
const ctx = (over: Partial<EmailApplyContext> = {}): EmailApplyContext => ({
  now: NOW,
  used: false,
  job: null,
  gmailConnected: true,
  applyEmail: "hrd@perusahaan.co.id",
  ...over,
});

// ---- alamat tujuan ----

test("email rekruter: alamat tunggal yang wajar diterima dan dipangkas", () => {
  assert.deepEqual(validateRecruiterEmail("  hrd@perusahaan.co.id "), { ok: true, email: "hrd@perusahaan.co.id" });
  assert.deepEqual(validateRecruiterEmail("karir+admin@sub.example.com"), { ok: true, email: "karir+admin@sub.example.com" });
});

test("email rekruter: kosong, tanpa @, dua alamat, spasi, tanda kurung sudut, dan baris baru ditolak (cegah header palsu di To:)", () => {
  for (const bad of [
    "", "   ", "tanpa-at.com", "a@b", "a@b.c", "@x.com", "a@@x.com", "a b@x.com", "a@x.com, b@x.com", "a@x.com;b@x.com",
    "Nama <a@x.com>", "\"a\"@x.com", "a@x.com\r\nBcc: korban@x.com", "a@x.com\nBcc: korban@x.com", "a..b@x.com", ".a@x.com", "a.@x.com",
    "a@-x.com", "a@x..com", "a@x.com.", "x".repeat(65) + "@x.com", `a@${"x".repeat(250)}.com`,
  ]) {
    assert.equal(validateRecruiterEmail(bad).ok, false, JSON.stringify(bad));
  }
  assert.equal(validateRecruiterEmail(null).ok, false);
  assert.equal(validateRecruiterEmail(42).ok, false);
});

test("saran email dari teks lowongan: unik, valid, bukan nama gambar, maksimal 5", () => {
  const text = "Kirim CV ke HRD@Maju.co.id atau hrd@maju.co.id; cc: karir@maju.co.id. logo@2x.png bukan email. Hubungi a@b";
  assert.deepEqual(extractRecruiterEmails(text), ["HRD@Maju.co.id", "karir@maju.co.id"]);
  assert.deepEqual(extractRecruiterEmails(""), []);
  assert.deepEqual(extractRecruiterEmails(undefined), []);
  const many = Array.from({ length: 9 }, (_, i) => `u${i}@x.com`).join(" ");
  assert.equal(extractRecruiterEmails(many).length, 5);
});

// ---- kapan aksi tampil ----

test("aksi hanya tampil bila persetujuan ada dan berstatus approved", () => {
  assert.equal(getEmailApplyState(null, ctx()).visible, false);
  assert.equal(getEmailApplyState(undefined, ctx()).visible, false);
  for (const status of ["pending", "rejected", "expired", "", null, undefined]) {
    const s = getEmailApplyState(approval({ status }), ctx());
    assert.equal(s.visible, false, String(status));
    assert.equal(s.enabled, false, String(status));
  }
  assert.equal(getEmailApplyState(approval(), ctx()).visible, true);
});

// ---- kapan tombol aktif ----

test("tombol aktif bila disetujui, belum kedaluwarsa, ada lowongan dan surat, belum dipakai, Gmail terhubung, email valid", () => {
  const s = getEmailApplyState(approval(), ctx());
  assert.deepEqual(s, { visible: true, enabled: true });
});

test("kedaluwarsa (atau tanggal rusak, atau tepat pada batas) menonaktifkan tombol", () => {
  for (const expires_at of ["2026-11-18T09:59:59.000Z", "2026-11-18T10:00:00.000Z", "bukan tanggal", null, undefined]) {
    const s = getEmailApplyState(approval({ expires_at }), ctx());
    assert.equal(s.visible, true);
    assert.equal(s.enabled, false, String(expires_at));
    assert.equal(s.block, "expired");
    // temuan 22: lencana Riwayat tetap "Disetujui", jadi panel menjelaskan bahwa yang habis adalah masa berlaku 1 jam
    assert.match(s.message ?? "", /tetap tercatat/);
    assert.match(s.message ?? "", /1 jam/);
  }
});

test("tanpa lowongan atau tanpa surat: nonaktif, dan surat tidak pernah dibuat AI sebagai pengganti", () => {
  assert.equal(getEmailApplyState(approval({ job_id: null }), ctx()).block, "no_job");
  for (const cover_letter of ["", "   \n", null, undefined]) {
    const s = getEmailApplyState(approval({ cover_letter }), ctx());
    assert.equal(s.enabled, false);
    assert.equal(s.block, "no_letter");
    assert.match(s.message!, /tidak dibuat dari AI/);
  }
});

test("persetujuan yang sudah dipakai satu pengiriman: nonaktif", () => {
  const s = getEmailApplyState(approval(), ctx({ used: true }));
  assert.equal(s.enabled, false);
  assert.equal(s.block, "used");
});

test("pekerjaan email yang menunggu atau berjalan: nonaktif (cegah klik ganda dan antrean ganda)", () => {
  for (const status of ["pending", "processing"]) {
    const s = getEmailApplyState(approval(), ctx({ job: { status } }));
    assert.equal(s.enabled, false);
    assert.equal(s.block, "queued");
  }
});

test("pekerjaan gagal: boleh coba lagi dengan catatan galat, kecuali catatannya melarang kirim ulang", () => {
  const retry = getEmailApplyState(approval(), ctx({ job: { status: "failed", error_message: "Gmail not connected" } }));
  assert.equal(retry.enabled, true);
  assert.match(retry.message!, /Gmail not connected/);
  const stop = getEmailApplyState(approval(), ctx({ job: { status: "failed", error_message: "email terkirim, tetapi catatan application_logs gagal disimpan; jangan kirim ulang" } }));
  assert.equal(stop.enabled, false);
  assert.equal(stop.block, "do_not_resend");
  // selesai tanpa pengiriman tercatat (mode uji): masih boleh, karena persetujuan belum terpakai
  assert.equal(getEmailApplyState(approval(), ctx({ job: { status: "completed" } })).enabled, true);
});

test("Gmail belum terhubung atau tidak diketahui: nonaktif dengan alasan berbeda", () => {
  assert.equal(getEmailApplyState(approval(), ctx({ gmailConnected: false })).block, "gmail_off");
  assert.equal(getEmailApplyState(approval(), ctx({ gmailConnected: null })).block, "gmail_unknown");
});

test("email tujuan: kosong menonaktifkan tanpa galat merah; salah format menonaktifkan dengan galat pada kolom", () => {
  const empty = getEmailApplyState(approval(), ctx({ applyEmail: "" }));
  assert.equal(empty.enabled, false);
  assert.equal(empty.block, "bad_email");
  assert.equal(empty.emailError, undefined);
  const bad = getEmailApplyState(approval(), ctx({ applyEmail: "bukan email" }));
  assert.equal(bad.enabled, false);
  assert.ok(bad.emailError);
});

test("urutan alasan: kedaluwarsa mengalahkan semua, lalu dipakai, lalu Gmail, lalu email", () => {
  const worst = ctx({ used: true, gmailConnected: false, applyEmail: "x" });
  assert.equal(getEmailApplyState(approval({ expires_at: "2020-01-01T00:00:00Z" }), worst).block, "expired");
  assert.equal(getEmailApplyState(approval(), worst).block, "used");
  assert.equal(getEmailApplyState(approval(), { ...worst, used: false }).block, "gmail_off");
  assert.equal(getEmailApplyState(approval(), { ...worst, used: false, gmailConnected: true }).block, "bad_email");
});

// ---- permintaan ke antrean ----

test("permintaan antrean mengikuti kontrak akhir backend: hanya approval_request_id dan apply_email, tanpa approved", () => {
  const req = buildEmailApplyRequest(approval(), " hrd@perusahaan.co.id ");
  assert.deepEqual(req, {
    job_type: "email_apply",
    payload: { approval_request_id: "apr-1", apply_email: "hrd@perusahaan.co.id" },
  });
  assert.deepEqual(Object.keys(req!.payload).sort(), ["apply_email", "approval_request_id"]);
  assert.equal("approved" in req!.payload, false);
  // job_id dan application_id diisi server dari baris persetujuan, jadi tidak dikirim UI
  assert.equal("job_id" in req!.payload, false);
  assert.equal("application_id" in req!.payload, false);
});

test("permintaan antrean tidak dibuat dari masukan yang belum cukup", () => {
  assert.equal(buildEmailApplyRequest(approval(), "salah"), null);
  assert.equal(buildEmailApplyRequest(approval({ job_id: null }), "hrd@perusahaan.co.id"), null);
  assert.equal(buildEmailApplyRequest(approval({ id: "" }), "hrd@perusahaan.co.id"), null);
});

test("galat antrean: kode approval_required, galat server berbentuk JSON, jaringan, dan teks biasa", () => {
  const forbidden = describeQueueError(new Error(JSON.stringify({ error: "approval request has expired", code: "approval_required" })));
  assert.match(forbidden, /kedaluwarsa/);
  assert.match(forbidden, /approval request has expired/);
  assert.match(describeQueueError(new Error(JSON.stringify({ error: "addGenericJob failed: boom" }))), /addGenericJob failed: boom/);
  assert.match(describeQueueError(new TypeError("Failed to fetch")), /tidak dapat dihubungi/);
  assert.match(describeQueueError("kacau"), /kacau/);
  assert.match(describeQueueError(undefined), /Gagal memasukkan ke antrean/);
});

test("penjelasan di layar: surat dikirim apa adanya, tanpa AI, satu persetujuan satu pengiriman", () => {
  assert.match(EMAIL_APPLY_EXPLANATION, /apa adanya/);
  assert.match(EMAIL_APPLY_EXPLANATION, /tanpa diubah atau ditulis ulang AI/);
  assert.match(EMAIL_APPLY_EXPLANATION, /satu pengiriman/);
});

// ---- cocok dengan kontrak backend dan worker (dibaca, tidak diubah) ----

test("kontrak: rute antrean umum dan penjaga persetujuan backend memang memakai bentuk yang dikirim UI", () => {
  const route = read("../../backend/api/routes/automation.ts");
  assert.match(route, /app\.post\('\/queue'/);
  assert.match(route, /const \{ job_type, payload, priority = 0 \} = request\.body/);
  assert.match(route, /clientErrorReply\(error\)/);
  const guard = read("../../backend/services/queue-guard.ts");
  assert.match(guard, /class ApprovalRequiredError/);
  assert.match(guard, /error instanceof ApprovalRequiredError/);
  assert.match(guard, /const needsApproval = jobType === 'email_apply'/);
  assert.match(guard, /delete payload\.approved/);
  const handler = read("../../worker/src/handlers/emailApply.ts");
  assert.match(handler, /job\.payload\?\.apply_email/);
  assert.match(handler, /job\.payload\?\.approval_request_id/);
  assert.match(handler, /job\.payload\?\.job_id/);
  assert.match(handler, /emailBodyFromApproval\(verdict\.row\)/);
});

test("kontrak: layar memakai addToQueue lewat /api/automation/queue dan tidak pernah menulis automation_queue langsung", () => {
  const api = read("../src/services/automationApi.ts");
  assert.match(api, /\/api\/automation\/queue`/);
  assert.match(api, /body: JSON\.stringify\(\{ job_type: jobType, payload, priority \}\)/);
  const svc = read("../src/services/emailApplyService.ts");
  assert.match(svc, /automationApi\.addToQueue\(req\.job_type, req\.payload\)/);
  assert.doesNotMatch(svc, /from\("automation_queue"\)\s*\.insert/);
  assert.doesNotMatch(svc, /approved\s*:\s*true/);
});

test("halaman Approvals: panel email hanya untuk baris riwayat berstatus approved", () => {
  const page = read("../src/routes/approvals.tsx");
  assert.match(page, /activeTab === 'history' && request\.status === 'approved' && \(\s*<EmailApplyPanel/);
  const panel = read("../src/components/EmailApplyPanel.tsx");
  assert.match(panel, /getEmailApplyState\(approval, \{ used, job, gmailConnected, applyEmail: email \}\)/);
  assert.match(panel, /if \(!state\.visible\) return null/);
  assert.match(panel, /EMAIL_APPLY_EXPLANATION/);
});
