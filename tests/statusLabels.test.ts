import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPLICATION_STATUS_LABEL,
  APPROVAL_STATUS_LABEL,
  QUEUE_STATUS_LABEL,
  applicationStatusLabel,
  approvalStatusLabel,
  isQueueActive,
  queueStatusHint,
  queueDisplayLabel,
  isQueueSkipped,
  queueStatusLabel,
  queueTypeLabel, effectiveApprovalStatus } from "../src/lib/statusLabels.ts";

test("setiap status approval, lamaran, dan antrean punya label Indonesia", () => {
  for (const k of ["pending", "approved", "rejected", "expired"]) assert.ok(APPROVAL_STATUS_LABEL[k]);
  for (const k of ["draft", "ready", "submitted", "follow_up", "responded", "closed"]) assert.ok(APPLICATION_STATUS_LABEL[k]);
  for (const k of ["pending", "processing", "completed", "failed"]) assert.ok(QUEUE_STATUS_LABEL[k]);
  // tidak ada label yang masih bahasa Inggris mentah
  const all = [APPROVAL_STATUS_LABEL, APPLICATION_STATUS_LABEL, QUEUE_STATUS_LABEL].flatMap((m) => Object.values(m)).join(" | ");
  assert.doesNotMatch(all, /\b(Pending|Approved|Rejected|Expired|Draft|Ready|Submitted|Follow-up|Responded|Closed|Processing|Completed|Failed)\b/);
});

test("status tidak dikenal tidak membuang kodenya dan tidak melempar", () => {
  assert.equal(approvalStatusLabel("approved"), "Disetujui");
  assert.match(approvalStatusLabel("aneh"), /Status tidak diketahui \(aneh\)/);
  assert.equal(applicationStatusLabel(null), "Status tidak diketahui");
  assert.equal(queueStatusLabel("processing"), "Sedang diproses");
  assert.equal(queueTypeLabel("apply"), "Isi formulir lowongan");
  assert.equal(queueTypeLabel(undefined), "Tugas agen");
});

test("petunjuk antrean: apply selesai berarti berhenti sebelum kirim, bukan terkirim", () => {
  assert.match(queueStatusHint("completed", "apply"), /sebelum tombol kirim/);
  assert.doesNotMatch(queueStatusHint("completed", "apply"), /sudah terkirim/i);
  assert.match(queueStatusHint("failed"), /mencoba lagi/);
  assert.equal(queueStatusHint("xyz"), "");
});

test("isQueueActive: hanya pending dan processing", () => {
  assert.equal(isQueueActive("pending"), true);
  assert.equal(isQueueActive("processing"), true);
  for (const s of ["completed", "failed", undefined, null]) assert.equal(isQueueActive(s as any), false);
});

test("temuan 22: Kedaluwarsa hanya untuk baris yang belum diputuskan; Disetujui dan Ditolak tetap walau waktunya lewat", () => {
  const now = Date.parse("2026-11-19T16:00:00Z");
  const lewat = "2026-11-19T15:05:00Z";
  const belum = "2026-11-19T17:00:00Z";
  assert.equal(effectiveApprovalStatus("pending", lewat, now), "expired");
  assert.equal(effectiveApprovalStatus("pending", belum, now), "pending");
  assert.equal(effectiveApprovalStatus("approved", lewat, now), "approved");
  assert.equal(effectiveApprovalStatus("approved", belum, now), "approved");
  assert.equal(effectiveApprovalStatus("rejected", lewat, now), "rejected");
  assert.equal(effectiveApprovalStatus("approved", null, now), "approved");
  assert.equal(effectiveApprovalStatus("pending", null, now), "pending");
  assert.equal(effectiveApprovalStatus("expired", lewat, now), "expired");
  // label yang tampil di Riwayat: tujuh baris, lima disetujui dan lewat waktu, satu ditolak, satu pending lewat waktu
  const rows = [...Array(5).fill("approved"), "rejected", "pending"].map((status) => approvalStatusLabel(effectiveApprovalStatus(status, lewat, now)));
  assert.deepEqual(rows, ["Disetujui", "Disetujui", "Disetujui", "Disetujui", "Disetujui", "Ditolak", "Kedaluwarsa"]);
  const src = readFileSync(new URL("../src/routes/approvals.tsx", import.meta.url), "utf8");
  // lencana kartu memakai label dari placement; baris yang disetujui tidak pernah Kedaluwarsa hanya karena waktu (tests/approvalTabs.test.ts)
  assert.match(src, /\{placement\.label\}/);
});

test("teks antarmuka tidak lagi menyebut Job Feed", () => {
  for (const rel of ["../src/lib/emailApply.ts", "../src/routes/payment.success.tsx"]) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.doesNotMatch(src.replace(/^\s*(\*|\/\/).*$/gm, ""), /Job Feed/);
  }
});

test("antrean: job apply tanpa tautan tampil Dilewati, bukan Gagal", () => {
  const msg = "Lowongan tidak punya tautan untuk dilamar";
  assert.equal(isQueueSkipped("failed", msg), true);
  assert.equal(queueDisplayLabel("failed", msg), "Dilewati");
  assert.match(queueStatusHint("failed", "apply", msg), /tidak punya tautan/);
  assert.equal(queueDisplayLabel("failed", "timeout"), "Gagal");
  assert.match(queueStatusHint("completed", "apply"), /peramban server/);
  // Tidak menyuruh pengguna menekan kirim di formulir yang hanya ada di peramban server.
  assert.doesNotMatch(queueStatusHint("completed", "apply"), /kirim sendiri lewat situs|kirim sendiri di situs/i);
  assert.match(queueStatusHint("completed", "apply"), /Siap dikirim/);
});
