import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACTIVE_APPLICATION_NOTE,
  isActiveApplication,
  isUniqueViolation,
  pickActiveApplication,
  reusedAnalysis,
} from "../supabase/functions/_shared/active-application.ts";
import { ACTIVE_APPLICATION_HINT, REUSED_DRAFT_NOTICE, canStartNewDraft } from "../src/lib/activeApplication.ts";

// Uji E2E 24 November 2026: lowongan yang sama tampil dua kali ("Lamaran ke-1 dari 2" dan "ke-2 dari 2"). Data produksi
// (dibaca saja): 12 pasangan baris ai_applications dengan user_id dan job_id yang sama, semuanya draft atau ready, jadi
// ini baris kembar, bukan salah kelompok di tampilan. Edge Function generate-application adalah satu-satunya yang
// membuat baris itu. Edge Function berjalan di Deno, jadi pengaitannya diperiksa lewat teks sumber dan aturannya dites langsung.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const FN = "../supabase/functions/generate-application/index.ts";

test("isActiveApplication: hanya closed yang tidak aktif; status kosong atau tidak dikenal dianggap aktif", () => {
  for (const status of ["draft", "ready", "submitted", "follow_up", "responded"]) assert.equal(isActiveApplication({ status }), true, status);
  assert.equal(isActiveApplication({ status: "closed" }), false);
  for (const status of [null, undefined, "", "ATS Lolos"]) assert.equal(isActiveApplication({ status }), true, String(status));
  assert.equal(isActiveApplication(null), false);
  assert.equal(isActiveApplication(undefined), false);
});

test("pickActiveApplication: tidak ada baris atau semuanya closed -> null (draf baru boleh dibuat)", () => {
  assert.equal(pickActiveApplication([]), null);
  assert.equal(pickActiveApplication(null), null);
  assert.equal(pickActiveApplication(undefined), null);
  assert.equal(pickActiveApplication([{ id: "a", status: "closed" }, { id: "b", status: "closed" }]), null);
});

test("pickActiveApplication: satu baris aktif dikembalikan, baris closed diabaikan", () => {
  const rows = [
    { id: "lama", status: "closed", created_at: "2026-11-20T10:00:00Z" },
    { id: "aktif", status: "draft", created_at: "2026-11-21T10:00:00Z" },
  ];
  assert.equal(pickActiveApplication(rows)?.id, "aktif");
});

test("pickActiveApplication: data lama dengan beberapa baris aktif -> yang paling maju statusnya, lalu yang terbaru", () => {
  // pasangan produksi: dua ready (Datadog) dan dua draft (FIN HOMEMART)
  assert.equal(
    pickActiveApplication([
      { id: "ready-baru", status: "ready", created_at: "2026-11-20T16:26:27Z" },
      { id: "ready-lama", status: "ready", created_at: "2026-11-20T16:00:16Z" },
    ])?.id,
    "ready-baru",
  );
  assert.equal(
    pickActiveApplication([
      { id: "draft-baru", status: "draft", created_at: "2026-11-21T06:53:44Z" },
      { id: "terkirim", status: "submitted", created_at: "2026-11-21T06:09:34Z" },
      { id: "ready", status: "ready", created_at: "2026-11-21T06:30:00Z" },
    ])?.id,
    "terkirim",
    "yang sudah terkirim tidak boleh tertimpa draf baru",
  );
  // tanggal tidak terbaca tidak membuat fungsi melempar
  assert.equal(pickActiveApplication([{ id: "x", status: "draft", created_at: "bukan tanggal" }, { id: "y", status: "draft" }])?.id, "x");
});

test("isUniqueViolation: hanya kode 23505", () => {
  assert.equal(isUniqueViolation({ code: "23505" }), true);
  assert.equal(isUniqueViolation({ code: "23503" }), false);
  assert.equal(isUniqueViolation({}), false);
  assert.equal(isUniqueViolation(null), false);
  assert.equal(isUniqueViolation(undefined), false);
});

test("reusedAnalysis: tanpa analisis baru, label model dari baris yang ada, dan catatan untuk layar", () => {
  const a = reusedAnalysis({ model_used: "numes:model-x" });
  assert.deepEqual({ ...a, note: undefined }, { skillGaps: [], warnings: [], modelUsed: "numes:model-x", note: undefined });
  assert.equal(a.note, ACTIVE_APPLICATION_NOTE);
  assert.equal(reusedAnalysis({ model_used: null }).modelUsed, null);
  assert.equal(reusedAnalysis({ model_used: "  " }).modelUsed, null);
  assert.equal(reusedAnalysis(undefined).modelUsed, null);
});

test("Edge Function: lamaran aktif diperiksa sesudah kuota dibaca dan sebelum panggilan model; yang ada dikembalikan tanpa kuota", () => {
  const fn = read(FN);
  assert.match(fn, /from "\.\.\/_shared\/active-application\.ts"/);
  const guardAt = fn.indexOf("3a) Satu lowongan, satu lamaran aktif");
  assert.ok(guardAt > fn.indexOf("get_quota_status"), "sesudah kuota dibaca (balasan memuat kuota)");
  assert.ok(guardAt < fn.indexOf("// 4) Context"), "sebelum konteks dan panggilan model");
  assert.ok(guardAt < fn.indexOf("consume_monthly_apply"), "sebelum kuota dipotong");
  const guard = fn.slice(guardAt, fn.indexOf("// 3b) BYOK"));
  assert.match(guard, /if \(mode !== "analyze"\)/, "mode analyze (pratinjau) tidak diganggu");
  assert.match(guard, /\.eq\("user_id", userId\)\.eq\("job_id", jobId\)\.neq\("status", CLOSED_STATUS\)/);
  assert.match(guard, /if \(activeErr\) return json\(\{[^}]*code: "active_lookup_failed"[^}]*\}, 503\)/, "gagal tertutup");
  assert.match(guard, /json\(\{ application: existing, reused: true, analysis: reusedAnalysis\(existing\), quota \}\)/);
});

test("Edge Function: dua permintaan bersamaan -> pelanggaran indeks unik mengembalikan pemenang, bukan galat 500", () => {
  const fn = read(FN);
  const insertAt = fn.indexOf('.from("ai_applications")\n      .insert(');
  assert.ok(insertAt > 0);
  const after = fn.slice(insertAt);
  const unique = after.slice(after.indexOf("if (isUniqueViolation(insErr))"), after.indexOf('if (insErr) return json({ error: "Failed to save draft"'));
  assert.ok(unique.length > 0);
  assert.match(unique, /pickActiveApplication\(winners\)/);
  assert.match(unique, /reused: true/);
  // baris yang dibuat tetap hanya satu: insert draf tunggal, status draft
  assert.equal(fn.split('.from("ai_applications")\n      .insert(').length - 1, 1);
  // kuota dipotong sesudah insert berhasil (bukan sebelumnya), dan baris baru dibersihkan jika kuota gagal/habis
  const consumeAt = fn.indexOf('rpc("consume_monthly_apply"');
  assert.ok(insertAt < consumeAt, "insert draf terjadi sebelum consume_monthly_apply agar duplikat/gagal insert tidak memotong kuota");
  const afterConsume = fn.slice(consumeAt);
  assert.match(afterConsume, /\.from\("ai_applications"\)\.delete\(\)\.eq\("id", app\.id\)\.eq\("user_id", userId\)/);
});

test("Layar: server mengembalikan lamaran yang ada -> toast; tombol draf baru hanya bila lamaran terakhir sudah ditutup", () => {
  assert.equal(canStartNewDraft("closed"), true);
  for (const s of ["draft", "ready", "submitted", "follow_up", "responded", null, undefined, ""]) assert.equal(canStartNewDraft(s), false, String(s));
  assert.match(ACTIVE_APPLICATION_HINT, /satu lamaran aktif/);
  assert.match(ACTIVE_APPLICATION_HINT, /Ditutup/);
  assert.match(REUSED_DRAFT_NOTICE, /kuota tidak terpakai/);

  const svc = read("../src/services/aiApplicationService.ts");
  assert.match(svc, /reused: res\.reused === true/);
  const modal = read("../src/components/AIApplyModal.tsx");
  assert.match(modal, /const \{ application: app, analysis, reused \} = await aiApplicationService\.createDraftWithAnalysis/);
  assert.match(modal, /if \(reused\) toast\.info\(REUSED_DRAFT_NOTICE\)/);
  assert.match(modal, /\{!canStartNewDraft\(application\.status\) && \(\s*<p [^>]*>\{ACTIVE_APPLICATION_HINT\}<\/p>/);
  assert.match(modal, /\{canApply && canStartNewDraft\(application\.status\) && !confirmNewDraft && \(/);
  assert.match(modal, /\{canApply && canStartNewDraft\(application\.status\) && confirmNewDraft && \(/);
});
