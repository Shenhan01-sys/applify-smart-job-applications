/**
 * Kunci API LLM milik pengguna sendiri (BYOK, bring your own key).
 *
 * Kontrak backend (prefix /api/llm-keys, di belakang login):
 *   GET    /              -> 200 { enabled, providers, keys: [{ provider, last4, status, lastValidatedAt, updatedAt, model }] }
 *   PUT    /:provider     -> body { apiKey, consent: true, model? }. 200 { key }. Galat { code }: 403 byok_disabled,
 *                            400 unknown_provider, 400 provider_unverified, 400 consent_required, 400 key_format,
 *                            400 model_format, 400 model_required, 400 wrong_provider, 429 too_many_attempts (Retry-After),
 *                            400 key_invalid, 503 validation_unavailable, 500 encryption_unavailable.
 *   POST   /:provider/test -> 200 { result: valid | invalid | unavailable, key }. 403 byok_disabled, 404 not_found,
 *                            429 too_many_attempts.
 *   DELETE /:provider     -> 200 { deleted }. Tetap jalan walau fiturnya mati.
 *
 * Kunci hanya ada di kolom isian dan di badan permintaan PUT. Server tidak pernah mengirimnya kembali: yang
 * tampil hanya 4 karakter terakhir. Modul ini hanya merapikan, memeriksa bentuk, dan menjelaskan galat.
 *
 * Fungsi murni, supaya bisa dites dengan `node --test` tanpa DOM.
 */

import { describeApiError, parseApiError } from "./apiErrors.ts";

// ---------------------------------------------------------------------------------------------------------
// Registri penyedia: SATU-SATUNYA daftar penyedia di sisi UI. Komponen, API, dan data contoh menurunkan
// semuanya dari sini; tidak ada berkas lain yang menulis id penyedia.
//
// Salinannya ada di backend (`services/byok-providers.ts`) dan Edge Function
// (`supabase/functions/_shared/byok-providers.ts`): id dan `verified` harus sama. UI tidak memakai `baseUrl`
// dan `validate` (alamat tujuan dipegang server dan tidak pernah dari input pengguna); keduanya disimpan agar
// bentuk registri sama di ketiga tempat.
//
// Sumber kebenaran data penyedia adalah registri backend (`services/byok-providers.ts`): id, label, format,
// baseUrl, validate, keyPrefix, verified, dan requiresModel di sini harus sama dengannya (dicek tes
// llmKeys.test.ts dengan membaca berkas backend sebagai teks). `keyUrl` dan `keyUrlLabel` hanya ada di UI.
//
// `verified: false` = penyedia belum diperiksa terhadap dokumen resminya. Backend menolak PUT-nya dengan
// 400 provider_unverified, jadi UI menampilkannya mati ("Segera hadir"). Membukanya cukup dengan mengubah
// data di sini (isi baseUrl, validate, lalu `verified: true`), tanpa mengubah komponen.
// Urutan tampil: OpenAI dan Anthropic dulu.

export type LlmFormat = "openai" | "anthropic";
export type LlmHeaderStyle = "bearer" | "x-api-key" | "x-goog-api-key";

export interface LlmProviderEntry {
  id: string;
  label: string;
  /** Bentuk panggilan model: Messages API Anthropic atau Chat Completions yang kompatibel dengan OpenAI. */
  format: LlmFormat;
  /** Alamat dasar tetap (https). Tidak pernah input pengguna. */
  baseUrl: string;
  /** Satu GET murah untuk memeriksa kunci, dan cara kunci dilampirkan. */
  validate: { url: string; headerStyle: LlmHeaderStyle };
  /** Kunci berawalan ini hanya milik penyedia ini; di kolom penyedia lain jadi wrong_provider. */
  keyPrefix?: string;
  verified: boolean;
  /** Halaman tempat pengguna membuat kunci API. Kosong bila belum diperiksa. */
  keyUrl: string;
  /** Nama situs pada tautan "Dapatkan kunci". */
  keyUrlLabel: string;
  /** Penyedia tanpa model bawaan di Applify: pengguna wajib mengisi nama model (tanpa itu backend menjawab 400 model_required). */
  requiresModel?: boolean;
}

const REGISTRY = [
  {
    id: "openai",
    label: "OpenAI",
    format: "openai",
    baseUrl: "https://api.openai.com/v1",
    validate: { url: "https://api.openai.com/v1/models", headerStyle: "bearer" },
    verified: true,
    keyUrl: "https://platform.openai.com/api-keys",
    keyUrlLabel: "platform.openai.com",
    requiresModel: true,
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    format: "anthropic",
    baseUrl: "https://api.anthropic.com",
    validate: { url: "https://api.anthropic.com/v1/models?limit=1", headerStyle: "x-api-key" },
    keyPrefix: "sk-ant-",
    verified: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyUrlLabel: "console.anthropic.com",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    format: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    validate: { url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", headerStyle: "x-goog-api-key" },
    verified: true,
    keyUrl: "https://aistudio.google.com/apikey",
    keyUrlLabel: "aistudio.google.com",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    format: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    validate: { url: "https://openrouter.ai/api/v1/key", headerStyle: "bearer" },
    keyPrefix: "sk-or-",
    verified: true,
    keyUrl: "https://openrouter.ai/keys",
    keyUrlLabel: "openrouter.ai",
  },
  // Penyedia OpenAI-compatible pihak ketiga. Alamat sudah diperiksa terhadap dokumen tiap penyedia (lihat
  // registri backend). `keyUrl` sengaja kosong: belum ada halaman konsol yang terverifikasi, jadi tautan
  // "Dapatkan kunci" disembunyikan.
  {
    id: "deepseek",
    label: "DeepSeek",
    format: "openai",
    baseUrl: "https://api.deepseek.com",
    validate: { url: "https://api.deepseek.com/models", headerStyle: "bearer" },
    verified: true,
    keyUrl: "",
    keyUrlLabel: "",
  },
  {
    id: "moonshot",
    label: "Moonshot AI (Kimi, platform internasional)",
    format: "openai",
    baseUrl: "https://api.moonshot.ai/v1",
    validate: { url: "https://api.moonshot.ai/v1/models", headerStyle: "bearer" },
    verified: true,
    keyUrl: "",
    keyUrlLabel: "",
  },
  // Belum ada cek kunci murah yang terdokumentasi, jadi tetap mati ("Segera hadir").
  { id: "zhipu", label: "Zhipu AI (GLM)", format: "openai", baseUrl: "", validate: { url: "", headerStyle: "bearer" }, verified: false, keyUrl: "", keyUrlLabel: "" },
  { id: "qwen", label: "Qwen (Alibaba Cloud)", format: "openai", baseUrl: "", validate: { url: "", headerStyle: "bearer" }, verified: false, keyUrl: "", keyUrlLabel: "" },
  {
    id: "mimo",
    label: "Xiaomi MiMo",
    format: "openai",
    baseUrl: "https://api.xiaomimimo.com/v1",
    validate: { url: "https://api.xiaomimimo.com/v1/models", headerStyle: "bearer" },
    verified: true,
    keyUrl: "",
    keyUrlLabel: "",
  },
  {
    id: "numes",
    label: "Numes",
    format: "openai",
    baseUrl: "https://api.numes.ai/api/v1",
    validate: { url: "https://api.numes.ai/api/v1/key", headerStyle: "bearer" },
    verified: true,
    keyUrl: "",
    keyUrlLabel: "",
  },
  {
    id: "crowllm",
    label: "CrowLLM",
    format: "openai",
    baseUrl: "https://crowllm.com/v1",
    validate: { url: "https://crowllm.com/v1/models", headerStyle: "bearer" },
    requiresModel: true,
    verified: true,
    keyUrl: "",
    keyUrlLabel: "",
  },
] as const satisfies readonly LlmProviderEntry[];

export type LlmProvider = (typeof REGISTRY)[number]["id"];

export type LlmProviderInfo = LlmProviderEntry & { id: LlmProvider };

export const LLM_PROVIDERS: readonly LlmProviderInfo[] = REGISTRY;

export const LLM_PROVIDER_IDS: readonly LlmProvider[] = LLM_PROVIDERS.map((p) => p.id);

export function isLlmProvider(value: unknown): value is LlmProvider {
  return typeof value === "string" && (LLM_PROVIDER_IDS as readonly string[]).includes(value);
}

export function providerInfo(provider: LlmProvider): LlmProviderInfo {
  return LLM_PROVIDERS.find((p) => p.id === provider) ?? LLM_PROVIDERS[0];
}

/** Penyedia yang sudah diperiksa: hanya ini yang boleh menerima kunci. */
export function isVerifiedProvider(provider: unknown): boolean {
  return isLlmProvider(provider) && providerInfo(provider).verified === true;
}

export type LlmKeyStatus = "valid" | "invalid";

/** Satu kunci tersimpan, seperti yang dijawab backend. Tidak pernah berisi kunci utuh. */
export interface LlmKeyRow {
  provider: LlmProvider;
  /** 4 karakter terakhir kunci. */
  last4: string;
  status: LlmKeyStatus;
  lastValidatedAt: string | null;
  updatedAt: string | null;
  /** Model pilihan pengguna (dipakai pertama untuk penyedia ini), null bila tidak memilih. */
  model: string | null;
}

export interface LlmKeysResponse {
  enabled: boolean;
  providers: LlmProvider[];
  keys: LlmKeyRow[];
}

export type LlmTestResult = "valid" | "invalid" | "unavailable";

export interface LlmTestResponse {
  result: LlmTestResult;
  key: LlmKeyRow | null;
}

// ---------------------------------------------------------------------------------------------------------
// Teks tampilan

export const LLM_KEYS_STORAGE_NOTE =
  "Kunci disimpan terenkripsi di server dan hanya 4 karakter terakhir yang ditampilkan. Saat disimpan, Applify menghubungi penyedia sekali untuk memeriksa kunci. Kunci yang ditolak tidak disimpan.";
export const LLM_KEYS_QUOTA_NOTE =
  "Draf yang dibuat dengan kuncimu tidak dihitung ke kuota draf bulanan, tetapi tetap dibatasi laju permintaannya.";
export const LLM_KEYS_DISABLED_TEXT =
  "Fitur kunci API sendiri belum aktif di server ini, jadi kunci baru belum bisa disimpan atau diuji.";
export const LLM_KEYS_DISABLED_DELETE_TEXT = " Kunci yang sudah tersimpan tetap bisa dihapus.";
export const LLM_KEYS_LOAD_ERROR_TEXT = "Daftar kunci belum bisa dimuat. Coba lagi.";
export const LLM_PROVIDER_SOON_LABEL = "Segera hadir";
export const LLM_PROVIDER_SOON_TEXT = "Penyedia ini belum tersedia. Kunci belum bisa disimpan.";
export const LLM_MODEL_HINT = "Opsional. Kosongkan untuk memakai model bawaan.";
export const LLM_MODEL_REQUIRED_HINT = "Wajib. Applify tidak punya model bawaan untuk penyedia ini, jadi isi nama modelnya.";

/** Label kolom model: penyedia tanpa model bawaan (requiresModel di registri) mewajibkannya. */
export function llmModelLabel(requiresModel: boolean | undefined): string {
  return requiresModel === true ? "Model (wajib)" : "Model (opsional)";
}

/**
 * Teks persetujuan yang dicentang pengguna setiap kali menyimpan kunci. Menyebut penyedia pilihannya, bahwa data
 * CV dan profil ikut dikirim ke sana (bisa di luar negeri), dan bahwa tagihannya ditanggung pengguna.
 */
export function llmConsentText(label: string): string {
  return `Data CV dan profilku akan dikirim ke ${label} (bisa di luar negeri) saat Applify membuat draf dengan kunci ini, dan tagihan dari ${label} kutanggung sendiri. Aku mengerti dan setuju.`;
}

export type LlmKeyView = "valid" | "invalid" | "none";

export const LLM_KEY_STATUS_LABEL: Record<LlmKeyView, string> = {
  valid: "Tersimpan dan valid",
  invalid: "Tidak valid",
  none: "Belum ada",
};

/** Status yang ditampilkan di satu baris penyedia. */
export function llmKeyView(row: LlmKeyRow | null | undefined): LlmKeyView {
  if (!row) return "none";
  return row.status === "valid" ? "valid" : "invalid";
}

/** `abcd` -> `••••abcd`. Hanya 4 karakter terakhir yang dipakai, apa pun yang dikirim server. */
export function maskLast4(last4: unknown): string {
  const tail = typeof last4 === "string" ? last4.trim().slice(-4) : "";
  return `••••${tail}`;
}

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Tanggal ISO -> "23 November 2026" (zona WIB). Kosong bila tanggalnya tidak terbaca. */
export function formatKeyDate(iso: unknown): string {
  const ms = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms + WIB_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------------------------------------
// Pemeriksaan bentuk kunci dan model (cermin pemeriksaan di backend)

export const KEY_MIN_LENGTH = 20;
export const KEY_MAX_LENGTH = 300;
const KEY_CHARSET = /^[A-Za-z0-9_\-.]+$/;

export const MODEL_MAX_LENGTH = 100;
const MODEL_CHARSET = /^[A-Za-z0-9._:/-]+$/;

export type PrecheckCode = "unknown_provider" | "provider_unverified" | "key_format" | "wrong_provider";

export type KeyPrecheck = { ok: true; key: string } | { ok: false; code: PrecheckCode; message: string };

/**
 * Periksa kunci sebelum dikirim: penyedia dikenal dan sudah diperiksa, kunci dirapikan (trim), 20 sampai 300
 * karakter, hanya huruf, angka, `_`, `-`, `.`, dan awalan khusus penyedia (`keyPrefix` di registri) hanya untuk
 * pemiliknya. Pemeriksaan ini hanya menghemat satu permintaan; backend tetap memeriksa ulang.
 */
export function precheckLlmKey(provider: unknown, key: unknown): KeyPrecheck {
  const fail = (code: PrecheckCode): KeyPrecheck => ({ ok: false, code, message: describeLlmKeyError(code) });
  if (!isLlmProvider(provider)) return fail("unknown_provider");
  if (!isVerifiedProvider(provider)) return fail("provider_unverified");
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (trimmed.length < KEY_MIN_LENGTH || trimmed.length > KEY_MAX_LENGTH) return fail("key_format");
  if (!KEY_CHARSET.test(trimmed)) return fail("key_format");
  for (const owner of LLM_PROVIDERS) {
    if (owner.keyPrefix && trimmed.startsWith(owner.keyPrefix) && owner.id !== provider) return fail("wrong_provider");
  }
  return { ok: true, key: trimmed };
}

export type ModelPrecheck =
  | { ok: true; model: string | null }
  | { ok: false; code: "model_format" | "model_required"; message: string };

/**
 * Model pilihan: kosong berarti tidak memilih (null, tidak dikirim), kecuali penyedia mewajibkannya
 * (`required`, dari `requiresModel` di registri): kosong lalu jadi model_required. Selain itu 1 sampai 100
 * karakter huruf, angka, dan tanda `. _ : / -`.
 */
export function precheckLlmModel(model: unknown, options: { required?: boolean } = {}): ModelPrecheck {
  const fail = (code: "model_format" | "model_required"): ModelPrecheck => ({ ok: false, code, message: describeLlmKeyError(code) });
  if (model !== undefined && model !== null && typeof model !== "string") return fail("model_format");
  const trimmed = typeof model === "string" ? model.trim() : "";
  if (trimmed === "") return options.required === true ? fail("model_required") : { ok: true, model: null };
  if (trimmed.length > MODEL_MAX_LENGTH || !MODEL_CHARSET.test(trimmed)) return fail("model_format");
  return { ok: true, model: trimmed };
}

/**
 * Tombol "Simpan dan uji" boleh ditekan hanya bila penyedia bisa dipakai (fitur aktif dan penyedia sudah
 * diperiksa), persetujuan dicentang, dan kolom kunci terisi. Persetujuan harus persis `true`. Penyedia yang
 * `requiresModel` juga butuh nama model yang sah; untuk penyedia lain model boleh kosong (bentuknya yang
 * salah ditolak saat dikirim).
 */
export function canSaveLlmKey(state: {
  usable: boolean;
  consent: unknown;
  key: unknown;
  requiresModel?: boolean;
  model?: unknown;
}): boolean {
  if (state.usable !== true || state.consent !== true) return false;
  if (typeof state.key !== "string" || state.key.trim() === "") return false;
  if (state.requiresModel === true) {
    const m = precheckLlmModel(state.model, { required: true });
    if (!m.ok) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------
// Galat

const GENERIC_ERROR = "Kunci belum bisa diproses. Coba lagi sebentar lagi.";

function waitText(sec: number | undefined): string {
  if (!sec || sec <= 0) return "beberapa saat lagi";
  if (sec < 90) return `${Math.ceil(sec)} detik`;
  return `${Math.ceil(sec / 60)} menit`;
}

/**
 * Kode galat dari backend -> pesan singkat. Kode yang tidak dikenal memakai pesan umum. `retryAfterSec`
 * hanya dipakai untuk too_many_attempts.
 */
export function describeLlmKeyError(code: unknown, retryAfterSec?: number): string {
  switch (code) {
    case "byok_disabled":
      return "Fitur kunci API sendiri belum aktif di server ini.";
    case "unknown_provider":
      return "Penyedia AI ini tidak dikenali.";
    case "provider_unverified":
      return "Penyedia ini belum tersedia, jadi kunci belum bisa disimpan. Pilih penyedia lain.";
    case "consent_required":
      return "Centang persetujuan pengiriman data dulu, lalu simpan lagi.";
    case "key_format":
      return `Bentuk kunci tidak sesuai. Kunci berisi ${KEY_MIN_LENGTH} sampai ${KEY_MAX_LENGTH} huruf, angka, atau tanda - _ . tanpa spasi. Tempel ulang kuncinya.`;
    case "model_format":
      return `Nama model tidak sesuai. Pakai paling banyak ${MODEL_MAX_LENGTH} huruf, angka, atau tanda . _ : / - tanpa spasi.`;
    case "model_required":
      return "Penyedia ini butuh nama model. Isi nama modelnya, lalu simpan lagi.";
    case "wrong_provider":
      return "Kunci ini milik penyedia lain. Tempel di baris penyedia yang sesuai.";
    case "too_many_attempts":
      return `Terlalu sering mencoba. Coba lagi dalam ${waitText(retryAfterSec)}.`;
    case "key_invalid":
      return "Kunci ditolak oleh penyedia. Periksa kuncinya dan pastikan masih aktif. Kunci ini tidak disimpan.";
    case "validation_unavailable":
      return "Penyedia belum bisa dihubungi untuk memeriksa kunci, jadi kunci belum disimpan. Coba lagi nanti.";
    case "encryption_unavailable":
      return "Server belum bisa menyimpan kunci dengan aman. Hubungi administrator.";
    case "not_found":
      return "Belum ada kunci tersimpan untuk penyedia ini.";
    case "bad_response":
      return "Jawaban server tidak dikenali. Coba lagi nanti.";
    default:
      return GENERIC_ERROR;
  }
}

/**
 * Galat dari apiFetch (ApiError) -> pesan untuk pengguna. Hanya kode galat dan status yang dibaca; teks mentah
 * dari server tidak pernah ditampilkan.
 */
export function describeLlmKeyApiError(err: unknown): string {
  const e = parseApiError(err);
  if (e.code) return describeLlmKeyError(e.code, e.retryAfterSec);
  if (e.status === 401) return "Sesi login berakhir atau belum masuk. Masuk lagi, lalu ulangi.";
  if (e.status === 429) return describeLlmKeyError("too_many_attempts", e.retryAfterSec);
  if (e.status !== undefined && e.status >= 500) return "Server sedang bermasalah. Coba lagi beberapa saat lagi.";
  // Tanpa status: galat jaringan atau alamat server belum diatur. describeApiError menjelaskannya; teks
  // `fallback` dipakai bila tidak ada yang dikenali. Isi jawaban server tidak ikut ditampilkan di sini.
  return e.status === undefined ? describeApiError(err, GENERIC_ERROR) : GENERIC_ERROR;
}

export type NoticeTone = "ok" | "warn" | "error";
export interface Notice {
  tone: NoticeTone;
  text: string;
}

/** Hasil "Uji ulang" -> catatan di bawah baris. */
export function describeTestResult(result: unknown): Notice {
  switch (result) {
    case "valid":
      return { tone: "ok", text: "Kunci masih valid." };
    case "invalid":
      return { tone: "error", text: "Kunci ditolak penyedia. Simpan kunci yang baru, atau hapus kunci ini." };
    case "unavailable":
      return { tone: "warn", text: "Penyedia belum bisa dihubungi, jadi status kunci tidak berubah. Coba lagi nanti." };
    default:
      return { tone: "error", text: GENERIC_ERROR };
  }
}

// ---------------------------------------------------------------------------------------------------------
// Membaca jawaban backend

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Satu baris kunci dari jawaban backend; null bila bentuknya tidak dikenali. Hanya 4 karakter terakhir yang dibawa. */
export function parseLlmKeyRow(value: unknown): LlmKeyRow | null {
  if (!isObject(value) || !isLlmProvider(value.provider) || typeof value.last4 !== "string") return null;
  return {
    provider: value.provider,
    last4: value.last4.trim().slice(-4),
    // Status yang tidak dikenal dianggap tidak valid: tidak pernah menampilkan "valid" tanpa dasar.
    status: value.status === "valid" ? "valid" : "invalid",
    lastValidatedAt: text(value.lastValidatedAt),
    updatedAt: text(value.updatedAt),
    model: text(value.model)?.slice(0, MODEL_MAX_LENGTH) ?? null,
  };
}

/** Jawaban GET /api/llm-keys; null bila bentuknya tidak dikenali. */
export function parseLlmKeysResponse(body: unknown): LlmKeysResponse | null {
  if (!isObject(body) || !Array.isArray(body.keys)) return null;
  const providers = Array.isArray(body.providers) ? body.providers.filter(isLlmProvider) : [];
  const keys = body.keys.map(parseLlmKeyRow).filter((k): k is LlmKeyRow => k !== null);
  return {
    enabled: body.enabled === true,
    providers: providers.length > 0 ? providers : [...LLM_PROVIDER_IDS],
    keys,
  };
}

/** Jawaban PUT /api/llm-keys/:provider ({ key }); null bila bentuknya tidak dikenali. */
export function parseSaveResponse(body: unknown): LlmKeyRow | null {
  return isObject(body) ? parseLlmKeyRow(body.key) : null;
}

/** Jawaban POST /api/llm-keys/:provider/test ({ result, key }); null bila hasilnya tidak dikenali. */
export function parseTestResponse(body: unknown): LlmTestResponse | null {
  if (!isObject(body)) return null;
  const r = body.result;
  if (r !== "valid" && r !== "invalid" && r !== "unavailable") return null;
  return { result: r, key: parseLlmKeyRow(body.key) };
}

/** Jawaban DELETE /api/llm-keys/:provider ({ deleted }). */
export function parseDeleteResponse(body: unknown): boolean {
  return isObject(body) && body.deleted === true;
}

/** Daftar kunci sesudah satu kunci disimpan atau diperbarui (satu baris per penyedia). */
export function upsertKey(keys: readonly LlmKeyRow[], row: LlmKeyRow): LlmKeyRow[] {
  return [...keys.filter((k) => k.provider !== row.provider), row];
}

/** Daftar kunci sesudah kunci satu penyedia dihapus. */
export function removeKey(keys: readonly LlmKeyRow[], provider: LlmProvider): LlmKeyRow[] {
  return keys.filter((k) => k.provider !== provider);
}

/** Penyedia yang ditampilkan: urutan tetap dari registri, hanya yang disebut server. */
export function visibleProviders(providers: readonly LlmProvider[]): LlmProviderInfo[] {
  return LLM_PROVIDERS.filter((p) => providers.includes(p.id));
}
