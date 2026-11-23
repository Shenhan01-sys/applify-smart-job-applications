// Penyedia model AI untuk Edge Function generate-application. TypeScript murni tanpa API Deno atau browser,
// supaya bisa dites dengan node:test.
//
// Setiap entri rantai model ditulis sebagai "<penyedia>:<model>" atau langsung slug OpenRouter:
//   gemini:gemini-3.5-flash-lite      -> Google AI Studio, endpoint kompatibel OpenAI, kunci GEMINI_API_KEY
//   anthropic:claude-haiku-5-5        -> Anthropic, endpoint kompatibel OpenAI, kunci ANTHROPIC_API_KEY
//   google/gemma-4-31b-it:free        -> OpenRouter (tanpa awalan), kunci OPENROUTER_API_KEY
// Ketiganya menerima format chat completions yang sama, jadi pemanggil cukup mengganti URL, kunci, dan nama model.
// Entri yang kuncinya tidak ada dilewati, sehingga rantai tetap jalan walau hanya sebagian kunci terpasang.

export type ProviderName = "openrouter" | "gemini" | "anthropic";

export interface ProviderKeys {
  openrouter?: string;
  gemini?: string;
  anthropic?: string;
}

export interface ResolvedModel {
  provider: ProviderName;
  /** Entri asli di rantai, dipakai untuk log dan pesan galat. */
  entry: string;
  /** Nama model yang dikirim ke penyedia. */
  model: string;
  url: string;
  headers: Record<string, string>;
}

const ENDPOINTS: Record<ProviderName, string> = {
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  anthropic: "https://api.anthropic.com/v1/chat/completions",
};

/** Rantai bawaan bila secret FREE_MODELS / PRO_MODELS tidak diisi. */
// Free: Claude Sonnet 5.5 dicoba lebih dulu, lalu Claude Haiku 5.5, karena Gemini gratis sering membalas 429/503
// sehingga pengguna melihat pesan AI sibuk (keputusan Hans, 23 Nov 2026). Gemini, Gemma, dan openrouter/free
// tetap menjadi cadangan. Entri Claude dilewati bila ANTHROPIC_API_KEY tidak ada.
export const DEFAULT_FREE_MODELS =
  "anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5,gemini:gemini-3.5-flash-lite,google/gemma-4-31b-it:free,openrouter/free";
// Pro: Gemini 4 menggantikan DeepSeek V4 atas keputusan Hans (19 Nov 2026). Uji coba 19 Nov: gemini-4-argon
// menolak dengan 429 (kuota free tier 0, butuh billing), gemini-4-hydrogen 503 karena permintaan tinggi.
// Karena itu Claude Sonnet 5.5 dan Haiku 5.5 (sudah terbukti menjawab) tetap jadi cadangan.
export const DEFAULT_PRO_MODELS =
  "gemini:gemini-4-hydrogen,gemini:gemini-4-argon,anthropic:claude-sonnet-5-5,anthropic:claude-haiku-5-5";

export function parseModelList(raw: string | undefined, fallback: string): string[] {
  return (raw && raw.trim() ? raw : fallback).split(",").map((m) => m.trim()).filter(Boolean);
}

/** Ubah satu entri rantai menjadi tujuan panggilan, atau null bila kunci penyedianya tidak ada. */
export function resolveModel(entry: string, keys: ProviderKeys): ResolvedModel | null {
  const m = /^(gemini|anthropic):(.+)$/.exec(entry);
  const provider: ProviderName = m ? (m[1] as ProviderName) : "openrouter";
  const model = m ? m[2] : entry;
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

/**
 * Badan permintaan chat per penyedia. Claude menolak `temperature` dengan HTTP 400
 * ("`temperature` is deprecated for this model"), dan penalaran tersembunyinya memakai jatah
 * `max_tokens`, sehingga jawaban bisa kosong bila jatahnya pas-pasan. Untuk Claude, `temperature`
 * dihilangkan dan `max_tokens` dinaikkan minimal 2.400.
 */
export function chatBody(
  target: Pick<ResolvedModel, "provider" | "model">,
  messages: { role: string; content: string }[],
  opts: { temperature: number; maxTokens: number },
): Record<string, unknown> {
  if (target.provider === "anthropic") {
    return { model: target.model, messages, max_tokens: Math.max(opts.maxTokens, 2400) };
  }
  return { model: target.model, messages, temperature: opts.temperature, max_tokens: opts.maxTokens };
}

// ---- batas waktu rantai ------------------------------------------------------------------------------------
// Dulu tiap panggilan punya batas sendiri (40 detik) dan rantai tidak punya batas total, jadi empat model yang
// lambat bisa menahan pengguna lebih dari 50 detik tanpa jawaban (uji E2E klik 20 November 2026, temuan 13).
// Kini seluruh rantai berbagi satu anggaran waktu yang dihitung sejak permintaan masuk, dan klien menyerah
// sedikit sesudahnya (src/lib/draftProgress.ts DRAFT_CLIENT_TIMEOUT_MS), jadi galat dari server tiba lebih dulu.

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

/** Angka dari secret (string) atau bawaan bila kosong, bukan angka, atau tidak positif. */
export function positiveMs(raw: string | undefined | null, fallback: number): number {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : fallback;
}
