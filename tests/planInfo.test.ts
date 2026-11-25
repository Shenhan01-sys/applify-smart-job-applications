import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FREE_FEATURES, PRO_FEATURES, PLAN_MODELS, GOLDEN_WINDOW_LABEL, PLANNED_FEATURES } from "../src/lib/planInfo.ts";
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

test("model paket Free ada di kode: Numes (GLM, DeepSeek), Gemini, Gemma, Nemotron, Qwen, Groq, dan Claude Haiku terakhir", () => {
  assert.match(workerAi, /gemma-4-26b-a4b-it:free/);
  assert.match(workerAi, /nemotron-3-super-120b-a12b:free/);
  assert.match(workerAi, /qwen\/qwen3\.8-27b:free/);
  assert.match(workerAi, /api\.groq\.com/);
  assert.match(backendAi, /gemma-4-26b-a4b-it:free/);
  assert.match(backendAi, /nemotron-3-super-120b-a12b:free/);
  assert.match(backendAi, /qwen\/qwen3\.8-27b:free/);
  assert.match(backendAi, /GROQ_MODEL_FALLBACKS/);
  // Edge Function: rantai draf ada di _shared/providers.ts. Numes dulu, lalu Gemini, model gratis OpenRouter, dan Claude
  // Haiku paling akhir (24 November 2026: pemilik ingin menghemat kredit Anthropic).
  assert.match(providers, /const NUMES_MODELS = "numes:z-ai\/glm-5\.3-flash:free,numes:deepseek\/deepseek-v4\.1-flash:free"/);
  assert.match(providers, /DEFAULT_FREE_MODELS =\s*`\$\{NUMES_MODELS\},gemini:gemini-3\.5-flash-lite,google\/gemma-4-31b-it:free,openrouter\/free,anthropic:claude-haiku-5-5`/);
  const names = PLAN_MODELS.free.models.map((m) => m.name);
  assert.match(names[0], /GLM 5\.3 Flash/);
  assert.match(names[1], /DeepSeek V4\.1 Flash/);
  assert.match(names[0] + names[1], /Numes[\s\S]*Numes/);
  assert.match(names[2], /Gemini/);
  assert.match(names.at(-1)!, /Claude Haiku/);
  assert.equal(PLAN_MODELS.free.models.at(-1)!.role, "Cadangan");
  const all = names.join(" | ");
  for (const word of ["Gemma", "Nemotron", "Qwen", "Groq"]) assert.match(all, new RegExp(word));
  assert.equal(PLAN_MODELS.free.models[0].role, "Utama");
  // Claude hanya di ujung daftar
  assert.equal(names.findIndex((n) => /Claude/.test(n)), names.length - 1);
});

test("teks fitur AI paket Free menyebut model gratis Numes, Gemini, dan OpenRouter; Claude hanya cadangan terakhir", () => {
  const ai = FREE_FEATURES.find((f) => /^AI Basic/.test(f));
  assert.ok(ai, "ada butir fitur AI Basic");
  assert.match(ai!, /Numes/);
  assert.match(ai!, /Gemini/);
  assert.match(ai!, /Claude hanya cadangan terakhir/);
  assert.doesNotMatch(ai!, /Claude Sonnet/);
  // Claude yang disebut memang ada di rantai bawaan, dan paling belakang
  assert.match(providers, /anthropic:claude-haiku-5-5`;?\s*(\/\/|\n)/);
});

test("model draf paket Pro ada di kode: Numes, Gemini 4 Hydrogen dan Argon, lalu Claude (cadangan terakhir)", () => {
  assert.match(providers, /DEFAULT_PRO_MODELS =\s*`\$\{NUMES_MODELS\},gemini:gemini-4-hydrogen,gemini:gemini-4-argon,google\/gemma-4-31b-it:free,openrouter\/free,anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5`/);
  assert.doesNotMatch(providers, /DEFAULT_PRO_MODELS =\s*`[^`]*deepseek-v4-pro/);

  const names = PLAN_MODELS.pro.models.map((m) => m.name);
  assert.match(names[0], /GLM 5\.3 Flash/);
  assert.equal(PLAN_MODELS.pro.models[0].role, "Utama");
  assert.match(names[1], /DeepSeek V4\.1 Flash/);
  assert.match(names[2], /Gemini 4 Hydrogen/);
  assert.match(names[3], /Gemini 4 Argon/);
  assert.match(names[4], /Claude Sonnet/);
  assert.match(names[5], /Claude Haiku/);
  assert.match(PRO_FEATURES.join(" "), /Gemini 4/);
  assert.match(PRO_FEATURES.join(" "), /Claude hanya cadangan terakhir/);
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
  // Golden Window tidak lagi bagian paket berbayar; hanya tercantum sebagai rencana.
  assert.ok(!PRO_FEATURES.includes(GOLDEN_WINDOW_LABEL));
  assert.ok(PLANNED_FEATURES.includes(GOLDEN_WINDOW_LABEL));
  assert.equal(PRO_FEATURES.filter((f) => /Golden Window/.test(f)).length, 0);

  const landing = read("applify-smart-job-applications/src/routes/index.tsx");
  assert.match(landing, /badge="Segera hadir"[^>]*title="Golden Window Sniper"/);
  // Daftar rencana tampil terpisah dari fitur paket di beranda dan halaman langganan.
  assert.match(landing, /Rencana, belum tersedia:/);
  const subscriptionPage = read("applify-smart-job-applications/src/routes/subscription.tsx");
  assert.match(subscriptionPage, /Rencana, belum tersedia:/);
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
