/**
 * Hasil sambungan Gmail yang dikembalikan backend lewat alamat halaman (GET /api/oauth/google/callback mengarahkan
 * ke `/settings?gmail=connected` atau `/settings?gmail=error&reason=<kode>`). Murni, supaya bisa dites dengan
 * `node --test`. Kode alasan berasal dari Google (misalnya access_denied) atau backend (token_exchange, storage);
 * teks mentahnya tidak pernah ditampilkan.
 */

export type GmailCallback = { kind: "connected" } | { kind: "error"; reason: string | null };

export interface GmailBanner {
  tone: "success" | "error";
  text: string;
}

export interface GmailSearch {
  gmail?: "connected" | "error";
  reason?: string;
}

/** Parameter pencarian halaman -> bentuk yang aman. Nilai lain dibuang. */
export function validateGmailSearch(search: Record<string, unknown>): GmailSearch {
  const out: GmailSearch = {};
  if (search.gmail === "connected" || search.gmail === "error") out.gmail = search.gmail;
  if (out.gmail === "error" && typeof search.reason === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(search.reason)) {
    out.reason = search.reason;
  }
  return out;
}

export function parseGmailCallback(search: GmailSearch | null | undefined): GmailCallback | null {
  if (search?.gmail === "connected") return { kind: "connected" };
  if (search?.gmail === "error") return { kind: "error", reason: search.reason ?? null };
  return null;
}

export const GMAIL_CONNECTED_TEXT = "Gmail terhubung. Kamu bisa mengirim lamaran lewat email dari persetujuan yang sudah disetujui.";
export const GMAIL_DENIED_TEXT = "Izin Gmail tidak diberikan, jadi Gmail belum terhubung. Coba lagi dan pilih Izinkan.";
export const GMAIL_FAILED_TEXT = "Gmail belum bisa disambungkan saat ini. Coba lagi nanti.";
export const GMAIL_SESSION_TEXT = "Sambungan Gmail terputus di tengah jalan atau sudah lewat waktunya. Mulai lagi dari tombol Hubungkan Gmail.";
export const GMAIL_UNAVAILABLE_TEXT = "Kirim lewat Gmail belum tersedia.";
export const GMAIL_UNKNOWN_ERROR_TEXT = "Gmail belum terhubung. Coba hubungkan lagi dari kartu Persetujuan.";

export function gmailBanner(callback: GmailCallback): GmailBanner {
  if (callback.kind === "connected") return { tone: "success", text: GMAIL_CONNECTED_TEXT };
  switch (callback.reason) {
    case "access_denied":
      return { tone: "error", text: GMAIL_DENIED_TEXT };
    case "token_exchange":
    case "storage":
      return { tone: "error", text: GMAIL_FAILED_TEXT };
    case "invalid_state":
    case "session_mismatch":
    case "missing_params":
      return { tone: "error", text: GMAIL_SESSION_TEXT };
    case "not_configured":
      return { tone: "error", text: GMAIL_UNAVAILABLE_TEXT };
    default:
      return { tone: "error", text: GMAIL_UNKNOWN_ERROR_TEXT };
  }
}
