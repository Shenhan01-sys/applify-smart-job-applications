import { test } from "node:test";
import assert from "node:assert/strict";
import { FOLLOW_UP_DAYS, followUpDueAt } from "../src/lib/followUp.ts";

test("follow-up: satu nilai, 4 hari (sama dengan worker)", () => {
  assert.equal(FOLLOW_UP_DAYS, 4);
  const from = new Date("2026-11-18T10:00:00.000Z");
  assert.equal(followUpDueAt(from), "2026-11-22T10:00:00.000Z");
});
