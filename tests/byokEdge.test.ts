// BYOK di Edge Function generate-application: dekripsi key pengguna (WebCrypto) harus cocok dengan enkripsi
// backend (node:crypto, AES-256-GCM, base64(iv|tag|ct), AAD user+provider), rantai BYOK hanya memakai key
// pengguna dan preset terverifikasi, dua format adapter (OpenAI Chat Completions dan Anthropic Messages)
// dibaca benar, dan kuota bulanan hanya dipotong bila key Applify yang menulis draf.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import {
  byokAad,
  byokChain,
  byokEnabled,
  byokRateDecision,
  combinedChain,
  decryptByokKey,
  isAuthFailure,
  loadByokKeys,
  readCompletion,
  redactSecrets,
  requestBody,
} from "../supabase/functions/_shared/byok.ts";
import { BYOK_PRESETS, byokPreset } from "../supabase/functions/_shared/byok-providers.ts";
import { chatBody, resolveChain, resolveModel } from "../supabase/functions/_shared/providers.ts";

const SECRET = "test-secret-0123456789-abcdefghijklmnop"; // 38 karakter, bukan secret sungguhan
const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const ANTHROPIC_KEY = "sk-ant-test-" + "a".repeat(40);
const OPENAI_KEY = "sk-proj-test-" + "b".repeat(40);

/** Salinan cara backend mengenkripsi (backend/services/byok-crypto.ts). */
function backendEncrypt(plain: string, secret: string, userId: string, provider: string): string {
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(byokAad(userId, provider)));
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}

test("byok: ciphertext backend didekripsi WebCrypto edge dengan hasil sama", async () => {
  const b64 = backendEncrypt(ANTHROPIC_KEY, SECRET, USER, "anthropic");
  assert.equal(await decryptByokKey(b64, SECRET, { userId: USER, provider: "anthropic" }), ANTHROPIC_KEY);
});

test("byok: AAD mengikat baris, ciphertext pengguna lain atau penyedia lain ditolak", async () => {
  const b64 = backendEncrypt(ANTHROPIC_KEY, SECRET, USER, "anthropic");
  await assert.rejects(decryptByokKey(b64, SECRET, { userId: OTHER, provider: "anthropic" }));
  await assert.rejects(decryptByokKey(b64, SECRET, { userId: USER, provider: "openai" }));
  await assert.rejects(decryptByokKey(b64, SECRET + "x", { userId: USER, provider: "anthropic" }));
});

test("byok: secret kosong atau pendek gagal tertutup", async () => {
  const b64 = backendEncrypt(ANTHROPIC_KEY, SECRET, USER, "anthropic");
  await assert.rejects(decryptByokKey(b64, "", { userId: USER, provider: "anthropic" }), /byok_secret_missing/);
  await assert.rejects(decryptByokKey(b64, "short", { userId: USER, provider: "anthropic" }), /byok_secret_missing/);
});

test("preset: hanya https, id unik, preset belum terverifikasi tidak bisa dipakai", () => {
  const ids = BYOK_PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.slice(0, 2), ["openai", "anthropic"]);
  for (const p of BYOK_PRESETS) {
    if (p.verified) assert.match(p.url, /^https:\/\/[a-z0-9.-]+\//, p.id);
    else assert.equal(byokPreset(p.id), null, p.id);
  }
  assert.equal(byokPreset("http-evil"), null);
});

test("byok: loadByokKeys melewati status invalid, penyedia asing, dan baris rusak; urutan preset", async () => {
  const rows = [
    { provider: "anthropic", key_encrypted: backendEncrypt(ANTHROPIC_KEY, SECRET, USER, "anthropic"), status: "valid", model: null },
    { provider: "openai", key_encrypted: backendEncrypt(OPENAI_KEY, SECRET, USER, "openai"), status: "valid", model: "model-pilihan" },
    { provider: "gemini", key_encrypted: backendEncrypt("AIza" + "c".repeat(35), SECRET, OTHER, "gemini"), status: "valid" },
    { provider: "openrouter", key_encrypted: backendEncrypt("sk-or-" + "d".repeat(40), SECRET, USER, "openrouter"), status: "invalid" },
    { provider: "evil", key_encrypted: "AAAA", status: "valid" },
  ];
  const { creds, failed } = await loadByokKeys(rows, SECRET, USER);
  assert.deepEqual(creds.map((c) => c.provider), ["openai", "anthropic"]);
  assert.equal(creds[0].model, "model-pilihan");
  assert.equal(creds[1].key, ANTHROPIC_KEY);
  assert.equal(creds[1].keyEncrypted, rows[0].key_encrypted);
  assert.deepEqual(failed, ["gemini"]);
  assert.deepEqual(await loadByokKeys(null, SECRET, USER), { creds: [], failed: [] });
  // Model dengan karakter aneh diabaikan, tidak dikirim ke penyedia.
  const bad = await loadByokKeys([{ ...rows[1], model: "x\ny" }], SECRET, USER);
  assert.equal(bad.creds[0].model, undefined);
});

test("byok: rantai memakai key pengguna, model pilihan dulu, header per format", () => {
  const chain = byokChain([
    { provider: "openai", key: OPENAI_KEY, model: "model-pilihan" },
    { provider: "anthropic", key: ANTHROPIC_KEY },
  ]);
  assert.deepEqual(chain.map((c) => c.entry), [
    "byok:openai:model-pilihan",
    "byok:anthropic:claude-sonnet-5-5",
    "byok:anthropic:claude-haiku-5-5",
  ]);
  assert.ok(chain.every((c) => c.source === "byok"));
  assert.equal(chain[0].headers.Authorization, `Bearer ${OPENAI_KEY}`);
  assert.equal(chain[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(chain[1].format, "anthropic");
  assert.equal(chain[1].url, "https://api.anthropic.com/v1/messages");
  assert.equal(chain[1].headers["x-api-key"], ANTHROPIC_KEY);
  assert.equal(chain[1].headers["anthropic-version"], "2023-06-01");
  assert.equal("Authorization" in chain[1].headers, false);
  // OpenAI tanpa model pilihan: tidak ada model bawaan, jadi tidak ada target.
  assert.deepEqual(byokChain([{ provider: "openai", key: OPENAI_KEY }]), []);
  // Preset belum terverifikasi dilewati.
  assert.deepEqual(byokChain([{ provider: "qwen", key: "x".repeat(30), model: "m" }]), []);
  // CrowLLM tanpa model bawaan: hanya model pilihan pengguna.
  assert.deepEqual(byokChain([{ provider: "crowllm", key: "x".repeat(30) }]), []);
  assert.deepEqual(byokChain([{ provider: "crowllm", key: "x".repeat(30), model: "deepseek-v4-flash" }]).map((c) => c.url), ["https://crowllm.com/v1/chat/completions"]);
});

test("preset: sama dengan registry backend (id, format, verified, host)", () => {
  const be = readFileSync(new URL("../../backend/services/byok-providers.ts", import.meta.url), "utf8");
  const beIds = [...be.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...beIds].sort(), BYOK_PRESETS.map((p) => p.id).sort());
  for (const p of BYOK_PRESETS) {
    const block = be.slice(be.indexOf(`id: '${p.id}'`)).split(/\n  \{|\n  \/\/ |\n\]/)[0];
    assert.match(block, new RegExp(`format: '${p.format}'`), p.id);
    assert.match(block, new RegExp(`verified: ${p.verified}`), p.id);
    if (p.verified) assert.ok(block.includes(`baseUrl: '${new URL(p.url).origin}`), p.id);
  }
});

test("adapter: badan Anthropic Messages memisahkan system, OpenAI tetap lewat chatBody", () => {
  const msgs = [{ role: "system", content: "S" }, { role: "user", content: "U" }];
  const a = requestBody({ provider: "anthropic", model: "claude-haiku-5-5", format: "anthropic" }, msgs, { temperature: 0.6, maxTokens: 1600 });
  assert.deepEqual(a, { model: "claude-haiku-5-5", max_tokens: 8000, system: "S", messages: [{ role: "user", content: "U" }] });
  const o = requestBody({ provider: "openai", model: "m", format: "openai" }, msgs, { temperature: 0.6, maxTokens: 1600 });
  assert.equal(o.max_completion_tokens, 8000);
  assert.equal("temperature" in o, false);
  const d = requestBody({ provider: "deepseek", model: "m", format: "openai" }, msgs, { temperature: 0.6, maxTokens: 1600 });
  assert.deepEqual(d, { model: "m", messages: msgs, temperature: 0.6, max_tokens: 1600 });
});

test("adapter: readCompletion membaca kedua format", () => {
  assert.deepEqual(
    readCompletion("anthropic", { model: "claude-x", stop_reason: "end_turn", content: [{ type: "thinking", thinking: "..." }, { type: "text", text: "Halo" }, { type: "text", text: " dunia" }] }),
    { text: "Halo dunia", model: "claude-x", finish: "end_turn" },
  );
  assert.deepEqual(
    readCompletion("openai", { model: "m", choices: [{ message: { content: "Hai" }, finish_reason: "stop" }] }),
    { text: "Hai", model: "m", finish: "stop" },
  );
  assert.equal(readCompletion("anthropic", {}).text, "");
  assert.equal(readCompletion("openai", null).text, "");
});

test("providers: openai: dikenali dan memakai max_completion_tokens tanpa temperature", () => {
  const o = resolveModel("openai:x", { openai: "k" })!;
  assert.equal(o.provider, "openai");
  const body = chatBody(o, [{ role: "user", content: "hai" }], { temperature: 0.6, maxTokens: 1600 });
  assert.equal("temperature" in body, false);
  assert.equal("max_tokens" in body, false);
  assert.equal(body.max_completion_tokens, 8000);
  assert.deepEqual(resolveChain(["openai:x"], { openrouter: "or" }), []);
});

test("byok: rantai Applify hanya ikut bila kuota masih ada atau mode analyze", () => {
  const byok = byokChain([{ provider: "anthropic", key: ANTHROPIC_KEY }]);
  const applify = resolveChain(["gemini:gemini-3.5-flash-lite"], { gemini: "applify-g" });
  const withQuota = combinedChain({ byok, applify, quotaRemaining: 3, mode: "generate" });
  assert.deepEqual(withQuota.map((c) => c.source), ["byok", "byok", "applify"]);
  assert.equal(withQuota[2].format, "openai");
  const noQuota = combinedChain({ byok, applify, quotaRemaining: 0, mode: "generate" });
  assert.deepEqual(noQuota.map((c) => c.source), ["byok", "byok"]);
  const analyze = combinedChain({ byok: [], applify, quotaRemaining: 0, mode: "analyze" });
  assert.deepEqual(analyze.map((c) => c.source), ["applify"]);
});

test("byok: batas laju per jam", () => {
  assert.deepEqual(byokRateDecision({ recentCount: 29, limitPerHour: 30 }), { allowed: true });
  assert.deepEqual(byokRateDecision({ recentCount: null, limitPerHour: 30 }), { allowed: true });
  assert.equal(byokRateDecision({ recentCount: 30, limitPerHour: 30 }).allowed, false);
});

test("byok: flag, status auth, dan penyamaran key di teks galat", () => {
  assert.equal(byokEnabled("true"), true);
  assert.equal(byokEnabled("1"), false);
  assert.equal(byokEnabled(undefined), false);
  assert.equal(isAuthFailure(401), true);
  assert.equal(isAuthFailure(403), false);
  assert.equal(isAuthFailure(429), false);
  const msg = `Incorrect API key provided: ${ANTHROPIC_KEY}. Also ${ANTHROPIC_KEY.slice(-8)} at the end.`;
  const red = redactSecrets(msg, [ANTHROPIC_KEY]);
  assert.equal(red.includes(ANTHROPIC_KEY), false);
  assert.equal(red.includes(ANTHROPIC_KEY.slice(-8)), false);
  assert.equal(redactSecrets("no secret here", [undefined, "short"]), "no secret here");
});

test("generate-application: BYOK di balik flag, kuota hanya dipotong bila key Applify yang menulis", () => {
  const src = readFileSync(new URL("../supabase/functions/generate-application/index.ts", import.meta.url), "utf8");
  assert.match(src, /byokEnabled\(Deno\.env\.get\("BYOK_ENABLED"\)\)/);
  assert.match(src, /Deno\.env\.get\("BYOK_ENCRYPTION_KEY"\)/);
  assert.match(src, /if \(BYOK_ON\) \{/);
  assert.match(src, /\.from\("user_llm_keys"\)\.select\("provider, key_encrypted, status, model"\)\.eq\("user_id", userId\)/);
  assert.match(src, /if \(mode !== "analyze" && keySource === "applify"\) \{\s*const \{ data: q, error: qErr \} = await admin\.rpc\("consume_monthly_apply"/);
  assert.match(src, /quota\.remaining <= 0 && byokTargets\.length === 0/);
  assert.match(src, /redactSecrets\(await aiResp\.text\(\), byokSecrets\)\.slice\(0, 300\)/);
  assert.match(src, /redirect: candidate\.source === "byok" \? "manual" : "follow"/);
  assert.match(src, /if \(keyErr\) return json\([^;]*byok_lookup_failed[^;]*503\)/);
  assert.match(src, /const decision = countErr\s*\? \{ allowed: false \}/);
  assert.match(src, /\.eq\("provider", candidate\.provider\)\.eq\("key_encrypted", candidate\.keyEncrypted \?\? ""\)/);
  assert.match(src, /for \(const \[index, candidate\] of chain\.entries\(\)\)/);
  assert.match(src, /requestBody\(candidate, \[/);
  assert.match(src, /readCompletion\(candidate\.format, aiJson\)/);
  // Key tidak pernah masuk console.
  assert.equal(/console\.\w+\([^)]*byokSecrets/.test(src), false);
  assert.equal(/console\.\w+\([^)]*creds/.test(src), false);
});
