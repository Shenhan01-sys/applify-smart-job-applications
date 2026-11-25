import test from "node:test";
import assert from "node:assert/strict";
import { extractRecruiterEmails, validateRecruiterEmail } from "../src/lib/emailApply.ts";

/**
 * 47.3 P1-07 & 48.5 J5-09 (audit 26 Nov 2026):
 *   - extractRecruiterEmails menyaring alamat sistem/contoh (noreply, support, privacy, example.com, sentry.io)
 *     sama persis dengan backend/services/apply-channel.ts.
 *   - validateRecruiterEmail sejalan dengan vektor backend/worker APPLY_EMAIL_RE.
 */

test("P1-07 & J5-09: extractRecruiterEmails menolak alamat noreply/support/privacy/example.com/sentry.io", () => {
  const desc = [
    "Jangan balas ke noreply@perusahaan.id atau no-reply@perusahaan.id.",
    "Kendala teknis hubungi support@perusahaan.id, privacy@perusahaan.id, security@perusahaan.id.",
    "Contoh email: pelamar@example.com, log@sentry.io, icon@2x.png.",
    "Kirim CV ke hr.rekrutmen@perusahaan.id atau talent@startup.co.id.",
  ].join("\n");

  assert.deepEqual(extractRecruiterEmails(desc), ["hr.rekrutmen@perusahaan.id", "talent@startup.co.id"]);
});

test("J5-09: validateRecruiterEmail menolak injeksi header, penerima ganda, IP literal, dan non-ASCII", () => {
  for (const bad of [
    "",
    "hr@acme.co.id, other@acme.co.id",
    "hr@acme.co.id\r\nBcc: evil@attacker.test",
    "hr@acme.co.id\u2028Bcc: evil@attacker.test",
    "hr@127.0.0.1",
    "hr@localhost",
    ".lead@acme.id",
    "double..dot@acme.id",
    "nama@domain.c",
  ]) {
    assert.equal(validateRecruiterEmail(bad).ok, false, `Harusnya ditolak: ${JSON.stringify(bad)}`);
  }
  assert.deepEqual(validateRecruiterEmail("  hr@acme.co.id  "), { ok: true, email: "hr@acme.co.id" });
});
