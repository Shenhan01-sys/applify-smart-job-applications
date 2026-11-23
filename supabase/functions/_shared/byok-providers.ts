// Daftar preset penyedia BYOK untuk Edge Function. Base URL TETAP di sini dan tidak pernah datang dari
// pengguna atau database, sehingga server tidak bisa diarahkan ke alamat internal (SSRF). Hanya https.
//
// Dua format adapter:
//   "anthropic" -> Anthropic Messages API (POST <url>, header x-api-key + anthropic-version)
//   "openai"    -> OpenAI Chat Completions atau endpoint yang kompatibel (POST <url>, Authorization: Bearer)
//
// `verified: false` berarti base URL atau autentikasinya belum terlihat di dokumen resmi. Penyedia itu ditolak
// backend saat menyimpan key, dan dilewati di sini walau barisnya ada.
// Salinan backend: backend/services/byok-providers.ts (id, format, dan verified harus sama; dicek tes).
// Sumber dan tanggal akses: Applify-Obsidian/NextRoadMap/19 - Rancangan BYOK (2026-11-23).md

export type ByokFormat = "openai" | "anthropic";

export interface ByokPreset {
  id: string;
  format: ByokFormat;
  /** Endpoint chat lengkap. */
  url: string;
  /** Model bawaan bila pengguna tidak memilih model. Kosong berarti pengguna wajib mengisi model. */
  defaultModels: string[];
  verified: boolean;
}

export const ANTHROPIC_VERSION = "2023-06-01";

export const BYOK_PRESETS: ByokPreset[] = [
  {
    id: "openai",
    format: "openai",
    url: "https://api.openai.com/v1/chat/completions",
    // Belum ada model OpenAI yang diuji Applify, jadi pengguna mengisi nama model sendiri.
    defaultModels: [],
    verified: true,
  },
  {
    id: "anthropic",
    format: "anthropic",
    url: "https://api.anthropic.com/v1/messages",
    defaultModels: ["claude-sonnet-5-5", "claude-haiku-5-5"],
    verified: true,
  },
  {
    id: "gemini",
    format: "openai",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    defaultModels: ["gemini-3.5-flash-lite", "gemini-4-hydrogen"],
    verified: true,
  },
  {
    id: "openrouter",
    format: "openai",
    url: "https://openrouter.ai/api/v1/chat/completions",
    defaultModels: ["deepseek/deepseek-v4-pro", "google/gemma-4-31b-it:free"],
    verified: true,
  },
  // Penyedia pihak ketiga yang kompatibel OpenAI (Hans, 23 Nov 2026). Endpoint internasional dicek di dokumen
  // resmi masing-masing pada 2026-11-23. Model bawaan diambil dari daftar model di dokumen itu, belum diuji
  // dengan prompt generate-application sungguhan.
  {
    id: "deepseek",
    format: "openai",
    url: "https://api.deepseek.com/chat/completions",
    defaultModels: ["deepseek-v4-pro", "deepseek-flash"],
    verified: true,
  },
  {
    id: "moonshot",
    format: "openai",
    url: "https://api.moonshot.ai/v1/chat/completions",
    defaultModels: ["kimi-k3.1-pro", "kimi-k3"],
    verified: true,
  },
  // GLM dan Qwen belum punya cara murah yang terdokumentasi untuk memvalidasi key, jadi belum dibuka. Modelnya
  // bisa dipakai lewat Numes, CrowLLM, atau OpenRouter.
  { id: "zhipu", format: "openai", url: "", defaultModels: [], verified: false },
  { id: "qwen", format: "openai", url: "", defaultModels: [], verified: false },
  {
    id: "mimo",
    format: "openai",
    url: "https://api.xiaomimimo.com/v1/chat/completions",
    defaultModels: ["mimo-v2.6-flash", "mimo-v2.6-pro"],
    verified: true,
  },
  {
    id: "numes",
    format: "openai",
    url: "https://api.numes.ai/api/v1/chat/completions",
    // Dua model gratis yang sudah dipakai rantai Free Applify (providers.ts).
    defaultModels: ["z-ai/glm-5.3-flash:free", "deepseek/deepseek-v4.1-flash:free"],
    verified: true,
  },
  {
    id: "crowllm",
    format: "openai",
    url: "https://crowllm.com/v1/chat/completions",
    // Katalognya besar dan berubah, jadi pengguna memilih model sendiri.
    defaultModels: [],
    verified: true,
  },
];

export const BYOK_PROVIDER_IDS = BYOK_PRESETS.map((p) => p.id);

export function byokPreset(id: string): ByokPreset | null {
  const p = BYOK_PRESETS.find((x) => x.id === id);
  return p && p.verified && p.url.startsWith("https://") ? p : null;
}

export const MODEL_NAME_RE = /^[A-Za-z0-9._:/-]{1,100}$/;
