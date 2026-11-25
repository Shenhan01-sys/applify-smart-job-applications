import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FOLLOW_UP_DAYS,
  FOLLOW_UP_DONE_LABEL,
  followUpBadge,
  followUpDueAt,
  nextStatusAfterFollowUpSent,
  showFollowUpDoneBadge,
} from "../src/lib/followUp.ts";
import { summarizeApplications } from "../src/lib/dashboardStats.ts";

test("follow-up: satu nilai, 4 hari (sama dengan worker)", () => {
  assert.equal(FOLLOW_UP_DAYS, 4);
  const from = new Date("2026-11-18T10:00:00.000Z");
  assert.equal(followUpDueAt(from), "2026-11-22T10:00:00.000Z");
});

test("lencana tindak lanjut: tanggal saran belum tiba bukan 'Perlu tindak lanjut' (uji 25 Nov)", () => {
  const now = new Date("2026-11-25T05:30:00.000Z");
  const future = "2026-11-29T05:26:00.000Z";
  const past = "2026-11-24T05:26:00.000Z";
  const b = followUpBadge({ status: "submitted", follow_up_scheduled: future }, now);
  assert.equal(b?.kind, "scheduled");
  assert.match(b!.label, /^Tindak lanjut 29/);
  assert.deepEqual(followUpBadge({ status: "submitted", follow_up_scheduled: past }, now), { kind: "due", label: "Saatnya tindak lanjut" });
  assert.deepEqual(followUpBadge({ status: "follow_up", follow_up_scheduled: future }, now), { kind: "due", label: "Saatnya tindak lanjut" });
  assert.equal(followUpBadge({ status: "submitted", follow_up_scheduled: past, follow_up_sent: true }, now), null);
  assert.equal(followUpBadge({ status: "closed", follow_up_scheduled: past }, now), null);
  assert.equal(followUpBadge({ status: "submitted", follow_up_scheduled: null }, now), null);
  for (const s of ["submitted", "follow_up"]) {
    const x = followUpBadge({ status: s, follow_up_scheduled: past }, now);
    assert.doesNotMatch(x?.label ?? "", /Perlu tindak lanjut/, "kata kolom tidak dipakai lencana");
  }
});

test("UX-P7-02: Sudah Kutindaklanjuti menjaga kartu tetap di Terkirim dan mengeluarkannya dari Perlu tindak lanjut", () => {
  assert.equal(nextStatusAfterFollowUpSent("submitted"), "submitted");
  assert.equal(nextStatusAfterFollowUpSent("follow_up"), "submitted");
  assert.equal(nextStatusAfterFollowUpSent("responded"), "responded");
  assert.equal(nextStatusAfterFollowUpSent("closed"), "closed");

  // Kartu yang ditandai sudah ditindaklanjuti tidak lagi masuk hitungan followUp di ringkasan.
  const afterMark = [
    { status: nextStatusAfterFollowUpSent("submitted"), follow_up_sent: true },
    { status: nextStatusAfterFollowUpSent("follow_up"), follow_up_sent: true },
  ];
  const stats = summarizeApplications(afterMark);
  assert.equal(stats.followUp, 0);
  assert.equal(stats.sent, 2);

  assert.equal(FOLLOW_UP_DONE_LABEL, "Sudah ditindaklanjuti");
  assert.equal(showFollowUpDoneBadge({ status: "submitted", follow_up_sent: true }), true);
  assert.equal(showFollowUpDoneBadge({ status: "submitted", follow_up_sent: false }), false);
  assert.equal(showFollowUpDoneBadge({ status: "closed", follow_up_sent: true }), false);

  // Pastikan kabel layanan dan halaman tidak lagi memindahkan submitted -> follow_up.
  const svc = readFileSync(new URL("../src/services/aiApplicationService.ts", import.meta.url), "utf8");
  const markBlock = svc.slice(svc.indexOf("async markFollowUpSent"), svc.indexOf("async deleteApplication"));
  assert.doesNotMatch(markBlock, /update\(\{\s*status:\s*"follow_up"/);
  assert.match(markBlock, /update\(\{\s*status:\s*"submitted"/);
  assert.match(markBlock, /\.eq\("status",\s*"follow_up"\)/);

  const page = readFileSync(new URL("../src/routes/applications.tsx", import.meta.url), "utf8");
  assert.match(page, /nextStatusAfterFollowUpSent\(a\.status\)/);
  assert.doesNotMatch(page, /a\.status === "submitted" \? "follow_up"/);
});
