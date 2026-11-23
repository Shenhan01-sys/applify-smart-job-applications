import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  chatBody,
  DEFAULT_FREE_MODELS,
  DEFAULT_PRO_MODELS,
  DEFAULT_AI_CALL_TIMEOUT_MS,
  DEFAULT_AI_TOTAL_BUDGET_MS,
  MIN_AI_CALL_MS,
  nextCallTimeoutMs,
  positiveMs,
  parseModelList,
  resolveChain,
  resolveModel,
} from "../supabase/functions/_shared/providers.ts";

// ---- penyedia model Edge Function: Gemini, Anthropic, dan OpenRouter dalam satu rantai ----------------

const ALL = { openrouter: "or-key", gemini: "g-key", anthropic: "a-key", numes: "n-key" };

test("penyedia: awalan gemini: dan anthropic: diarahkan ke endpoint masing-masing, sisanya ke OpenRouter", () => {
  const g = resolveModel("gemini:gemini-3.5-flash-lite", ALL)!;
  assert.equal(g.provider, "gemini");
  assert.equal(g.model, "gemini-3.5-flash-lite");
  assert.match(g.url, /generativelanguage\.googleapis\.com\/v1beta\/openai\/chat\/completions$/);
  assert.equal(g.headers.Authorization, "Bearer g-key");

  const a = resolveModel("anthropic:claude-haiku-5-5", ALL)!;
  assert.equal(a.provider, "anthropic");
  assert.equal(a.model, "claude-haiku-5-5");
  assert.match(a.url, /api\.anthropic\.com\/v1\/chat\/completions$/);

  const o = resolveModel("deepseek/deepseek-v4-pro", ALL)!;
  assert.equal(o.provider, "openrouter");
  assert.equal(o.model, "deepseek/deepseek-v4-pro");
  assert.equal(o.headers["X-Title"], "Applify");
});

test("penyedia: awalan numes: diarahkan ke Numes, nama model utuh (memuat / dan :) dan badan permintaan seperti OpenAI", () => {
  const n = resolveModel("numes:z-ai/glm-5.3-flash:free", ALL)!;
  assert.equal(n.provider, "numes");
  assert.equal(n.entry, "numes:z-ai/glm-5.3-flash:free");
  assert.equal(n.model, "z-ai/glm-5.3-flash:free");
  assert.equal(n.url, "https://api.numes.ai/api/v1/chat/completions");
  assert.equal(n.headers.Authorization, "Bearer n-key");
  assert.equal(n.headers["Content-Type"], "application/json");
  assert.equal(n.headers["X-Title"], undefined, "header khusus OpenRouter tidak ikut");

  const d = resolveModel("numes:deepseek/deepseek-v4.1-flash:free", ALL)!;
  assert.equal(d.provider, "numes");
  assert.equal(d.model, "deepseek/deepseek-v4.1-flash:free");

  // hanya awalan pertama yang menjadi penyedia; nama tanpa awalan tetap ke OpenRouter
  assert.equal(resolveModel("numes:numes:x/y:free", ALL)!.model, "numes:x/y:free");
  assert.equal(resolveModel("z-ai/glm-5.3-flash:free", ALL)!.provider, "openrouter");

  // badan: temperature dipertahankan (tidak seperti Claude)
  const body = chatBody(n, [{ role: "user", content: "hai" }], { temperature: 0.6, maxTokens: 1600 });
  assert.deepEqual(body, { model: "z-ai/glm-5.3-flash:free", messages: [{ role: "user", content: "hai" }], temperature: 0.6, max_tokens: 1600 });
});

test("penyedia: entri Numes dilewati tanpa NUMES_API_KEY dan dipakai bila kuncinya ada", () => {
  const chain = ["numes:z-ai/glm-5.3-flash:free", "gemini:gemini-3.5-flash-lite"];
  assert.deepEqual(resolveChain(chain, { gemini: "g-key" }).map((c) => c.entry), ["gemini:gemini-3.5-flash-lite"]);
  assert.deepEqual(resolveChain(chain, { gemini: "g-key", numes: "" }).map((c) => c.provider), ["gemini"]);
  assert.deepEqual(resolveChain(chain, { gemini: "g-key", numes: "n-key" }).map((c) => c.provider), ["numes", "gemini"]);
  assert.equal(resolveModel("numes:z-ai/glm-5.3-flash:free", { openrouter: "or-key" }), null);
});

test("penyedia: entri tanpa kunci dilewati dan urutan rantai dipertahankan", () => {
  // Tanpa ANTHROPIC_API_KEY dan NUMES_API_KEY, entri Claude dan Numes di awal rantai Free dilewati.
  const chain = resolveChain(parseModelList(undefined, DEFAULT_FREE_MODELS), { openrouter: "or-key", gemini: "g-key" });
  assert.deepEqual(chain.map((c) => c.provider), ["gemini", "openrouter", "openrouter"]);
  assert.equal(resolveChain(["anthropic:claude-haiku-5-5"], {}).length, 0);
});

test("penyedia: rantai bawaan Free diawali Claude Sonnet 5.5 lalu Haiku 5.5, Pro diawali Gemini 4", () => {
  const free = parseModelList("", DEFAULT_FREE_MODELS);
  assert.deepEqual(free.slice(0, 2), ["anthropic:claude-sonnet-5-5", "anthropic:claude-haiku-5-5"]);
  assert.deepEqual(free.slice(2, 4), ["numes:z-ai/glm-5.3-flash:free", "numes:deepseek/deepseek-v4.1-flash:free"]);
  assert.equal(free[4], "gemini:gemini-3.5-flash-lite");
  assert.deepEqual(free.slice(5), ["google/gemma-4-31b-it:free", "openrouter/free"]);
  const withAll = resolveChain(free, ALL);
  assert.deepEqual(withAll.map((c) => c.provider), ["anthropic", "anthropic", "numes", "numes", "gemini", "openrouter", "openrouter"]);
  // tanpa kunci Claude, rantai langsung mulai dari Numes
  const noClaude = resolveChain(free, { openrouter: "or-key", gemini: "g-key", numes: "n-key" });
  assert.deepEqual(noClaude.map((c) => c.provider), ["numes", "numes", "gemini", "openrouter", "openrouter"]);
  assert.equal(parseModelList(undefined, DEFAULT_PRO_MODELS)[0], "gemini:gemini-4-hydrogen");
  assert.deepEqual(parseModelList(" a , b ,, ", "x"), ["a", "b"]);
});

test("Edge Function memakai rantai penyedia dan batas waktu per panggilan yang dibatasi sisa anggaran total", () => {
  const src = readFileSync(new URL("../supabase/functions/generate-application/index.ts", import.meta.url), "utf8");
  assert.match(src, /from "\.\.\/_shared\/providers\.ts"/);
  assert.match(src, /AbortSignal\.timeout\(callTimeoutMs\)/);
  assert.doesNotMatch(src, /AbortSignal\.timeout\(AI_CALL_TIMEOUT_MS\)/);
  assert.doesNotMatch(src, /fetch\("https:\/\/openrouter\.ai/);
  // kunci Numes dibaca dari secret yang sama dengan penyedia lain
  assert.match(src, /numes: Deno\.env\.get\("NUMES_API_KEY"\) \?\? ""/);
});

test("generate-application mencatat hasil tiap kandidat model tanpa isi surat", () => {
  const src = readFileSync(new URL("../supabase/functions/generate-application/index.ts", import.meta.url), "utf8");
  for (const outcome of ["http_${aiResp.status}", '"empty"', '"accepted"', '"bad_json"', "rejected ${why"]) {
    assert.ok(src.includes(`note(${outcome.startsWith('"') ? outcome : "`" + outcome}`), `tidak ada catatan untuk ${outcome}`);
  }
  assert.match(src, /console\.warn\(`\[generate-application\] \$\{entry\.model\} \$\{entry\.outcome\} \$\{entry\.ms\}ms`\)/);
  assert.match(src, /attempts, models:/);
});

test("chatBody: Claude tanpa temperature dan max_tokens minimal 8000, penyedia lain tetap", () => {
  const msgs = [{ role: "user", content: "hai" }];
  const claude = chatBody({ provider: "anthropic", model: "claude-haiku-5-5" }, msgs, { temperature: 0.6, maxTokens: 1600 });
  assert.equal("temperature" in claude, false);
  assert.equal(claude.max_tokens, 8000);
  const gemini = chatBody({ provider: "gemini", model: "gemini-3.5-flash-lite" }, msgs, { temperature: 0.6, maxTokens: 1600 });
  assert.equal(gemini.temperature, 0.6);
  assert.equal(gemini.max_tokens, 1600);
  const src = readFileSync(new URL("../supabase/functions/generate-application/index.ts", import.meta.url), "utf8");
  // Sejak BYOK (23 Nov 2026) badan dibuat requestBody (_shared/byok.ts), yang memanggil chatBody untuk format OpenAI.
  assert.match(src, /requestBody\(candidate,/);
  assert.doesNotMatch(src, /temperature: 0\.6,\s*max_tokens/);
});

test("model draf disimpan di ai_applications.model_used dan dibaca lagi saat modal dibuka", () => {
  const fn = readFileSync(new URL("../supabase/functions/generate-application/index.ts", import.meta.url), "utf8");
  assert.match(fn, /status: "draft",[\s\S]{0,200}model_used: modelUsed/);
  const modal = readFileSync(new URL("../src/components/AIApplyModal.tsx", import.meta.url), "utf8");
  assert.match(modal, /if \(app\.model_used\) setModelUsed\(app\.model_used\)/);
  const mig = readFileSync(new URL("../../database/migrations/2026-11-19_ai_applications_model_used.sql", import.meta.url), "utf8");
  assert.match(mig, /add column if not exists model_used text/);
});

// ---- batas waktu rantai (uji E2E klik 20 November 2026, temuan 13) -------------------------------------------

test("nextCallTimeoutMs: satu panggilan paling lama perCallMs, dan tidak pernah melewati sisa anggaran", () => {
  const base = { perCallMs: 20_000, totalBudgetMs: 34_000 };
  assert.equal(nextCallTimeoutMs({ ...base, elapsedMs: 1_000 }), 20_000);
  // sisa 12 detik < batas per panggilan: dipotong ke sisa
  assert.equal(nextCallTimeoutMs({ ...base, elapsedMs: 22_000 }), 12_000);
  // tepat di ambang minimum masih jalan; di bawahnya berhenti
  assert.equal(nextCallTimeoutMs({ ...base, elapsedMs: 34_000 - MIN_AI_CALL_MS }), MIN_AI_CALL_MS);
  assert.equal(nextCallTimeoutMs({ ...base, elapsedMs: 34_000 - MIN_AI_CALL_MS + 1 }), 0);
  assert.equal(nextCallTimeoutMs({ ...base, elapsedMs: 34_000 }), 0);
  assert.equal(nextCallTimeoutMs({ ...base, elapsedMs: 90_000 }), 0);
  assert.equal(nextCallTimeoutMs({ ...base, elapsedMs: 10_000, minCallMs: 30_000 }), 0);
  assert.equal(nextCallTimeoutMs({ ...base, elapsedMs: Number.NaN }), 0);
});

test("rantai yang semuanya lambat berhenti dalam anggaran, bukan jumlah model dikali batas per panggilan", () => {
  // Tiruan rantai: setiap model memakai seluruh batas waktunya lalu gagal.
  let elapsed = 1_500; // auth, kuota, dan konteks sebelum panggilan pertama
  let calls = 0;
  for (let i = 0; i < 4; i++) {
    const timeout = nextCallTimeoutMs({ perCallMs: DEFAULT_AI_CALL_TIMEOUT_MS, totalBudgetMs: DEFAULT_AI_TOTAL_BUDGET_MS, elapsedMs: elapsed });
    if (timeout === 0) break;
    calls += 1;
    elapsed += timeout;
  }
  assert.ok(calls >= 2, "sedikitnya satu cadangan sempat dicoba");
  assert.ok(elapsed <= DEFAULT_AI_TOTAL_BUDGET_MS, `rantai selesai pada ${elapsed} ms`);
});

test("positiveMs: angka dari secret dipakai, kosong atau tidak valid kembali ke bawaan", () => {
  assert.equal(positiveMs("15000", 20_000), 15_000);
  assert.equal(positiveMs(undefined, 20_000), 20_000);
  assert.equal(positiveMs("", 20_000), 20_000);
  assert.equal(positiveMs("abc", 20_000), 20_000);
  assert.equal(positiveMs("0", 20_000), 20_000);
  assert.equal(positiveMs("-5", 20_000), 20_000);
});

test("Edge Function: anggaran total dihitung sejak permintaan masuk, rantai berhenti saat habis, auth tidak berubah", () => {
  const src = readFileSync(new URL("../supabase/functions/generate-application/index.ts", import.meta.url), "utf8");
  assert.match(src, /const requestStarted = Date\.now\(\);\s*if \(req\.method === "OPTIONS"\)/);
  assert.match(src, /AI_TOTAL_BUDGET_MS = positiveMs\(Deno\.env\.get\("AI_TOTAL_BUDGET_MS"\), DEFAULT_AI_TOTAL_BUDGET_MS\)/);
  assert.match(src, /AI_CALL_TIMEOUT_MS = positiveMs\(Deno\.env\.get\("AI_CALL_TIMEOUT_MS"\), DEFAULT_AI_CALL_TIMEOUT_MS\)/);
  assert.match(src, /elapsedMs: started - requestStarted/);
  // Sejak BYOK (23 Nov 2026) loop berjalan atas `chain` (rantai BYOK lalu rantai paket), bukan `models`.
  const loop = src.slice(src.indexOf("for (const candidate of chain)"), src.indexOf("if (!parsed && soft)"));
  assert.ok(src.indexOf("for (const candidate of chain)") > 0);
  assert.match(loop, /if \(callTimeoutMs === 0\) \{[\s\S]{0,260}break;/);
  assert.match(loop, /note\("skipped time_budget", started\)/);
  // galat tetap 502 "AI generation failed" (describeError di klien menerjemahkannya), dengan penanda anggaran
  assert.match(src, /error: "AI generation failed"[^;]*budgetExhausted[^;]*\}, 502\)/);
  // verifikasi pemanggil di dalam fungsi tidak disentuh
  assert.match(src, /admin\.auth\.getUser\(token\)/);
  assert.match(src, /Missing auth token/);
  assert.equal(MIN_AI_CALL_MS < DEFAULT_AI_CALL_TIMEOUT_MS && DEFAULT_AI_CALL_TIMEOUT_MS < DEFAULT_AI_TOTAL_BUDGET_MS, true);
});
