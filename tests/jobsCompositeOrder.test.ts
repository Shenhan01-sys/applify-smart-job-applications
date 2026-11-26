import test from "node:test";
import assert from "node:assert/strict";
import { computeJobOrderScore, sortByMatch } from "../src/lib/matchScore.ts";

test("47.3 P1-04: computeJobOrderScore tetap mengembalikan null bila matchScore null", () => {
  const score = computeJobOrderScore(
    { title: "Frontend Developer", location: "Jakarta", workplace_type: "remote", posted_at: "2026-11-25T00:00:00.000Z" },
    null,
    { currentTitle: "Frontend Developer", location: "Jakarta", nowMs: Date.parse("2026-11-26T00:00:00.000Z") },
  );
  assert.equal(score, null);
});

test("47.3 P1-04: saat skor skill sama, lowongan baru dengan judul & lokasi cocok unggul di urutan /jobs", () => {
  const nowMs = Date.parse("2026-11-26T00:00:00.000Z");
  const ctx = { currentTitle: "Backend Engineer", location: "Jakarta Selatan", nowMs };
  const staleFar = {
    id: "stale",
    title: "Operations Specialist",
    location: "Medan",
    workplace_type: "onsite",
    posted_at: "2026-10-01T00:00:00.000Z",
  };
  const freshFit = {
    id: "fresh",
    title: "Backend Engineer",
    location: "Jakarta",
    workplace_type: "hybrid",
    posted_at: "2026-11-25T00:00:00.000Z",
  };
  const ordered = sortByMatch([staleFar, freshFit], (j) => computeJobOrderScore(j, 80, ctx));
  assert.deepEqual(ordered.map((j) => j.id), ["fresh", "stale"]);
});
