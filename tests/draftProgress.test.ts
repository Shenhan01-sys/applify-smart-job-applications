import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  DRAFT_CLIENT_TIMEOUT_MS,
  DRAFT_TIMEOUT_MESSAGE,
  SLOW_HINT_AFTER_SECONDS,
  draftErrorMessage,
  draftProgressText,
  draftStage,
  draftWaitHint,
  invokeWithDraftTimeout,
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
  assert.match(src, /import \{ invokeWithDraftTimeout \} from "@\/lib\/draftProgress"/);
  assert.match(src, /invokeWithDraftTimeout\(\(timeout\) =>\s*supabase\.functions\.invoke\("generate-application", \{ body: \{ jobId, mode, tone \}, timeout \}\),?\s*\)/);
  // pemetaan galat ada di satu tempat yang diuji, bukan disalin di layanan
  assert.doesNotMatch(src, /isClientTimeout|DRAFT_TIMEOUT_MESSAGE/);
});

// ---- batas waktu klien diuji dengan supabase.functions asli dan fetch yang tidak pernah menjawab ----------------
// (uji klik 20 November 2026, temuan 13: jalur galat 40 detik tidak sempat terpicu di produksi)

/** `supabase.functions` dari supabase-js asli, dengan fetch buatan; tanpa sesi, tanpa jaringan. */
const functionsWith = (fetchImpl: typeof fetch) =>
  createClient("http://localhost:54321", "anon-test-key", { global: { fetch: fetchImpl }, auth: { persistSession: false, autoRefreshToken: false } }).functions;
const abortError = () => new DOMException("This operation was aborted", "AbortError");
/** fetch yang menggantung sampai dibatalkan, seperti Edge Function yang tidak menjawab. */
const hangingFetch = ((_url: unknown, init?: { signal?: AbortSignal }) =>
  new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(abortError())))) as unknown as typeof fetch;
const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("temuan 13: supabase.functions asli yang menyerah karena timeout menghasilkan galat yang dikenali isClientTimeout", async () => {
  const client = functionsWith(hangingFetch);
  const started = Date.now();
  const { data, error } = await client.invoke("generate-application", { body: { jobId: "j1" }, timeout: 40 });
  assert.equal(data, null);
  assert.ok(Date.now() - started < 1_000, "menyerah sesudah timeout, tidak menggantung");
  assert.equal((error as { name?: string }).name, "FunctionsFetchError");
  assert.equal(isClientTimeout(error), true);
});

test("temuan 13: invokeWithDraftTimeout melempar pesan coba lagi saat batas waktu habis, dan memberi batas waktunya ke invoke", async () => {
  const client = functionsWith(hangingFetch);
  let received = -1;
  await assert.rejects(
    invokeWithDraftTimeout((timeout) => {
      received = timeout;
      return client.invoke("generate-application", { body: { jobId: "j1" }, timeout: 40 });
    }),
    (err: Error) => {
      assert.equal(err.message, DRAFT_TIMEOUT_MESSAGE);
      // yang sampai ke layar (describeError) sama dengan pesan galat 502 server
      assert.equal(describeError(err, "Draf belum bisa dibuat. Coba lagi."), DRAFT_TIMEOUT_MESSAGE);
      return true;
    },
  );
  assert.equal(received, DRAFT_CLIENT_TIMEOUT_MS);
  // batas waktu bawaan bisa diganti (dipakai uji ini), dan tanpa argumen sama dengan DRAFT_CLIENT_TIMEOUT_MS
  let custom = -1;
  await invokeWithDraftTimeout((t) => { custom = t; return Promise.resolve({ data: 1, error: null }); }, 123);
  assert.equal(custom, 123);
});

test("temuan 13: Coba lagi: panggilan kedua berhasil sesudah panggilan pertama kehabisan waktu, tanpa sisa keadaan", async () => {
  let calls = 0;
  const flaky = ((url: unknown, init?: { signal?: AbortSignal }) => {
    calls += 1;
    if (calls === 1) return hangingFetch(url, init);
    return Promise.resolve(jsonResponse(200, { application: { id: "app-1" }, analysis: { skillGaps: [] } }));
  }) as unknown as typeof fetch;
  const client = functionsWith(flaky);
  const attempt = () => invokeWithDraftTimeout<{ application: { id: string } }>((timeout) => client.invoke("generate-application", { body: { jobId: "j1" }, timeout }), 40);
  await assert.rejects(attempt(), { message: DRAFT_TIMEOUT_MESSAGE });
  const second = await attempt();
  assert.equal(second?.application.id, "app-1");
  assert.equal(calls, 2);
});

test("temuan 13: galat selain batas waktu tidak memakai pesan batas waktu", async () => {
  // jaringan putus: FunctionsFetchError dengan TypeError, pesan asli dipertahankan
  const offline = functionsWith((() => Promise.reject(new TypeError("Failed to fetch"))) as unknown as typeof fetch);
  await assert.rejects(
    invokeWithDraftTimeout((timeout) => offline.invoke("generate-application", { body: {}, timeout })),
    (err: Error) => err.message !== DRAFT_TIMEOUT_MESSAGE && /Failed to send a request to the Edge Function/.test(err.message),
  );
  // server menjawab 4xx dengan { error }: pesan server yang ditampilkan
  const quota = functionsWith((() => Promise.resolve(jsonResponse(402, { error: "Kuota draf bulan ini habis." }))) as unknown as typeof fetch);
  await assert.rejects(
    invokeWithDraftTimeout((timeout) => quota.invoke("generate-application", { body: {}, timeout })),
    { message: "Kuota draf bulan ini habis." },
  );
  // badan jawaban bukan JSON: pesan galat bawaan supabase-js
  const html = functionsWith((() => Promise.resolve(new Response("<html>Bad gateway</html>", { status: 502 }))) as unknown as typeof fetch);
  await assert.rejects(
    invokeWithDraftTimeout((timeout) => html.invoke("generate-application", { body: {}, timeout })),
    (err: Error) => err.message !== DRAFT_TIMEOUT_MESSAGE && err.message.length > 0,
  );
  // jawaban sukses mengembalikan datanya apa adanya
  const ok = functionsWith((() => Promise.resolve(jsonResponse(200, { application: { id: "a" } }))) as unknown as typeof fetch);
  assert.deepEqual(await invokeWithDraftTimeout((timeout) => ok.invoke("generate-application", { body: {}, timeout })), { application: { id: "a" } });
});

test("temuan 13: draftErrorMessage membaca badan JSON server, dan jatuh ke pesan galat bila badannya rusak", async () => {
  assert.equal(await draftErrorMessage({ name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ error: "Profil belum lengkap." }) } }), "Profil belum lengkap.");
  assert.equal(await draftErrorMessage({ name: "FunctionsHttpError", message: "non-2xx", context: { json: async () => { throw new SyntaxError("Unexpected token"); } } }), "non-2xx");
  assert.equal(await draftErrorMessage({ name: "FunctionsHttpError", message: "non-2xx", context: { json: async () => ({}) } }), "non-2xx");
  assert.equal(await draftErrorMessage({ name: "FunctionsFetchError", message: "x", context: { name: "TimeoutError" } }), DRAFT_TIMEOUT_MESSAGE);
  assert.equal(await draftErrorMessage({ name: "FunctionsFetchError", message: "x", context: new TypeError("Failed to fetch") }), "x");
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
