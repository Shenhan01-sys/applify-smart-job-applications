import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FAILED_CLOSED_LABEL,
  EXPIRED_NOT_SENT_LABEL,
  STAGE_LABEL,
  placeApproval,
  splitApprovalTabs,
  type ApprovalPlacementContext,
  type ApprovalStage,
} from "../src/lib/approvalTabs.ts";
import { agentLogFacts } from "../src/lib/agentEvidence.ts";
import type { AgentApplyRow } from "../src/lib/agentApplyStatus.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const NOW = Date.parse("2026-11-25T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const FUTURE = iso(NOW + 3_600_000);
const PAST = iso(NOW - 3_600_000);

const approved = (over: Record<string, unknown> = {}) => ({ status: "approved", expires_at: FUTURE, ...over });
const place = (approval: Parameters<typeof placeApproval>[0], ctx: ApprovalPlacementContext = {}) => placeApproval(approval, { agentKnown: true, ...ctx, now: NOW });

/** Baris agen dari log apply worker: status tugas + fakta log. */
function agentRow(status: string, log?: { status: string; details?: Record<string, unknown> }, extra: Partial<AgentApplyRow> = {}): AgentApplyRow {
  return { status, queue_job_id: "q1", job_type: "apply", ...(log ? agentLogFacts({ status: log.status, created_at: iso(NOW - 60_000), details: log.details ?? {} }) : {}), ...extra };
}

const expectPlace = (got: ReturnType<typeof placeApproval>, tab: "pending" | "history", stage: ApprovalStage, label?: string) => {
  assert.equal(got.stage, stage);
  assert.equal(got.tab, tab);
  assert.equal(got.label, label ?? STAGE_LABEL[stage]);
};

// ---- keputusan pengguna dan masa berlaku -------------------------------------------------------------

test("pending: Menunggu persetujuan, kecuali sudah lewat masa berlaku (Riwayat, Kedaluwarsa)", () => {
  expectPlace(place({ status: "pending", expires_at: FUTURE }), "pending", "review", "Menunggu persetujuan");
  expectPlace(place({ status: "pending", expires_at: PAST }), "history", "expired", "Kedaluwarsa");
  expectPlace(place({ status: "pending" }), "pending", "review");
});

test("ditolak dan kedaluwarsa di database: Riwayat", () => {
  expectPlace(place({ status: "rejected", expires_at: FUTURE }), "history", "rejected", "Ditolak");
  expectPlace(place({ status: "expired", expires_at: PAST }), "history", "expired", "Kedaluwarsa");
  // keputusan yang sudah diambil tidak hilang karena waktu: ditolak lewat masa berlaku tetap Ditolak
  expectPlace(place({ status: "rejected", expires_at: PAST }), "history", "rejected");
});

test("status yang tidak dikenal atau kosong: Riwayat dengan label statusnya, tidak pernah melempar galat", () => {
  const odd = place({ status: "dibatalkan" });
  assert.equal(odd.tab, "history");
  assert.match(odd.label, /dibatalkan/);
  assert.equal(place({}).tab, "history");
  assert.equal(place(null).tab, "history");
  assert.equal(place(undefined).tab, "history");
});

// ---- disetujui: terkirim -> Riwayat ------------------------------------------------------------------

test("disetujui dan ada log success (agen atau email): Riwayat, Terkirim", () => {
  expectPlace(place(approved(), { sent: true }), "history", "sent", "Terkirim");
  // log success lebih menentukan daripada percobaan agen lain sesudahnya
  expectPlace(place(approved(), { sent: true, agent: agentRow("failed") }), "history", "sent");
  expectPlace(place(approved(), { sent: true, emailJob: { status: "pending" } }), "history", "sent");
  // baris agen sendiri yang melaporkan success
  expectPlace(place(approved(), { agent: agentRow("completed", { status: "success" }) }), "history", "sent");
  expectPlace(place(approved(), { agent: agentRow("failed", { status: "success" }) }), "history", "sent");
  // log lama yang ditandai pengguna (details.manual) tetap dibaca sebagai terkirim
  expectPlace(place(approved(), { agent: agentRow("completed", { status: "success", details: { manual: true } }) }), "history", "sent");
});

// ---- disetujui tetapi belum terkirim -> Menunggu -----------------------------------------------------

test("disetujui, tugas agen antre atau berjalan: Menunggu, Sedang diproses", () => {
  expectPlace(place(approved(), { agent: agentRow("pending") }), "pending", "processing", "Sedang diproses");
  expectPlace(place(approved(), { agent: agentRow("processing") }), "pending", "processing", "Sedang diproses");
  // tugas ekstensi yang baru masuk antrean tanpa hambatan
  expectPlace(place(approved(), { agent: agentRow("pending", undefined, { job_type: "extension_apply", scheduled_at: iso(NOW - 30_000) }) }), "pending", "processing");
  // tugas email di antrean
  expectPlace(place(approved(), { emailJob: { status: "pending" } }), "pending", "processing");
  expectPlace(place(approved(), { emailJob: { status: "processing" } }), "pending", "processing");
});

test("disetujui, formulir terisi tetapi berhenti sebelum kirim: Menunggu, Terisi belum terkirim", () => {
  const ready = agentRow("completed", { status: "ready", details: { submit_blocked: "not_allowed", fields_filled: 7 } });
  expectPlace(place(approved(), { agent: ready }), "pending", "filled_not_sent", "Terisi, belum terkirim");
  // tugas selesai tanpa log percobaan juga bukan terkirim
  expectPlace(place(approved(), { agent: agentRow("completed", undefined, { fields_filled: 3 }) }), "pending", "filled_not_sent");
});

test("disetujui, agen menunggu pengguna (kode, login, jawaban, izin ekstensi): Menunggu, Perlu tindakanmu", () => {
  const until = iso(NOW + 600_000);
  expectPlace(place(approved(), { agent: agentRow("processing", { status: "awaiting_code", details: { awaiting_until: until, code_length: 6 } }) }), "pending", "needs_action", "Perlu tindakanmu");
  expectPlace(place(approved(), { agent: agentRow("processing", { status: "awaiting_login", details: { awaiting_until: until } }) }), "pending", "needs_action");
  const questions = [{ key: "gaji", label: "Gaji yang diharapkan", kind: "text", required: true }];
  expectPlace(place(approved(), { agent: agentRow("completed", { status: "ready", details: { submit_blocked: "required_remaining", questions } }) }), "pending", "needs_action");
  // ekstensi tertahan izin situs
  const permission = agentRow("pending", undefined, { job_type: "extension_apply", error_message: "permission_required:dealls.com - Izin situs ATS belum diberikan di ekstensi.", scheduled_at: iso(NOW + 30_000) });
  expectPlace(place(approved(), { agent: permission }), "pending", "needs_action");
  // pengguna belum mengizinkan Ekstensi Browser, belum ada tugas
  expectPlace(place(approved(), { consentRequired: true }), "pending", "needs_action");
});

test("disetujui, agen berhenti dan butuh tindakan (login, CAPTCHA, isian wajib kosong, dilewati): Menunggu", () => {
  for (const reason of ["auth_required", "captcha_blocked", "ai_prohibited", "login_timeout", "closed_posting", "external_redirect"]) {
    expectPlace(place(approved(), { agent: agentRow("completed", { status: "incomplete", details: { reason } }) }), "pending", "needs_action");
  }
  expectPlace(place(approved(), { agent: agentRow("completed", { status: "ready", details: { reason: "code_timeout" } }) }), "pending", "needs_action");
  expectPlace(place(approved(), { agent: agentRow("completed", { status: "ready", details: { submit_blocked: "required_remaining", remaining_required: ["Nomor telepon"] } }) }), "pending", "needs_action");
  expectPlace(place(approved(), { agent: agentRow("failed", undefined, { error_message: "Job ini tidak punya tautan lowongan" }) }), "pending", "needs_action");
  // tidak ada satu isian pun yang terisi
  expectPlace(place(approved(), { agent: agentRow("completed", undefined, { fields_filled: 0 }) }), "pending", "needs_action");
});

test("disetujui, kirim belum terkonfirmasi atau klaim terkunci: Menunggu, Perlu dicek", () => {
  expectPlace(place(approved(), { agent: agentRow("completed", { status: "submit_unverified" }) }), "pending", "unverified", "Perlu dicek, kirim belum terkonfirmasi");
  expectPlace(place(approved(), { agent: agentRow("completed", { status: "ready", details: { submit_blocked: "prior_unverified" } }) }), "pending", "unverified");
  expectPlace(place(approved(), { agent: agentRow("completed", undefined, { claim_state: "locked_stuck" }) }), "pending", "unverified");
});

test("disetujui, email tidak terkirim karena mode uji: Menunggu, Belum dikirim (mode uji)", () => {
  expectPlace(place(approved(), { emailJob: { status: "completed" }, testMode: true }), "pending", "test_mode", "Belum dikirim (mode uji)");
});

test("disetujui, agen gagal: bisa dicoba lagi tetap di Menunggu, masa berlaku habis ditutup sebagai kedaluwarsa", () => {
  expectPlace(place(approved(), { agent: agentRow("failed", undefined, { error_message: "timeout" }) }), "pending", "failed_retry", "Belum terkirim, bisa dicoba lagi");
  expectPlace(place(approved(), { emailJob: { status: "failed", error_message: "smtp" } }), "pending", "failed_retry");
  expectPlace(place(approved({ expires_at: PAST }), { agent: agentRow("failed", undefined, { error_message: "timeout" }) }), "history", "expired", FAILED_CLOSED_LABEL);
  expectPlace(place(approved({ expires_at: PAST }), { emailJob: { status: "failed" } }), "history", "expired", FAILED_CLOSED_LABEL);
  // yang sudah terkirim tidak pernah ikut tertutup karena kedaluwarsa
  expectPlace(place(approved({ expires_at: PAST }), { sent: true }), "history", "sent");
  // masa berlaku habis tetapi agen masih bekerja: tetap Menunggu
  expectPlace(place(approved({ expires_at: PAST }), { agent: agentRow("processing") }), "pending", "processing");
  // formulir terisi tetapi masa berlaku habis: tidak bisa dicoba lagi, pindah ke Riwayat (25 November 2026)
  expectPlace(place(approved({ expires_at: PAST }), { agent: agentRow("completed", { status: "ready", details: { submit_blocked: "not_allowed" } }) }), "history", "expired", EXPIRED_NOT_SENT_LABEL);
});

test("temuan 22: disetujui tidak pernah berlabel Kedaluwarsa hanya karena waktu lewat", () => {
  expectPlace(place(approved({ expires_at: PAST }), {}), "pending", "not_started", "Menunggu giliran");
  expectPlace(place(approved({ expires_at: PAST }), { sent: true }), "history", "sent", "Terkirim");
  for (const ctx of [{}, { agent: agentRow("processing") }, { agent: agentRow("completed", { status: "ready" }) }, { sent: true }]) {
    assert.notEqual(place(approved({ expires_at: PAST }), ctx).label, "Kedaluwarsa");
  }
});

test("disetujui, belum ada tugas agen: Menunggu, Disetujui belum terkirim; status belum terbaca: Menunggu", () => {
  expectPlace(place(approved(), {}), "pending", "not_started", "Menunggu giliran");
  expectPlace(place(approved(), { agent: undefined, agentKnown: true }), "pending", "not_started");
  expectPlace(place(approved(), { agentKnown: false }), "pending", "checking", "Status belum terbaca");
  // status belum terbaca tidak menyembunyikan bukti terkirim yang sudah ada
  expectPlace(place(approved(), { agentKnown: false, sent: true }), "history", "sent");
});

// ---- E2E-01: disetujui tetapi sengaja tidak diantre (LinkedIn, email langsung) ----------------------

test("disetujui tanpa antrean: LinkedIn berlabel Perlu diisi sendiri, email langsung Kirim lewat panel Email, bukan Menunggu giliran", () => {
  expectPlace(place(approved(), { notQueued: "manual" }), "pending", "fill_yourself", "Perlu diisi sendiri");
  expectPlace(place(approved(), { notQueued: "email_direct" }), "pending", "send_by_email", "Kirim lewat panel Email");
  // tanpa petunjuk jalur, perilaku lama tetap: belum ada tugas = Menunggu giliran
  expectPlace(place(approved(), { notQueued: null }), "pending", "not_started", "Menunggu giliran");
  expectPlace(place(approved(), {}), "pending", "not_started", "Menunggu giliran");
  assert.doesNotMatch(`${STAGE_LABEL.fill_yourself} ${STAGE_LABEL.send_by_email}`, /giliran|antre/i);
});

test("disetujui tanpa antrean: bukti nyata mengalahkan label jalur (terkirim, email berjalan, email gagal, mode uji)", () => {
  expectPlace(place(approved(), { notQueued: "email_direct", sent: true }), "history", "sent");
  expectPlace(place(approved(), { notQueued: "email_direct", emailJob: { status: "pending" } }), "pending", "processing");
  expectPlace(place(approved(), { notQueued: "email_direct", emailJob: { status: "failed", error_message: "smtp" } }), "pending", "failed_retry");
  expectPlace(place(approved(), { notQueued: "email_direct", testMode: true, emailJob: { status: "completed" } }), "pending", "test_mode");
  expectPlace(place(approved(), { notQueued: "manual", agentKnown: false }), "pending", "checking");
  expectPlace(place(approved(), { notQueued: "manual", agent: agentRow("completed", undefined, { claim_state: "abandoned" }) }), "history", "replaced");
});

test("disetujui tanpa antrean dan tanpa tugas: ditutup saat masa berlaku habis (tidak menumpuk di Menunggu tanpa tombol apa pun)", () => {
  expectPlace(place(approved({ expires_at: PAST }), { notQueued: "manual" }), "history", "expired", EXPIRED_NOT_SENT_LABEL);
  expectPlace(place(approved({ expires_at: PAST }), { notQueued: "email_direct" }), "history", "expired", EXPIRED_NOT_SENT_LABEL);
  // email yang sedang berjalan, atau selesai dalam mode uji, tidak ikut ditutup
  expectPlace(place(approved({ expires_at: PAST }), { notQueued: "email_direct", emailJob: { status: "processing" } }), "pending", "processing");
  expectPlace(place(approved({ expires_at: PAST }), { notQueued: "email_direct", testMode: true, emailJob: { status: "completed" } }), "pending", "test_mode");
  // jalur antrean biasa tanpa tugas tetap tidak ditutup hanya karena waktu (temuan 22)
  expectPlace(place(approved({ expires_at: PAST }), {}), "pending", "not_started", "Menunggu giliran");
  // yang sudah terkirim tidak pernah ikut tertutup
  expectPlace(place(approved({ expires_at: PAST }), { notQueued: "manual", sent: true }), "history", "sent");
});

test("kabel: kartu tanpa antrean diganti penjelasan jalurnya, tanpa tombol sudah terkirim", () => {
  const status = read("../src/components/AgentApplyStatus.tsx");
  assert.match(status, /if \(notQueued && !row\) return <NotQueuedNotice/);
  const notice = read("../src/components/NotQueuedNotice.tsx");
  assert.doesNotMatch(notice, /markApprovalSent|mark-sent|<button/);
  const page = read("../src/routes/approvals.tsx");
  assert.match(page, /fill_yourself:\s+\{ icon: AlertCircle/);
  assert.match(page, /send_by_email:\s+\{ icon: AlertCircle/);
});

test("klaim kirim dilepas karena pengguna membuat persetujuan baru: Riwayat, Diganti persetujuan baru", () => {
  expectPlace(place(approved(), { agent: agentRow("completed", undefined, { claim_state: "abandoned" }) }), "history", "replaced", "Diganti persetujuan baru");
  // tetapi bila ternyata sudah terkirim, Terkirim yang menang
  expectPlace(place(approved(), { sent: true, agent: agentRow("completed", undefined, { claim_state: "abandoned" }) }), "history", "sent");
});

// ---- invarian: Riwayat hanya terkirim atau ditutup ---------------------------------------------------

test("Riwayat hanya memuat tahap terkirim, ditolak, kedaluwarsa, dan diganti; semua tahap lain di Menunggu", () => {
  const history: ApprovalStage[] = ["sent", "rejected", "expired", "replaced"];
  const examples: Array<[ApprovalStage, ReturnType<typeof placeApproval>]> = [
    ["review", place({ status: "pending", expires_at: FUTURE })],
    ["checking", place(approved(), { agentKnown: false })],
    ["not_started", place(approved())],
    ["fill_yourself", place(approved(), { notQueued: "manual" })],
    ["send_by_email", place(approved(), { notQueued: "email_direct" })],
    ["processing", place(approved(), { agent: agentRow("processing") })],
    ["needs_action", place(approved(), { consentRequired: true })],
    ["filled_not_sent", place(approved(), { agent: agentRow("completed", { status: "ready" }) })],
    ["unverified", place(approved(), { agent: agentRow("completed", { status: "submit_unverified" }) })],
    ["test_mode", place(approved(), { testMode: true })],
    ["failed_retry", place(approved(), { agent: agentRow("failed") })],
    ["sent", place(approved(), { sent: true })],
    ["rejected", place({ status: "rejected" })],
    ["expired", place({ status: "expired" })],
    ["replaced", place(approved(), { agent: agentRow("completed", undefined, { claim_state: "abandoned" }) })],
  ];
  assert.equal(new Set(examples.map(([stage]) => stage)).size, Object.keys(STAGE_LABEL).length, "setiap tahap punya contoh");
  for (const [stage, got] of examples) {
    assert.equal(got.stage, stage);
    assert.equal(got.tab, history.includes(stage) ? "history" : "pending", stage);
  }
});

test("label tahap: bahasa Indonesia, tanpa tanda seru dan tanpa em dash", () => {
  for (const [stage, label] of [...Object.entries(STAGE_LABEL), ["failed_closed", FAILED_CLOSED_LABEL]]) {
    assert.ok(label.length > 0, stage);
    assert.doesNotMatch(label, /!|—|–/, stage);
  }
  assert.equal(STAGE_LABEL.processing, "Sedang diproses");
  assert.equal(STAGE_LABEL.filled_not_sent, "Terisi, belum terkirim");
  assert.equal(STAGE_LABEL.sent, "Terkirim");
});

// ---- membagi daftar ke dua tab -----------------------------------------------------------------------

test("splitApprovalTabs: yang belum terkirim tetap di Menunggu, review di atas, Riwayat hanya terkirim atau ditutup", () => {
  type Row = { id: string; status: string; expires_at: string };
  const rows: Row[] = [
    { id: "disetujui-diproses", status: "approved", expires_at: FUTURE },
    { id: "ditolak", status: "rejected", expires_at: FUTURE },
    { id: "disetujui-terkirim", status: "approved", expires_at: FUTURE },
    { id: "menunggu-review", status: "pending", expires_at: FUTURE },
    { id: "disetujui-terisi", status: "approved", expires_at: FUTURE },
    { id: "kedaluwarsa", status: "expired", expires_at: PAST },
    { id: "disetujui-gagal", status: "approved", expires_at: FUTURE },
  ];
  const ctx: Record<string, ApprovalPlacementContext> = {
    "disetujui-diproses": { agent: agentRow("processing") },
    "disetujui-terkirim": { sent: true },
    "disetujui-terisi": { agent: agentRow("completed", { status: "ready", details: { submit_blocked: "not_allowed" } }) },
    "disetujui-gagal": { agent: agentRow("failed") },
  };
  const tabs = splitApprovalTabs(rows, (r) => ({ agentKnown: true, ...(ctx[r.id] ?? {}) }), NOW);
  assert.deepEqual(tabs.pending.map((p) => p.item.id), ["menunggu-review", "disetujui-diproses", "disetujui-terisi", "disetujui-gagal"]);
  assert.deepEqual(tabs.pending.map((p) => p.placement.label), ["Menunggu persetujuan", "Sedang diproses", "Terisi, belum terkirim", "Belum terkirim, bisa dicoba lagi"]);
  assert.deepEqual(tabs.history.map((p) => p.item.id), ["ditolak", "disetujui-terkirim", "kedaluwarsa"]);
  assert.deepEqual(tabs.history.map((p) => p.placement.label), ["Ditolak", "Terkirim", "Kedaluwarsa"]);
  assert.equal(tabs.pending.length + tabs.history.length, rows.length);
  // tidak ada baris di Riwayat yang belum terkirim atau belum ditutup
  for (const p of tabs.history) assert.ok(["sent", "rejected", "expired", "replaced"].includes(p.placement.stage), p.item.id);
  assert.deepEqual(splitApprovalTabs([], () => ({}), NOW), { pending: [], history: [] });
});

// ---- kabel layar (suite ini tidak punya DOM: membaca teks sumber) -----------------------------------

test("kabel: halaman Persetujuan membagi tab lewat splitApprovalTabs dan memasang kartu agen di tab mana pun", () => {
  const page = read("../src/routes/approvals.tsx");
  assert.match(page, /import \{ splitApprovalTabs, type ApprovalStage \} from "@\/lib\/approvalTabs"/);
  assert.match(page, /splitApprovalTabs\(\[\.\.\.pendingApprovals, \.\.\.history\]/);
  assert.match(page, /activeTab === 'pending' \? tabs\.pending : tabs\.history/);
  assert.match(page, /count: tabs\.pending\.length/);
  assert.match(page, /count: tabs\.history\.length/);
  assert.match(page, /\{placement\.label\}/);
  assert.match(page, /placement\.stage === 'review'/);
  // kartu agen tidak lagi terkunci pada tab Riwayat
  assert.doesNotMatch(page, /activeTab === 'history' && request\.status === 'approved'/);
  assert.doesNotMatch(page, /handleTabChange\('history'\)/);
  assert.match(page, /\{approved && \(\s*<AgentApplyStatus/);
  assert.match(page, /\{approved &&[\s\S]*?<EmailApplyPanel/);
});

test("kabel: toast izin ekstensi menyebut tab Menunggu, tempat kartunya berada", () => {
  const src = read("../src/lib/extensionConsent.ts");
  assert.match(src, /EXTENSION_CONSENT_REQUIRED_TOAST = "Disetujui\. Izinkan ekstensi browser untuk mengisi formulirnya di tab Menunggu\."/);
});
