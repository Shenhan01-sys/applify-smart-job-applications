import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError } from "../src/lib/apiErrors.ts";
import {
  KEY_MAX_LENGTH,
  KEY_MIN_LENGTH,
  LLM_KEY_STATUS_LABEL,
  LLM_KEYS_DISABLED_TEXT,
  LLM_KEYS_QUOTA_NOTE,
  LLM_KEYS_STORAGE_NOTE,
  LLM_MODEL_HINT,
  LLM_MODEL_REQUIRED_HINT,
  LLM_PROVIDERS,
  LLM_PROVIDER_IDS,
  MODEL_MAX_LENGTH,
  canSaveLlmKey,
  describeLlmKeyApiError,
  describeLlmKeyError,
  describeTestResult,
  formatKeyDate,
  isLlmProvider,
  isVerifiedProvider,
  llmConsentText,
  llmKeyView,
  llmModelLabel,
  maskLast4,
  parseDeleteResponse,
  parseLlmKeyRow,
  parseLlmKeysResponse,
  parseSaveResponse,
  parseTestResponse,
  precheckLlmKey,
  precheckLlmModel,
  providerInfo,
  removeKey,
  upsertKey,
  visibleProviders,
  type LlmKeyRow,
} from "../src/lib/llmKeys.ts";
import { mockDeleteKey, mockLlmKeysResponse, mockSaveKey, mockTestKey } from "../src/mocks/llmKeysMock.ts";

// Kunci palsu yang dirakit di tempat, bukan kunci sungguhan.
const fake = (prefix: string, total = 40) => prefix + "a1B2".repeat(Math.ceil(total / 4)).slice(0, total - prefix.length);
const body = (o: unknown) => JSON.stringify(o);

const row = (provider: LlmKeyRow["provider"], over: Partial<LlmKeyRow> = {}): LlmKeyRow => ({
  provider,
  last4: "wxyz",
  status: "valid",
  lastValidatedAt: "2026-11-23T10:00:00.000Z",
  updatedAt: "2026-11-23T10:00:00.000Z",
  model: null,
  ...over,
});

const verifiedIds = LLM_PROVIDERS.filter((p) => p.verified).map((p) => p.id);
const unverified = LLM_PROVIDERS.find((p) => !p.verified);

test("registri: 11 id tetap, OpenAI dan Anthropic paling depan, keempat penyedia awal sudah verified", () => {
  assert.equal(LLM_PROVIDERS.length, 11);
  assert.equal(new Set(LLM_PROVIDER_IDS).size, 11, "id unik");
  assert.deepEqual(LLM_PROVIDER_IDS.slice(0, 2), ["openai", "anthropic"]);
  for (const id of ["openai", "anthropic", "gemini", "openrouter"] as const) {
    assert.equal(providerInfo(id).verified, true, id);
  }
  for (const id of ["deepseek", "moonshot", "zhipu", "qwen", "mimo", "numes", "crowllm"]) {
    assert.equal(isLlmProvider(id), true, `${id} ada di registri`);
  }
  assert.deepEqual([...LLM_PROVIDER_IDS], LLM_PROVIDERS.map((p) => p.id));
});

test("registri: sesudah pemeriksaan dokumen, tujuh penyedia baru terbuka kecuali zhipu dan qwen yang tetap Segera hadir", () => {
  for (const id of ["deepseek", "moonshot", "mimo", "numes", "crowllm"] as const) {
    const p = providerInfo(id);
    assert.equal(p.verified, true, id);
    assert.ok(p.baseUrl.startsWith("https://") && p.validate.url.startsWith("https://"), id);
    // belum ada halaman konsol yang terverifikasi: tautan "Dapatkan kunci" disembunyikan
    assert.equal(p.keyUrl, "", `${id}: keyUrl kosong`);
  }
  for (const id of ["zhipu", "qwen"] as const) {
    assert.equal(providerInfo(id).verified, false, id);
    assert.equal(providerInfo(id).baseUrl, "", id);
  }
  assert.equal(providerInfo("moonshot").label, "Moonshot AI (Kimi, platform internasional)");
  assert.equal(providerInfo("mimo").label, "Xiaomi MiMo");
});

test("registri: requiresModel hanya untuk openai dan crowllm", () => {
  const required = LLM_PROVIDERS.filter((p) => p.requiresModel === true).map((p) => p.id);
  assert.deepEqual(required.sort(), ["crowllm", "openai"]);
});

test("registri: penyedia verified punya alamat https penuh; tautan pembuat kunci https bila ada; label dan format terisi", () => {
  assert.equal(providerInfo("anthropic").keyUrl, "https://console.anthropic.com/settings/keys");
  assert.equal(providerInfo("openai").keyUrl, "https://platform.openai.com/api-keys");
  assert.equal(providerInfo("gemini").keyUrl, "https://aistudio.google.com/apikey");
  assert.equal(providerInfo("openrouter").keyUrl, "https://openrouter.ai/keys");
  for (const p of LLM_PROVIDERS) {
    assert.ok(p.label.length > 0, p.id);
    assert.ok(p.format === "openai" || p.format === "anthropic", p.id);
    assert.ok(["bearer", "x-api-key", "x-goog-api-key"].includes(p.validate.headerStyle), p.id);
    if (p.keyUrl) {
      assert.ok(p.keyUrl.startsWith("https://"), `${p.id}: ${p.keyUrl}`);
      assert.ok(p.keyUrlLabel.length > 0 && p.keyUrl.includes(p.keyUrlLabel), `${p.id}: nama situs sama dengan alamat`);
    } else {
      assert.equal(p.keyUrlLabel, "", `${p.id}: tanpa tautan, tanpa nama situs`);
    }
    if (!p.verified) continue;
    for (const url of [p.baseUrl, p.validate.url]) assert.ok(url.startsWith("https://"), `${p.id}: ${url}`);
  }
  assert.equal(isLlmProvider("azure"), false);
  assert.equal(isLlmProvider(undefined), false);
});

/** Bidang satu penyedia dibaca dari teks registri backend (services/byok-providers.ts), tanpa mengimpornya. */
function backendRegistry(): Map<string, Record<string, unknown>> {
  const src = readFileSync(new URL("../../backend/services/byok-providers.ts", import.meta.url), "utf8");
  const start = src.indexOf("const REGISTRY = [");
  const end = src.indexOf("] as const satisfies", start);
  assert.ok(start > 0 && end > start, "daftar REGISTRY ditemukan di berkas backend");
  const body = src.slice(start, end).replace(/^\s*\/\/.*$/gm, ""); // komentar satu baris dibuang
  const marks = [...body.matchAll(/\bid: '([a-z0-9-]+)'/g)];
  const out = new Map<string, Record<string, unknown>>();
  for (const [i, m] of marks.entries()) {
    const block = body.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : body.length);
    const validate = block.match(/validate: \{ url: '([^']*)', headerStyle: '([^']*)' \}/);
    out.set(m[1], {
      label: block.match(/label: '([^']*)'/)?.[1],
      format: block.match(/format: '([^']*)'/)?.[1],
      baseUrl: block.match(/baseUrl: '([^']*)'/)?.[1],
      validateUrl: validate?.[1],
      headerStyle: validate?.[2],
      keyPrefix: block.match(/keyPrefix: '([^']*)'/)?.[1],
      requiresModel: /requiresModel: true/.test(block),
      verified: block.match(/verified: (true|false)/)?.[1] === "true",
    });
  }
  return out;
}

test("registri UI sama dengan registri backend: id, label, format, baseUrl, validate, keyPrefix, verified, requiresModel", () => {
  const be = backendRegistry();
  assert.deepEqual([...be.keys()].sort(), [...LLM_PROVIDER_IDS].sort(), "daftar id sama");
  for (const p of LLM_PROVIDERS) {
    const b = be.get(p.id);
    assert.ok(b, `${p.id} ada di backend`);
    assert.equal(p.label, b.label, `${p.id}: label`);
    assert.equal(p.format, b.format, `${p.id}: format`);
    assert.equal(p.baseUrl, b.baseUrl, `${p.id}: baseUrl`);
    assert.equal(p.validate.url, b.validateUrl, `${p.id}: validate.url`);
    assert.equal(p.validate.headerStyle, b.headerStyle, `${p.id}: headerStyle`);
    assert.equal(p.keyPrefix, b.keyPrefix, `${p.id}: keyPrefix`);
    assert.equal(p.verified, b.verified, `${p.id}: verified`);
    assert.equal(p.requiresModel === true, b.requiresModel, `${p.id}: requiresModel`);
  }
  // pembacaan teks benar-benar menangkap data (bukan semua kosong)
  assert.equal(be.get("openai")?.requiresModel, true);
  assert.equal(be.get("qwen")?.verified, false);
  assert.equal(be.get("crowllm")?.baseUrl, "https://crowllm.com/v1");
  assert.equal(be.get("anthropic")?.keyPrefix, "sk-ant-");
});

test("isVerifiedProvider: id asing dan penyedia yang belum diperiksa tidak boleh menerima kunci", () => {
  assert.equal(isVerifiedProvider("openai"), true);
  assert.equal(isVerifiedProvider("azure"), false);
  assert.equal(isVerifiedProvider(undefined), false);
  for (const p of LLM_PROVIDERS) assert.equal(isVerifiedProvider(p.id), p.verified === true, p.id);
});

test("precheckLlmKey: kunci wajar lolos dan dirapikan", () => {
  for (const id of verifiedIds) {
    const prefix = providerInfo(id).keyPrefix ?? "sk-";
    const key = fake(prefix);
    const r = precheckLlmKey(id, `  ${key}\n`);
    assert.equal(r.ok, true, id);
    if (r.ok) assert.equal(r.key, key, `${id}: spasi di tepi dibuang`);
  }
  // Tanda yang diizinkan: huruf, angka, garis bawah, strip, titik.
  assert.equal(precheckLlmKey("gemini", "AIza_Sy-9.x".padEnd(39, "q")).ok, true);
});

test("precheckLlmKey: batas panjang 20 sampai 300 dihitung sesudah trim", () => {
  const at = (n: number) => "k".repeat(n);
  assert.equal(precheckLlmKey("openai", at(KEY_MIN_LENGTH - 1)).ok, false);
  assert.equal(precheckLlmKey("openai", at(KEY_MIN_LENGTH)).ok, true);
  assert.equal(precheckLlmKey("openai", at(KEY_MAX_LENGTH)).ok, true);
  assert.equal(precheckLlmKey("openai", at(KEY_MAX_LENGTH + 1)).ok, false);
  assert.equal(precheckLlmKey("openai", `   ${at(KEY_MIN_LENGTH - 1)}   `).ok, false, "spasi tidak menambah panjang");
  for (const empty of ["", "   ", undefined, null, 12345]) {
    const r = precheckLlmKey("openai", empty);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "key_format");
  }
});

test("precheckLlmKey: karakter di luar huruf, angka, _ - . ditolak sebagai key_format", () => {
  for (const bad of ["sk-" + "a".repeat(10) + " " + "b".repeat(10), "sk-" + "a".repeat(30) + "!", "sk-" + "a".repeat(30) + "/", "sk-" + "a".repeat(30) + "é"]) {
    const r = precheckLlmKey("openai", bad);
    assert.equal(r.ok, false, bad);
    if (!r.ok) assert.equal(r.code, "key_format");
  }
});

test("precheckLlmKey: awalan khusus penyedia (keyPrefix di registri) hanya untuk pemiliknya", () => {
  const owners = LLM_PROVIDERS.filter((p) => p.keyPrefix);
  assert.ok(owners.length >= 2, "anthropic dan openrouter punya awalan khusus");
  for (const owner of owners) {
    const key = fake(owner.keyPrefix!);
    assert.equal(precheckLlmKey(owner.id, key).ok, true, `${owner.id} menerima kuncinya sendiri`);
    for (const other of verifiedIds.filter((id) => id !== owner.id)) {
      const r = precheckLlmKey(other, key);
      assert.equal(r.ok, false, `${other} menolak kunci ${owner.id}`);
      if (!r.ok) assert.equal(r.code, "wrong_provider");
    }
  }
});

test("precheckLlmKey: penyedia tak dikenal atau belum verified ditolak, dan pesan galat tidak memuat kunci", () => {
  const r = precheckLlmKey("azure", fake("sk-"));
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "unknown_provider");
  if (unverified) {
    const u = precheckLlmKey(unverified.id, fake("sk-"));
    assert.equal(u.ok, false, `${unverified.id} belum verified`);
    if (!u.ok) assert.equal(u.code, "provider_unverified");
  }
  const key = fake("sk-ant-");
  const wrong = precheckLlmKey("openai", key);
  assert.equal(wrong.ok, false);
  if (!wrong.ok) {
    assert.ok(!wrong.message.includes(key));
    assert.ok(!wrong.message.includes(key.slice(-8)));
  }
});

test("precheckLlmModel: kosong berarti tidak memilih; 1 sampai 100 karakter dari [A-Za-z0-9._:/-]", () => {
  for (const blank of [undefined, null, "", "   "]) {
    const r = precheckLlmModel(blank);
    assert.deepEqual(r, { ok: true, model: null }, String(blank));
  }
  for (const good of ["gpt-4o", "claude-sonnet-4-5", "qwen/qwen3-32b:free", "gemini-2.0-flash.001", "a", "m".repeat(MODEL_MAX_LENGTH)]) {
    const r = precheckLlmModel(`  ${good} `);
    assert.deepEqual(r, { ok: true, model: good }, good);
  }
  for (const bad of ["m".repeat(MODEL_MAX_LENGTH + 1), "gpt 4o", "gpt-4o;rm", "model\nbaru", "gpt-4o?x=1", "modèl", "a@b", 42, {}]) {
    const r = precheckLlmModel(bad);
    assert.equal(r.ok, false, String(bad));
    if (!r.ok) {
      assert.equal(r.code, "model_format");
      assert.equal(r.message, describeLlmKeyError("model_format"));
    }
  }
});

test("precheckLlmModel: penyedia yang mewajibkan model menolak kosong dengan model_required", () => {
  for (const blank of [undefined, null, "", "   "]) {
    const r = precheckLlmModel(blank, { required: true });
    assert.equal(r.ok, false, String(blank));
    if (!r.ok) {
      assert.equal(r.code, "model_required");
      assert.equal(r.message, describeLlmKeyError("model_required"));
    }
  }
  assert.deepEqual(precheckLlmModel("  gpt-4o ", { required: true }), { ok: true, model: "gpt-4o" });
  const bad = precheckLlmModel("gpt 4o", { required: true });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.code, "model_format");
  assert.deepEqual(precheckLlmModel("", { required: false }), { ok: true, model: null });
});

test("canSaveLlmKey: penyedia requiresModel butuh nama model yang sah, yang lain boleh tanpa model", () => {
  const ok = { usable: true, consent: true, key: "abc", requiresModel: true };
  assert.equal(canSaveLlmKey({ ...ok, model: "gpt-4o" }), true);
  assert.equal(canSaveLlmKey({ ...ok, model: "  gpt-4o  " }), true);
  for (const missing of [undefined, null, "", "   "]) assert.equal(canSaveLlmKey({ ...ok, model: missing }), false, `kosong: ${String(missing)}`);
  for (const bad of ["gpt 4o", "m".repeat(MODEL_MAX_LENGTH + 1), "gpt;4o", 5]) assert.equal(canSaveLlmKey({ ...ok, model: bad }), false, String(bad));
  // model sah tidak menggantikan persetujuan atau kunci
  assert.equal(canSaveLlmKey({ ...ok, model: "gpt-4o", consent: false }), false);
  assert.equal(canSaveLlmKey({ ...ok, model: "gpt-4o", key: "" }), false);
  // penyedia lain: model opsional
  assert.equal(canSaveLlmKey({ usable: true, consent: true, key: "abc", requiresModel: false, model: "" }), true);
  assert.equal(canSaveLlmKey({ usable: true, consent: true, key: "abc", model: undefined }), true);
});

test("canSaveLlmKey: tombol simpan butuh penyedia aktif, persetujuan true, dan kunci terisi", () => {
  const ok = { usable: true, consent: true, key: "abc" };
  assert.equal(canSaveLlmKey(ok), true);
  assert.equal(canSaveLlmKey({ ...ok, consent: false }), false, "tanpa centang persetujuan");
  assert.equal(canSaveLlmKey({ ...ok, usable: false }), false, "fitur mati atau penyedia belum verified");
  assert.equal(canSaveLlmKey({ ...ok, key: "" }), false);
  assert.equal(canSaveLlmKey({ ...ok, key: "   " }), false);
  assert.equal(canSaveLlmKey({ ...ok, key: undefined }), false);
  // persetujuan harus persis true, bukan nilai yang "kebetulan benar"
  for (const loose of ["true", 1, "on", {}, [], null, undefined]) {
    assert.equal(canSaveLlmKey({ ...ok, consent: loose }), false, String(loose));
  }
});

test("llmConsentText: menyebut penyedia, data CV dan profil, luar negeri, dan tagihan ditanggung pengguna", () => {
  for (const p of LLM_PROVIDERS) {
    const t = llmConsentText(p.label);
    assert.ok(t.includes(p.label), p.id);
    assert.match(t, /CV dan profil/);
    assert.match(t, /di luar negeri/);
    assert.match(t, /tagihan/i);
    assert.match(t, /setuju/);
  }
  assert.notEqual(llmConsentText("OpenAI"), llmConsentText("Anthropic (Claude)"));
});

test("kolom model: label wajib atau opsional mengikuti registri, petunjuk wajib berbeda dari opsional", () => {
  assert.equal(llmModelLabel(true), "Model (wajib)");
  assert.equal(llmModelLabel(false), "Model (opsional)");
  assert.equal(llmModelLabel(undefined), "Model (opsional)");
  for (const p of LLM_PROVIDERS) {
    assert.equal(llmModelLabel(p.requiresModel), p.requiresModel === true ? "Model (wajib)" : "Model (opsional)", p.id);
  }
  assert.notEqual(LLM_MODEL_HINT, LLM_MODEL_REQUIRED_HINT);
  assert.match(LLM_MODEL_HINT, /Opsional/);
  assert.match(LLM_MODEL_REQUIRED_HINT, /^Wajib\./);
  assert.match(LLM_MODEL_REQUIRED_HINT, /nama modelnya/);
});

test("describeLlmKeyError: setiap kode kontrak punya pesan Indonesia sendiri, kode asing memakai pesan umum", () => {
  const codes = [
    "byok_disabled",
    "unknown_provider",
    "provider_unverified",
    "consent_required",
    "key_format",
    "model_format",
    "model_required",
    "wrong_provider",
    "too_many_attempts",
    "key_invalid",
    "validation_unavailable",
    "encryption_unavailable",
    "not_found",
  ];
  const messages = codes.map((c) => describeLlmKeyError(c));
  for (const [i, m] of messages.entries()) {
    assert.ok(m.length > 10, codes[i]);
    assert.doesNotMatch(m, /undefined|NaN|\[object/, codes[i]);
  }
  assert.equal(new Set(messages).size, codes.length, "tidak ada dua kode dengan pesan yang sama");
  const generic = describeLlmKeyError("kode_baru_yang_belum_dikenal");
  assert.ok(!messages.includes(generic));
  assert.equal(describeLlmKeyError(undefined), generic);
  assert.equal(describeLlmKeyError(null), generic);
  assert.equal(describeLlmKeyError(42), generic);
});

test("describeLlmKeyError: provider_unverified dan consent_required punya arahan yang jelas", () => {
  assert.match(describeLlmKeyError("provider_unverified"), /belum tersedia/);
  assert.match(describeLlmKeyError("provider_unverified"), /belum bisa disimpan/);
  assert.match(describeLlmKeyError("consent_required"), /Centang persetujuan/);
  assert.match(describeLlmKeyApiError(new ApiError(400, body({ code: "provider_unverified" }))), /belum tersedia/);
  assert.match(describeLlmKeyApiError(new ApiError(400, body({ code: "consent_required" }))), /Centang persetujuan/);
  assert.match(describeLlmKeyApiError(new ApiError(400, body({ code: "model_format" }))), /Nama model/);
  assert.match(describeLlmKeyError("model_required"), /butuh nama model/);
  assert.match(describeLlmKeyApiError(new ApiError(400, body({ code: "model_required" }))), /butuh nama model/);
});

test("describeLlmKeyError: key_invalid dan validation_unavailable menyebut kunci belum disimpan", () => {
  assert.match(describeLlmKeyError("key_invalid"), /tidak disimpan/);
  assert.match(describeLlmKeyError("validation_unavailable"), /belum disimpan/);
  assert.doesNotMatch(describeLlmKeyError("encryption_unavailable"), /administrator/);
  assert.match(describeLlmKeyError("encryption_unavailable"), /belum bisa disimpan dengan aman/);
});

test("describeLlmKeyError: too_many_attempts menyebut waktu tunggu bila ada", () => {
  assert.match(describeLlmKeyError("too_many_attempts", 45), /45 detik/);
  assert.match(describeLlmKeyError("too_many_attempts", 1800), /30 menit/);
  assert.match(describeLlmKeyError("too_many_attempts"), /beberapa saat lagi/);
});

test("describeLlmKeyApiError: kode dari badan jawaban, Retry-After, 401, 5xx, dan jaringan", () => {
  assert.match(describeLlmKeyApiError(new ApiError(400, body({ code: "key_invalid" }))), /ditolak oleh penyedia/);
  assert.match(describeLlmKeyApiError(new ApiError(403, body({ code: "byok_disabled" }))), /belum aktif/);
  assert.match(describeLlmKeyApiError(new ApiError(404, body({ code: "not_found" }))), /Belum ada kunci/);
  assert.match(describeLlmKeyApiError(new ApiError(429, body({ code: "too_many_attempts" }), 120)), /2 menit/);
  assert.match(describeLlmKeyApiError(new ApiError(429, "")), /Terlalu sering mencoba/);
  assert.match(describeLlmKeyApiError(new ApiError(401, "")), /Masuk lagi/);
  assert.match(describeLlmKeyApiError(new ApiError(503, "gateway")), /Server sedang bermasalah/);
  assert.match(describeLlmKeyApiError(new TypeError("Failed to fetch")), /tidak dapat dihubungi/);
});

test("describeLlmKeyApiError: teks mentah dari server tidak pernah ikut tampil", () => {
  const leak = "kunci-rahasia-" + "z".repeat(20);
  for (const err of [new ApiError(400, leak), new ApiError(500, body({ error: leak })), new ApiError(422, body({ error: leak, message: leak }))]) {
    assert.ok(!describeLlmKeyApiError(err).includes(leak));
  }
});

test("maskLast4: titik di depan, hanya 4 karakter terakhir", () => {
  assert.equal(maskLast4("abcd"), "••••abcd");
  assert.equal(maskLast4("  wxyz "), "••••wxyz");
  // Bila server keliru mengirim lebih panjang, tetap hanya 4 karakter terakhir yang tampil.
  assert.equal(maskLast4("sk-ant-rahasia-1234"), "••••1234");
  assert.equal(maskLast4(""), "••••");
  assert.equal(maskLast4(undefined), "••••");
  assert.equal(maskLast4(1234), "••••");
});

test("formatKeyDate: tanggal Indonesia zona WIB, kosong bila tidak terbaca", () => {
  assert.equal(formatKeyDate("2026-11-23T10:00:00.000Z"), "23 November 2026");
  // 20:00 UTC sudah hari berikutnya di WIB
  assert.equal(formatKeyDate("2026-12-31T20:00:00Z"), "1 Januari 2027");
  assert.equal(formatKeyDate(null), "");
  assert.equal(formatKeyDate("bukan tanggal"), "");
  assert.equal(formatKeyDate(undefined), "");
});

test("status tampilan: valid, tidak valid, belum ada", () => {
  assert.equal(llmKeyView(null), "none");
  assert.equal(llmKeyView(undefined), "none");
  assert.equal(llmKeyView(row("openai")), "valid");
  assert.equal(llmKeyView(row("openai", { status: "invalid" })), "invalid");
  assert.deepEqual(LLM_KEY_STATUS_LABEL, { valid: "Tersimpan dan valid", invalid: "Tidak valid", none: "Belum ada" });
});

test("describeTestResult: valid, invalid, unavailable punya nada berbeda; hasil asing jadi galat", () => {
  assert.equal(describeTestResult("valid").tone, "ok");
  assert.equal(describeTestResult("invalid").tone, "error");
  const unavailable = describeTestResult("unavailable");
  assert.equal(unavailable.tone, "warn");
  assert.match(unavailable.text, /status kunci tidak berubah/);
  assert.equal(describeTestResult("???").tone, "error");
  assert.equal(describeTestResult(undefined).tone, "error");
});

test("parseLlmKeysResponse: membaca bentuk kontrak (termasuk model) dan hanya membawa 4 karakter terakhir", () => {
  const parsed = parseLlmKeysResponse({
    enabled: true,
    providers: ["anthropic", "openai", "gemini", "openrouter"],
    keys: [
      { provider: "openai", last4: "1234", status: "valid", lastValidatedAt: "2026-11-23T10:00:00Z", updatedAt: "2026-11-23T10:00:00Z", model: "gpt-4o", key_encrypted: "RAHASIA" },
      { provider: "gemini", last4: "sk-ant-penuh-9876", status: "invalid", lastValidatedAt: null, updatedAt: null, model: null },
    ],
  });
  assert.ok(parsed);
  assert.equal(parsed.enabled, true);
  assert.deepEqual(parsed.keys.map((k) => [k.provider, k.last4, k.status, k.model]), [
    ["openai", "1234", "valid", "gpt-4o"],
    ["gemini", "9876", "invalid", null],
  ]);
  assert.ok(!JSON.stringify(parsed).includes("RAHASIA"));
});

test("parseLlmKeysResponse: model hilang atau bukan teks menjadi null, model terlalu panjang dipotong", () => {
  const parsed = parseLlmKeysResponse({
    enabled: true,
    keys: [
      { provider: "openai", last4: "1111", status: "valid" },
      { provider: "gemini", last4: "2222", status: "valid", model: 42 },
      { provider: "anthropic", last4: "3333", status: "valid", model: "m".repeat(500) },
    ],
  });
  assert.ok(parsed);
  assert.equal(parsed.keys[0].model, null);
  assert.equal(parsed.keys[1].model, null);
  assert.equal(parsed.keys[2].model?.length, MODEL_MAX_LENGTH);
});

test("parseLlmKeysResponse: enabled hanya true bila persis true; baris asing dibuang; status asing dianggap tidak valid", () => {
  const parsed = parseLlmKeysResponse({
    enabled: "true",
    providers: ["openai", "azure"],
    keys: [
      { provider: "azure", last4: "aaaa", status: "valid" },
      { provider: "openai", last4: "bbbb", status: "mungkin" },
      { provider: "gemini" },
      "bukan objek",
    ],
  });
  assert.ok(parsed);
  assert.equal(parsed.enabled, false);
  assert.deepEqual(parsed.providers, ["openai"]);
  assert.equal(parsed.keys.length, 1);
  assert.equal(parsed.keys[0].status, "invalid");
});

test("parseLlmKeysResponse: daftar penyedia kosong atau hilang memakai seluruh registri; bentuk rusak menghasilkan null", () => {
  assert.deepEqual(parseLlmKeysResponse({ enabled: false, keys: [] })?.providers, [...LLM_PROVIDER_IDS]);
  assert.deepEqual(parseLlmKeysResponse({ enabled: false, providers: [], keys: [] })?.providers, [...LLM_PROVIDER_IDS]);
  for (const bad of [null, undefined, "x", 5, [], {}, { enabled: true }, { keys: "bukan array" }]) {
    assert.equal(parseLlmKeysResponse(bad), null);
  }
});

test("parseSaveResponse, parseTestResponse, parseDeleteResponse", () => {
  const saved = parseSaveResponse({ key: { provider: "anthropic", last4: "abcd", status: "valid", lastValidatedAt: "2026-11-23T10:00:00Z", model: "claude-haiku-4-5" } });
  assert.equal(saved?.provider, "anthropic");
  assert.equal(saved?.last4, "abcd");
  assert.equal(saved?.model, "claude-haiku-4-5");
  assert.equal(saved?.updatedAt, null);
  assert.equal(parseSaveResponse({}), null);
  assert.equal(parseSaveResponse(null), null);

  const tested = parseTestResponse({ result: "unavailable", key: { provider: "openai", last4: "1111", status: "valid", lastValidatedAt: null } });
  assert.equal(tested?.result, "unavailable");
  assert.equal(tested?.key?.provider, "openai");
  assert.equal(parseTestResponse({ result: "valid" })?.key, null);
  assert.equal(parseTestResponse({ result: "aneh", key: {} }), null);

  assert.equal(parseDeleteResponse({ deleted: true }), true);
  assert.equal(parseDeleteResponse({ deleted: false }), false);
  assert.equal(parseDeleteResponse({}), false);
  assert.equal(parseLlmKeyRow({ provider: "openai", last4: 1234 }), null);
});

test("upsertKey dan removeKey: satu baris per penyedia, daftar asli tidak diubah", () => {
  const start = [row("openai"), row("gemini")];
  const next = upsertKey(start, row("openai", { last4: "9999", status: "invalid" }));
  assert.equal(next.length, 2);
  assert.equal(next.find((k) => k.provider === "openai")?.last4, "9999");
  assert.equal(start.find((k) => k.provider === "openai")?.last4, "wxyz");
  assert.equal(upsertKey([], row("anthropic")).length, 1);
  assert.deepEqual(removeKey(start, "openai").map((k) => k.provider), ["gemini"]);
  assert.equal(removeKey(start, "anthropic").length, 2);
  assert.equal(start.length, 2);
});

test("visibleProviders: urutan tetap dari registri, hanya yang disebut server", () => {
  assert.deepEqual(visibleProviders(["openrouter", "anthropic"]).map((p) => p.id), ["anthropic", "openrouter"]);
  assert.deepEqual(visibleProviders([...LLM_PROVIDER_IDS]).map((p) => p.id), [...LLM_PROVIDER_IDS]);
  assert.deepEqual(visibleProviders(["anthropic", "openai"]).map((p) => p.id), ["openai", "anthropic"], "OpenAI di depan Anthropic");
});

test("catatan di kartu: kuota tidak terpotong tetapi tetap dibatasi laju; kunci terenkripsi dan hanya 4 karakter", () => {
  assert.match(LLM_KEYS_QUOTA_NOTE, /tidak dihitung ke kuota draf bulanan/);
  assert.match(LLM_KEYS_QUOTA_NOTE, /dibatasi laju/);
  assert.match(LLM_KEYS_STORAGE_NOTE, /terenkripsi/);
  assert.match(LLM_KEYS_STORAGE_NOTE, /4 karakter terakhir/);
  assert.match(LLM_KEYS_DISABLED_TEXT, /belum aktif/);
});

test("mode demo: simpan hanya membawa 4 karakter terakhir dan model, uji ulang dan hapus bekerja per penyedia", () => {
  const key = fake("sk-ant-", 48);
  const now = new Date("2026-11-23T10:00:00Z");
  const saved = mockSaveKey([], "anthropic", ` ${key} `, "claude-haiku-4-5", now);
  assert.equal(saved.key.last4, key.slice(-4));
  assert.equal(saved.key.status, "valid");
  assert.equal(saved.key.model, "claude-haiku-4-5");
  assert.equal(saved.key.lastValidatedAt, now.toISOString());
  assert.ok(!JSON.stringify(saved).includes(key), "kunci utuh tidak muncul di hasil mock");
  assert.ok(!JSON.stringify(saved).includes(key.slice(0, -4)), "bagian depan kunci tidak ikut");
  assert.equal(mockSaveKey([], "openai", key).key.model, null, "tanpa model: null");

  const later = new Date("2026-11-24T10:00:00Z");
  const tested = mockTestKey(saved.rows, "anthropic", later);
  assert.equal(tested?.response.result, "valid");
  assert.equal(tested?.response.key?.lastValidatedAt, later.toISOString());
  assert.equal(tested?.response.key?.model, "claude-haiku-4-5", "uji ulang tidak mengubah model");
  assert.equal(mockTestKey(saved.rows, "openai", later), null, "tanpa kunci tersimpan: tidak ada yang diuji");

  assert.equal(mockLlmKeysResponse(saved.rows).enabled, true);
  assert.deepEqual(mockLlmKeysResponse([]).providers, [...LLM_PROVIDER_IDS]);

  const removed = mockDeleteKey(saved.rows, "anthropic");
  assert.equal(removed.deleted, true);
  assert.equal(removed.rows.length, 0);
  assert.equal(mockDeleteKey(removed.rows, "anthropic").deleted, false);
});
