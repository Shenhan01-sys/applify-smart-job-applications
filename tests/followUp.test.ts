import { test } from "node:test";
import assert from "node:assert/strict";
import { FOLLOW_UP_DAYS, followUpBadge, followUpDueAt } from "../src/lib/followUp.ts";

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
