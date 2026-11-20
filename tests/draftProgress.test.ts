import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DRAFT_CLIENT_TIMEOUT_MS,
  DRAFT_TIMEOUT_MESSAGE,
  SLOW_HINT_AFTER_SECONDS,
  draftProgressText,
  draftStage,
  draftWaitHint,
  isClientTimeout,
} from "../src/lib/draftProgress.ts";
import { DEFAULT_AI_TOTAL_BUDGET_MS } from "../supabase/functions/_shared/providers.ts";
import { describeError } from "../src/lib/authErrors.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Uji E2E klik 20 November 2026 (temuan 13): draf yang gagal baru melapor sesudah sekitar 55 detik tanpa kemajuan.

test("batas waktu klien lebih besar dari anggaran server, dan pesan gagal muncul sekitar 35 sampai 40 detik", () => {
  // jawaban galat server (sampai anggarannya habis, lalu menulis jawaban) harus tiba sebelum klien menyerah
  assert.ok(DRAFT_CLIENT_TIMEOUT_MS >= DEFAULT_AI_TOTAL_BUDGET_MS + 4_000, "selisih untuk auth, kueri, dan penyimpanan");
  assert.ok(DRAFT_CLIENT_TIMEOUT_MS <= 40_000, "pesan gagal paling lambat sekitar 40 detik");
  assert.ok(DEFAULT_AI_TOTAL_BUDGET_MS >= 30_000 && DEFAULT_AI_TOTAL_BUDGET_MS <= 36_000);
});

test("teks kemajuan: tahap singkat dan detik berjalan", () => {
  assert.equal(draftProgressText(0), "Menyusun draf... 0 detik");
  assert.equal(draftProgressText(5), "Menyusun draf... 5 detik");
  assert.equal(draftProgressText(12), "Masih menyusun draf... 12 detik");
  assert.equal(draftProgressText(20), "Masih menyusun draf... 20 detik");
  assert.equal(draftProgressText(30), "Menunggu layanan AI menjawab... 30 detik");
  assert.equal(draftProgressText(40), "Menunggu jawaban terakhir... 40 detik");
  // pecahan dibulatkan ke bawah, masukan aneh tidak merusak teks
  assert.equal(draftProgressText(7.9), "Menyusun draf... 7 detik");
  assert.equal(draftProgressText(-3), "Menyusun draf... 0 detik");
  assert.equal(draftProgressText(Number.NaN), "Menyusun draf... 0 detik");
  assert.equal(draftStage(0), "Menyusun draf");
});

test("petunjuk menunggu: kosong di awal, lalu sisa waktu dan kabar kuota, tanpa em dash", () => {
  assert.equal(draftWaitHint(0), "");
  assert.equal(draftWaitHint(SLOW_HINT_AFTER_SECONDS - 1), "");
  const hint = draftWaitHint(SLOW_HINT_AFTER_SECONDS);
  assert.match(hint, /lebih lambat dari biasanya/);
  assert.match(hint, /sekitar 25 detik/);
  assert.match(hint, /Kuota baru terpakai bila draf jadi/);
  assert.match(draftWaitHint(30), /sekitar 10 detik/);
  assert.match(draftWaitHint(40), /pilihan coba lagi/);
  for (const s of [0, 15, 30, 45]) assert.doesNotMatch(draftWaitHint(s) + draftProgressText(s), /—|–/);
});

test("isClientTimeout: hanya FunctionsFetchError yang konteksnya AbortError atau TimeoutError", () => {
  assert.equal(isClientTimeout({ name: "FunctionsFetchError", context: { name: "AbortError" } }), true);
  assert.equal(isClientTimeout({ name: "FunctionsFetchError", context: { name: "TimeoutError" } }), true);
  // jaringan putus: FunctionsFetchError dengan TypeError, bukan batas waktu
  assert.equal(isClientTimeout({ name: "FunctionsFetchError", context: { name: "TypeError" } }), false);
  assert.equal(isClientTimeout({ name: "FunctionsHttpError", context: { name: "AbortError" } }), false);
  assert.equal(isClientTimeout({ name: "FunctionsFetchError" }), false);
  assert.equal(isClientTimeout(null), false);
  assert.equal(isClientTimeout("timeout"), false);
});

test("pesan batas waktu klien lolos describeError apa adanya dan sama dengan pesan galat 502 server", () => {
  assert.equal(describeError(new Error(DRAFT_TIMEOUT_MESSAGE), "Draf belum bisa dibuat. Coba lagi."), DRAFT_TIMEOUT_MESSAGE);
  assert.equal(describeError(new Error("AI generation failed"), "x"), DRAFT_TIMEOUT_MESSAGE);
});

test("layanan draf memasang batas waktu klien dan memetakan batas waktu ke pesan coba lagi", () => {
  const src = read("../src/services/aiApplicationService.ts");
  assert.match(src, /import \{ DRAFT_CLIENT_TIMEOUT_MS, DRAFT_TIMEOUT_MESSAGE, isClientTimeout \} from "@\/lib\/draftProgress"/);
  assert.match(src, /functions\.invoke\("generate-application", \{\s*body: \{ jobId, mode, tone \},\s*timeout: DRAFT_CLIENT_TIMEOUT_MS,\s*\}\)/);
  assert.match(src, /if \(isClientTimeout\(error\)\) throw new Error\(DRAFT_TIMEOUT_MESSAGE\)/);
});

test("jendela Lamar dengan AI menampilkan detik berjalan selama draf dibuat, dan membersihkan penghitungnya", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  assert.match(src, /import \{ draftProgressText, draftWaitHint \} from "@\/lib\/draftProgress"/);
  // penghitung berjalan hanya saat generating, dan interval dibersihkan
  const effect = src.slice(src.indexOf("const [generatingElapsed"), src.indexOf("const [generatingElapsed") + 200);
  assert.match(effect, /useState\(0\)/);
  const timer = src.slice(src.indexOf("if (!generating) {"), src.indexOf("// Generate the application draft"));
  assert.match(timer, /setGeneratingElapsed\(0\)/);
  assert.match(timer, /setInterval\(\(\) => setGeneratingElapsed\(Math\.floor\(\(Date\.now\(\) - startedAt\) \/ 1000\)\), 1000\)/);
  assert.match(timer, /return \(\) => clearInterval\(timer\)/);
  assert.match(timer, /\[generating\]/);
  // tampilan: teks kemajuan dan petunjuk ada di cabang generating, penghitung di luar region aria-live
  const view = src.slice(src.indexOf("{generating ? ("), src.indexOf(") : error && !application ? ("));
  assert.match(view, /data-testid="draft-progress"/);
  assert.match(view, /\{draftProgressText\(generatingElapsed\)\}/);
  assert.match(view, /draftWaitHint\(generatingElapsed\)/);
  const live = view.slice(view.indexOf('role="status"'), view.indexOf("</div>", view.indexOf('role="status"')));
  assert.doesNotMatch(live, /draftProgressText/);
  assert.match(live, /sedang menulis lamaranmu/);
});

test("Coba lagi dan penutupan jendela tetap bekerja seperti sebelumnya", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  // galat draf tampil dengan tombol Coba lagi yang memanggil generate lagi
  const retry = src.slice(src.indexOf(") : error && !application ? ("), src.indexOf(") : existing.state === \"checking\""));
  assert.match(retry, /role="alert"/);
  assert.match(retry, /onClick=\{generate\}/);
  assert.match(retry, /Coba lagi/);
  // generating selalu dikembalikan ke false, juga saat gagal
  const fn = src.slice(src.indexOf("const generate = async"), src.indexOf("// Free preview-style regeneration"));
  assert.match(fn, /finally \{\s*setGenerating\(false\)/);
  assert.match(fn, /setError\(describeError\(err, "Draf belum bisa dibuat\. Coba lagi\."\)\)/);
  // menutup jendela tidak dikaitkan dengan state generating
  assert.match(src, /<Dialog open onOpenChange=\{\(open\) => \{ if \(!open\) onClose\(\); \}\}>/);
});
