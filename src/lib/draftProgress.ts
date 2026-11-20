/**
 * Kemajuan dan batas waktu pembuatan draf di jendela "Lamar dengan AI".
 *
 * Edge Function `generate-application` mencoba beberapa model berurutan. Dulu rantainya tidak punya batas total,
 * jadi draf yang gagal baru melapor sesudah sekitar 55 detik tanpa tanda apa pun (uji E2E klik 20 November 2026,
 * temuan 13). Kini server berhenti sesudah anggaran waktunya (DEFAULT_AI_TOTAL_BUDGET_MS di
 * supabase/functions/_shared/providers.ts, 34 detik) dan browser menyerah sedikit sesudahnya, jadi pesan gagal
 * dan tombol "Coba lagi" muncul sekitar 35 sampai 40 detik. Selama menunggu, jendela menampilkan detik berjalan.
 *
 * Fungsi murni tanpa impor, supaya bisa dites dengan `node --test`.
 */

/**
 * Browser berhenti menunggu Edge Function sesudah ini. Harus lebih besar dari anggaran server ditambah waktu
 * membaca profil dan menyimpan draf, supaya jawaban galat dari server tiba lebih dulu (dijaga oleh tes).
 */
export const DRAFT_CLIENT_TIMEOUT_MS = 40_000;

/** Sama dengan pesan describeError() untuk "AI generation failed", dipakai saat browser yang menyerah lebih dulu. */
export const DRAFT_TIMEOUT_MESSAGE = "Layanan AI sedang sibuk atau tidak menjawab. Coba lagi beberapa menit lagi.";

/** Detik sampai petunjuk tambahan "layanan lambat" muncul. */
export const SLOW_HINT_AFTER_SECONDS = 15;

const LIMIT_SECONDS = Math.round(DRAFT_CLIENT_TIMEOUT_MS / 1000);

function wholeSeconds(elapsedSeconds: number): number {
  return Number.isFinite(elapsedSeconds) && elapsedSeconds > 0 ? Math.floor(elapsedSeconds) : 0;
}

/** Tahap singkat menurut lama menunggu. Server tidak melaporkan tahapnya, jadi hanya lamanya yang dipakai. */
export function draftStage(elapsedSeconds: number): string {
  const s = wholeSeconds(elapsedSeconds);
  if (s < 12) return "Menyusun draf";
  if (s < SLOW_HINT_AFTER_SECONDS + 10) return "Masih menyusun draf";
  if (s < LIMIT_SECONDS) return "Menunggu layanan AI menjawab";
  return "Menunggu jawaban terakhir";
}

/** "Menyusun draf... 20 detik" */
export function draftProgressText(elapsedSeconds: number): string {
  return `${draftStage(elapsedSeconds)}... ${wholeSeconds(elapsedSeconds)} detik`;
}

/** Petunjuk di bawah penghitung: kosong sebelum 15 detik, lalu sisa waktu tunggu dan kabar soal kuota. */
export function draftWaitHint(elapsedSeconds: number): string {
  const s = wholeSeconds(elapsedSeconds);
  if (s < SLOW_HINT_AFTER_SECONDS) return "";
  if (s >= LIMIT_SECONDS) return "Sebentar lagi muncul pilihan coba lagi bila belum ada jawaban. Kuota baru terpakai bila draf jadi.";
  return `Layanan AI lebih lambat dari biasanya. Bila belum menjawab dalam sekitar ${LIMIT_SECONDS - s} detik, kamu bisa mencoba lagi. Kuota baru terpakai bila draf jadi.`;
}

/**
 * true bila supabase-js menyerah karena `timeout` habis: FunctionsFetchError yang konteksnya AbortError atau
 * TimeoutError. Putusnya jaringan juga FunctionsFetchError, tetapi konteksnya TypeError, jadi bukan ini.
 */
export function isClientTimeout(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: unknown; context?: unknown };
  if (e.name !== "FunctionsFetchError") return false;
  const ctx = e.context as { name?: unknown } | null | undefined;
  return ctx?.name === "AbortError" || ctx?.name === "TimeoutError";
}
