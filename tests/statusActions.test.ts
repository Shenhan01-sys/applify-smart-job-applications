import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_LABEL,
  ALWAYS_ACTION,
  STAGE_ACTIONS,
  allStagesHaveAction,
  describeOutcomeError,
  offersOutcomeChoice,
  outcomeIntroKind,
  panelActions,
  terminalExplanation,
  type StatusActionId,
} from "../src/lib/outcomeActions.ts";
import { STAGE_LABEL, placeApproval, splitApprovalTabs, SENT_BY_USER_LABEL, type ApprovalPlacementContext, type ApprovalStage } from "../src/lib/approvalTabs.ts";
import { agentLogFacts } from "../src/lib/agentEvidence.ts";
import { ApiError } from "../src/lib/apiErrors.ts";
import { AGENT_CLOSED_LABEL, AGENT_USER_CONFIRMED_LABEL, describeAgentApply, describeLogOutcome, describeSentApproval, SENT_VIA_EMAIL_LABEL, type AgentApplyRow } from "../src/lib/agentApplyStatus.ts";
import { manualSentRow } from "../src/lib/manualSubmit.ts";
import { attemptsForApplications } from "../src/lib/applicationAttempts.ts";
import { summarizeUrgentActions } from "../src/lib/dashboardUrgent.ts";
import { liveApprovalIds } from "../src/lib/approvalExpiry.ts";

/**
 * Penjaga "tidak ada status buntu" (keputusan Hans, 26 November 2026): setiap tahap kartu persetujuan yang dirender wajib
 * punya paling sedikit satu tindakan, dengan data sekecil apa pun. Contoh nyata dari production dipasang sebagai kasus.
 */

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const NOW = Date.parse("2026-11-26T15:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const FUTURE = iso(NOW + 3_600_000);
const PAST = iso(NOW - 3 * 86_400_000);
const URL_OK = "https://boards.greenhouse.io/binance/jobs/1";

const approved = (over: Record<string, unknown> = {}) => ({ status: "approved", expires_at: FUTURE, ...over });
const place = (approval: Parameters<typeof placeApproval>[0], ctx: ApprovalPlacementContext = {}) => placeApproval(approval, { agentKnown: true, ...ctx, now: NOW });

function agentRow(status: string, log?: { status: string; details?: Record<string, unknown> }, extra: Partial<AgentApplyRow> = {}): AgentApplyRow {
  return { status, queue_job_id: "q1", job_type: "apply", ...(log ? agentLogFacts({ status: log.status, created_at: iso(NOW - 60_000), details: log.details ?? {} }) : {}), ...extra };
}

// ---- registri: setiap tahap punya tindakan ------------------------------------------------------------

test("setiap tahap kartu punya tindakan yang selalu ada, dan terdaftar di STAGE_ACTIONS", () => {
  const stages = Object.keys(STAGE_LABEL) as ApprovalStage[];
  assert.deepEqual(Object.keys(STAGE_ACTIONS).sort(), [...stages].sort());
  assert.deepEqual(Object.keys(ALWAYS_ACTION).sort(), [...stages].sort());
  for (const stage of stages) {
    assert.ok(STAGE_ACTIONS[stage].length >= 1, stage);
    assert.ok(STAGE_ACTIONS[stage].includes(ALWAYS_ACTION[stage]), `${stage}: tindakan wajib ${ALWAYS_ACTION[stage]} harus terdaftar`);
    for (const id of STAGE_ACTIONS[stage]) assert.ok(ACTION_LABEL[id as StatusActionId], `${stage}: label ${id}`);
  }
  assert.equal(allStagesHaveAction(), true);
});

test("tanpa data apa pun (tanpa tautan, tanpa baris agen) setiap tahap tetap punya tindakan yang digambar", () => {
  for (const stage of Object.keys(STAGE_LABEL) as ApprovalStage[]) {
    const got = panelActions({ stage, approvalStatus: "approved" });
    if (stage === "review") {
      assert.deepEqual(got, [], "review: tombol Periksa digambar komponen lain");
      continue;
    }
    assert.ok(got.length >= 1, `${stage} buntu: ${JSON.stringify(got)}`);
    for (const id of got) assert.ok(STAGE_ACTIONS[stage].includes(id), `${stage}: ${id} tidak terdaftar`);
  }
  // persetujuan yang tidak pernah disetujui (kedaluwarsa atau ditolak): tetap ada jalan
  assert.deepEqual(panelActions({ stage: "expired", approvalStatus: "pending" }), ["reapply"]);
  assert.deepEqual(panelActions({ stage: "rejected", approvalStatus: "rejected" }), ["reapply"]);
});

test("tahap yang digambar dari data sungguhan: setiap contoh di setiap tahap punya tindakan", () => {
  const examples: Array<[string, ReturnType<typeof placeApproval>, AgentApplyRow | undefined, string]> = [
    ["review", place({ status: "pending", expires_at: FUTURE }), undefined, "pending"],
    ["checking", place(approved(), { agentKnown: false }), undefined, "approved"],
    ["not_started", place(approved()), undefined, "approved"],
    ["fill_yourself", place(approved(), { notQueued: "manual" }), undefined, "approved"],
    ["send_by_email", place(approved(), { notQueued: "email_direct" }), undefined, "approved"],
    ["processing", place(approved(), { agent: agentRow("processing") }), agentRow("processing"), "approved"],
    ["needs_action:consent", place(approved(), { consentRequired: true }), undefined, "approved"],
    ["filled_not_sent", place(approved(), { agent: agentRow("completed", { status: "ready" }) }), agentRow("completed", { status: "ready" }), "approved"],
    ["unverified", place(approved(), { agent: agentRow("completed", { status: "submit_unverified" }) }), agentRow("completed", { status: "submit_unverified" }), "approved"],
    ["test_mode", place(approved(), { testMode: true }), undefined, "approved"],
    ["failed_retry", place(approved(), { agent: agentRow("failed") }), agentRow("failed"), "approved"],
    ["sent", place(approved(), { sent: true }), undefined, "approved"],
    ["rejected", place({ status: "rejected" }), undefined, "rejected"],
    ["expired", place({ status: "expired" }), undefined, "expired"],
    ["replaced", place(approved(), { agent: agentRow("completed", undefined, { claim_state: "abandoned" }) }), undefined, "approved"],
    ["closed", place(approved(), { agent: agentRow("completed", undefined, { claim_state: "closed" }) }), undefined, "approved"],
  ];
  for (const [name, placement, row, status] of examples) {
    if (placement.stage === "review") continue;
    const got = panelActions({ stage: placement.stage, approvalStatus: status, row: row ?? null, jobUrl: URL_OK, platform: "greenhouse" });
    assert.ok(got.length >= 1, `${name} (${placement.stage}) buntu`);
  }
});

// ---- tiga tindakan untuk hasil kirim yang tidak pasti ---------------------------------------------------

test("kirim belum terkonfirmasi (submit_unverified): sudah terkirim, belum terkirim ulangi, buka formulir, tutup", () => {
  const row = agentRow("completed", { status: "submit_unverified" });
  assert.equal(place(approved(), { agent: row }).stage, "unverified");
  assert.equal(offersOutcomeChoice({ stage: "unverified", approvalStatus: "approved", row }), true);
  assert.deepEqual(panelActions({ stage: "unverified", approvalStatus: "approved", row, jobUrl: URL_OK }), ["confirm_sent", "retry_fresh", "open_form", "close"]);
  assert.equal(outcomeIntroKind("unverified", row), "unverified");
});

test("kasus Binance 23 November: kedaluwarsa dan kirim belum terkonfirmasi tetap di Menunggu dengan semua tindakan", () => {
  const row = agentRow("completed", { status: "submit_unverified" });
  const placed = place({ status: "approved", expires_at: PAST }, { agent: row });
  assert.equal(placed.tab, "pending");
  assert.equal(placed.stage, "unverified");
  const got = panelActions({ stage: placed.stage, approvalStatus: "approved", row, jobUrl: URL_OK });
  for (const id of ["confirm_sent", "retry_fresh", "close", "open_form"] as const) assert.ok(got.includes(id), id);
});

test("kode keamanan tidak masuk (code_timeout) dan ditolak (code_rejected): tiga tindakan, bukan hanya jalankan agen lagi", () => {
  for (const reason of ["code_timeout", "code_rejected"]) {
    const row = agentRow("completed", { status: "ready", details: { reason } });
    const placed = place(approved(), { agent: row });
    assert.equal(placed.stage, "needs_action", reason);
    assert.equal(offersOutcomeChoice({ stage: placed.stage, approvalStatus: "approved", row }), true, reason);
    assert.deepEqual(panelActions({ stage: placed.stage, approvalStatus: "approved", row, jobUrl: URL_OK }), ["confirm_sent", "retry_fresh", "open_form", "close"], reason);
    assert.equal(outcomeIntroKind(placed.stage, row), "needs_code");
  }
});

test("persetujuan disetujui lalu kedaluwarsa tanpa tugas agen: Riwayat dengan tiga tindakan; tidak disetujui: hanya ajukan lagi", () => {
  const placed = place({ status: "approved", expires_at: PAST }, { notQueued: "manual" });
  assert.equal(placed.tab, "history");
  assert.equal(placed.stage, "expired");
  assert.deepEqual(panelActions({ stage: "expired", approvalStatus: "approved", jobUrl: URL_OK }), ["confirm_sent", "retry_fresh", "open_form", "close"]);
  assert.deepEqual(panelActions({ stage: "expired", approvalStatus: "expired", jobUrl: URL_OK }), ["reapply"]);
  assert.match(terminalExplanation("expired", "expired") ?? "", /tidak kamu setujui sebelum masa berlakunya \(24 jam\) habis/);
  assert.match(terminalExplanation("rejected", "rejected") ?? "", /menolak/);
  assert.equal(terminalExplanation("expired", "approved"), null);
});

test("tiga tindakan tidak ditawarkan saat agen bekerja, atau untuk persetujuan yang belum disetujui", () => {
  const working = agentRow("processing");
  assert.equal(offersOutcomeChoice({ stage: "unverified", approvalStatus: "approved", row: working }), false);
  assert.equal(offersOutcomeChoice({ stage: "unverified", approvalStatus: "pending" }), false);
  assert.equal(offersOutcomeChoice({ stage: "sent", approvalStatus: "approved" }), false);
  assert.ok(!panelActions({ stage: "unverified", approvalStatus: "approved", row: working }).includes("confirm_sent"));
});

test("lowongan yang hanya bisa dilamar sendiri (LinkedIn) dan email langsung: sudah terkirim, buka lowongan, tutup", () => {
  assert.deepEqual(panelActions({ stage: "fill_yourself", approvalStatus: "approved", jobUrl: "https://www.linkedin.com/jobs/view/1" }), ["confirm_sent", "open_form", "close"]);
  assert.deepEqual(panelActions({ stage: "send_by_email", approvalStatus: "approved" }), ["confirm_sent", "close"]);
});

// ---- status gagal: coba lagi, buka formulir, lanjutkan di ekstensi ------------------------------------

test("gagal (failed_retry): coba lagi, buka formulir, lanjutkan di ekstensi bila situs didukung, tutup", () => {
  const row = agentRow("failed");
  assert.equal(place(approved(), { agent: row }).stage, "failed_retry");
  const onPortal = panelActions({ stage: "failed_retry", approvalStatus: "approved", row, jobUrl: "https://dealls.com/jobs/1", platform: "dealls" });
  assert.deepEqual(onPortal, ["rerun", "continue_extension", "open_form", "close"]);
  const plain = panelActions({ stage: "failed_retry", approvalStatus: "approved", row, jobUrl: "https://contoh.co.id/karier/1", platform: "web" });
  assert.deepEqual(plain, ["rerun", "open_form", "close"]);
  // blok izin ekstensi sudah tampil: tidak diulang
  assert.ok(!panelActions({ stage: "failed_retry", approvalStatus: "approved", row, jobUrl: "https://dealls.com/jobs/1", platform: "dealls", consentShown: true }).includes("continue_extension"));
});

test("diblokir (login, CAPTCHA, alihkan, validasi, lowongan tutup, AI dilarang): selalu ada jalan, tidak ada coba lagi yang sia-sia", () => {
  const reasons = ["auth_required", "captcha_blocked", "login_timeout", "external_redirect", "validation_failed", "closed_posting", "ai_prohibited", "no_fields_filled", "file_upload_required", "google_forms_missing_required"];
  for (const reason of reasons) {
    const row = agentRow("completed", { status: "incomplete", details: { reason } });
    const placed = place(approved(), { agent: row });
    assert.equal(placed.tab, "pending", reason);
    const got = panelActions({ stage: placed.stage, approvalStatus: "approved", row, jobUrl: URL_OK, platform: "greenhouse" });
    assert.ok(got.length >= 1, `${reason} (${placed.stage}) buntu`);
    if (reason === "closed_posting" || reason === "ai_prohibited") assert.ok(!got.includes("rerun"), `${reason}: coba lagi tidak ada gunanya`);
  }
});

test("menunggu giliran, sedang diproses, status belum terbaca: muat ulang status selalu ada", () => {
  for (const stage of ["checking", "not_started", "processing"] as const) {
    assert.ok(panelActions({ stage, approvalStatus: "approved" }).includes("refresh"), stage);
  }
});

test("pertanyaan, kode, dan izin ekstensi punya formulirnya sendiri: panel tidak menawarkan coba lagi di atasnya", () => {
  const code = agentRow("processing", { status: "awaiting_code", details: { awaiting_until: iso(NOW + 300_000), code_length: 8 } });
  const got = panelActions({ stage: "needs_action", approvalStatus: "approved", row: code });
  assert.deepEqual(got, ["refresh"]);
  const consent = panelActions({ stage: "needs_action", approvalStatus: "approved", consentShown: true, jobUrl: URL_OK });
  assert.ok(!consent.includes("rerun") && !consent.includes("close"));
  assert.ok(consent.length >= 1);
});

// ---- Riwayat: terkirim, diganti, ditutup ------------------------------------------------------------

test("Riwayat: terkirim, diganti, dan ditutup punya tindakan sendiri", () => {
  assert.deepEqual(panelActions({ stage: "sent", approvalStatus: "approved" }), ["view_application"]);
  assert.deepEqual(panelActions({ stage: "replaced", approvalStatus: "approved" }), ["view_new_approval"]);
  assert.deepEqual(panelActions({ stage: "closed", approvalStatus: "approved" }), ["reapply"]);
});

test("ditutup pengguna: tahap closed di Riwayat, mengalahkan kirim yang belum terkonfirmasi, tetapi tidak mengalahkan success", () => {
  const unverified = agentRow("completed", { status: "submit_unverified" }, { claim_state: "closed" });
  const placed = place(approved(), { agent: unverified });
  assert.equal(placed.stage, "closed");
  assert.equal(placed.tab, "history");
  assert.equal(placed.label, STAGE_LABEL.closed);
  assert.equal(describeAgentApply(unverified).label, AGENT_CLOSED_LABEL);
  assert.equal(place(approved(), { agent: agentRow("completed", { status: "success" }, { claim_state: "closed" }) }).stage, "sent");
  // diganti persetujuan baru, juga bila agen sempat mencatat kirim belum terkonfirmasi
  assert.equal(place(approved(), { agent: agentRow("completed", { status: "submit_unverified" }, { claim_state: "abandoned" }) }).stage, "replaced");
});

test("terkirim atas konfirmasi pengguna: label dan tahap membedakannya dari konfirmasi sistem", () => {
  const log = agentLogFacts({ status: "success", created_at: iso(NOW), details: { manual: true, confirmed_by: "user", reason: "manual_submit" } });
  assert.equal(log.manual, true);
  assert.equal(log.confirmed_by, "user");
  assert.equal(describeLogOutcome(log)?.label, AGENT_USER_CONFIRMED_LABEL);
  // log lama tanpa confirmed_by tetap memakai label lama
  assert.notEqual(describeLogOutcome(agentLogFacts({ status: "success", created_at: iso(NOW), details: { manual: true } }))?.label, AGENT_USER_CONFIRMED_LABEL);
  const row = manualSentRow(undefined, iso(NOW), "user");
  assert.equal(row.confirmed_by, "user");
  const placed = place(approved(), { sent: true, agent: row });
  assert.equal(placed.stage, "sent");
  assert.equal(placed.label, SENT_BY_USER_LABEL);
  assert.equal(place(approved(), { sent: true, agent: manualSentRow(undefined, iso(NOW)) }).label, STAGE_LABEL.sent);
});

// ---- kasus audit Gemini 26 November 2026 -----------------------------------------------------------------

test("GoToGroup: email terkirim sesudah percobaan ekstensi yang berhenti: tetap Terkirim, teks percobaan lama diganti", () => {
  const stale = agentRow("completed", { status: "incomplete", details: { reason: "partly_filled", channel: "extension", questions_pending: 2 } });
  assert.equal(place(approved({ expires_at: PAST }), { sent: true, agent: stale }).stage, "sent");
  const view = describeSentApproval(stale, "email");
  assert.equal(view?.label, SENT_VIA_EMAIL_LABEL);
  assert.equal(view?.tone, "sent");
  assert.match(view?.hint ?? "", /tidak perlu dikerjakan/);
  assert.equal(describeSentApproval(stale, "agent")?.tone, "sent");
  // percobaan terbaru memang terkirim: tidak ada penggantian
  assert.equal(describeSentApproval(agentRow("completed", { status: "success" }), "agent"), null);
});

test("kartu persetujuan memasang tindakan di semua tahap, memakai sentVia, dan tidak menampilkan formulir lama pada yang terkirim", () => {
  const page = read("../src/routes/approvals.tsx");
  assert.match(page, /<OutcomeActions[^>]*approvalId=\{request\.id\}/);
  assert.match(page, /stage=\{placement\.stage\}/);
  assert.match(page, /sentVia=\{sentVia\}/);
  assert.match(page, /const isSent = placement\.stage === 'sent'/);
  assert.match(page, /closed:\s+\{ icon: XCircle/);
  // tombol Muat ulang tidak menampilkan layar Memuat penuh
  assert.match(page, /loadData\(\{ quiet: true \}\)/);
});

test("dashboard: kode dan pertanyaan milik persetujuan kedaluwarsa tidak dihitung (banner menunjuk halaman yang tidak menampilkannya)", () => {
  const queueRows = [
    { id: "q-exp", job_type: "extension_apply", status: "completed", created_at: iso(NOW - 100_000), payload: { approval_request_id: "apr-expired" } },
    { id: "q-live", job_type: "extension_apply", status: "completed", created_at: iso(NOW - 90_000), payload: { approval_request_id: "apr-live" } },
  ];
  const question = { question: "Berapa gaji?", kind: "text", required: true, field_key: "gaji" };
  const applyLogs = ["apr-expired", "apr-live"].map((id, i) => ({
    status: "incomplete",
    created_at: iso(NOW - 80_000 + i),
    details: { channel: "extension", approval_request_id: id, reason: "partly_filled", questions: [question], questions_pending: 1 },
  }));
  const base = { pendingApprovals: [], queueRows, applyLogs, now: NOW };
  const before = summarizeUrgentActions(base);
  assert.equal(before.pendingQuestionsCount, 2, "tanpa daftar persetujuan: perilaku lama");
  const after = summarizeUrgentActions({
    ...base,
    approvals: [
      { id: "apr-expired", status: "approved", expires_at: PAST },
      { id: "apr-live", status: "approved", expires_at: FUTURE },
    ],
  });
  assert.equal(after.pendingQuestionsCount, 1);
  assert.equal(after.total, 1);
  const none = summarizeUrgentActions({ ...base, approvals: [{ id: "apr-expired", status: "approved", expires_at: PAST }] });
  assert.equal(none.total, 0);
  assert.deepEqual([...liveApprovalIds([{ id: "a", status: "approved", expires_at: FUTURE }, { id: "b", status: "rejected", expires_at: FUTURE }, { id: "c", status: "approved" }, null, "x"], NOW)], ["a"]);
});

test("Datadog yang Ditutup tidak memakai bukti lamaran lain untuk lowongan yang sama (percobaan dibatasi per lamaran)", () => {
  const apps = [
    { id: "app-tutup", job_id: "job-dd", created_at: "2026-11-20T16:00:00Z" },
    { id: "app-baru", job_id: "job-dd", created_at: "2026-11-20T16:27:00Z" },
    { id: "app-lain", job_id: "job-x", created_at: "2026-11-20T10:00:00Z" },
  ];
  const rows = {
    "job-dd": [
      { job_id: "job-dd", status: "success", created_at: "2026-11-25T14:24:00Z", details: { approval_request_id: "apr-baru" } },
      { job_id: "job-dd", status: "ready", created_at: "2026-11-20T16:46:00Z", details: { approval_request_id: "apr-baru-1" } },
      { job_id: "job-dd", status: "ready", created_at: "2026-11-20T16:02:00Z", details: { approval_request_id: "apr-tutup" } },
    ],
  };
  const got = attemptsForApplications(apps, rows);
  assert.equal(got["app-tutup"].facts?.log_status, "ready", "lamaran Ditutup hanya melihat percobaannya sendiri");
  assert.equal(got["app-tutup"].facts?.approval_request_id, "apr-tutup");
  assert.equal(got["app-baru"].facts?.log_status, "success", "lamaran terbaru mendapat semua percobaan sesudah dibuat");
  assert.equal(got["app-lain"], undefined, "tanpa percobaan: tanpa isian");
  assert.deepEqual(attemptsForApplications(null, rows), {});
  assert.deepEqual(attemptsForApplications(apps, null), {});
  assert.deepEqual(attemptsForApplications([{ id: "z", job_id: "job-dd", created_at: "bukan tanggal" }], rows), {});
});

test("jendela detail lamaran: IDEKU dengan persetujuan kedaluwarsa tidak diarahkan ke Persetujuan; teks uji coba lama hilang", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /liveApprovalIds\(list\)/);
  assert.match(src, /\{selectedQuestionCount > 0 && approvalLive && \(/);
  assert.match(src, /\{selectedAwaitingCode && approvalLive && \(/);
  assert.match(src, /data-testid="agent-stale-approval"/);
  assert.doesNotMatch(src, /selama uji coba, pengiriman dimatikan/);
  assert.match(src, /<OutcomeActions[^>]*approvalId=\{selectedApprovalId\}/);
});

// ---- galat tindakan ------------------------------------------------------------------------------------------

test("galat tindakan: 409 already_resolved dan already_sent berarti sudah beres, lainnya pesan yang bisa dipahami", () => {
  const e = (status: number, code: string) => new ApiError(status, JSON.stringify({ error: "x", code }));
  assert.equal(describeOutcomeError(e(409, "already_resolved"), "f").alreadyDone, true);
  assert.equal(describeOutcomeError(e(409, "already_sent"), "f").alreadyDone, true);
  const busy = describeOutcomeError(e(409, "agent_working"), "f");
  assert.equal(busy.alreadyDone, false);
  assert.match(busy.message, /masih mengerjakan/);
  assert.match(describeOutcomeError(e(409, "pending_exists"), "f").message, /tab Menunggu/);
  assert.match(describeOutcomeError(e(500, "mark_failed"), "Gagal.").message, /^Gagal\./);
});

test("tahap dipecah ke tab: closed ada di Riwayat, dan yang lain tidak ikut ke sana", () => {
  const rows = [
    { id: "a", status: "approved", expires_at: FUTURE },
    { id: "b", status: "approved", expires_at: FUTURE },
  ];
  const tabs = splitApprovalTabs(rows, (r) => ({ agentKnown: true, agent: r.id === "b" ? agentRow("completed", undefined, { claim_state: "closed" }) : undefined }), NOW);
  assert.deepEqual(tabs.history.map((p) => p.item.id), ["b"]);
  assert.deepEqual(tabs.pending.map((p) => p.item.id), ["a"]);
});
