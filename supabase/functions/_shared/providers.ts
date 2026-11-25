// Penyedia model AI untuk Edge Function generate-application. TypeScript murni tanpa API Deno atau browser,
// supaya bisa dites dengan node:test.
//
// Setiap entri rantai model ditulis sebagai "<penyedia>:<model>" atau langsung slug OpenRouter:
//   gemini:gemini-3.5-flash-lite      -> Google AI Studio, endpoint kompatibel OpenAI, kunci GEMINI_API_KEY
//   anthropic:claude-haiku-5-5        -> Anthropic, endpoint kompatibel OpenAI, kunci ANTHROPIC_API_KEY
//   numes:z-ai/glm-5.3-flash:free     -> Numes (pasar model), endpoint kompatibel OpenAI, kunci NUMES_API_KEY,
//                                        NUMES_API_KEY_2, NUMES_API_KEY_3 atau NUMES_API_KEYS (kolam kunci, numes-keys.ts)
//   google/gemma-4-31b-it:free        -> OpenRouter (tanpa awalan), kunci OPENROUTER_API_KEY
//   openai:<model>                    -> OpenAI, hanya dipakai dengan key milik pengguna (BYOK, _shared/byok.ts);
//                                        Applify sendiri tidak punya OPENAI_API_KEY
// Semuanya menerima format chat completions yang sama, jadi pemanggil cukup mengganti URL, kunci, dan nama model.
// Hanya awalan pertama yang menjadi penyedia: nama model Numes sendiri memuat "/" dan ":" (author/model:free).
// Entri yang kuncinya tidak ada dilewati, sehingga rantai tetap jalan walau hanya sebagian kunci terpasang.
//
// Urutan: entri "anthropic:" selalu dijalankan paling akhir, apa pun urutan di FREE_MODELS / PRO_MODELS (platformChain).
// Pemilik ingin menghemat kredit Anthropic, jadi Claude hanya cadangan terakhir (keputusan 24 Nov 2026). Key Anthropic
// milik pengguna sendiri (BYOK) tidak terpengaruh: rantai BYOK dibuat terpisah di byok.ts dan tetap berjalan lebih dulu.
import { numesErrorType, numesPoolFor, parseNumesKeys, runWithNumesKeys, type NumesBudget, type NumesKeyPool } from "./numes-keys.ts";

export type ProviderName = "openrouter" | "gemini" | "anthropic" | "numes" | "openai";

export interface ProviderKeys {
  openrouter?: string;
  gemini?: string;
  anthropic?: string;
  /** Kunci platform Numes: satu string, atau daftar (satu sampai tiga) untuk kolam kunci. */
  numes?: string | readonly string[];
  openai?: string;
}

/** Kunci platform Numes dari secret (NUMES_API_KEY, _2, _3, NUMES_API_KEYS), mis. `numesKeysFromEnv((n) => Deno.env.get(n))`. */
export function numesKeysFromEnv(get: (name: string) => string | undefined | null): string[] {
  const env: Record<string, string | undefined> = {};
  for (const name of ["NUMES_API_KEY", "NUMES_API_KEY_2", "NUMES_API_KEY_3", "NUMES_API_KEY_4", "NUMES_API_KEY_5", "NUMES_API_KEYS"]) env[name] = get(name) ?? undefined;
  return parseNumesKeys(env);
}

export interface ResolvedModel {
  provider: ProviderName;
  /** Entri asli di rantai, dipakai untuk log dan pesan galat. */
  entry: string;
  /** Nama model yang dikirim ke penyedia. */
  model: string;
  url: string;
  /** Untuk Numes tanpa Authorization: kuncinya dipasang per percobaan oleh kolam kunci (postChat). */
  headers: Record<string, string>;
  /** Hanya Numes: kolam kunci platform. */
  pool?: NumesKeyPool;
}

const ENDPOINTS: Record<ProviderName, string> = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  anthropic: "https://api.anthropic.com/v1/chat/completions",
  numes: "https://api.numes.ai/api/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
};

// Model Numes bawaan. Dokumen Numes (numes.ai/docs/models, dibaca 24 Nov 2026) tidak mendaftar id model selain contoh,
// karena katalognya dinamis (GET /api/v1/models dengan kunci, atau numes.ai/models). Dua id ini dipilih Hans 23 Nov 2026
// untuk preset Numes (Applify-Obsidian/NextRoadMap/19) dan sama dengan backend dan worker. Akhiran `:free` berarti hanya
// endpoint berharga nol: tidak pernah ditagih dan tidak pernah jatuh ke endpoint berbayar. Id tanpa `:free` butuh saldo
// (402 insufficient_credits bila kosong). Paket Pro memakai dua id yang sama karena tidak ada id yang lebih kuat yang
// bisa diverifikasi dari dokumen; setelah mengecek katalog dan saldo, taruh id berbayar di secret PRO_MODELS.
const NUMES_MODELS = "numes:z-ai/glm-5.3-flash:free,numes:deepseek/deepseek-v4.1-flash:free";

/** Rantai bawaan bila secret FREE_MODELS / PRO_MODELS tidak diisi. */
// Free: Numes dulu (GLM 5.3 Flash lalu DeepSeek V4.1 Flash, gratis), lalu Gemini, lalu model gratis OpenRouter, dan
// Claude Haiku 5.5 paling akhir. Sebelum 24 Nov 2026 Claude Sonnet dan Haiku di depan; pemilik ingin menghemat kredit
// Anthropic. Entri yang kuncinya tidak ada dilewati (NUMES_API_KEY..., GEMINI_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY).
export const DEFAULT_FREE_MODELS =
  `${NUMES_MODELS},gemini:gemini-3.5-flash-lite,google/gemma-4-31b-it:free,openrouter/free,anthropic:claude-haiku-5-5`;
// Pro: Numes dulu, lalu Gemini 4 (Gemini 4 menggantikan DeepSeek V4 atas keputusan Hans 19 Nov 2026), lalu model gratis
// OpenRouter, dan Claude Sonnet 5.5 lalu Haiku 5.5 paling akhir. Uji coba 19 Nov: gemini-4-argon menolak dengan 429
// (kuota free tier 0, butuh billing), gemini-4-hydrogen 503 karena permintaan tinggi.
export const DEFAULT_PRO_MODELS =
  `${NUMES_MODELS},gemini:gemini-4-hydrogen,gemini:gemini-4-argon,google/gemma-4-31b-it:free,openrouter/free,anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5`;

export function parseModelList(raw: string | undefined, fallback: string): string[] {
  return (raw && raw.trim() ? raw : fallback).split(",").map((m) => m.trim()).filter(Boolean);
}

/** Ubah satu entri rantai menjadi tujuan panggilan, atau null bila kunci penyedianya tidak ada. */
export function resolveModel(entry: string, keys: ProviderKeys): ResolvedModel | null {
  const m = /^(gemini|anthropic|numes|openai):(.+)$/.exec(entry);
  const provider: ProviderName = m ? (m[1] as ProviderName) : "openrouter";
  const model = m ? m[2] : entry;
  if (provider === "numes") {
    const list = typeof keys.numes === "string" ? [keys.numes] : [...(keys.numes ?? [])];
    const pool = list.map((k) => k.trim()).filter(Boolean);
    if (pool.length === 0) return null;
    return { provider, entry, model, url: ENDPOINTS.numes, headers: { "Content-Type": "application/json" }, pool: numesPoolFor(pool) };
  }
  const key = keys[provider];
  if (!key) return null;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://applify.id";
    headers["X-Title"] = "Applify";
  }
  return { provider, entry, model, url: ENDPOINTS[provider], headers };
}

/** Rantai yang benar-benar bisa dipanggil dengan kunci yang terpasang, urutan dipertahankan. */
export function resolveChain(entries: string[], keys: ProviderKeys): ResolvedModel[] {
  return entries.map((e) => resolveModel(e, keys)).filter((r): r is ResolvedModel => r !== null);
}

/** Entri "anthropic:" dipindah ke belakang, urutan lainnya dipertahankan. */
export function anthropicLast(entries: string[]): string[] {
  return [...entries.filter((e) => !e.startsWith("anthropic:")), ...entries.filter((e) => e.startsWith("anthropic:"))];
}

/**
 * Rantai Applify (kunci platform) untuk satu paket: resolveChain dengan Anthropic selalu paling belakang, apa pun urutan
 * di FREE_MODELS / PRO_MODELS (cadangan terakhir, lihat catatan di atas file). Dipakai generate-application dan
 * green-career-assessment. Rantai BYOK (key pengguna) dibuat terpisah di byok.ts.
 */
export function platformChain(entries: string[], keys: ProviderKeys): ResolvedModel[] {
  return resolveChain(anthropicLast(entries), keys);
}

// ---- satu panggilan chat, dengan kolam kunci untuk Numes ------------------------------------------------------

export interface PostableTarget {
  entry: string;
  url: string;
  headers: Record<string, string>;
  pool?: NumesKeyPool;
}

export interface PostChatOptions {
  /** Badan permintaan (JSON). */
  body: string;
  /** Batas waktu (ms) satu percobaan, dihitung ulang tiap percobaan. 0 = waktu habis: tidak ada percobaan tambahan. */
  timeoutMs: () => number;
  /** Hanya Numes: batas waktu satu percobaan (ms). Bawaan 12 detik (DEFAULT_NUMES_CALL_TIMEOUT_MS), env NUMES_TIMEOUT_MS. */
  numesTimeoutMs?: number;
  /** Hanya Numes: anggaran waktu bersama semua entri Numes dalam satu permintaan (buat satu per permintaan). */
  numesBudget?: NumesBudget;
  /** Boleh mencoba kunci berikutnya? Bawaan: masih ada waktu (timeoutMs() > 0). */
  canRetry?: () => boolean;
  /** "manual" untuk key milik pengguna (jangan ikuti redirect ke host lain). Bawaan "follow". */
  redirect?: "follow" | "manual";
  fetchFn?: typeof fetch;
  /** Bawaan: console.warn. Hanya memuat nomor kunci, tidak pernah nilainya. */
  log?: (line: string) => void;
}

/**
 * Kirim satu permintaan chat. Target biasa: satu fetch dengan headers-nya. Target Numes (ada `pool`): kunci dicoba
 * berurutan lewat kolam kunci (numes-keys.ts); hanya 401/402/403/429 yang berganti ke kunci berikutnya untuk model
 * yang sama. Batas waktu atau galat sambungan melepas modelnya saat itu juga (modelnya yang lambat, bukan kuncinya),
 * dan batas waktu mendinginkan model 5 menit. Tiap percobaan Numes dibatasi `numesTimeoutMs` dan `numesBudget`.
 * Mengembalikan Response terakhir (2xx bila ada kunci yang berhasil) agar pemanggil memperlakukannya seperti
 * penyedia lain, melempar galat jaringan terakhir, atau 503 buatan bila Numes dilewati tanpa percobaan.
 */
export async function postChat(target: PostableTarget, opts: PostChatOptions): Promise<Response> {
  const doFetch = opts.fetchFn ?? fetch;
  const send = (headers: Record<string, string>, timeoutMs?: number) =>
    doFetch(target.url, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(Math.max(1, timeoutMs ?? opts.timeoutMs())),
      redirect: opts.redirect ?? "follow",
      body: opts.body,
    });
  if (!target.pool) return await send(target.headers);
  const run = await runWithNumesKeys(
    target.pool,
    async (key, _index, timeoutMs) => {
      const resp = await send({ ...target.headers, Authorization: `Bearer ${key}` }, timeoutMs);
      if (resp.ok) return { status: resp.status, resp };
      let errorType: string | null = null;
      try {
        errorType = numesErrorType(await resp.clone().json());
      } catch {
        /* badan bukan JSON */
      }
      return { status: resp.status, retryAfter: resp.headers.get("retry-after"), errorType, resp };
    },
    {
      label: target.entry,
      canContinue: opts.canRetry ?? (() => opts.timeoutMs() > 0),
      log: opts.log ?? ((line) => console.warn(line)),
      callTimeoutMs: opts.numesTimeoutMs,
      limitMs: opts.timeoutMs,
      budget: opts.numesBudget,
    },
  );
  if (run.reply) return run.reply.resp;
  if (run.error) throw run.error;
  // Tidak ada percobaan (semua kunci didinginkan, model sedang didinginkan karena lambat, atau anggaran Numes habis):
  // jawaban 503 buatan, supaya dicatat seperti galat penyedia lain dan rantai lanjut ke penyedia berikutnya.
  const reason = run.skipped === "model_cooling" ? "numes_model_cooling" : run.skipped === "budget" ? "numes_budget_spent" : "no_numes_key_available";
  return new Response(JSON.stringify({ error: reason }), { status: 503, headers: { "Content-Type": "application/json" } });
}

/** Batas bawah max_tokens untuk Claude, karena penalaran tersembunyinya ikut memakai jatah ini. */
export const CLAUDE_MIN_MAX_TOKENS = 8000;

/**
 * Badan permintaan chat per penyedia. Claude menolak `temperature` dengan HTTP 400
 * ("`temperature` is deprecated for this model"), dan penalaran tersembunyinya memakai jatah
 * `max_tokens`, sehingga jawaban bisa kosong bila jatahnya pas-pasan. Untuk Claude, `temperature`
 * dihilangkan dan `max_tokens` dinaikkan minimal 8.000 (2.400 terlalu kecil: draf lowongan GoTo 23 November 2026
 * terpotong sebelum JSON ditutup, lalu ditolak sebagai not_a_letter).
 */
export function chatBody(
  target: Pick<ResolvedModel, "provider" | "model">,
  messages: { role: string; content: string }[],
  opts: { temperature: number; maxTokens: number },
): Record<string, unknown> {
  if (target.provider === "anthropic") {
    return { model: target.model, messages, max_tokens: Math.max(opts.maxTokens, CLAUDE_MIN_MAX_TOKENS) };
  }
  // OpenAI (BYOK): model penalaran OpenAI menolak `max_tokens` dan `temperature` selain bawaan, sedangkan
  // `max_completion_tokens` diterima semua model chat completions. Jatahnya dinaikkan seperti Claude karena
  // penalaran tersembunyi ikut memakainya. Belum diuji dengan key OpenAI sungguhan (23 November 2026).
  if (target.provider === "openai") {
    return { model: target.model, messages, max_completion_tokens: Math.max(opts.maxTokens, CLAUDE_MIN_MAX_TOKENS) };
  }
  return { model: target.model, messages, temperature: opts.temperature, max_tokens: opts.maxTokens };
}

// ---- batas waktu rantai ------------------------------------------------------------------------------------
// Dulu tiap panggilan punya batas sendiri (40 detik) dan rantai tidak punya batas total, jadi empat model yang
// lambat bisa menahan pengguna lebih dari 50 detik tanpa jawaban (uji E2E klik 20 November 2026, temuan 13).
// Kini seluruh rantai berbagi satu anggaran waktu yang dihitung sejak permintaan masuk, dan klien menyerah
// sedikit sesudahnya (src/lib/draftProgress.ts DRAFT_CLIENT_TIMEOUT_MS), jadi galat dari server tiba lebih dulu.

// Numes (model gratis, sering lambat) punya jatah sendiri di numes-keys.ts: 12 detik per percobaan (secret NUMES_TIMEOUT_MS),
// dan seluruh entri Numes dalam satu permintaan paling banyak 40% anggaran total atau 15 detik, mana yang lebih kecil
// (NumesBudget). Insiden 25 Nov 2026: Numes menghabiskan seluruh anggaran 34 detik, Gemini tidak pernah dipanggil, balasan 502.

/** Batas satu panggilan model bila secret AI_CALL_TIMEOUT_MS tidak diisi. */
export const DEFAULT_AI_CALL_TIMEOUT_MS = 20_000;
/** Anggaran total untuk semua panggilan model dalam satu permintaan, dihitung sejak permintaan masuk. */
export const DEFAULT_AI_TOTAL_BUDGET_MS = 34_000;
/** Sisa anggaran yang lebih kecil dari ini tidak cukup untuk satu panggilan model, jadi rantai berhenti. */
export const MIN_AI_CALL_MS = 4_000;

/**
 * Batas waktu untuk panggilan model berikutnya: `perCallMs`, tetapi tidak melebihi sisa anggaran.
 * 0 berarti sisa anggaran terlalu sedikit dan rantai harus berhenti.
 */
export function nextCallTimeoutMs(input: { perCallMs: number; totalBudgetMs: number; elapsedMs: number; minCallMs?: number }): number {
  const remaining = input.totalBudgetMs - input.elapsedMs;
  if (!(remaining >= (input.minCallMs ?? MIN_AI_CALL_MS))) return 0;
  return Math.max(0, Math.min(input.perCallMs, remaining));
}

/** Cadangan waktu untuk kandidat Anthropic (berbayar, paling andal) di akhir rantai. */
export const DEFAULT_AI_RESERVE_MS = 12_000;

/**
 * Anggaran total untuk kandidat ke-`index`. Insiden 25 November 2026: model gratis (Numes, Gemini, Gemma, OpenRouter)
 * menghabiskan 34 detik, lalu Anthropic di akhir rantai dilewati dengan "time_budget 0ms" dan pengguna melihat
 * "Layanan AI sedang sibuk". Kandidat sebelum Anthropic pertama hanya boleh memakai anggaran dikurangi cadangan.
 */
export function budgetForCandidate(input: { index: number; firstReservedIndex: number; totalBudgetMs: number; reserveMs: number }): {
  budgetMs: number;
  reserveAhead: boolean;
} {
  const reserveAhead = input.firstReservedIndex >= 0 && input.index < input.firstReservedIndex;
  return { budgetMs: reserveAhead ? Math.max(0, input.totalBudgetMs - input.reserveMs) : input.totalBudgetMs, reserveAhead };
}

/** Angka dari secret (string) atau bawaan bila kosong, bukan angka, atau tidak positif. */
export function positiveMs(raw: string | undefined | null, fallback: number): number {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : fallback;
}
