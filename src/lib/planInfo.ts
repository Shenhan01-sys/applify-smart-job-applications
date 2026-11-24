// What each plan really contains, in one place for the pricing page, the landing page and the AI settings tab.
// Only things the code does belong here. Model names follow the code, and tests/planInfo.test.ts checks them
// against it:
//   - supabase/functions/generate-application/index.ts  (draft: FREE_MODELS / PRO_MODELS, chosen by plan)
//   - worker/src/lib/ai.ts                               (form planning: FREE_MODEL / PRO_MODEL + fallbacks + Groq)
//   - backend/services/ai-pipeline.service.ts            (backend AI calls: free chain + Groq, same for every plan)
// Limits follow worker/src/lib/quota.ts and backend/services/rate-limit.service.ts (daily apply: free 10, pro 20).

/** Golden Window Sniper is not built: there is no job-age detection, alert or early auto-apply in the code. */
export const GOLDEN_WINDOW_LABEL = "Golden Window Sniper (segera hadir)";

export const FREE_FEATURES = [
  "10 AI Apply per bulan",
  "AI Basic (draf surat memakai model gratis Numes, Gemini, dan OpenRouter; Claude hanya cadangan terakhir)",
  "Cover letter standar",
  "3 platform utama",
  "Skill radar dasar",
  "Human approval",
];

export const PRO_FEATURES = [
  "Hingga 20 lamaran per hari",
  "AI Premium (model Numes dan Gemini 4; Claude hanya cadangan terakhir)",
  "Semua 7 platform",
  GOLDEN_WINDOW_LABEL,
  "CV Optimization AI",
  "Blind Merit Mode",
  "Green Career Track",
  "Prioritas dukungan",
];

export interface PlanModel {
  name: string;
  /** Position in the order the system tries them. */
  role: "Utama" | "Cadangan";
  desc: string;
}

export const PLAN_MODELS: Record<"free" | "pro", { models: PlanModel[]; note: string }> = {
  free: {
    models: [
      { name: "GLM 5.3 Flash (Numes)", role: "Utama", desc: "Model gratis dari Numes, dicoba lebih dulu untuk draf surat lamaran" },
      { name: "DeepSeek V4.1 Flash (Numes)", role: "Cadangan", desc: "Model gratis dari Numes, dicoba untuk draf bila GLM 5.3 Flash tidak menjawab" },
      { name: "Gemini 3.5 Flash-Lite", role: "Cadangan", desc: "Cadangan draf bila model Numes tidak tersedia (Google AI Studio)" },
      { name: "Gemma 4 (26B, lalu 31B)", role: "Cadangan", desc: "Model gratis OpenRouter, dicoba sesudah Numes dan Gemini untuk draf, agen pengisi formulir, dan backend" },
      { name: "NVIDIA Nemotron 3 Super", role: "Cadangan", desc: "Model gratis OpenRouter" },
      { name: "Qwen 3.8", role: "Cadangan", desc: "Model gratis OpenRouter untuk agen pengisi formulir dan backend" },
      { name: "Groq (gpt-oss, Qwen)", role: "Cadangan", desc: "Penyedia terpisah, dipakai bila model gratis OpenRouter tidak menjawab" },
      { name: "Claude Haiku 5.5", role: "Cadangan", desc: "Cadangan terakhir (Anthropic), dipakai hanya bila semua model di atas tidak menjawab" },
    ],
    note: "Model yang sedang tidak tersedia dilewati otomatis, lalu sistem beralih ke model berikutnya.",
  },
  pro: {
    models: [
      { name: "GLM 5.3 Flash (Numes)", role: "Utama", desc: "Model dari Numes, dicoba lebih dulu untuk draf surat lamaran" },
      { name: "DeepSeek V4.1 Flash (Numes)", role: "Cadangan", desc: "Model dari Numes, dicoba untuk draf bila GLM 5.3 Flash tidak menjawab" },
      { name: "Gemini 4 Hydrogen", role: "Cadangan", desc: "Model Google AI Studio, dicoba bila kedua model Numes tidak menjawab" },
      { name: "Gemini 4 Argon", role: "Cadangan", desc: "Dipakai untuk draf bila Gemini 4 Hydrogen tidak menjawab" },
      { name: "Claude Sonnet 5.5", role: "Cadangan", desc: "Cadangan draf dari Anthropic bila model Numes dan Gemini 4 tidak tersedia" },
      { name: "Claude Haiku 5.5", role: "Cadangan", desc: "Cadangan terakhir untuk draf" },
    ],
    note: "Model dipilih menurut paketmu; bila satu model sedang tidak tersedia, sistem beralih ke model cadangan. Fitur regenerate surat di layar persetujuan saat ini memakai rangkaian model gratis untuk semua paket.",
  },
};
