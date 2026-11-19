import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aiPlanLabel, formatModelUsed, modelDisplay } from "../src/lib/modelLabel.ts";
import { quotaFromEdgeResponse } from "../src/lib/quotaStatus.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("modelUsed dari Edge Function menjadi nama ramah pengguna", () => {
  assert.equal(formatModelUsed("gemini:gemini-3.5-flash-lite"), "Gemini 3.5 Flash-Lite");
  assert.equal(formatModelUsed("gemini:models/gemini-3.5-flash-lite-preview"), "Gemini 3.5 Flash-Lite");
  assert.equal(formatModelUsed("anthropic:claude-haiku-5-5"), "Claude Haiku 5.5");
  assert.equal(formatModelUsed("anthropic:claude-haiku-5-5-20261101"), "Claude Haiku 5.5");
  assert.equal(formatModelUsed("anthropic:claude-sonnet-5-5"), "Claude Sonnet 5.5");
  assert.equal(formatModelUsed("openrouter:deepseek/deepseek-v4-pro"), "DeepSeek V4 Pro");
  assert.equal(formatModelUsed("deepseek/deepseek-v4-flash"), "DeepSeek V4 Flash");
  assert.equal(formatModelUsed("gemini:gemini-4-hydrogen"), "Gemini 4 Hydrogen");
  assert.equal(formatModelUsed("gemini:gemini-4-argon"), "Gemini 4 Argon");
});

test("model gratis OpenRouter diberi tanda gratis; router tanpa nama model tidak diklaim sebagai model tertentu", () => {
  assert.equal(formatModelUsed("openrouter:google/gemma-4-31b-it:free"), "Gemma 4 31B (gratis, OpenRouter)");
  assert.equal(formatModelUsed("openrouter:nvidia/nemotron-3-super:free"), "NVIDIA Nemotron 3 Super (gratis, OpenRouter)");
  assert.equal(formatModelUsed("openrouter/free"), "Model gratis OpenRouter");
  assert.equal(formatModelUsed("openrouter:openrouter/free"), "Model gratis OpenRouter");
});

test("model tak dikenal tetap ramah dan tidak menampilkan slug mentah", () => {
  assert.equal(formatModelUsed("openrouter:acme/foo-bar-5-5"), "Foo Bar 5.5");
  assert.equal(formatModelUsed("anthropic:claude-opus-6-0-20270101"), "Claude Opus 6.0");
  for (const v of ["gemini:gemini-3.5-flash-lite", "anthropic:claude-haiku-5-5", "openrouter:google/gemma-4-31b-it:free"]) {
    assert.doesNotMatch(formatModelUsed(v)!, /[:/]|-it\b/, v);
  }
});

test("nilai kosong atau bukan teks menghasilkan null, jadi layar memakai label paket", () => {
  for (const v of [undefined, null, "", "   ", 42, {}, []]) assert.equal(formatModelUsed(v), null, String(v));
  assert.equal(modelDisplay(undefined, "free"), "AI paket Free");
  assert.equal(modelDisplay(null, "pro"), "AI paket Pro");
  assert.equal(modelDisplay("gemini:gemini-3.5-flash-lite", "free"), "Gemini 3.5 Flash-Lite");
});

test("label paket tidak menyebut model tertentu dan tidak memakai kata 'gratis'", () => {
  assert.equal(aiPlanLabel("free"), "AI paket Free");
  assert.equal(aiPlanLabel("pro"), "AI paket Pro");
  assert.doesNotMatch(aiPlanLabel("free"), /gratis|gemini|claude|openrouter/i);
});

test("kuota dari respons Edge Function (sudah diparse) dibaca apa adanya, termasuk batas paket Pro", () => {
  assert.deepEqual(quotaFromEdgeResponse({ quota: 10, used: 1, remaining: 9, allowed: true }), { quota: 10, used: 1, remaining: 9, allowed: true });
  assert.deepEqual(quotaFromEdgeResponse({ quota: 20, used: 3, remaining: 17, allowed: true }), { quota: 20, used: 3, remaining: 17, allowed: true });
  assert.deepEqual(quotaFromEdgeResponse({ quota: 10, used: 10, remaining: 0, allowed: false }), { quota: 10, used: 10, remaining: 0, allowed: false });
  // used tidak ada: dihitung dari sisa
  assert.deepEqual(quotaFromEdgeResponse({ quota: 10, remaining: 7 }), { quota: 10, used: 3, remaining: 7, allowed: true });
});

test("kuota: baris mentah RPC masih dibaca, dan nilai tak berguna menghasilkan null (bukan 10/10 bawaan)", () => {
  assert.deepEqual(quotaFromEdgeResponse([{ allowed: true, used: 2, limit_qty: 10, remaining: 8 }]), { quota: 10, used: 2, remaining: 8, allowed: true });
  for (const v of [undefined, null, "x", 5, [], {}, { quota: "abc" }, { quota: 10 }]) assert.equal(quotaFromEdgeResponse(v), null, JSON.stringify(v));
});

// ---- kabel antarmuka -------------------------------------------------------------------------------

test("AIApplyModal: tidak ada lagi klaim 'model gratis' atau 'Flash · Gratis'; model asli dipakai setelah draf ada", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  assert.doesNotMatch(src, /model gratis OpenRouter|Model gratis|Flash|Gratis/);
  assert.match(src, /modelDisplay\(modelUsed, tier\)/);
  assert.match(src, /setModelUsed\(analysis\.modelUsed\)/);
  const svc = read("../src/services/aiApplicationService.ts");
  assert.match(svc, /modelUsed: rawModelUsed\(res\.analysis\?\.modelUsed\)/);
});

test("AIApplyModal: kuota setelah draf dibuat memakai quota dari respons, dan galat RPC tidak berubah menjadi 10/10", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  assert.match(src, /analysis\.quota/);
  assert.doesNotMatch(src, /useState<QuotaState>\(\{ remaining: 10/);
  assert.match(src, /statusRes\.error/);
  assert.match(src, /Sisa kuota belum bisa dimuat/);
  const svc = read("../src/services/aiApplicationService.ts");
  assert.match(svc, /quota: quotaFromEdgeResponse\(res\.quota\)/);
});

test("Strategi AI menampilkan model yang dipakai bila diketahui", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  const strategy = src.slice(src.indexOf('activeTab === "strategy"'));
  assert.match(strategy, /Model yang menulis draf/);
  assert.match(strategy, /formatModelUsed\(modelUsed\)/);
});
