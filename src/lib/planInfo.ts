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
  "AI Basic (model gratis OpenRouter, cadangan Groq)",
  "Cover letter standar",
  "3 platform utama",
  "Skill radar dasar",
  "Human approval",
];

export const PRO_FEATURES = [
  "Hingga 20 lamaran per hari",
  "AI Premium (DeepSeek V4)",
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
      { name: "Gemma 4 (26B, lalu 31B)", role: "Utama", desc: "Model gratis OpenRouter, dicoba lebih dulu" },
      { name: "NVIDIA Nemotron 3 Super", role: "Cadangan", desc: "Model gratis OpenRouter" },
      { name: "Qwen 3.8", role: "Cadangan", desc: "Model gratis OpenRouter untuk agen pengisi formulir dan backend" },
      { name: "Groq (gpt-oss, Qwen)", role: "Cadangan", desc: "Penyedia terpisah, dipakai bila model gratis OpenRouter tidak menjawab" },
    ],
    note: "Daftar model gratis sering berganti; model yang sudah dicabut dilewati otomatis.",
  },
  pro: {
    models: [
      { name: "DeepSeek V4 Pro", role: "Utama", desc: "Model utama untuk surat lamaran dan pengisian formulir" },
      { name: "DeepSeek V4 Flash", role: "Cadangan", desc: "Dipakai untuk draf bila model utama tidak tersedia" },
      { name: "Model gratis OpenRouter dan Groq", role: "Cadangan", desc: "Cadangan terakhir, sama dengan paket Free" },
    ],
    note: "Model dipilih menurut paketmu; bila satu model sedang tidak tersedia, sistem beralih ke model cadangan. Fitur regenerate surat di layar persetujuan saat ini memakai rangkaian model gratis untuk semua paket.",
  },
};
