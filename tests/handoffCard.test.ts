import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAgentApplyRows, keepAgentRowsWhenUnreadable, latestQueueJobIds } from "../src/lib/agentApplyRows.ts";
import {
  AGENT_UNREAD_LABEL,
  GOOGLE_FORMS_MISSING_LABEL,
  describeAgentApply,
  describeHandoffReason,
  describeLogOutcome,
  describeUnreadAgent,
  handoffLabels,
  type AgentApplyRow,
} from "../src/lib/agentApplyStatus.ts";
import { agentLogFacts } from "../src/lib/agentEvidence.ts";
import { emptyPlacementData, placeApproval, placementContextFromData, type PlacementSourceData } from "../src/lib/approvalTabs.ts";
import { extensionConsentState, isExtensionHandoffRow } from "../src/lib/extensionConsent.ts";
import { panelActions } from "../src/lib/outcomeActions.ts";
import { AGENT_STOPPED_BEFORE_SUBMIT_TEXT } from "../src/lib/statusLabels.ts";

/**
 * Temuan E2E production 27 November 2026: persetujuan Google Form disetujui, worker mengisi formulir lalu berhenti
 * karena ada pertanyaan wajib tanpa jawaban (reason google_forms_missing_required) dan mengalihkan ke Ekstensi Browser.
 * Kartu hanya berkata "Menunggu Ekstensi Browser" tanpa menyebut pertanyaan yang kosong, dan berganti menjadi "Agen belum
 * dijalankan" bila satu muat ulang gagal membaca antrean.
 */

const NOW = Date.parse("2026-11-27T04:30:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeDemo/viewform";
const QUESTION = { key: "posisi yang dilamar", label: "Posisi yang dilamar", kind: "text" };

const handoffLog = (queueJobId: string, over: Record<string, unknown> = {}) => ({
  status: "incomplete",
  created_at: iso(NOW - 600_000),
  details: {
    queue_job_id: queueJobId,
    approval_request_id: "apr-gf",
    reason: "google_forms_missing_required",
    extension_handoff: true,
    handoff_reason: "missing_required",
    remaining_required: ["Posisi yang dilamar"],
    questions: [QUESTION],
    questions_pending: 1,
    fields_filled: 3,
    ...over,
  },
});

const applyJob = { id: "q-apply", job_type: "apply", status: "completed", created_at: iso(NOW - 700_000), payload: { approval_request_id: "apr-gf" } };
const extensionJob = (status: string) => ({ id: "q-ext", job_type: "extension_apply", status, created_at: iso(NOW - 500_000), payload: { approval_request_id: "apr-gf" } });

test("alasan pengalihan google_forms_missing_required tampil apa adanya: pertanyaan yang kosong disebut, bukan situs yang belum diizinkan", () => {
  const facts = agentLogFacts(handoffLog("q-apply"));
  const view = describeLogOutcome(facts);
  assert.ok(view);
  assert.equal(view.label, GOOGLE_FORMS_MISSING_LABEL);
  assert.match(view.hint, /pertanyaan wajib yang belum terjawab: Posisi yang dilamar\./);
  assert.match(view.hint, /Lamaran belum terkirim/);
  assert.doesNotMatch(`${view.label} ${view.hint}`, /daftar situs|diizinkan kirim|Profil Saya|Pengaturan Agen/i);
  assert.equal(view.tone, "manual");
  // Banyak pertanyaan: tiga pertama disebut, sisanya dihitung.
  const many = describeLogOutcome(agentLogFacts(handoffLog("q-apply", { remaining_required: ["A", "B", "C", "D", "E"], questions: [] })));
  assert.match(many?.hint ?? "", /A; B; C; dan 2 pertanyaan lain\./);
  // Tanpa daftar pertanyaan: kalimat tetap benar, tanpa titik dua kosong.
  const none = describeLogOutcome(agentLogFacts(handoffLog("q-apply", { remaining_required: [], questions: [] })));
  assert.doesNotMatch(none?.hint ?? "", /: \./);
  assert.match(none?.hint ?? "", /pertanyaan wajib yang belum terjawab\. Lamaran belum terkirim/);
});

test("teks umum 'berhenti sebelum kirim' tidak menuduh satu penyebab saja", () => {
  assert.match(AGENT_STOPPED_BEFORE_SUBMIT_TEXT, /paling umum/);
  assert.match(AGENT_STOPPED_BEFORE_SUBMIT_TEXT, /isian wajib yang masih kosong/);
  // Hasil log yang spesifik mengalahkan teks umum itu.
  assert.notEqual(describeAgentApply({ ...agentLogFacts(handoffLog("q-apply")), status: "completed", job_type: "apply" }).hint, AGENT_STOPPED_BEFORE_SUBMIT_TEXT);
});

test("handoffLabels: remaining_required dulu, lalu label pertanyaan, tanpa duplikat dan tanpa isi kosong", () => {
  assert.deepEqual(handoffLabels({ remaining_required: ["Posisi yang dilamar", " "], questions: [QUESTION, { key: "k", label: "Gaji", kind: "text" }] }), ["Posisi yang dilamar", "Gaji"]);
  assert.deepEqual(handoffLabels(null), []);
  assert.equal(describeHandoffReason("missing_required"), "formulir punya pertanyaan wajib yang belum terjawab");
  assert.equal(describeHandoffReason("file_upload"), "formulir meminta unggah berkas");
  assert.equal(describeHandoffReason(undefined), "formulir perlu dilanjutkan di Ekstensi Browser");
});

test("tugas ekstensi hasil pengalihan masih antre: baris tetap 'Menunggu Ekstensi Browser' dan membawa pertanyaan yang kosong", () => {
  const queue = [applyJob, extensionJob("pending")];
  const logs = [handoffLog("q-apply")];
  // Log tugas worker sebelumnya ikut dibaca, bukan hanya tugas terbaru.
  assert.deepEqual(latestQueueJobIds(queue).sort(), ["q-apply", "q-ext"]);

  const row = buildAgentApplyRows(queue, logs, [])["apr-gf"];
  assert.equal(row.status, "pending");
  assert.equal(row.job_type, "extension_apply");
  assert.equal(row.queue_job_id, "q-ext");
  assert.deepEqual(row.handoff_context, { reason: "google_forms_missing_required", handoff_reason: "missing_required", labels: ["Posisi yang dilamar"] });
  assert.equal(describeAgentApply(row, NOW).label, "Menunggu Ekstensi Browser");
  // Log lama tidak menjadi hasil percobaan terbaru: pertanyaannya tidak dijawab lewat formulir saat tugas ekstensi aktif.
  assert.equal(row.log_status, undefined);
  assert.equal(row.questions, undefined);
});

test("kartu pengalihan tetap di Sedang diproses (ekstensi bekerja), bukan berganti ke Agen belum dijalankan", () => {
  const row = buildAgentApplyRows([applyJob, extensionJob("pending")], [handoffLog("q-apply")], [])["apr-gf"];
  const data: PlacementSourceData = { ...emptyPlacementData(), agentKnown: true, agent: { "apr-gf": row } };
  const placed = placeApproval({ status: "approved", expires_at: iso(NOW + 3_600_000) }, { ...placementContextFromData(data, "apr-gf"), now: NOW });
  assert.equal(placed.tab, "pending");
  assert.equal(placed.stage, "processing");
  // Beda dengan kartu tanpa baris sama sekali.
  assert.equal(describeAgentApply(undefined).label, "Agen belum dijalankan");
});

test("konteks pengalihan hanya dibawa untuk tugas ekstensi yang masih aktif, dan hanya dari percobaan yang memang pengalihan", () => {
  for (const status of ["completed", "failed"]) {
    const row = buildAgentApplyRows([applyJob, extensionJob(status)], [handoffLog("q-apply")], [])["apr-gf"];
    assert.equal(row.handoff_context, undefined, status);
    assert.deepEqual(latestQueueJobIds([applyJob, extensionJob(status)]), ["q-ext"], status);
  }
  const plain = { ...handoffLog("q-apply"), details: { queue_job_id: "q-apply", approval_request_id: "apr-gf", reason: "no_fields_filled" } };
  assert.equal(buildAgentApplyRows([applyJob, extensionJob("pending")], [{ ...plain, status: "incomplete", created_at: iso(NOW - 600_000) }], [])["apr-gf"].handoff_context, undefined);
  // Tanpa tugas ekstensi (pengalihan belum diantre): log worker dibaca seperti biasa, tanpa konteks tambahan.
  const only = buildAgentApplyRows([applyJob], [handoffLog("q-apply")], [])["apr-gf"];
  assert.equal(only.handoff_context, undefined);
  assert.equal(only.reason, "google_forms_missing_required");
  assert.deepEqual(only.questions?.map((q) => q.label), ["Posisi yang dilamar"]);
});

test("pengalihan belum diantre: tindakan Sudah terkirim, Buka formulir, Lanjutkan di ekstensi (tanpa blok izin), dan Tutup tersedia", () => {
  const row = buildAgentApplyRows([applyJob], [handoffLog("q-apply")], [])["apr-gf"];
  assert.equal(isExtensionHandoffRow(row), true);
  const actions = panelActions({ stage: "needs_action", approvalStatus: "approved", row, jobUrl: FORM_URL, platform: "google_forms" });
  for (const id of ["confirm_sent", "open_form", "close"] as const) assert.ok(actions.includes(id), `${id} ada: ${actions.join(",")}`);
  assert.equal(extensionConsentState({ approvalStatus: "approved", platform: "google_forms", jobUrl: FORM_URL, row, agentKnown: true }).show, false);
  // Selama tugas ekstensi aktif, tidak ada tombol yang menimpa ekstensi: hanya Muat ulang dan Buka formulir.
  const active = buildAgentApplyRows([applyJob, extensionJob("pending")], [handoffLog("q-apply")], [])["apr-gf"];
  assert.deepEqual(panelActions({ stage: "processing", approvalStatus: "approved", row: active, jobUrl: FORM_URL, platform: "google_forms" }), ["refresh", "open_form"]);
  // Bukan pengalihan: Sudah terkirim tidak ikut menawar pada tahap Perlu tindakanmu biasa.
  const captcha: AgentApplyRow = { status: "completed", job_type: "apply", ...agentLogFacts({ status: "incomplete", created_at: iso(NOW), details: { reason: "captcha_blocked" } }) };
  assert.equal(isExtensionHandoffRow(captcha), false);
  assert.ok(!panelActions({ stage: "needs_action", approvalStatus: "approved", row: captcha, jobUrl: FORM_URL }).includes("confirm_sent"));
});

test("muat ulang yang gagal membaca antrean mempertahankan baris agen lama, bukan mengosongkannya", () => {
  const known = buildAgentApplyRows([applyJob, extensionJob("pending")], [handoffLog("q-apply")], []);
  const previous = { agent: known, agentKnown: true };
  const failed = { agent: {} as Record<string, AgentApplyRow>, agentKnown: false };
  const kept = keepAgentRowsWhenUnreadable(previous, failed);
  assert.equal(kept.agentKnown, true);
  assert.equal(kept.agent["apr-gf"].status, "pending");
  assert.equal(describeAgentApply(kept.agent["apr-gf"], NOW).label, "Menunggu Ekstensi Browser");

  // Status klaim baru (ditutup, diganti) tetap diambil dari pemuatan baru.
  const withClaim = keepAgentRowsWhenUnreadable(previous, { agent: { "apr-gf": { status: "completed", claim_state: "closed", claim_channel: null } as AgentApplyRow }, agentKnown: false });
  assert.equal(withClaim.agent["apr-gf"].claim_state, "closed");
  assert.equal(withClaim.agent["apr-gf"].status, "pending");

  // Pemuatan yang berhasil menggantikan data lama sepenuhnya, dan pemuatan pertama yang gagal tetap gagal.
  const fresh = { agent: {}, agentKnown: true };
  assert.equal(keepAgentRowsWhenUnreadable(previous, fresh), fresh);
  const firstFail = { agent: {}, agentKnown: false };
  assert.equal(keepAgentRowsWhenUnreadable({ agent: {}, agentKnown: false }, firstFail), firstFail);
});

test("status agen yang belum terbaca tidak dikatakan 'Agen belum dijalankan'", () => {
  const view = describeUnreadAgent();
  assert.equal(view.label, AGENT_UNREAD_LABEL);
  assert.notEqual(view.label, "Agen belum dijalankan");
  assert.match(view.hint, /belum bisa dibaca/);
  const card = readFileSync(new URL("../src/components/AgentApplyStatus.tsx", import.meta.url), "utf8");
  assert.match(card, /!row && !agentKnown \? describeUnreadAgent\(\)/);
  const page = readFileSync(new URL("../src/routes/approvals.tsx", import.meta.url), "utf8");
  assert.match(page, /agentKnown=\{emailData\.agentKnown\}/);
  assert.match(page, /keepAgentRowsWhenUnreadable\(prev, next\)/);
  assert.doesNotMatch(page, /setEmailData\(emptyEmailApplyData\(\)\)/, "muat ulang yang gagal tidak mengosongkan data");
});
