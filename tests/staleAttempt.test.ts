import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { agentLogFacts } from "../src/lib/agentEvidence.ts";
import { SENT_STALE_ATTEMPT_HINT, describeLogOutcome, describeSentApproval } from "../src/lib/agentApplyStatus.ts";
import { STALE_ATTEMPT_EXPIRED_HINT, STALE_ATTEMPT_LABEL, staleAttemptNote } from "../src/lib/staleAttempt.ts";
import { isApplicationSent } from "../src/lib/dashboardStats.ts";

/**
 * Kasus GoToGroup (Data Scientist Intern, 26 November 2026): lamaran terkirim lewat email, tetapi jendela detail Lamaran
 * Saya masih menampilkan blok "Bukti dari agen" berisi 10 isian dari percobaan agen yang berhenti sebelum kirim.
 * Aturannya sama dengan kartu Terkirim di Persetujuan (describeSentApproval): percobaan lama yang berhenti sebelum
 * kirim tidak berlaku lagi dan tidak boleh terbaca sebagai bukti kirim oleh agen.
 */

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const at = "2026-11-26T10:00:00Z";
const facts = (status: string, details: Record<string, unknown> = {}) => agentLogFacts({ status, created_at: at, details });

const TEN_FIELDS = Array.from({ length: 10 }, (_, i) => ({ label: `Isian ${i + 1}`, kind: "text", value: `Nilai ${i + 1}` }));

test("GoToGroup: lamaran terkirim lewat email dan percobaan ekstensi berhenti sebelum kirim -> label percobaan sebelumnya, bukan bukti", () => {
  const stale = facts("incomplete", { channel: "extension", reason: "partly_filled", fields_filled: 10, filled_fields: TEN_FIELDS });
  assert.equal(stale?.filled_fields?.length, 10);
  const note = staleAttemptNote({ applicationSent: true, approvalLive: true, facts: stale });
  assert.equal(note?.label, "Percobaan agen sebelumnya (tidak dikirim)");
  assert.equal(note?.label, STALE_ATTEMPT_LABEL);
  assert.equal(note?.hint, SENT_STALE_ATTEMPT_HINT, "catatan yang sama dengan kartu Terkirim di Persetujuan");
  assert.match(note?.hint ?? "", /tidak berlaku lagi/);
  assert.doesNotMatch(note?.label ?? "", /bukti/i);
});

test("tidak menimpa bukti yang benar: log success (agen atau manual) tetap bukti pengiriman", () => {
  assert.equal(staleAttemptNote({ applicationSent: true, facts: facts("success", { filled_fields: TEN_FIELDS }) }), null);
  assert.equal(staleAttemptNote({ applicationSent: true, facts: facts("success", { manual: true, confirmed_by: "user" }) }), null);
  assert.equal(staleAttemptNote({ applicationSent: true, approvalLive: false, facts: facts("success") }), null);
  // agen sempat menekan kirim dan hasilnya belum pasti: bukan "tidak dikirim"
  assert.equal(staleAttemptNote({ applicationSent: true, facts: facts("submit_unverified") }), null);
  assert.equal(staleAttemptNote({ applicationSent: true, facts: null }), null);
  assert.equal(staleAttemptNote({ applicationSent: true, facts: undefined }), null);
});

test("lamaran belum terkirim dengan persetujuan masih berlaku: percobaan agen terbaru tetap 'Bukti dari agen' (tidak berubah)", () => {
  const ready = facts("ready", { filled_fields: TEN_FIELDS });
  assert.equal(staleAttemptNote({ applicationSent: false, approvalLive: true, facts: ready }), null);
  assert.equal(staleAttemptNote({ applicationSent: false, approvalLive: null, facts: ready }), null, "belum diketahui dianggap berlaku");
  assert.equal(staleAttemptNote({ applicationSent: false, facts: ready }), null);
});

test("percobaan agen yang persetujuannya sudah kedaluwarsa atau ditutup: label percobaan sebelumnya dengan penjelasan sendiri", () => {
  const note = staleAttemptNote({ applicationSent: false, approvalLive: false, facts: facts("ready", { filled_fields: TEN_FIELDS }) });
  assert.equal(note?.label, STALE_ATTEMPT_LABEL);
  assert.equal(note?.hint, STALE_ATTEMPT_EXPIRED_HINT);
  assert.match(note?.hint ?? "", /kedaluwarsa atau ditutup/);
  assert.match(note?.hint ?? "", /tidak dikirim/);
});

test("aturan sama dengan Persetujuan: label berlaku tepat bila describeSentApproval mengganti tampilan percobaan lama", () => {
  const samples = [
    facts("ready", { filled_fields: TEN_FIELDS }),
    facts("incomplete", { channel: "extension", reason: "partly_filled" }),
    facts("incomplete", { reason: "auth_required" }),
    facts("awaiting_code", { awaiting_until: "2026-11-26T10:05:00Z" }),
    facts("success"),
    facts("success", { manual: true }),
  ];
  for (const f of samples) {
    const approvalsPageReplaces = describeSentApproval({ status: "completed", ...f }, "email") !== null;
    const modalOutcomeSent = describeLogOutcome(f)?.tone === "sent";
    assert.equal(approvalsPageReplaces, !modalOutcomeSent, `${f?.log_status}: Persetujuan dan jendela detail sepakat tentang percobaan yang mengirim`);
    assert.equal(staleAttemptNote({ applicationSent: true, facts: f }) !== null, approvalsPageReplaces, `${f?.log_status}`);
  }
});

test("status lamaran terkirim mengikuti isApplicationSent (Terkirim, Tindak Lanjut, Dibalas, Ditutup setelah terkirim)", () => {
  assert.equal(isApplicationSent({ status: "submitted" }), true);
  assert.equal(isApplicationSent({ status: "ready" }), false);
});

test("jendela detail memakai catatan ini: judul bukan 'Bukti dari agen', isian dalam toggle tertutup", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /import \{ STALE_ATTEMPT_TOGGLE_LABEL, staleAttemptNote \} from "@\/lib\/staleAttempt"/);
  assert.match(src, /const selectedStale = staleAttemptNote\(\{/);
  assert.match(src, /applicationSent: !!selectedApp && isApplicationSent\(selectedApp\)/);
  assert.match(src, /selectedStale \? \(\s*<>[\s\S]*?data-testid="agent-proof-stale"[\s\S]*?<details data-testid="agent-proof-stale-toggle"[\s\S]*?<AgentEvidence stale /);
  // <details> tanpa atribut open: tertutup saat jendela dibuka
  assert.doesNotMatch(src, /<details data-testid="agent-proof-stale-toggle"[^>]*\bopen\b/);
  const evidence = read("../src/components/AgentEvidence.tsx");
  assert.match(evidence, /stale \? "Catatan percobaan lama" : "Bukti dari agen"/);
  assert.match(evidence, /stale \? "Isian percobaan lama" : "Isian yang diisi agen"/);
});
