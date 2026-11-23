import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FREE_FEATURES, PRO_FEATURES, PLAN_MODELS, GOLDEN_WINDOW_LABEL } from "../src/lib/planInfo.ts";
import { PLAN_PRICE } from "../src/lib/subscriptionStore.ts";

// ---- halaman harga dan pengaturan AI hanya boleh memuat klaim yang sesuai kode ----------------------------

const here = fileURLToPath(new URL(".", import.meta.url));
const project = join(here, "..", "..");
const read = (rel: string) => readFileSync(join(project, rel), "utf8");

const edgeFn = read("applify-smart-job-applications/supabase/functions/generate-application/index.ts");
const providers = read("applify-smart-job-applications/supabase/functions/_shared/providers.ts");
const workerAi = read("worker/src/lib/ai.ts");
const backendAi = read("backend/services/ai-pipeline.service.ts");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "tests" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const allCopy = JSON.stringify([FREE_FEATURES, PRO_FEATURES, PLAN_MODELS]);

test("tidak ada model atau klaim yang tidak dipakai kode (GPT-4, Ultimate, 90% akurasi, tak terbatas); Claude dan Gemini harus ada di rantai", () => {
  for (const banned of [/gpt-4/i, /ultimate/i, /90%/, /tak terbatas/i]) {
    assert.doesNotMatch(allCopy, banned);
  }
  // Claude dan Gemini sekarang benar-benar dipakai Edge Function (2026-11-19), jadi boleh disebut di planInfo.
  if (/claude/i.test(allCopy)) assert.match(providers, /anthropic:claude-/);
  if (/gemini/i.test(allCopy)) assert.match(providers, /gemini:gemini-/);
  if (/numes/i.test(allCopy)) assert.match(providers, /numes:z-ai\/glm-5\.3-flash:free/);
  const ui = ["subscription.tsx", "index.tsx", "automation-settings.tsx"].map((f) => read(`applify-smart-job-applications/src/routes/${f}`));
  for (const src of ui) {
    assert.doesNotMatch(src, /Claude Sonnet|Sonnet 4\.6|Ultimate|90% akurasi|4× lebih tinggi|Lamaran tak terbatas/);
  }
});

test("model paket Free ada di kode: Claude Sonnet, Claude Haiku, lalu Gemini untuk draf; Gemma, Nemotron, Qwen, Groq sebagai cadangan", () => {
  assert.match(workerAi, /gemma-4-26b-a4b-it:free/);
  assert.match(workerAi, /nemotron-3-super-120b-a12b:free/);
  assert.match(workerAi, /qwen\/qwen3\.8-27b:free/);
  assert.match(workerAi, /api\.groq\.com/);
  assert.match(backendAi, /gemma-4-26b-a4b-it:free/);
  assert.match(backendAi, /nemotron-3-super-120b-a12b:free/);
  assert.match(backendAi, /qwen\/qwen3\.8-27b:free/);
  assert.match(backendAi, /GROQ_MODEL_FALLBACKS/);
  // Edge Function: rantai draf ada di _shared/providers.ts (Claude Sonnet, Claude Haiku, dua model gratis Numes,
  // Gemini, lalu model gratis OpenRouter).
  assert.match(providers, /DEFAULT_FREE_MODELS =\s*"anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5,numes:z-ai\/glm-5\.3-flash:free,numes:deepseek\/deepseek-v4\.1-flash:free,gemini:gemini-3\.5-flash-lite,google\/gemma-4-31b-it:free,openrouter\/free"/);
  assert.match(PLAN_MODELS.free.models[0].name, /Claude Sonnet/);
  assert.match(PLAN_MODELS.free.models[1].name, /Claude Haiku/);
  assert.match(PLAN_MODELS.free.models[2].name, /GLM 5\.3 Flash/);
  assert.match(PLAN_MODELS.free.models[3].name, /DeepSeek V4\.1 Flash/);
  assert.match(PLAN_MODELS.free.models[4].name, /Gemini/);
  assert.match(PLAN_MODELS.free.models[2].name + PLAN_MODELS.free.models[3].name, /Numes[\s\S]*Numes/);

  const names = PLAN_MODELS.free.models.map((m) => m.name).join(" | ");
  for (const word of ["Gemma", "Nemotron", "Qwen", "Groq"]) assert.match(names, new RegExp(word));
  assert.equal(PLAN_MODELS.free.models[0].role, "Utama");
});

test("teks fitur AI paket Free menyebut Claude Sonnet dan Haiku untuk draf, model gratis hanya sebagai cadangan", () => {
  const ai = FREE_FEATURES.find((f) => /^AI Basic/.test(f));
  assert.ok(ai, "ada butir fitur AI Basic");
  assert.match(ai!, /Claude Sonnet/);
  assert.match(ai!, /Haiku/);
  assert.match(ai!, /cadangan/);
  // butir lama (OpenRouter sebagai model utama) sudah tidak benar untuk draf
  assert.doesNotMatch(ai!, /OpenRouter/);
  // Claude yang disebut memang ada di rantai bawaan
  assert.match(providers, /DEFAULT_FREE_MODELS =\s*"anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5/);
});

test("model draf paket Pro ada di kode: Gemini 4 Hydrogen (utama), Argon, lalu Claude (cadangan)", () => {
  assert.match(providers, /DEFAULT_PRO_MODELS =\s*"gemini:gemini-4-hydrogen,gemini:gemini-4-argon,anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5"/);
  assert.doesNotMatch(providers, /DEFAULT_PRO_MODELS =\s*"[^"]*deepseek/);

  const [first, second, third, fourth] = PLAN_MODELS.pro.models;
  assert.match(first.name, /Gemini 4 Hydrogen/);
  assert.equal(first.role, "Utama");
  assert.match(second.name, /Gemini 4 Argon/);
  assert.match(third.name, /Claude Sonnet/);
  assert.match(fourth.name, /Claude Haiku/);
  assert.match(PRO_FEATURES.join(" "), /Gemini 4/);
  assert.doesNotMatch(PRO_FEATURES.join(" "), /DeepSeek/);
});

test("pemilihan paket di kode hanya free/pro, jadi tidak ada panel model untuk paket lain", () => {
  assert.deepEqual(Object.keys(PLAN_MODELS).sort(), ["free", "pro"]);
  assert.match(edgeFn, /ai_model_tier === "pro" \? "pro" : "free"/);
  assert.match(workerAi, /tier === "pro" \? PRO_MODEL : FREE_MODEL/);
});

test("batas lamaran Pro di UI (20 per hari) sama dengan worker; Free 10", () => {
  const quota = read("worker/src/lib/quota.ts");
  assert.match(quota, /free:\s*10,\s*pro:\s*20/);
  assert.ok(PRO_FEATURES.includes("Hingga 20 lamaran per hari"));
  assert.ok(FREE_FEATURES.includes("10 AI Apply per bulan"));
});

test("Golden Window Sniper belum ada di kode, jadi di UI berlabel segera hadir", () => {
  // Bila fitur ini dibuat (kata "golden" muncul di backend atau worker), tes ini gagal supaya labelnya ditinjau.
  const files = [...sourceFiles(join(project, "backend")), ...sourceFiles(join(project, "worker", "src"))];
  const hits = files.filter((f) => /golden/i.test(readFileSync(f, "utf8")));
  assert.deepEqual(hits, []);

  assert.match(GOLDEN_WINDOW_LABEL, /segera hadir/);
  assert.ok(PRO_FEATURES.includes(GOLDEN_WINDOW_LABEL));
  assert.equal(PRO_FEATURES.filter((f) => /Golden Window/.test(f) && !/segera hadir/.test(f)).length, 0);

  const landing = read("applify-smart-job-applications/src/routes/index.tsx");
  assert.match(landing, /badge="Segera hadir"[^>]*title="Golden Window Sniper"/);
  const settings = read("applify-smart-job-applications/src/routes/settings.tsx");
  assert.doesNotMatch(settings, /"Golden Window"/);
});

test("harga tidak berubah: Free gratis, Pro Rp 69.000/bulan, Kampus Rp 50jt/semester", () => {
  assert.deepEqual(PLAN_PRICE.free, { amount: 0, label: "Gratis", period: "selamanya" });
  assert.deepEqual(PLAN_PRICE.pro, { amount: 69000, label: "Rp 69.000", period: "/bulan" });
  assert.deepEqual(PLAN_PRICE.kampus, { amount: 50_000_000, label: "Rp 50jt", period: "/semester" });
  const landing = read("applify-smart-job-applications/src/routes/index.tsx");
  assert.match(landing, /price: "Rp 69\.000", per: "\/bulan"/);
  assert.match(landing, /price: "Rp 50jt", per: "\/semester"/);
});
