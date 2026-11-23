/**
 * Data contoh untuk Kunci API Sendiri (BYOK) di mode demo (VITE_MOCK_MODE=true), tanpa server.
 *
 * Fungsi murni: mereka menerima daftar kunci dan mengembalikan daftar yang baru. Kunci utuh tidak pernah
 * disimpan atau dikembalikan; yang dibawa hanya 4 karakter terakhirnya, sama seperti server sungguhan.
 */
import {
  LLM_PROVIDER_IDS,
  removeKey,
  upsertKey,
  type LlmKeyRow,
  type LlmKeysResponse,
  type LlmProvider,
  type LlmTestResponse,
} from "../lib/llmKeys.ts";

/** Mode demo menyalakan fiturnya supaya tampilannya bisa dicoba. */
export function mockLlmKeysResponse(rows: readonly LlmKeyRow[]): LlmKeysResponse {
  return { enabled: true, providers: [...LLM_PROVIDER_IDS], keys: [...rows] };
}

/** Simpan kunci contoh: dianggap valid, hanya 4 karakter terakhir yang dibawa. Model pilihan ikut tersimpan (boleh kosong). */
export function mockSaveKey(
  rows: readonly LlmKeyRow[],
  provider: LlmProvider,
  apiKey: string,
  model: string | null = null,
  now: Date = new Date(),
): { rows: LlmKeyRow[]; key: LlmKeyRow } {
  const iso = now.toISOString();
  const key: LlmKeyRow = { provider, last4: apiKey.trim().slice(-4), status: "valid", lastValidatedAt: iso, updatedAt: iso, model };
  return { rows: upsertKey(rows, key), key };
}

/** Uji ulang kunci contoh: selalu valid. Null bila penyedia ini belum punya kunci (server membalas 404 not_found). */
export function mockTestKey(
  rows: readonly LlmKeyRow[],
  provider: LlmProvider,
  now: Date = new Date(),
): { rows: LlmKeyRow[]; response: LlmTestResponse } | null {
  const current = rows.find((r) => r.provider === provider);
  if (!current) return null;
  const key: LlmKeyRow = { ...current, status: "valid", lastValidatedAt: now.toISOString() };
  return { rows: upsertKey(rows, key), response: { result: "valid", key } };
}

/** Hapus kunci contoh. */
export function mockDeleteKey(rows: readonly LlmKeyRow[], provider: LlmProvider): { rows: LlmKeyRow[]; deleted: boolean } {
  return { rows: removeKey(rows, provider), deleted: rows.some((r) => r.provider === provider) };
}
