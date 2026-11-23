// Bring Your Own Key (BYOK) untuk Edge Function generate-application. TypeScript murni dengan WebCrypto
// (globalThis.crypto.subtle ada di Deno dan Node), supaya bisa dites dengan node:test.
//
// Backend (backend/services/byok-crypto.ts) mengenkripsi API key pengguna dengan AES-256-GCM:
//   kunci   = SHA-256(BYOK_ENCRYPTION_KEY)
//   simpan  = base64(iv[12] | tag[16] | ciphertext)
//   AAD     = "applify-byok:v1:<user_id>:<provider>"
// WebCrypto meminta tag di BELAKANG ciphertext, jadi urutannya ditukar sebelum didekripsi.
// AAD mengikat ciphertext ke baris pemiliknya: ciphertext milik pengguna lain atau penyedia lain gagal didekripsi.
//
// Rancangan lengkap: Applify-Obsidian/NextRoadMap/19 - Rancangan BYOK (2026-11-23).md

import { chatBody, CLAUDE_MIN_MAX_TOKENS, type ResolvedModel } from "./providers.ts";
import { ANTHROPIC_VERSION, BYOK_PRESETS, byokPreset, MODEL_NAME_RE, type ByokFormat } from "./byok-providers.ts";

export const BYOK_MIN_SECRET_LENGTH = 32;

/** Batas draf per jam untuk pengguna BYOK bila secret BYOK_RATE_LIMIT_PER_HOUR tidak diisi. */
export const DEFAULT_BYOK_RATE_LIMIT_PER_HOUR = 30;

export function byokEnabled(raw: string | undefined | null): boolean {
  return raw === "true";
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function byokAad(userId: string, provider: string): Uint8Array {
  return new TextEncoder().encode(`applify-byok:v1:${userId}:${provider}`);
}

/** Dekripsi satu key. Melempar galat bila secret kurang, data rusak, atau AAD tidak cocok. */
export async function decryptByokKey(
  b64: string,
  secret: string,
  ctx: { userId: string; provider: string },
): Promise<string> {
  if (!secret || secret.length < BYOK_MIN_SECRET_LENGTH) throw new Error("byok_secret_missing");
  const buf = b64ToBytes(b64);
  if (buf.length < 12 + 16 + 1) throw new Error("byok_ciphertext_short");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const ctTag = new Uint8Array(ct.length + tag.length);
  ctTag.set(ct, 0);
  ctTag.set(tag, ct.length);
  const subtle = globalThis.crypto.subtle;
  const raw = await subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: byokAad(ctx.userId, ctx.provider), tagLength: 128 },
    key,
    ctTag,
  );
  return new TextDecoder().decode(plain);
}

export interface ByokRow {
  provider: string;
  key_encrypted: string;
  status?: string | null;
  model?: string | null;
}

export interface ByokCredential {
  provider: string;
  key: string;
  model?: string;
  /** Ciphertext baris asal, dipakai sebagai syarat saat menandai key invalid (hindari menimpa key pengganti). */
  keyEncrypted?: string;
}

/**
 * Dekripsi semua key pengguna yang statusnya valid dan penyedianya preset terverifikasi. Baris yang gagal
 * didekripsi dilewati dan dicatat di `failed` (nama penyedia saja, tanpa isi), supaya draf tetap bisa jalan
 * dengan key Applify. Urutan hasil mengikuti urutan preset (OpenAI dan Anthropic lebih dulu).
 */
export async function loadByokKeys(
  rows: ByokRow[] | null | undefined,
  secret: string,
  userId: string,
): Promise<{ creds: ByokCredential[]; failed: string[] }> {
  const creds: ByokCredential[] = [];
  const failed: string[] = [];
  for (const row of rows ?? []) {
    if (!row || !byokPreset(row.provider)) continue;
    if (row.status && row.status !== "valid") continue;
    try {
      const key = await decryptByokKey(row.key_encrypted, secret, { userId, provider: row.provider });
      if (!key) continue;
      const model = row.model && MODEL_NAME_RE.test(row.model) ? row.model : undefined;
      creds.push({ provider: row.provider, key, model, keyEncrypted: row.key_encrypted });
    } catch {
      failed.push(row.provider);
    }
  }
  const order = (p: string) => BYOK_PRESETS.findIndex((x) => x.id === p);
  creds.sort((a, b) => order(a.provider) - order(b.provider));
  return { creds, failed };
}

export interface ChainTarget {
  /** Penyedia: nama penyedia Applify (providers.ts) atau id preset BYOK. */
  provider: string;
  entry: string;
  model: string;
  url: string;
  headers: Record<string, string>;
  format: ByokFormat;
  /** "byok" bila memakai key pengguna, "applify" bila memakai key Applify (memotong kuota bulanan). */
  source: "byok" | "applify";
  /** Hanya untuk BYOK: ciphertext baris key asal. */
  keyEncrypted?: string;
}

/**
 * Rantai BYOK: untuk tiap key pengguna, model pilihan pengguna dulu lalu model bawaan preset. Hanya key
 * pengguna yang dipakai (key Applify tidak pernah ikut), jadi panggilan BYOK tidak pernah tertagih ke Applify.
 */
export function byokChain(creds: ByokCredential[]): ChainTarget[] {
  const out: ChainTarget[] = [];
  for (const c of creds) {
    const preset = byokPreset(c.provider);
    if (!preset || !c.key) continue;
    const models = [...new Set([...(c.model ? [c.model] : []), ...preset.defaultModels])];
    for (const model of models) {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (preset.format === "anthropic") {
        headers["x-api-key"] = c.key;
        headers["anthropic-version"] = ANTHROPIC_VERSION;
      } else {
        headers.Authorization = `Bearer ${c.key}`;
      }
      if (preset.id === "openrouter") {
        headers["HTTP-Referer"] = "https://applify.id";
        headers["X-Title"] = "Applify";
      }
      out.push({ provider: preset.id, entry: `byok:${preset.id}:${model}`, model, url: preset.url, headers, format: preset.format, source: "byok", keyEncrypted: c.keyEncrypted });
    }
  }
  return out;
}

/**
 * Gabungan rantai satu permintaan: rantai BYOK dulu, lalu rantai Applify hanya bila kuota bulanan masih ada
 * (atau mode analyze yang memang tidak memotong kuota). Pengguna BYOK yang kuotanya habis tetap bisa membuat
 * draf, tetapi bila semua key-nya gagal, permintaannya tidak jatuh ke key Applify.
 */
export function combinedChain(input: {
  byok: ChainTarget[];
  applify: ResolvedModel[];
  quotaRemaining: number;
  mode: string;
}): ChainTarget[] {
  const applifyAllowed = input.mode === "analyze" || input.quotaRemaining > 0;
  const applify: ChainTarget[] = applifyAllowed
    ? input.applify.map((t) => ({ ...t, format: "openai" as const, source: "applify" as const }))
    : [];
  return [...input.byok, ...applify];
}

/**
 * Badan permintaan per format. Format OpenAI memakai chatBody (aturan khusus Claude lewat endpoint kompatibel
 * dan OpenAI tetap berlaku). Format Anthropic Messages memisahkan pesan system dan mewajibkan max_tokens.
 */
export function requestBody(
  target: Pick<ChainTarget, "provider" | "model" | "format">,
  messages: { role: string; content: string }[],
  opts: { temperature: number; maxTokens: number },
): Record<string, unknown> {
  if (target.format === "anthropic") {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = messages.filter((m) => m.role !== "system");
    return {
      model: target.model,
      max_tokens: Math.max(opts.maxTokens, CLAUDE_MIN_MAX_TOKENS),
      ...(system ? { system } : {}),
      messages: rest,
    };
  }
  return chatBody(target as Pick<ResolvedModel, "provider" | "model">, messages, opts);
}

/** Teks jawaban, nama model, dan alasan berhenti dari balasan kedua format. */
export function readCompletion(format: ByokFormat, json: any): { text: string; model?: string; finish?: string } {
  if (format === "anthropic") {
    const blocks = Array.isArray(json?.content) ? json.content : [];
    const text = blocks.filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? "")).join("");
    return { text, model: json?.model, finish: json?.stop_reason };
  }
  return {
    text: json?.choices?.[0]?.message?.content ?? "",
    model: json?.model,
    finish: json?.choices?.[0]?.finish_reason,
  };
}

/** Keputusan batas laju draf BYOK. `recentCount` = jumlah draf pengguna dalam satu jam terakhir. */
export function byokRateDecision(input: { recentCount: number | null | undefined; limitPerHour: number }):
  { allowed: true } | { allowed: false; retryAfterSec: number } {
  const count = Number(input.recentCount ?? 0);
  if (Number.isFinite(count) && count < input.limitPerHour) return { allowed: true };
  return { allowed: false, retryAfterSec: 3600 };
}

/**
 * Hanya 401 yang berarti key pengguna ditolak, jadi barisnya ditandai invalid. 403 tidak: OpenAI dan Anthropic
 * juga memakai 403 untuk model yang tidak boleh diakses, sehingga model pilihan yang salah tidak boleh
 * mematikan key yang sebenarnya sah.
 */
export function isAuthFailure(status: number): boolean {
  return status === 401;
}

/**
 * Hapus key dari teks galat penyedia sebelum teks itu masuk log atau balasan. Sebagian penyedia mengulang
 * potongan key di pesan 401. Potongan 8 karakter di awal dan akhir key juga disamarkan.
 */
export function redactSecrets(text: string, secrets: (string | undefined)[]): string {
  let out = text;
  for (const s of secrets) {
    if (!s || s.length < 8) continue;
    for (const piece of [s, s.slice(0, 8), s.slice(-8)]) {
      out = out.split(piece).join("[disamarkan]");
    }
  }
  return out;
}
