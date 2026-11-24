import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveChain } from "../supabase/functions/_shared/providers.ts";
import { runChain } from "../supabase/functions/_shared/chat-chain.ts";
import {
  MAX_QUESTIONS,
  READY_THRESHOLD,
  normalizeFeedback,
  normalizeQuestions,
  parseQuestionsReply,
  parseScoreReply,
  statusForScore,
} from "../supabase/functions/_shared/green-assessment.ts";
import { describeError } from "../src/lib/authErrors.ts";
import {
  MSG_GENERATE_FAILED,
  MSG_SAVE_FAILED,
  MSG_SCORE_FAILED,
  MSG_SERVER_ERROR,
} from "../supabase/functions/_shared/green-assessment.ts";

// Edge Function green-career-assessment berjalan di Deno dan tidak bisa dijalankan di sini. Pengaitannya diperiksa
// lewat teks sumber; rantai penyedia dan perapian jawaban model dites langsung dengan fetch palsu.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const FN = "../supabase/functions/green-career-assessment/index.ts";

// ---- pengaitan di index.ts ----

test("green-career-assessment: memakai rantai penyedia bersama, bukan satu model OpenRouter gratis", () => {
  const src = read(FN);
  assert.match(src, /import \{ DEFAULT_FREE_MODELS, numesKeysFromEnv, parseModelList, platformChain \} from "\.\.\/_shared\/providers\.ts"/);
  assert.match(src, /import \{ runChain \} from "\.\.\/_shared\/chat-chain\.ts"/);
  assert.match(src, /platformChain\(\s*parseModelList\(Deno\.env\.get\("FREE_MODELS"\) \?\? Deno\.env\.get\("FREE_MODEL"\), DEFAULT_FREE_MODELS\)/);
  assert.match(src, /GEMINI_API_KEY/);
  assert.match(src, /ANTHROPIC_API_KEY/);
  assert.match(src, /numes: numesKeysFromEnv\(\(name\) => Deno\.env\.get\(name\)\)/);
  // dua mode sama-sama lewat runChain
  assert.equal([...src.matchAll(/await runChain\(MODELS/g)].length, 2);
  // tidak ada lagi panggilan langsung ke OpenRouter atau model gratis yang sudah dicabut
  assert.doesNotMatch(src, /openrouter\.ai/);
  assert.doesNotMatch(src, /deepseek-v4-flash/);
  assert.doesNotMatch(src, /await fetch\(/);
});

test("green-career-assessment: kegagalan dicatat lewat console.error dengan kode alasan, tanpa data pengguna", () => {
  const src = read(FN);
  assert.match(src, /console\.error\(`\$\{TAG\} generate_failed all_providers_failed/);
  assert.match(src, /console\.error\(`\$\{TAG\} score_failed all_providers_failed/);
  assert.match(src, /console\.error\(`\$\{TAG\} insert_failed table=green_career_assessments code=/);
  assert.match(src, /console\.error\(`\$\{TAG\} update_failed table=green_career_assessments code=/);
  assert.match(src, /console\.error\(`\$\{TAG\} unhandled /);
  assert.match(src, /console\.error\(`\$\{TAG\} not_configured/);
  // baris log tidak menyebut isi prompt, jawaban, token, atau kunci
  const logs = [...src.matchAll(/console\.error\(([^\n]*)\)/g)].map((m) => m[1]).join("\n");
  assert.doesNotMatch(logs, /token|user\b|answers|Authorization|KEY|SERVICE_ROLE/);
  const chain = read("../supabase/functions/_shared/chat-chain.ts");
  const chainLogs = [...chain.matchAll(/logger\.(?:error|log)\(([^\n]*)\)/g)].map((m) => m[1]).join("\n");
  assert.match(chainLogs, /provider_failed reason=\$\{reason\} model=\$\{candidate\.entry\}/);
  assert.match(chainLogs, /model accepted \$\{candidate\.entry\}/);
  assert.doesNotMatch(chainLogs, /messages|content|headers|Authorization|text\(\)/);
});

test("green-career-assessment: semua penyedia gagal membalas 502 berbahasa Indonesia, bukan 500 mentah", () => {
  const src = read(FN);
  assert.match(src, /return json\(\{ error: MSG_GENERATE_FAILED \}, 502\)/);
  assert.match(src, /return json\(\{ error: MSG_SCORE_FAILED \}, 502\)/);
  assert.match(src, /AI not configured \(no provider key set\)" \}, 503\)/);
  // galat database dan galat tak terduga tidak membocorkan teks mentah ke pengguna
  assert.match(src, /return json\(\{ error: MSG_SAVE_FAILED \}, 500\)/);
  assert.match(src, /return json\(\{ error: MSG_SERVER_ERROR \}, 500\)/);
  assert.doesNotMatch(src, /error: insErr\.message/);
  assert.doesNotMatch(src, /error: String\(e\?\.message/);
});

test("green-career-assessment: autentikasi, mode, dan bentuk balasan sukses tidak berubah", () => {
  const src = read(FN);
  assert.match(src, /return json\(\{ error: "Missing auth token" \}, 401\)/);
  assert.match(src, /return json\(\{ error: "Invalid token" \}, 401\)/);
  assert.match(src, /const mode = body\?\.mode \?\? "generate"/);
  assert.match(src, /return json\(\{ assessmentId: row\.id, job: \{ id: job\.id, title: job\.title, company: job\.company \}, questions \}\)/);
  assert.match(src, /return json\(\{ readinessScore: score, status, feedback \}\)/);
  // kolom yang ditulis ada di tabel production: status ('interviewing', 'ready', 'needs_development'), assessment, transcript
  assert.match(src, /insert\(\{ user_id: userId, job_id: jobId, status: "interviewing", assessment: \{ questions \} \}\)/);
  assert.match(src, /update\(\{ status, readiness_score: score, transcript: answers, feedback, updated_at:/);
  // tidak membaca kuota bulanan lamaran: asesmen opsional dan tanpa biaya
  assert.doesNotMatch(src, /get_quota_status|consume_monthly_apply/);
});

test("pesan galat Indonesia lolos describeError apa adanya di layar", () => {
  for (const msg of [MSG_GENERATE_FAILED, MSG_SCORE_FAILED, MSG_SAVE_FAILED, MSG_SERVER_ERROR]) {
    assert.equal(describeError(new Error(msg), "fallback"), msg);
    assert.doesNotMatch(msg, /—/);
  }
});

// ---- rantai penyedia (runChain) ----

const KEYS = { openrouter: "or-secret", gemini: "g-secret", anthropic: "a-secret" };
const CHAIN = resolveChain(["gemini:model-a", "anthropic:model-b", "vendor/model-c:free"], KEYS);
const okBody = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const messages = [{ role: "system", content: "RAHASIA-PROMPT" }, { role: "user", content: "DATA-PENGGUNA" }];

function harness(replies: Array<() => Response | Promise<Response>>) {
  const calls: Array<{ url: string; body: any }> = [];
  const errors: string[] = [];
  const logs: string[] = [];
  let i = 0;
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return replies[i++]();
  }) as unknown as typeof fetch;
  const logger = { error: (l: string) => errors.push(l), log: (l: string) => logs.push(l) };
  return { calls, errors, logs, fetchFn, logger };
}

const run = (h: ReturnType<typeof harness>, extra: Record<string, unknown> = {}) =>
  runChain(CHAIN, {
    tag: "[t]", messages, temperature: 0.4, maxTokens: 900, timeoutMs: 1000,
    accept: (t: string) => (t.includes("OK") ? t : null),
    fetchFn: h.fetchFn, logger: h.logger, ...extra,
  });

test("runChain: model pertama gagal HTTP, model kedua menjawab, dan kegagalan tercatat dengan kode dan nama model", async () => {
  const h = harness([() => new Response("quota", { status: 429 }), () => okBody("OK jawaban")]);
  const r = await run(h);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value, "OK jawaban");
    assert.equal(r.model, "anthropic:model-b");
    assert.deepEqual(r.attempts.map((a) => a.outcome), ["http_429", "accepted"]);
  }
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[0].url, /generativelanguage\.googleapis\.com/);
  assert.match(h.calls[1].url, /api\.anthropic\.com/);
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0], /^\[t\] provider_failed reason=http_429 model=gemini:model-a \d+ms$/);
  assert.match(h.logs[0], /^\[t\] model accepted anthropic:model-b \d+ms$/);
});

test("runChain: Claude tidak menerima temperature dan mendapat max_tokens minimal 8000 (chatBody bersama)", async () => {
  const h = harness([() => new Response("x", { status: 500 }), () => okBody("OK")]);
  await run(h);
  assert.equal(h.calls[0].body.temperature, 0.4);
  assert.equal(h.calls[0].body.max_tokens, 900);
  assert.equal("temperature" in h.calls[1].body, false);
  assert.equal(h.calls[1].body.max_tokens, 8000);
});

test("runChain: jaringan, timeout, JSON rusak, jawaban kosong, dan jawaban ditolak masing-masing punya kode alasan", async () => {
  const h = harness([
    () => { throw new DOMException("t", "TimeoutError"); },
    () => new Response("<html>", { status: 200 }),
    () => okBody("<think>mikir</think>"),
    () => { throw new TypeError("fetch failed"); },
    () => okBody("tidak layak"),
  ]);
  const five = resolveChain(["gemini:a", "gemini:b", "gemini:c", "gemini:d", "gemini:e"], KEYS);
  const r = await runChain(five, {
    tag: "[t]", messages, temperature: 0.4, maxTokens: 900, timeoutMs: 1000,
    accept: (t: string) => (t.includes("OK") ? t : null), fetchFn: h.fetchFn, logger: h.logger,
  });
  assert.equal(r.ok, false);
  assert.deepEqual(r.attempts.map((a) => a.outcome), ["timeout", "bad_json", "empty", "network", "rejected"]);
  assert.equal(h.errors.length, 5);
  assert.match(h.errors[0], /reason=timeout model=gemini:a/);
  assert.match(h.errors[4], /reason=rejected model=gemini:e/);
});

test("runChain: balasan berisi rantai pikir dibersihkan sebelum diperiksa", async () => {
  const h = harness([() => okBody("<think>{bukan json}</think>OK {\"a\":1}")]);
  const r = await run(h);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, "OK {\"a\":1}");
});

test("runChain: log tidak memuat isi prompt, isi jawaban, atau kunci", async () => {
  const h = harness([() => new Response("DATA-PENGGUNA or-secret g-secret", { status: 401 }), () => okBody("OK JAWABAN-RAHASIA"), () => okBody("OK")]);
  await run(h);
  const all = [...h.errors, ...h.logs].join("\n");
  assert.doesNotMatch(all, /RAHASIA|DATA-PENGGUNA|secret/);
});

test("runChain: semua penyedia gagal mengembalikan ok=false dengan satu baris galat per model", async () => {
  const h = harness([() => new Response("", { status: 503 }), () => new Response("", { status: 402 }), () => new Response("", { status: 404 })]);
  const r = await run(h);
  assert.equal(r.ok, false);
  assert.deepEqual(r.attempts.map((a) => a.outcome), ["http_503", "http_402", "http_404"]);
  assert.deepEqual(h.errors.map((l) => /reason=(\S+) model=(\S+)/.exec(l)!.slice(1)), [
    ["http_503", "gemini:model-a"], ["http_402", "anthropic:model-b"], ["http_404", "vendor/model-c:free"],
  ]);
  assert.equal(h.logs.length, 0);
});

test("runChain: Numes memakai kolam kunci: kunci 1 kena 429, kunci 2 menjawab model yang sama; model berikutnya tidak disentuh", async () => {
  const K1 = "nk-one-not-real";
  const K2 = "nk-two-not-real";
  const chain = resolveChain(["numes:z-ai/glm-5.3-flash:free", "gemini:model-a"], { gemini: "g-secret", numes: [K1, K2] });
  const auths: string[] = [];
  const errors: string[] = [];
  const logs: string[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    auths.push(`${new URL(url).hostname} ${(init.headers as Record<string, string>).Authorization}`);
    return auths.length === 1 ? new Response("{}", { status: 429 }) : okBody("OK jawaban");
  }) as unknown as typeof fetch;
  const r = await runChain(chain, {
    tag: "[t]", messages, temperature: 0.4, maxTokens: 900, timeoutMs: 1000,
    accept: (t: string) => (t.includes("OK") ? t : null), fetchFn, logger: { error: (l) => errors.push(l), log: (l) => logs.push(l) },
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.model, "numes:z-ai/glm-5.3-flash:free");
  assert.deepEqual(auths, [`api.numes.ai Bearer ${K1}`, `api.numes.ai Bearer ${K2}`]);
  // log pindah kunci hanya memuat nomor kunci
  const all = [...errors, ...logs].join("\n");
  assert.match(all, /key 1\/2 -> HTTP 429/);
  assert.ok(!all.includes(K1) && !all.includes(K2));
});

test("runChain: rantai kosong atau batas total waktu habis berhenti tanpa memanggil model berikutnya", async () => {
  const empty = harness([]);
  const r0 = await runChain([], { tag: "[t]", messages, temperature: 0, maxTokens: 10, timeoutMs: 10, accept: () => "x", fetchFn: empty.fetchFn, logger: empty.logger });
  assert.equal(r0.ok, false);
  assert.equal(empty.calls.length, 0);

  let t = 0;
  const h = harness([() => new Response("", { status: 500 }), () => okBody("OK")]);
  const r = await run(h, { budgetMs: 50, now: () => (t += 40) });
  assert.equal(r.ok, false);
  assert.equal(h.calls.length, 1);
  assert.match(h.errors.at(-1)!, /chain_budget_exhausted/);
});

test("rantai bawaan: tanpa satu pun kunci penyedia, rantai kosong (fungsi membalas 503)", () => {
  assert.equal(resolveChain(["gemini:a", "anthropic:b", "x/y:free"], {}).length, 0);
  assert.equal(resolveChain(["gemini:a", "anthropic:b", "x/y:free"], { gemini: "k" }).length, 1);
});

// ---- perapian jawaban model ----

test("normalizeQuestions: id unik, mcq tanpa opsi cukup jadi isian, soal kosong dibuang, paling banyak 6", () => {
  const raw = [
    { id: "q1", type: "mcq", question: " Apa itu ESG? ", options: ["A", "B", " ", "C"] },
    { id: "q1", type: "text", question: "Ceritakan pengalamanmu." },
    { type: "mcq", question: "Satu opsi saja", options: ["A"] },
    { id: "q4", type: "text", question: "   " },
    "bukan objek",
    null,
    ...Array.from({ length: 10 }, (_, i) => ({ type: "text", question: `Soal tambahan ${i}` })),
  ];
  const qs = normalizeQuestions(raw);
  assert.equal(qs.length, MAX_QUESTIONS);
  assert.deepEqual(qs[0], { id: "q1", type: "mcq", question: "Apa itu ESG?", options: ["A", "B", "C"] });
  assert.deepEqual(qs[1], { id: "q2", type: "text", question: "Ceritakan pengalamanmu." });
  assert.deepEqual(qs[2], { id: "q3", type: "text", question: "Satu opsi saja" });
  assert.equal(new Set(qs.map((q) => q.id)).size, qs.length);
  assert.deepEqual(normalizeQuestions("x"), []);
  assert.deepEqual(normalizeQuestions(undefined), []);
});

test("parseQuestionsReply: JSON dalam pagar kode terbaca, jawaban tanpa soal ditolak (null)", () => {
  const ok = parseQuestionsReply('```json\n{"questions":[{"id":"q1","type":"text","question":"Halo?"}]}\n```');
  assert.equal(ok?.length, 1);
  assert.equal(parseQuestionsReply("maaf, tidak bisa"), null);
  assert.equal(parseQuestionsReply('{"questions":[]}'), null);
  assert.equal(parseQuestionsReply('{"questions":[{"question":""}]}'), null);
});

test("parseScoreReply: skor dijepit 0..100, status dari ambang 70, tanpa skor ditolak (bukan skor 0)", () => {
  const hi = parseScoreReply('{"readinessScore": 84.4, "feedback": {"strengths": ["Kuat"], "gaps": [], "developmentPath": ["Belajar"]}}');
  assert.equal(hi?.score, 84);
  assert.equal(hi?.status, "ready");
  assert.deepEqual(hi?.feedback.strengths, ["Kuat"]);
  assert.equal(parseScoreReply('{"readinessScore": 150}')?.score, 100);
  assert.equal(parseScoreReply('{"readinessScore": "69"}')?.status, "needs_development");
  assert.equal(parseScoreReply('{"readinessScore": 0}')?.score, 0);
  assert.equal(parseScoreReply('{"verdict":"ready"}'), null);
  assert.equal(parseScoreReply('{"readinessScore": "bagus"}'), null);
  assert.equal(parseScoreReply("bukan json"), null);
  assert.equal(statusForScore(READY_THRESHOLD), "ready");
  assert.equal(statusForScore(READY_THRESHOLD - 1), "needs_development");
});

test("normalizeFeedback: selalu tiga daftar teks, objek dibaca teksnya, sisanya dibuang", () => {
  assert.deepEqual(normalizeFeedback(undefined), { strengths: [], gaps: [], developmentPath: [] });
  assert.deepEqual(
    normalizeFeedback({ strengths: ["A", " ", { text: "B" }, { skill: "C" }, 7, null], gaps: "bukan daftar", developmentPath: [{ message: "D" }] }),
    { strengths: ["A", "B", "C"], gaps: [], developmentPath: ["D"] },
  );
});
