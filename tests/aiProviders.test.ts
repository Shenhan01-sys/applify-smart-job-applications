import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_FREE_MODELS,
  DEFAULT_PRO_MODELS,
  parseModelList,
  resolveChain,
  resolveModel,
} from "../supabase/functions/_shared/providers.ts";

// ---- penyedia model Edge Function: Gemini, Anthropic, dan OpenRouter dalam satu rantai ----------------

const ALL = { openrouter: "or-key", gemini: "g-key", anthropic: "a-key" };

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

test("penyedia: entri tanpa kunci dilewati dan urutan rantai dipertahankan", () => {
  const chain = resolveChain(parseModelList(undefined, DEFAULT_FREE_MODELS), { openrouter: "or-key", gemini: "g-key" });
  assert.deepEqual(chain.map((c) => c.provider), ["gemini", "openrouter", "openrouter"]);
  assert.equal(resolveChain(["anthropic:claude-haiku-5-5"], {}).length, 0);
});

test("penyedia: rantai bawaan Free diawali Gemini lalu Claude, Pro diawali Gemini 4", () => {
  const free = parseModelList("", DEFAULT_FREE_MODELS);
  assert.equal(free[0].startsWith("gemini:"), true);
  assert.equal(free[1].startsWith("anthropic:"), true);
  assert.equal(parseModelList(undefined, DEFAULT_PRO_MODELS)[0], "gemini:gemini-4-hydrogen");
  assert.deepEqual(parseModelList(" a , b ,, ", "x"), ["a", "b"]);
});

test("Edge Function memakai rantai penyedia dan batas waktu per panggilan", () => {
  const src = readFileSync(new URL("../supabase/functions/generate-application/index.ts", import.meta.url), "utf8");
  assert.match(src, /from "\.\.\/_shared\/providers\.ts"/);
  assert.match(src, /AbortSignal\.timeout\(AI_CALL_TIMEOUT_MS\)/);
  assert.doesNotMatch(src, /fetch\("https:\/\/openrouter\.ai/);
});
