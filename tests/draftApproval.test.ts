import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildApprovalPayload, canRequestApproval, draftToGenerated, findPendingApproval } from "../src/lib/draftApproval.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const NOW = Date.parse("2026-11-19T10:00:00.000Z");
const future = "2026-11-19T10:30:00.000Z";
const past = "2026-11-19T09:30:00.000Z";

test("hanya draf yang belum dikirim yang bisa diajukan: draft dan ready", () => {
  assert.equal(canRequestApproval("draft"), true);
  assert.equal(canRequestApproval("ready"), true);
  for (const s of ["submitted", "follow_up", "responded", "closed", "", undefined, null, 5]) assert.equal(canRequestApproval(s), false, String(s));
});

test("approval pending yang masih berlaku untuk draf itu ditemukan; yang lain tidak", () => {
  const rows = [
    { id: "a1", application_id: "app-2", status: "pending", expires_at: future },
    { id: "a2", application_id: "app-1", status: "approved", expires_at: future },
    { id: "a3", application_id: "app-1", status: "pending", expires_at: past },
    { id: "a4", application_id: "app-1", status: "pending", expires_at: future },
    { id: "a5", application_id: null, status: "pending", expires_at: future },
  ];
  assert.equal(findPendingApproval(rows, "app-1", NOW)?.id, "a4");
  assert.equal(findPendingApproval(rows, "app-2", NOW)?.id, "a1");
  assert.equal(findPendingApproval(rows, "app-3", NOW), null);
});

test("findPendingApproval: daftar kosong, bukan array, baris rusak, dan tanggal rusak tidak melempar dan tidak dianggap pending", () => {
  assert.equal(findPendingApproval([], "app-1", NOW), null);
  for (const v of [null, undefined, {}, "x", 5]) assert.equal(findPendingApproval(v, "app-1", NOW), null);
  assert.equal(findPendingApproval([null, 3, "x", { application_id: "app-1" }, { id: "", application_id: "app-1" }], "app-1", NOW), null);
  assert.equal(findPendingApproval([{ id: "a", application_id: "app-1", status: "pending", expires_at: "bukan tanggal" }], "app-1", NOW), null);
  assert.equal(findPendingApproval([{ id: "a", application_id: "app-1", status: "pending", expires_at: future }], "", NOW), null);
  // daftar dari /pending sudah disaring server: baris tanpa status dan tanpa expires_at tetap dihitung pending
  assert.equal(findPendingApproval([{ id: "a", application_id: "app-1" }], "app-1", NOW)?.id, "a");
});

test("isi pengajuan sama dengan modal AI Apply: job_id, application_id, job_title, company, platform, cover_letter", () => {
  const r = buildApprovalPayload({
    applicationId: "app-1",
    jobId: "job-9",
    jobTitle: " Frontend Developer ",
    company: "Acme",
    platform: "jobstreet",
    coverLetter: "Yth. Tim Acme,\nSaya melamar.",
  });
  assert.deepEqual(r, {
    ok: true,
    payload: {
      job_id: "job-9",
      application_id: "app-1",
      job_title: "Frontend Developer",
      company: "Acme",
      platform: "jobstreet",
      cover_letter: "Yth. Tim Acme,\nSaya melamar.",
    },
  });
  // platform kosong menjadi null, bukan teks kosong
  const noPlatform = buildApprovalPayload({ applicationId: "app-1", jobId: "j", jobTitle: "A", company: "B", platform: "", coverLetter: "x" });
  assert.equal(noPlatform.ok && noPlatform.payload.platform, null);
});

test("draf tanpa job_id ditolak sebelum dikirim, karena backend mewajibkan job_id (E2E-05)", () => {
  for (const jobId of [undefined, null, "", "   "]) {
    const r = buildApprovalPayload({ applicationId: "app-1", jobId, jobTitle: "A", company: "B", coverLetter: "x" });
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /Lowongan untuk draf ini sudah tidak ada/);
  }
  const trimmed = buildApprovalPayload({ applicationId: "app-1", jobId: " job-1 ", jobTitle: "A", company: "B", coverLetter: "x" });
  assert.equal(trimmed.ok && trimmed.payload.job_id, "job-1");
});

test("draf tanpa lowongan, tanpa id, atau tanpa surat ditolak dengan alasan yang bisa dibaca", () => {
  const noJob = buildApprovalPayload({ applicationId: "app-1", jobId: "j", jobTitle: undefined, company: undefined, coverLetter: "x" });
  assert.equal(noJob.ok, false);
  assert.match((noJob as { reason: string }).reason, /Lowongan untuk draf ini sudah tidak ada/);
  const noId = buildApprovalPayload({ applicationId: "", jobTitle: "A", company: "B", coverLetter: "x" });
  assert.equal(noId.ok, false);
  const noLetter = buildApprovalPayload({ applicationId: "app-1", jobTitle: "A", company: "B", coverLetter: "   " });
  assert.equal(noLetter.ok, false);
  assert.match((noLetter as { reason: string }).reason, /kosong/);
});

test("draf yang tersimpan ditampilkan apa adanya; kolom kosong atau salah bentuk menjadi kosong, bukan galat", () => {
  const v = draftToGenerated({
    cover_letter: "Halo",
    optimized_cv: { summary: "Ringkasan", highlighted_skills: ["React"] },
    tailored_skills: ["React", "", 5, "TypeScript"],
    ai_notes: "Catatan",
  });
  assert.deepEqual(v, { coverLetter: "Halo", optimizedCV: { summary: "Ringkasan", highlighted_skills: ["React"] }, tailoredSkills: ["React", "TypeScript"], aiNotes: "Catatan" });
  assert.deepEqual(draftToGenerated({}), { coverLetter: "", optimizedCV: {}, tailoredSkills: [], aiNotes: "" });
  assert.deepEqual(draftToGenerated({ optimized_cv: [1], tailored_skills: "React", ai_notes: null, cover_letter: 7 }), { coverLetter: "", optimizedCV: {}, tailoredSkills: [], aiNotes: "" });
});

// ---- kabel antarmuka -------------------------------------------------------------------------------

test("service pengajuan: memeriksa antrean pending lebih dulu, memakai createApproval yang sama, dan tidak menggandakan", () => {
  const svc = read("../src/services/approvalService.ts");
  const fn = svc.slice(svc.indexOf("export async function requestApprovalForDraft"));
  assert.ok(fn.indexOf("getPendingApprovalFor(") < fn.indexOf("automationApi.createApproval("), "memeriksa pending sebelum membuat");
  assert.match(fn, /return \{ approval: existing, created: false \}/);
  assert.match(fn, /throw new DraftNotSendableError\(built\.reason\)/);
  assert.match(svc, /automationApi\.getPendingApprovals\(\)/);
});

test("Lamaran Saya: status ready tidak lagi ditulis 'belum diajukan' (uji E2E klik 20 November 2026)", () => {
  const src = read("../src/routes/applications.tsx");
  const box = src.slice(src.indexOf("Draf ini sudah menunggu persetujuanmu"), src.indexOf("approvalUi.state === \"unknown\""));
  // teks 'belum diajukan' hanya untuk status selain ready
  assert.match(box, /selectedApp\.status === "ready"\s*\?[\s\S]*berhenti sebelum tombol kirim[\s\S]*: "Draf ini belum diajukan\./);
  assert.match(src, /selectedApp\.status === "ready" \? "Ajukan lagi ke Persetujuan" : "Ajukan ke Persetujuan"/);
});

test("Lamaran Saya: detail draf punya tombol Ajukan ke Persetujuan, tautan Buka Persetujuan, galat dekat tombol, dan toast", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /canRequestApproval\(selectedApp\.status\) && \(/);
  assert.match(src, /Ajukan ke Persetujuan/);
  assert.match(src, /to="\/approvals"[\s\S]{0,400}Buka Persetujuan/);
  // pending ditampilkan sebagai tautan, bukan tombol ajukan lagi
  assert.match(src, /approvalUi\.state === "pending" \? \(/);
  // data pengajuan: id lowongan dan draf, judul, perusahaan, platform, surat
  const fn = src.slice(src.indexOf("const handleRequestApproval"), src.indexOf("const viewOrder"));
  for (const field of ["applicationId: app.id", "jobId: app.job_id", "jobTitle: job?.title", "company: job?.company", "platform: job?.platform_source", "coverLetter: app.cover_letter"]) {
    assert.ok(fn.includes(field), field);
  }
  assert.match(fn, /setApprovalError\(message\)/);
  assert.match(fn, /toast\.error\(message\)/);
  // kotak galat berada di atas tombol dan terhubung lewat aria-describedby
  const ui = src.slice(src.indexOf("Draf yang belum dikirim bisa diajukan dari sini"));
  assert.ok(ui.indexOf('id="detail-approval-error"') < ui.indexOf("Ajukan ke Persetujuan"), "galat di atas tombol");
  assert.match(ui, /role="alert" id="detail-approval-error"/);
  assert.match(ui, /aria-describedby=\{approvalError \? "detail-approval-error" : undefined\}/);
  // tombol terkunci saat memeriksa atau mengajukan, supaya tidak terkirim dua kali
  assert.match(ui, /disabled=\{approvalBusy \|\| approvalUi\.state === "checking"\}/);
});

test("modal AI Apply memakai service pengajuan yang sama dan melaporkan galatnya apa adanya", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  assert.match(src, /requestApprovalForDraft\(\{/);
  assert.doesNotMatch(src, /automationApi\.createApproval|describeApiError/);
  assert.match(src, /describeApprovalError\(err, "Draf belum bisa diajukan\."\)/);
});

test("modal AI Apply dibuka lagi untuk lowongan yang sudah punya draf: draf yang ada ditampilkan, tanpa draf baru dan tanpa kuota", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  // mencari draf yang ada saat modal dibuka
  assert.match(src, /aiApplicationService\.getDraftForJob\(jobId\)/);
  assert.match(src, /loadExistingDraft\(\);/);
  const load = src.slice(src.indexOf("const loadExistingDraft"), src.indexOf("useEffect(() => {\n    loadQuota()"));
  assert.match(load, /setApplication\(app\)/);
  assert.match(load, /setAiGenerated\(view\)/);
  // modal tidak memanggil generate sendiri saat dibuka; generate hanya dari tombol
  assert.doesNotMatch(load, /generate\(|createDraft/);
  // layar "Buat draf" tidak muncul selama pemeriksaan, dan galat pemeriksaan tidak dianggap "tidak ada draf"
  assert.match(src, /existing\.state === "checking" \? \(/);
  assert.match(src, /existing\.state === "error" \? \(/);
  assert.match(src, /Draf baru belum dibuat, supaya kuota tidak terpakai untuk draf kedua/);
  // draf baru meminta konfirmasi yang menyebut kuota
  assert.match(src, /Kamu sudah punya draf untuk lowongan ini/);
  assert.match(src, /Buat draf baru \(pakai 1 kuota\)/);
  assert.match(src, /Draf baru memakai 1 kuota/);
  const confirmAt = src.indexOf("Ya, buat draf baru");
  assert.ok(confirmAt > 0 && src.slice(confirmAt - 200, confirmAt).includes("onClick={generate}"));
  // draf yang sudah terkirim ditampilkan tanpa tombol ajukan atau tandai terkirim
  assert.match(src, /const editable = application !== null && canRequestApproval\(application\.status\)/);
  assert.match(src, /\) : editable && \(/);
  // service membaca draf terbaru milik pengguna untuk lowongan itu dan melempar galat database
  const svc = read("../src/services/aiApplicationService.ts");
  const fn = svc.slice(svc.indexOf("async getDraftForJob"), svc.indexOf("// Get single application"));
  assert.match(fn, /\.eq\("user_id", user\.id\)/);
  assert.match(fn, /\.eq\("job_id", jobId\)/);
  assert.match(fn, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(fn, /if \(error\) throw error/);
});
