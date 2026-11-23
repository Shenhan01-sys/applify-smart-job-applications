import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_SCREENSHOT_BUCKET,
  MAX_FILLED_FIELDS,
  SCREENSHOT_ERROR_TEXT,
  SCREENSHOT_MISSING_TEXT,
  SIGNED_URL_TTL_SECONDS,
  agentFactsByJob,
  agentLogFacts,
  cleanFilledFields,
  cleanScreenshots,
  fieldValueText,
  formatAttemptTime,
  hasAgentEvidence,
  isSafeStoragePath,
  signedUrlOutcome,
} from "../src/lib/agentEvidence.ts";
import { describeLogOutcome } from "../src/lib/agentApplyStatus.ts";
import { attemptForApplication, latestApplyAttempt } from "../src/lib/formGaps.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

// Baris log "confirmed" dari worker (contoh dari spesifikasi).
const CONFIRMED = {
  job_id: "job-1",
  status: "success",
  created_at: "2026-11-23T14:05:00Z",
  details: {
    note: "lamaran terkirim otomatis; halaman konfirmasi terdeteksi",
    application_status: "submitted",
    submit_clicked: true,
    submit_check: { verdict: "confirmed", confirmation_phrase: "terima kasih telah melamar", after_path: "/x/selesai" },
    filled_fields: [{ label: "Email", kind: "text", value: "u1@contoh.test" }],
    screenshots: {
      filled: { path: "u1/q1/filled.png", url: "https://contoh.test/signed/filled" },
      after: { path: "u1/q1/after.png", url: "https://contoh.test/signed/after" },
    },
    fields_filled: 1,
    queue_job_id: "q1",
  },
};

test("agentLogFacts: baris confirmed dibaca lengkap", () => {
  assert.deepEqual(agentLogFacts(CONFIRMED), {
    log_status: "success",
    submit_check_verdict: "confirmed",
    confirmation_phrase: "terima kasih telah melamar",
    reason: null,
    submit_blocked: null,
    remaining_required: [],
    fields_filled: 1,
    filled_fields: [{ label: "Email", kind: "text", value: "u1@contoh.test" }],
    screenshots: {
      filled: { path: "u1/q1/filled.png", url: "https://contoh.test/signed/filled" },
      after: { path: "u1/q1/after.png", url: "https://contoh.test/signed/after" },
    },
    logged_at: "2026-11-23T14:05:00Z",
  });
  const outcome = describeLogOutcome(agentLogFacts(CONFIRMED));
  assert.equal(outcome?.label, "Terkirim");
  assert.match(outcome?.hint ?? "", /"terima kasih telah melamar"/);
});

test("agentLogFacts: baris submit_unverified, validation_failed, dan required_remaining", () => {
  const unverified = agentLogFacts({
    status: "submit_unverified",
    created_at: "2026-11-23T14:10:00Z",
    details: { submit_clicked: true, submit_check: { verdict: "uncertain", confirmation_phrase: null, after_path: "/x" }, fields_filled: 7 },
  });
  assert.equal(unverified.log_status, "submit_unverified");
  assert.equal(unverified.submit_check_verdict, "uncertain");
  assert.equal(unverified.confirmation_phrase, null);
  assert.equal(describeLogOutcome(unverified)?.label, "Perlu dicek: kirim belum terkonfirmasi");

  const rejected = agentLogFacts({ status: "incomplete", created_at: "2026-11-23T14:11:00Z", details: { reason: "validation_failed", submit_check: { verdict: "validation_error" } } });
  assert.equal(rejected.reason, "validation_failed");
  assert.equal(describeLogOutcome(rejected)?.label, "Ditolak formulir (tidak terkirim)");

  const partial = agentLogFacts({
    status: "ready",
    created_at: "2026-11-23T14:12:00Z",
    details: { submit_blocked: "required_remaining", remaining_required: ["Phone", "Phone", "", 4, "City"] },
  });
  assert.deepEqual(partial.remaining_required, ["Phone", "City"]);
  assert.equal(describeLogOutcome(partial)?.label, "Terisi sebagian, belum dikirim");
});

test("agentLogFacts: masukan rusak atau log lama tidak melempar dan tidak mengarang bukti", () => {
  for (const bad of [null, undefined, "x", 5, [], { details: "x" }, { details: [] }, { status: 3, details: { screenshots: "x", filled_fields: "x", submit_check: 4 } }]) {
    const f = agentLogFacts(bad);
    assert.equal(hasAgentEvidence(f), false);
    assert.equal(f.screenshots ?? null, null);
    assert.deepEqual(f.filled_fields ?? [], []);
    assert.equal(describeLogOutcome(f), null);
  }
  assert.equal(agentLogFacts({ status: "ready", created_at: "bukan tanggal" }).logged_at, null);
  assert.equal(hasAgentEvidence(undefined), false);
});

test("cleanFilledFields: label wajib, jenis tak dikenal jadi teks, nilai kosong dibuang, paling banyak 40", () => {
  const out = cleanFilledFields([
    { label: " Email ", kind: "text", value: " a@b.test " },
    { label: "Negara", kind: "select", value: "Indonesia" },
    { label: "Setuju", kind: "check" },
    { label: "CV", kind: "upload", value: "cv.pdf" },
    { label: "Aneh", kind: "radio", value: 5 },
    { label: "", kind: "text", value: "tanpa label" },
    { kind: "text", value: "tanpa label juga" },
    "bukan objek",
    null,
  ]);
  assert.deepEqual(out, [
    { label: "Email", kind: "text", value: "a@b.test" },
    { label: "Negara", kind: "select", value: "Indonesia" },
    { label: "Setuju", kind: "check" },
    { label: "CV", kind: "upload", value: "cv.pdf" },
    { label: "Aneh", kind: "text", value: "5" },
  ]);
  const many = cleanFilledFields(Array.from({ length: 80 }, (_, i) => ({ label: `Isian ${i}`, kind: "text", value: "x" })));
  assert.equal(many.length, MAX_FILLED_FIELDS);
  assert.equal(MAX_FILLED_FIELDS, 40);
  assert.deepEqual(cleanFilledFields("x"), []);
  assert.equal(cleanFilledFields([{ label: "L".repeat(500), kind: "text", value: "v".repeat(900) }])[0].value?.length, 300);
});

test("cleanScreenshots: hanya jalur aman, tautan hanya http(s), satu dari dua tetap dipakai", () => {
  assert.equal(isSafeStoragePath("u1/q1/filled.png"), true);
  for (const bad of ["", "/abs/path.png", "../x.png", "u1/../x.png", "u1\\x.png", 5, null, "a".repeat(301)]) assert.equal(isSafeStoragePath(bad), false);
  assert.deepEqual(cleanScreenshots({ filled: { path: "u1/q1/filled.png", url: "javascript:alert(1)" }, after: null }), {
    filled: { path: "u1/q1/filled.png", url: null },
    after: null,
  });
  assert.deepEqual(cleanScreenshots({ filled: null, after: { path: "u1/q1/after.png" } }), { filled: null, after: { path: "u1/q1/after.png", url: null } });
  assert.equal(cleanScreenshots({ filled: { path: "../x" }, after: { url: "https://x.test/a" } }), null);
  assert.equal(cleanScreenshots({ filled: null, after: null }), null);
  assert.equal(cleanScreenshots(null), null);
  assert.equal(cleanScreenshots([]), null);
});

test("hasAgentEvidence: tangkapan layar atau daftar isian", () => {
  assert.equal(hasAgentEvidence({ filled_fields: [{ label: "A", kind: "text" }] }), true);
  assert.equal(hasAgentEvidence({ screenshots: { filled: { path: "u/q/filled.png", url: null }, after: null } }), true);
  assert.equal(hasAgentEvidence({ screenshots: { filled: null, after: { path: "u/q/after.png", url: null } } }), true);
  assert.equal(hasAgentEvidence({ filled_fields: [], screenshots: null, log_status: "success" }), false);
});

test("agentFactsByJob: percobaan terbaru per lowongan, sama dengan yang dibaca latestApplyAttempt", () => {
  const rows = [
    { job_id: "a", status: "incomplete", created_at: "2026-11-23T10:00:00Z", details: { reason: "validation_failed", queue_job_id: "q-old" } },
    { job_id: "a", status: "submit_unverified", created_at: "2026-11-23T12:00:00Z", details: { queue_job_id: "q-new", fields_filled: 4 } },
    { job_id: "b", status: "success", created_at: "2026-11-23T11:00:00Z", details: {} },
  ];
  const facts = agentFactsByJob(rows, ["a", "b", "c", "a", "", null]);
  assert.deepEqual(Object.keys(facts).sort(), ["a", "b"]);
  assert.equal(facts.a.log_status, "submit_unverified");
  assert.equal(facts.a.logged_at, "2026-11-23T12:00:00Z");
  assert.equal(latestApplyAttempt(rows, "a")?.at, facts.a.logged_at);
  assert.deepEqual(agentFactsByJob(rows, null), {});
  assert.deepEqual(agentFactsByJob(null, ["a"]), {});
});

test("percobaan lama tidak dibawa ke lamaran baru: bukti hanya untuk percobaan sesudah lamaran dibuat", () => {
  const attempt = latestApplyAttempt([CONFIRMED], "job-1");
  assert.ok(attemptForApplication(attempt, { created_at: "2026-11-23T10:00:00Z" }));
  assert.equal(attemptForApplication(attempt, { created_at: "2026-11-24T10:00:00Z" }), undefined);
  // jendela detail hanya membaca fakta bila attemptForApplication mengembalikan percobaan
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /const selectedFacts = selectedApp && selectedAttempt \? agentFacts\[selectedApp\.job_id\] : undefined;/);
});

test("signedUrlOutcome: tautan bertanda tangan, cadangan dari log, dan pesan galat singkat", () => {
  assert.deepEqual(signedUrlOutcome({ data: { signedUrl: "https://s.test/obj?token=abc" }, error: null }, "https://old.test/x"), { url: "https://s.test/obj?token=abc", fallback: false });
  // gagal dibuat: pakai tautan cadangan yang ditulis worker
  assert.deepEqual(signedUrlOutcome({ data: null, error: { message: "boom" } }, "https://old.test/x"), { url: "https://old.test/x", fallback: true });
  // gagal dan tanpa cadangan
  assert.deepEqual(signedUrlOutcome({ data: null, error: { message: "boom" } }, null), { error: SCREENSHOT_ERROR_TEXT });
  assert.deepEqual(signedUrlOutcome(null, undefined), { error: SCREENSHOT_ERROR_TEXT });
  assert.deepEqual(signedUrlOutcome({ data: null, error: { message: "Object not found" } }, null), { error: SCREENSHOT_MISSING_TEXT });
  // tautan bukan http(s) tidak pernah dipakai
  assert.deepEqual(signedUrlOutcome({ data: { signedUrl: "javascript:alert(1)" }, error: null }, "javascript:alert(2)"), { error: SCREENSHOT_ERROR_TEXT });
  assert.equal(SCREENSHOT_ERROR_TEXT, "Gambar belum bisa dibuka. Coba lagi sebentar lagi.");
});

test("fieldValueText dan formatAttemptTime", () => {
  assert.equal(fieldValueText({ label: "Email", kind: "text", value: "a@b.test" }), "a@b.test");
  assert.equal(fieldValueText({ label: "Setuju", kind: "check" }), "dicentang");
  assert.equal(fieldValueText({ label: "CV", kind: "upload" }), "berkas diunggah");
  assert.equal(fieldValueText({ label: "Negara", kind: "select" }), "dipilih");
  assert.equal(fieldValueText({ label: "Nama", kind: "text" }), "tidak dicatat");
  assert.match(formatAttemptTime("2026-11-23T14:05:00Z", "UTC") ?? "", /23 November 2026.*14\.05/);
  assert.equal(formatAttemptTime("bukan tanggal"), null);
  assert.equal(formatAttemptTime(null), null);
  assert.equal(formatAttemptTime(undefined), null);
});

test("AgentEvidence: dua tombol tangkapan layar, daftar isian yang bisa dibuka, waktu percobaan, galat singkat", () => {
  const src = read("../src/components/AgentEvidence.tsx");
  assert.match(src, /filled: "Lihat formulir yang diisi agen"/);
  assert.match(src, /after: "Lihat halaman setelah kirim"/);
  // tombol "setelah kirim" hanya bila tangkapan layar itu ada
  assert.match(src, /\(\["filled", "after"\] as const\)\.filter\(\(k\) => !!screenshots\?\.\[k\]\)/);
  assert.match(src, /<details/);
  assert.match(src, /Isian yang diisi agen \(\{fields\.length\}\)/);
  assert.match(src, /formatAttemptTime\(loggedAt\)/);
  assert.match(src, /Percobaan agen: \{time\}/);
  // tautan dibuat saat tombol ditekan, galat tampil sebagai pesan, gambar yang gagal dimuat juga
  assert.match(src, /await signAgentScreenshot\(ref\)/);
  assert.match(src, /role="alert"/);
  assert.match(src, /SCREENSHOT_LOAD_FAILED_TEXT/);
  // gambar dibuka di jendela Radix di halaman ini, dengan tautan ke tab baru yang aman
  assert.match(src, /@\/components\/ui\/dialog/);
  assert.match(src, /target="_blank"\s+rel="noopener noreferrer"/);
  assert.doesNotMatch(src, /fixed inset-0/);
  // tombol cukup besar untuk disentuh
  assert.match(src, /min-h-11/);
  // tanpa bukti, komponen tidak menampilkan apa-apa
  assert.match(src, /if \(shots\.length === 0 && fields\.length === 0\) return null;/);
});

test("tautan tangkapan layar dibuat di peramban dengan sesi pengguna: bucket privat, berlaku 3600 detik, hanya membaca", () => {
  assert.equal(AGENT_SCREENSHOT_BUCKET, "agent-screenshots");
  assert.equal(SIGNED_URL_TTL_SECONDS, 3600);
  const svc = read("../src/services/agentScreenshotService.ts");
  assert.match(svc, /supabase\.storage\.from\(AGENT_SCREENSHOT_BUCKET\)\.createSignedUrl\(ref\.path, SIGNED_URL_TTL_SECONDS\)/);
  assert.match(svc, /signedUrlOutcome\(res, ref\.url\)/);
  for (const rel of [
    "../src/services/agentScreenshotService.ts",
    "../src/components/AgentEvidence.tsx",
    "../src/components/AgentApplyStatus.tsx",
    "../src/lib/agentEvidence.ts",
    "../src/lib/agentApplyStatus.ts",
    "../src/services/formGapService.ts",
    "../src/services/emailApplyService.ts",
  ]) {
    const src = read(rel).replace(/^\s*(\*|\/\/|\/\*).*$/gm, "");
    assert.doesNotMatch(src, /\.(insert|upsert|delete)\(|\.update\(\{/, `${rel} tidak boleh menulis`);
    assert.doesNotMatch(src, /\.upload\(|\.remove\(|\.move\(|\.copy\(/, `${rel} tidak boleh menulis ke Storage`);
  }
  // lib murni: hanya mengimpor formGaps.ts (yang sendiri tanpa impor)
  const imports = [...read("../src/lib/agentEvidence.ts").matchAll(/^\s*import\s.*$/gm)].map((m) => m[0]);
  assert.deepEqual(imports, ['import { newestRow } from "./formGaps.ts";']);
});

test("Lamaran Saya: bukti pengiriman untuk lamaran terkirim, bukti dari agen untuk lainnya, penjelasan hasil menggantikan teks berhenti sebelum kirim", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /import AgentEvidence from "@\/components\/AgentEvidence"/);
  assert.match(src, /const selectedSent = selectedOutcome\?\.tone === "sent";/);
  assert.match(src, /\{selectedSent \? "Bukti pengiriman" : "Bukti dari agen"\}/);
  assert.match(src, /<AgentEvidence screenshots=\{selectedFacts\.screenshots\} filledFields=\{selectedFacts\.filled_fields\} loggedAt=\{selectedFacts\.logged_at\} \/>/);
  // blok bukti hanya bila lamaran punya percobaan agen yang terbaca
  assert.match(src, /\{selectedFacts && \(selectedSent \|\| hasAgentEvidence\(selectedFacts\)\) && \(/);
  // penjelasan hasil (belum terkonfirmasi, ditolak formulir, terisi sebagian) tampil dan teks lama hanya bila tidak ada
  const detail = src.slice(src.indexOf("{selectedIssue && ("), src.indexOf("{selectedGaps && ("));
  assert.match(detail, /\{selectedIssue\.label\}/);
  assert.match(detail, /\{selectedIssue\.hint\}/);
  assert.match(detail, /\{!selectedIssue && <p/);
  assert.match(detail, /berhenti sebelum tombol kirim/);
  // log dibaca untuk semua lamaran supaya bukti pengiriman juga ada di kolom Terkirim
  assert.match(src, /setAgentFacts\(facts\)/);
});

test("approvals dan Lamaran Saya tidak menulis ke automation_queue atau application_logs", () => {
  for (const rel of ["../src/routes/approvals.tsx", "../src/routes/applications.tsx", "../src/components/AgentEvidence.tsx", "../src/components/AgentApplyStatus.tsx"]) {
    const src = read(rel);
    assert.doesNotMatch(src, /from\("(automation_queue|application_logs)"\)/, rel);
  }
  for (const rel of ["../src/services/emailApplyService.ts", "../src/services/formGapService.ts"]) {
    const src = read(rel);
    assert.doesNotMatch(src, /from\("(automation_queue|application_logs)"\)\s*\.(insert|update|upsert|delete)/, rel);
  }
});
