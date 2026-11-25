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
  budgetForCandidate,
  numesKeysFromEnv,
  positiveMs,
  parseModelList,
  anthropicLast,
  platformChain,
  postChat,
  resolveChain,
  resolveModel,
} from "../supabase/functions/_shared/providers.ts";
import { DEFAULT_NUMES_CALL_TIMEOUT_MS, NUMES_COOLDOWN_RATE_MS, NUMES_MODEL_COOLDOWN_MS, NumesBudget, resetNumesPools } from "../supabase/functions/_shared/numes-keys.ts";

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
  assert.equal(n.headers.Authorization, undefined, "kunci Numes dipasang per percobaan oleh kolam kunci (postChat)");
  assert.equal(n.pool?.size, 1);
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

test("penyedia: rantai bawaan Free diawali Numes (GLM, DeepSeek), lalu Gemini, OpenRouter gratis, dan Claude Haiku paling akhir", () => {
  const free = parseModelList("", DEFAULT_FREE_MODELS);
  assert.deepEqual(free, [
    "numes:z-ai/glm-5.3-flash:free",
    "numes:deepseek/deepseek-v4.1-flash:free",
    "gemini:gemini-3.5-flash-lite",
    "google/gemma-4-31b-it:free",
    "openrouter/free",
    "anthropic:claude-haiku-5-5",
  ]);
  const withAll = resolveChain(free, ALL);
  assert.deepEqual(withAll.map((c) => c.provider), ["numes", "numes", "gemini", "openrouter", "openrouter", "anthropic"]);
  // tanpa kunci Numes dan Claude, rantai mulai dari Gemini
  const noNumes = resolveChain(free, { openrouter: "or-key", gemini: "g-key" });
  assert.deepEqual(noNumes.map((c) => c.provider), ["gemini", "openrouter", "openrouter"]);
  assert.deepEqual(parseModelList(" a , b ,, ", "x"), ["a", "b"]);
});

test("penyedia: rantai bawaan Pro diawali Numes, lalu Gemini 4, OpenRouter gratis, dan Claude Sonnet lalu Haiku paling akhir", () => {
  const pro = parseModelList(undefined, DEFAULT_PRO_MODELS);
  assert.deepEqual(pro, [
    "numes:z-ai/glm-5.3-flash:free",
    "numes:deepseek/deepseek-v4.1-flash:free",
    "gemini:gemini-4-hydrogen",
    "gemini:gemini-4-argon",
    "google/gemma-4-31b-it:free",
    "openrouter/free",
    "anthropic:claude-sonnet-5-5",
    "anthropic:claude-haiku-5-5",
  ]);
  assert.ok(!pro.some((e) => /deepseek-v4-pro/.test(e)));
  assert.deepEqual(resolveChain(pro, ALL).map((c) => c.provider), ["numes", "numes", "gemini", "gemini", "openrouter", "openrouter", "anthropic", "anthropic"]);
});

test("penyedia: Anthropic hanya di ujung kedua rantai bawaan, dan platformChain memindahkannya ke ujung walau env menaruhnya di depan", () => {
  for (const list of [DEFAULT_FREE_MODELS, DEFAULT_PRO_MODELS].map((l) => parseModelList(undefined, l))) {
    const first = list.findIndex((e) => e.startsWith("anthropic:"));
    assert.ok(first > 0);
    assert.ok(list.slice(first).every((e) => e.startsWith("anthropic:")));
  }
  assert.deepEqual(anthropicLast(["anthropic:a", "numes:x/y", "gemini:g", "anthropic:b", "z/w:free"]), ["numes:x/y", "gemini:g", "z/w:free", "anthropic:a", "anthropic:b"]);
  const keys = { openrouter: "or", gemini: "g", anthropic: "a", numes: ["n"] };
  const chain = platformChain(["anthropic:claude-haiku-5-5", "gemini:g1", "numes:x/y:free", "vendor/m:free"], keys);
  assert.deepEqual(chain.map((c) => c.entry), ["gemini:g1", "numes:x/y:free", "vendor/m:free", "anthropic:claude-haiku-5-5"]);
  // resolveChain sendiri tetap mempertahankan urutan
  assert.deepEqual(resolveChain(["anthropic:claude-haiku-5-5", "gemini:g1"], keys).map((c) => c.provider), ["anthropic", "gemini"]);
  // tanpa kunci Numes entri Numes dilewati
  assert.deepEqual(platformChain(["numes:x/y:free", "gemini:g1"], { gemini: "g" }).map((c) => c.provider), ["gemini"]);
});

test("numesKeysFromEnv membaca NUMES_API_KEY, _2 sampai _5, dan NUMES_API_KEYS dari secret", () => {
  const secrets: Record<string, string> = { NUMES_API_KEY: "k1", NUMES_API_KEY_2: " k2 ", NUMES_API_KEY_4: "k4", NUMES_API_KEYS: "k2,k3,k5,k6" };
  assert.deepEqual(numesKeysFromEnv((name) => secrets[name]), ["k1", "k2", "k4", "k3", "k5"]);
  assert.deepEqual(numesKeysFromEnv(() => undefined), []);
  assert.deepEqual(numesKeysFromEnv(() => null), []);
  assert.deepEqual(numesKeysFromEnv(() => ""), []);
  // satu string tetap diterima sebagai kunci tunggal
  assert.equal(resolveModel("numes:x/y:free", { numes: "solo" })!.pool!.size, 1);
  assert.equal(resolveModel("numes:x/y:free", { numes: ["a", "b", ""] })!.pool!.size, 2);
});

// ---- postChat: satu panggilan chat dengan kolam kunci Numes ---------------------------------------------------

const NK1 = "nk-one-not-real";
const NK2 = "nk-two-not-real";
const NK3 = "nk-three-not-real";
const NUMES_MODEL = "numes:z-ai/glm-5.3-flash:free";
type Step = number | Error | { status: number; headers?: Record<string, string>; body?: unknown };

function numesHarness(keys: string[], script: (auth: string, call: number) => Step) {
  resetNumesPools();
  const target = resolveModel(NUMES_MODEL, { numes: keys })!;
  const calls: Array<{ auth: string; signal: AbortSignal | null | undefined; redirect?: string }> = [];
  const logs: string[] = [];
  let n = 0;
  const fetchFn = (async (_url: string, init: RequestInit) => {
    const auth = String((init.headers as Record<string, string>).Authorization);
    calls.push({ auth, signal: init.signal, redirect: init.redirect });
    const step = script(auth, ++n);
    if (step instanceof Error) throw step;
    const { status, headers, body } = typeof step === "number" ? { status: step, headers: undefined, body: undefined } : step;
    const payload = body ?? (status >= 200 && status < 300 ? { choices: [{ message: { content: "OK" } }] } : { error: { code: status, message: "x", metadata: { error_type: "rate_limited" } } });
    return new Response(JSON.stringify(payload), { status, headers });
  }) as unknown as typeof fetch;
  const post = (extra: Record<string, unknown> = {}) =>
    postChat(target, { body: "{}", timeoutMs: () => 20_000, fetchFn, log: (l) => logs.push(l), ...extra });
  return { target, calls, logs, post };
}

test("postChat: kunci pertama berhasil, header Authorization dipasang per percobaan dan kunci berputar antarpanggilan", async () => {
  const h = numesHarness([NK1, NK2, NK3], () => 200);
  for (let i = 0; i < 4; i++) assert.equal((await h.post()).status, 200);
  assert.deepEqual(h.calls.map((c) => c.auth), [NK1, NK2, NK3, NK1].map((k) => `Bearer ${k}`));
  assert.equal(h.target.headers.Authorization, undefined);
});

for (const [name, step] of [
  ["429", { status: 429, headers: { "retry-after": "20" } }],
  ["402", 402],
  ["401", 401],
  ["403", 403],
] as Array<[string, Step]>) {
  test(`postChat: ${name} pada kunci 1 = model yang sama dengan kunci 2`, async () => {
    const h = numesHarness([NK1, NK2, NK3], (auth) => (auth === `Bearer ${NK1}` ? step : 200));
    const resp = await h.post();
    assert.equal(resp.status, 200);
    assert.deepEqual(h.calls.map((c) => c.auth), [NK1, NK2].map((k) => `Bearer ${k}`));
  });
}

test("postChat: 503 (galat server) pada kunci 1 melepas model itu, kunci 2 tidak dicoba", async () => {
  const h = numesHarness([NK1, NK2, NK3], () => 503);
  const resp = await h.post();
  assert.equal(resp.status, 503);
  assert.deepEqual(h.calls.map((c) => c.auth), [`Bearer ${NK1}`]);
});

test("postChat: batas waktu pada kunci 1 melempar galat langsung, kunci 2 tidak dicoba, dan modelnya didinginkan 5 menit", async () => {
  const realNow = Date.now;
  let skew = 0;
  Date.now = () => realNow() + skew;
  try {
    const h = numesHarness([NK1, NK2, NK3], () => new DOMException("t", "TimeoutError"));
    await assert.rejects(h.post(), (e: any) => e.name === "TimeoutError");
    assert.deepEqual(h.calls.map((c) => c.auth), [`Bearer ${NK1}`], "tidak ada percobaan dengan kunci 2");
    assert.match(h.logs.join("\n"), /key 1\/3 -> timeout, giving up on this model/);
    assert.doesNotMatch(h.logs.join("\n"), /trying next key/);
    // permintaan berikutnya: model yang sama dilewati tanpa panggilan jaringan, 503 buatan supaya rantai lanjut
    h.calls.length = 0;
    const skipped = await h.post();
    assert.equal(skipped.status, 503);
    assert.match(await skipped.text(), /numes_model_cooling/);
    assert.equal(h.calls.length, 0, "model yang baru kena batas waktu dilewati langsung");
    assert.match(h.logs.at(-1)!, /too slow, cooling down/);
    // sesudah 5 menit dicoba lagi
    skew += NUMES_MODEL_COOLDOWN_MS + 1;
    await assert.rejects(h.post(), (e: any) => e.name === "TimeoutError");
    assert.equal(h.calls.length, 1);
  } finally {
    Date.now = realNow;
  }
});

test("postChat: batas waktu satu percobaan Numes 12 detik (numesTimeoutMs menimpanya), tidak terikat batas 20 detik pemanggil", async () => {
  const sendMs = async (extra: Record<string, unknown>) => {
    const h = numesHarness([NK1], () => 200);
    const spy = AbortSignal.timeout;
    const asked: number[] = [];
    AbortSignal.timeout = ((ms: number) => (asked.push(ms), spy.call(AbortSignal, ms))) as typeof AbortSignal.timeout;
    try {
      await h.post(extra);
    } finally {
      AbortSignal.timeout = spy;
    }
    return asked;
  };
  assert.equal(DEFAULT_NUMES_CALL_TIMEOUT_MS, 12_000);
  assert.deepEqual(await sendMs({}), [12_000]);
  assert.deepEqual(await sendMs({ numesTimeoutMs: 5_000 }), [5_000]);
  assert.deepEqual(await sendMs({ timeoutMs: () => 8_000 }), [8_000], "sisa anggaran total yang lebih kecil tetap menang");
});

test("postChat: jatah Numes habis = 503 buatan tanpa panggilan jaringan, penyedia berikutnya yang dipakai", async () => {
  const budget = new NumesBudget({ totalBudgetMs: 34_000 });
  budget.spend(budget.limitMs - 1_000);
  const h = numesHarness([NK1, NK2], () => 200);
  const resp = await h.post({ numesBudget: budget });
  assert.equal(resp.status, 503);
  assert.match(await resp.text(), /numes_budget_spent/);
  assert.equal(h.calls.length, 0);
});

test("rantai gaya generate-application: Numes lambat di semua entri, Gemini tetap dipanggil dalam anggaran 34 detik dan tidak kena time_budget", async () => {
  const realNow = Date.now;
  let skew = 0;
  Date.now = () => realNow() + skew;
  try {
    resetNumesPools();
    const chain = resolveChain(
      ["numes:z-ai/glm-5.3-flash:free", "numes:deepseek/deepseek-v4.1-flash:free", "gemini:gemini-3.5-flash-lite", "anthropic:claude-haiku-5-5"],
      { gemini: "g-key", anthropic: "a-key", numes: [NK1, NK2, NK3, "nk-four-not-real"] },
    );
    const started = Date.now();
    const hosts: string[] = [];
    const timeouts: number[] = [];
    const spy = AbortSignal.timeout;
    AbortSignal.timeout = ((ms: number) => (timeouts.push(ms), spy.call(AbortSignal, ms))) as typeof AbortSignal.timeout;
    const fetchFn = (async (url: string, init: RequestInit) => {
      const host = new URL(url).hostname;
      hosts.push(`${host} ${(init.headers as Record<string, string>).Authorization}`);
      if (host === "api.numes.ai") {
        skew += timeouts.at(-1)!; // Numes menggantung sampai batas waktunya
        throw new DOMException("t", "TimeoutError");
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const numesBudget = new NumesBudget({ totalBudgetMs: DEFAULT_AI_TOTAL_BUDGET_MS });
    const outcomes: string[] = [];
    let winner = "";
    for (const [index, candidate] of chain.entries()) {
      const callTimeout = nextCallTimeoutMs({ perCallMs: DEFAULT_AI_CALL_TIMEOUT_MS, totalBudgetMs: DEFAULT_AI_TOTAL_BUDGET_MS, elapsedMs: Date.now() - started });
      if (callTimeout === 0) {
        outcomes.push(`${candidate.entry} time_budget`);
        break;
      }
      let resp: Response;
      try {
        resp = await postChat(candidate, {
          timeoutMs: () => nextCallTimeoutMs({ perCallMs: DEFAULT_AI_CALL_TIMEOUT_MS, totalBudgetMs: DEFAULT_AI_TOTAL_BUDGET_MS, elapsedMs: Date.now() - started }),
          numesTimeoutMs: DEFAULT_NUMES_CALL_TIMEOUT_MS,
          numesBudget,
          fetchFn,
          body: "{}",
          log: () => {},
        });
      } catch (e) {
        outcomes.push(`${candidate.entry} ${(e as Error).name}`);
        continue;
      }
      if (!resp.ok) {
        outcomes.push(`${candidate.entry} http_${resp.status}`);
        continue;
      }
      winner = candidate.entry;
      break;
    }
    AbortSignal.timeout = spy;
    assert.equal(winner, "gemini:gemini-3.5-flash-lite", `urutan: ${outcomes.join(", ")}`);
    assert.deepEqual(outcomes, ["numes:z-ai/glm-5.3-flash:free TimeoutError", "numes:deepseek/deepseek-v4.1-flash:free http_503"]);
    // satu panggilan Numes saja (kunci 1), model Numes kedua dilewati karena jatah habis, lalu Gemini
    assert.deepEqual(hosts, [`api.numes.ai Bearer ${NK1}`, "generativelanguage.googleapis.com Bearer g-key"]);
    assert.ok(skew <= 13_600, `Numes memakai ${skew} ms dari jatah 13,6 detik`);
    assert.ok(timeouts.at(-1)! >= 10_000, `Gemini mendapat batas waktu ${timeouts.at(-1)} ms`);
  } finally {
    Date.now = realNow;
  }
});

test("postChat: semua kunci gagal mengembalikan jawaban gagal terakhir (bisa dibaca), pemanggil lanjut ke model berikutnya", async () => {
  const h = numesHarness([NK1, NK2, NK3], (auth) => (auth === `Bearer ${NK1}` ? 429 : auth === `Bearer ${NK2}` ? 402 : 401));
  const resp = await h.post();
  assert.equal(resp.status, 401);
  assert.equal(h.calls.length, 3);
  assert.match(await resp.text(), /error/);
});

test("postChat: kunci yang kena 429 didinginkan 60 detik, kunci dingin dilewati, semua dingin = 503 buatan tanpa panggilan", async () => {
  const realNow = Date.now;
  let skew = 0;
  Date.now = () => realNow() + skew;
  try {
    const h = numesHarness([NK1, NK2], () => 429);
    assert.equal((await h.post()).status, 429); // K1 429, K2 429
    assert.equal(h.calls.length, 2);
    h.calls.length = 0;
    const blocked = await h.post();
    assert.equal(blocked.status, 503);
    assert.match(await blocked.text(), /no_numes_key_available/);
    assert.equal(h.calls.length, 0, "tidak ada panggilan selama semua kunci dingin");
    skew += NUMES_COOLDOWN_RATE_MS + 1;
    await h.post();
    assert.equal(h.calls.length, 2, "kunci kembali dipakai sesudah masa dingin");
  } finally {
    Date.now = realNow;
  }
});

test("postChat: anggaran waktu habis (timeoutMs 0) menghentikan percobaan tambahan", async () => {
  resetNumesPools();
  const target = resolveModel(NUMES_MODEL, { numes: [NK1, NK2, NK3] })!;
  let budget = 20_000;
  let n = 0;
  const fetchFn = (async () => {
    n++;
    budget = 0; // waktu habis sesudah percobaan pertama
    return new Response("{}", { status: 429 });
  }) as unknown as typeof fetch;
  const resp = await postChat(target, { body: "{}", timeoutMs: () => budget, fetchFn, log: () => {} });
  assert.equal(resp.status, 429);
  assert.equal(n, 1);
});

test("postChat: log hanya memuat nomor kunci, tidak pernah nilainya", async () => {
  const h = numesHarness([NK1, NK2, NK3], (auth) => (auth === `Bearer ${NK3}` ? 200 : auth === `Bearer ${NK1}` ? 429 : 402));
  await h.post();
  const all = h.logs.join("\n");
  for (const key of [NK1, NK2, NK3]) assert.ok(!all.includes(key), `log memuat nilai kunci: ${all}`);
  assert.match(all, /key 1\/3/);
  assert.match(all, /key 2\/3/);
});

test("postChat: target biasa (bukan Numes) satu fetch dengan headers-nya, redirect manual untuk key pengguna", async () => {
  const target = resolveModel("gemini:gemini-3.5-flash-lite", { gemini: "g-key" })!;
  const seen: Array<{ auth: string; redirect?: string }> = [];
  const fetchFn = (async (_u: string, init: RequestInit) => {
    seen.push({ auth: String((init.headers as Record<string, string>).Authorization), redirect: init.redirect });
    return new Response("{}", { status: 429 });
  }) as unknown as typeof fetch;
  const r = await postChat(target, { body: "{}", timeoutMs: () => 1000, fetchFn, redirect: "manual" });
  assert.equal(r.status, 429);
  assert.deepEqual(seen, [{ auth: "Bearer g-key", redirect: "manual" }], "tanpa kolam: tidak ada percobaan ulang");
});

test("Edge Function memakai rantai penyedia dan batas waktu per panggilan yang dibatasi sisa anggaran total", () => {
  const src = readFileSync(new URL("../supabase/functions/generate-application/index.ts", import.meta.url), "utf8");
  assert.match(src, /from "\.\.\/_shared\/providers\.ts"/);
  // Batas waktu per percobaan dihitung ulang dari sisa anggaran total dan dipasang di postChat (providers.ts).
  assert.match(src, /postChat\(candidate, \{\s*timeoutMs: \(\) => nextCallTimeoutMs\(\{ perCallMs: AI_CALL_TIMEOUT_MS, totalBudgetMs: budgetMs, elapsedMs: Date\.now\(\) - requestStarted \}\)/);
  // Numes: batas 12 detik per percobaan (NUMES_TIMEOUT_MS) dan satu NumesBudget per permintaan, supaya Gemini tidak kena time_budget
  assert.match(src, /const NUMES_TIMEOUT_MS = positiveMs\(Deno\.env\.get\("NUMES_TIMEOUT_MS"\), DEFAULT_NUMES_CALL_TIMEOUT_MS\)/);
  assert.match(src, /const numesBudget = new NumesBudget\(\{ totalBudgetMs: AI_TOTAL_BUDGET_MS \}\)/);
  assert.match(src, /numesTimeoutMs: NUMES_TIMEOUT_MS,\s*numesBudget,/);
  assert.doesNotMatch(src, /AbortSignal\.timeout\(AI_CALL_TIMEOUT_MS\)/);
  const providersSrc = readFileSync(new URL("../supabase/functions/_shared/providers.ts", import.meta.url), "utf8");
  assert.match(providersSrc, /signal: AbortSignal\.timeout\(Math\.max\(1, timeoutMs \?\? opts\.timeoutMs\(\)\)\)/);
  assert.doesNotMatch(src, /fetch\("https:\/\/openrouter\.ai/);
  // kunci Numes (NUMES_API_KEY, _2, _3, NUMES_API_KEYS) dibaca dari secret, dan rantai Applify menaruh Anthropic paling akhir
  assert.match(src, /numes: numesKeysFromEnv\(\(name\) => Deno\.env\.get\(name\)\)/);
  assert.match(src, /const FREE_MODELS = platformChain\(/);
  assert.match(src, /const PRO_MODELS = platformChain\(/);
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
  const loop = src.slice(src.indexOf("for (const [index, candidate] of chain.entries())"), src.indexOf("if (!parsed && soft)"));
  assert.ok(src.indexOf("for (const [index, candidate] of chain.entries())") > 0);
  assert.match(loop, /if \(callTimeoutMs === 0\) \{[\s\S]{0,260}break;/);
  // Jatah kandidat gratis habis sebelum Anthropic: lompat (continue), bukan berhenti.
  assert.match(loop, /if \(callTimeoutMs === 0 && reserveAhead\) \{[\s\S]{0,120}continue;/);
  assert.match(loop, /note\("skipped time_budget", started\)/);
  // galat tetap 502 "AI generation failed" (describeError di klien menerjemahkannya), dengan penanda anggaran
  assert.match(src, /error: "AI generation failed"[^;]*budgetExhausted[^;]*\}, 502\)/);
  // verifikasi pemanggil di dalam fungsi tidak disentuh
  assert.match(src, /admin\.auth\.getUser\(token\)/);
  assert.match(src, /Missing auth token/);
  assert.equal(MIN_AI_CALL_MS < DEFAULT_AI_CALL_TIMEOUT_MS && DEFAULT_AI_CALL_TIMEOUT_MS < DEFAULT_AI_TOTAL_BUDGET_MS, true);
});

test("budgetForCandidate: kandidat sebelum Anthropic menyisakan cadangan; Anthropic memakai anggaran penuh (insiden 25 Nov 2026)", () => {
  const total = 34_000, reserve = 12_000;
  assert.deepEqual(budgetForCandidate({ index: 0, firstReservedIndex: 4, totalBudgetMs: total, reserveMs: reserve }), { budgetMs: 22_000, reserveAhead: true });
  assert.deepEqual(budgetForCandidate({ index: 4, firstReservedIndex: 4, totalBudgetMs: total, reserveMs: reserve }), { budgetMs: total, reserveAhead: false });
  assert.deepEqual(budgetForCandidate({ index: 2, firstReservedIndex: -1, totalBudgetMs: total, reserveMs: reserve }), { budgetMs: total, reserveAhead: false });
  // Sesudah 22 detik model gratis, OpenRouter tidak boleh mulai lagi, tetapi Anthropic masih punya 12 detik.
  assert.equal(nextCallTimeoutMs({ perCallMs: 20_000, totalBudgetMs: 22_000, elapsedMs: 22_500 }), 0);
  assert.equal(nextCallTimeoutMs({ perCallMs: 20_000, totalBudgetMs: total, elapsedMs: 22_500 }), 11_500);
});
