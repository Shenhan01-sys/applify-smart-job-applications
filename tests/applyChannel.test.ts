import test from "node:test";
import assert from "node:assert/strict";
import { classifyJobChannel } from "../src/lib/applyChannel.ts";
import { describeAgentApply, describeLogOutcome } from "../src/lib/agentApplyStatus.ts";

test("classifyJobChannel frontend: ATS publik, LinkedIn manual-only, Portal ekstensi, dan Email Gmail", () => {
  const gh = classifyJobChannel({ platform_source: "greenhouse", external_url: "https://boards.greenhouse.io/acme/jobs/1" });
  assert.equal(gh.channel, "public_ats");
  assert.equal(gh.badgeLabel, "ATS Otomatis");
  assert.equal(gh.autoWorkerSupported, true);

  const li = classifyJobChannel({ platform_source: "linkedin", external_url: "https://www.linkedin.com/jobs/view/999" });
  assert.equal(li.manualOnly, true);
  assert.equal(li.extensionSupported, false);
  assert.equal(li.autoWorkerSupported, false);
  assert.equal(li.badgeLabel, "LinkedIn Manual");

  const ks = classifyJobChannel({ platform_source: "kalibrr", external_url: "https://www.kalibrr.com/c/acme/jobs/1" });
  assert.equal(ks.channel, "auth_portal");
  assert.equal(ks.extensionSupported, true);
  assert.equal(ks.badgeLabel, "Portal · Pakai Ekstensi");

  const em = classifyJobChannel({
    platform_source: "dealls",
    external_url: "https://dealls.com/loker/be",
    description: "Kirim lamaran ke recruit@acme.id",
  });
  assert.equal(em.channel, "email_direct");
  assert.equal(em.applyEmail, "recruit@acme.id");
  assert.equal(em.badgeLabel, "Email Gmail");
});

test("describeLogOutcome & describeAgentApply: alasan baru Stage 1 tampil jujur tanpa mematahkan kasus lama", () => {
  for (const [reason, expected] of [
    ["auth_required", /login|masuk/i],
    ["captcha_blocked", /CAPTCHA/i],
    ["ai_prohibited", /melarang penggunaan AI/i],
    ["closed_posting", /ditutup/i],
    ["external_redirect", /domain eksternal/i],
  ] as const) {
    const view = describeLogOutcome({ log_status: "incomplete", reason });
    assert.ok(view);
    assert.equal(view.tone, "manual");
    assert.match(view.label, expected);

    const agentView = describeAgentApply({ status: "completed", fields_filled: 0, log_status: "incomplete", reason });
    assert.match(agentView.label, expected);
  }
});
