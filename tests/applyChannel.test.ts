import test from "node:test";
import assert from "node:assert/strict";
import { classifyJobChannel, isTestPortalUrl, needsBrowserExtension } from "../src/lib/applyChannel.ts";
import { describeAgentApply, describeLogOutcome } from "../src/lib/agentApplyStatus.ts";

test("classifyJobChannel frontend: situs karier perusahaan, LinkedIn manual-only, Portal ekstensi, dan Email Gmail", () => {
  const gh = classifyJobChannel({ platform_source: "greenhouse", external_url: "https://boards.greenhouse.io/acme/jobs/1" });
  assert.equal(gh.channel, "public_ats");
  assert.equal(gh.badgeLabel, "Formulir ATS · Agen");
  assert.equal(gh.autoWorkerSupported, true);
  assert.match(gh.reason, /Situs karier perusahaan/);
  assert.doesNotMatch(gh.reason, /ATS publik/);

  const li = classifyJobChannel({ platform_source: "linkedin", external_url: "https://www.linkedin.com/jobs/view/999" });
  assert.equal(li.manualOnly, true);
  assert.equal(li.extensionSupported, false);
  assert.equal(li.autoWorkerSupported, false);
  assert.equal(li.badgeLabel, "LinkedIn Manual");

  const ks = classifyJobChannel({ platform_source: "kalibrr", external_url: "https://www.kalibrr.com/c/acme/jobs/1" });
  assert.equal(ks.channel, "auth_portal");
  assert.equal(ks.extensionSupported, true);
  assert.equal(ks.badgeLabel, "Portal · Butuh Ekstensi");
  assert.equal(needsBrowserExtension(ks), true);
  assert.match(ks.reason, /khusus laptop \(Chrome atau Edge\)/);
  assert.match(ks.reason, /tidak bisa dipasang di HP/i);
  assert.match(ks.reason, /berhenti sebelum kirim/);
  assert.match(ks.reason, /situs karier perusahaan/);
  assert.doesNotMatch(ks.reason, /\[UJI\]|ATS publik/);
  assert.equal(needsBrowserExtension(gh), false);

  // Domain lama Kalibrr (.id) sama dengan backend EXTENSION_LOGIN_PORTAL_DOMAINS: portal ekstensi, bukan web luar.
  const kid = classifyJobChannel({ platform_source: "other", external_url: "https://www.kalibrr.id/c/acme/jobs/1" });
  assert.equal(kid.channel, "auth_portal");
  assert.equal(kid.extensionSupported, true);
  // Samakan dengan backend: label platform_source ATS tidak boleh menimpa URL portal login ke worker.
  const mismatched = classifyJobChannel({ platform_source: "greenhouse", external_url: "https://id.jobstreet.com/id/job/96011760" });
  assert.equal(mismatched.channel, "auth_portal");
  assert.equal(mismatched.autoWorkerSupported, false);
  const fake = classifyJobChannel({ platform_source: "other", external_url: "https://kalibrr.id.evil.test/jobs/1" });
  assert.notEqual(fake.channel, "auth_portal");

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

test("Portal Uji Applify: diisi worker, bukan ekstensi, dan tidak memakai teks 'lebih andal menggunakan Ekstensi'", () => {
  const uji = classifyJobChannel({ platform_source: "uji", external_url: "https://applify-smart-job-applications.vercel.app/uji-portal" });
  assert.equal(uji.autoWorkerSupported, true);
  assert.equal(uji.extensionSupported, false);
  assert.equal(uji.manualOnly, false);
  assert.equal(needsBrowserExtension(uji), false);
  assert.equal(uji.badgeLabel, "Portal Uji Applify");
  assert.doesNotMatch(uji.reason, /Ekstensi Browser Chrome\/Edge untuk pengisian/);
  assert.match(uji.reason, /tidak diteruskan ke perusahaan/);
  assert.equal(isTestPortalUrl("https://applify-smart-job-applications.vercel.app/uji-portal?x=1"), true);
  // Halaman lain di host yang sama dan host mirip bukan portal uji.
  assert.equal(isTestPortalUrl("https://applify-smart-job-applications.vercel.app/jobs"), false);
  assert.equal(isTestPortalUrl("https://applify-smart-job-applications.vercel.app.evil.test/uji-portal"), false);
  // Host luar EXTENSION_HOST_DOMAINS (J5-02): jujur tidak didukung ekstensi, arahkan manual.
  const other = classifyJobChannel({ platform_source: "other", external_url: "https://careers.acme.example/apply" });
  assert.equal(other.extensionSupported, false);
  assert.equal(other.badgeLabel, "Situs Web · Manual");
  assert.equal(other.badgeTone, "manual");
  assert.match(other.reason, /lamar manual/i);

  // Host ATS terdaftar di EXTENSION_HOST_DOMAINS (mis. Teamtailor) tetap didukung ekstensi.
  const tt = classifyJobChannel({ platform_source: "other", external_url: "https://acme.teamtailor.com/jobs/123" });
  assert.equal(tt.channel, "external_web");
  assert.equal(tt.extensionSupported, true);
  assert.equal(tt.badgeLabel, "Situs Web · Ekstensi");
  assert.match(tt.reason, /Ekstensi Browser/);

  // Portal login yang belum ada di manifest ekstensi (mis. Indeed) tidak menjanjikan ekstensi.
  const indeed = classifyJobChannel({ platform_source: "indeed", external_url: "https://id.indeed.com/viewjob?jk=abc" });
  assert.equal(indeed.channel, "auth_portal");
  assert.equal(indeed.extensionSupported, false);
  assert.equal(indeed.badgeLabel, "Portal · Manual");
  assert.equal(needsBrowserExtension(indeed), false);
});

test("portal login menjelaskan butuh ekstensi khusus laptop dan mengarahkan ke situs karier perusahaan; LinkedIn manual-only tidak butuh ekstensi", () => {
  for (const url of ["https://www.jobstreet.com/id/job/1", "https://glints.com/id/opportunities/jobs/1", "https://www.kalibrr.com/c/a/jobs/1", "https://dealls.com/loker/1"]) {
    const c = classifyJobChannel({ external_url: url });
    assert.equal(c.channel, "auth_portal", url);
    assert.equal(needsBrowserExtension(c), true, url);
    assert.doesNotMatch(c.reason, /\[UJI\]|ATS publik|—|!/);
  }
  const li = classifyJobChannel({ platform_source: "linkedin", external_url: "https://www.linkedin.com/jobs/view/999" });
  assert.equal(needsBrowserExtension(li), false);
});

test("E2E-07: ATS korporasi kompleks (Workday/iCIMS/Taleo/SuccessFactors) ditandai eksperimental dengan saran manual", () => {
  for (const url of [
    "https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/SWE_1",
    "https://careers-acme.icims.com/jobs/1234/job",
    "https://acme.taleo.net/careersection/ex/jobdetail.ftl?job=123",
    "https://jobs.successfactors.com/career?company=acme",
    "https://career5.successfactors.eu/career?company=acme",
  ]) {
    const res = classifyJobChannel({ external_url: url });
    assert.equal(res.extensionSupported, true, url);
    assert.equal(res.experimentalExtension, true, url);
    assert.match(res.badgeLabel, /Eksperimental/);
    assert.match(res.reason, /eksperimental/i);
    assert.match(res.reason, /manual/i);
  }
});
