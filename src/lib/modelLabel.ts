/**
 * Nama model AI yang ditampilkan ke pengguna.
 *
 * Edge Function generate-application mengirim `analysis.modelUsed` dengan format `<penyedia>:<model>`
 * (misalnya `gemini:gemini-3.5-flash-lite`, `anthropic:claude-haiku-5-5`, `openrouter:google/gemma-4-31b-it:free`,
 * `numes:z-ai/glm-5.3-flash:free`).
 * Bila penyedia tidak menyebut nama model, isinya entri rantai apa adanya (misalnya `openrouter/free`).
 * Layar tidak boleh menampilkan slug mentah, dan sebelum ada draf layar tidak boleh mengklaim model tertentu.
 *
 * TypeScript murni tanpa impor, supaya jalan di bawah `node --test`.
 */

export type AiPlan = "free" | "pro";

/** Pola nama model yang dikenal rantai draf (supabase/functions/_shared/providers.ts dan planInfo.PLAN_MODELS). */
const KNOWN_MODELS: Array<[RegExp, string]> = [
  [/gemini-3[.-]5-flash-lite/, "Gemini 3.5 Flash-Lite"],
  [/gemini-4-hydrogen/, "Gemini 4 Hydrogen"],
  [/gemini-4-argon/, "Gemini 4 Argon"],
  [/claude-haiku-5[.-]5/, "Claude Haiku 5.5"],
  [/claude-sonnet-5[.-]5/, "Claude Sonnet 5.5"],
  [/glm-5[.-]3-flash/, "GLM 5.3 Flash"],
  [/deepseek-v4[.-]1-flash/, "DeepSeek V4.1 Flash"],
  [/deepseek-v4-pro/, "DeepSeek V4 Pro"],
  [/deepseek-v4-flash/, "DeepSeek V4 Flash"],
  [/gemma-4-26b/, "Gemma 4 26B"],
  [/gemma-4-31b/, "Gemma 4 31B"],
  [/nemotron-3-super/, "NVIDIA Nemotron 3 Super"],
  [/qwen-?3[.-]8/, "Qwen 3.8"],
];

/** Model yang dipilih router OpenRouter, jadi nama aslinya belum diketahui. */
const OPENROUTER_ROUTER = /^openrouter\/(free|auto)$/;

function titleCase(word: string): string {
  return word ? word[0].toUpperCase() + word.slice(1) : word;
}

/** Nama darurat untuk model yang tidak ada di daftar: "foo-bar-5-5" menjadi "Foo Bar 5.5". */
function prettifySlug(slug: string): string {
  const tokens = slug.split("-").filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    const prev = out[out.length - 1];
    if (/^\d$/.test(t) && prev && /^\d+$/.test(prev) && prev.length === 1) out[out.length - 1] = `${prev}.${t}`;
    else out.push(/^\d/.test(t) ? t.toUpperCase() : titleCase(t));
  }
  return out.join(" ");
}

/** `modelUsed` apa adanya dari respons (teks tanpa spasi tepi), atau null. Diformat baru saat ditampilkan. */
export function rawModelUsed(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Nama ramah untuk `modelUsed`. `null` bila tidak ada nilai yang bisa dipakai (kosong atau bukan teks),
 * supaya pemanggil jatuh ke label paket, bukan ke nama karangan.
 */
export function formatModelUsed(raw: unknown): string | null {
  const value = rawModelUsed(raw);
  if (!value) return null;

  const provider = /^(gemini|anthropic|openrouter|numes):/i.exec(value)?.[1].toLowerCase();
  const withoutProvider = value.replace(/^(gemini|anthropic|openrouter|numes):/i, "");
  const lower = withoutProvider.toLowerCase();
  const isFree = /:free$/.test(lower);
  // Model Numes ditandai penyedianya; model gratis lain berasal dari OpenRouter.
  const tag = (name: string) => (provider === "numes" ? `${name} (Numes)` : isFree ? `${name} (gratis, OpenRouter)` : name);

  if (OPENROUTER_ROUTER.test(lower)) return "Model gratis OpenRouter";

  for (const [pattern, name] of KNOWN_MODELS) {
    if (pattern.test(lower)) return tag(name);
  }

  // Slug tak dikenal: ambil nama setelah "vendor/", buang ":free" dan tanggal versi.
  const slug = lower.replace(/:free$/, "").split("/").pop()!.replace(/-\d{8}$/, "");
  if (!slug) return null;
  const pretty = prettifySlug(slug);
  return tag(pretty);
}

/** Label paket untuk saat model belum diketahui (sebelum draf dibuat): tidak menyebut model tertentu. */
export function aiPlanLabel(tier: AiPlan): string {
  return tier === "pro" ? "AI paket Pro" : "AI paket Free";
}

/** Model yang benar-benar dipakai bila diketahui, kalau tidak label paket. */
export function modelDisplay(modelUsed: unknown, tier: AiPlan): string {
  return formatModelUsed(modelUsed) ?? aiPlanLabel(tier);
}
