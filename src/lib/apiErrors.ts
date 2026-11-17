/**
 * Turn what the backend answers on a failed call into a message a user can act on.
 *
 * Backend contract (read only; backend/api/routes/ai.ts, services/ai-guard.service.ts, sessions.ts,
 * linkedin-session.ts, services/session-crypto.ts, queue-guard.ts):
 *   /api/ai/*  -> 401 { success:false, error }                                  not signed in
 *                 429 { success:false, error, code:'quota_exhausted', quota }    monthly draft quota used up
 *                 429 { success:false, error, code:'rate_limited', retryAfterSec } + Retry-After header
 *                 503 { success:false, error, code:'quota_check_failed' | 'rate_limit_check_failed' }
 *   /api/sessions/*, /api/linkedin/import|verify
 *              -> 503 { error, code:'session_encryption_not_configured' }       server has no encryption key
 *                 422 { error, code:'session_undecryptable' }                    stored session cannot be read
 *   /api/automation/queue, /api/queue/apply
 *              -> 403 { error, code:'approval_required' }
 *
 * Plain TypeScript with no imports, so it runs under `node --test` without a bundler.
 */

/** Error thrown by the API helper. `message` stays the raw response text, so older code that parses it keeps working. */
export class ApiError extends Error {
  status: number;
  /** value of the Retry-After header in seconds, when the response had one */
  retryAfterHeader?: number;

  constructor(status: number, bodyText: string, retryAfterHeader?: number) {
    super(bodyText);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterHeader = retryAfterHeader;
  }
}

export interface ParsedApiError {
  status?: number;
  code?: string;
  /** the server's own message, when it sent one */
  serverMessage?: string;
  retryAfterSec?: number;
  quota?: { quota?: number; used?: number; remaining?: number };
  /** raw text when the body was not JSON */
  rawText?: string;
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

export function parseApiError(err: unknown): ParsedApiError {
  const out: ParsedApiError = {};
  let text = "";
  if (err instanceof Error) text = err.message;
  else if (typeof err === "string") text = err;
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") out.status = status;
  const header = num((err as { retryAfterHeader?: unknown } | null)?.retryAfterHeader);

  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object") {
      if (typeof body.code === "string") out.code = body.code;
      if (typeof body.error === "string") out.serverMessage = body.error;
      out.retryAfterSec = num(body.retryAfterSec) ?? header;
      if (body.quota && typeof body.quota === "object") {
        out.quota = { quota: num(body.quota.quota), used: num(body.quota.used), remaining: num(body.quota.remaining) };
      }
      return out;
    }
  } catch {
    /* not JSON */
  }
  if (text) out.rawText = text;
  out.retryAfterSec = header;
  return out;
}

function waitText(sec: number | undefined): string {
  if (!sec || sec <= 0) return "beberapa saat lagi";
  if (sec < 90) return `${Math.ceil(sec)} detik`;
  return `${Math.ceil(sec / 60)} menit`;
}

/**
 * Message for the user. `fallback` is used when the response says nothing we recognise, so each screen keeps its
 * own wording ("Gagal membuat surat") for plain failures.
 */
export function describeApiError(err: unknown, fallback = "Terjadi kesalahan. Coba lagi."): string {
  const e = parseApiError(err);

  switch (e.code) {
    case "quota_exhausted": {
      const q = e.quota;
      const used = q?.used !== undefined && q?.quota !== undefined ? ` (${q.used} dari ${q.quota} terpakai)` : "";
      return `Kuota draf AI bulan ini sudah habis${used}. Kuota dihitung per bulan; tunggu bulan berikutnya atau pilih paket Pro.`;
    }
    case "rate_limited":
      return `Terlalu banyak permintaan AI dalam waktu singkat. Coba lagi dalam ${waitText(e.retryAfterSec)}.`;
    case "quota_check_failed":
      return "Kuota AI tidak dapat diperiksa saat ini, jadi permintaan ditolak agar kuota tidak terlewati. Coba lagi nanti.";
    case "rate_limit_check_failed":
      return "Batas permintaan AI tidak dapat diperiksa saat ini, jadi permintaan ditolak demi keamanan. Coba lagi nanti.";
    case "session_encryption_not_configured":
      return (
        "Server belum dikonfigurasi untuk menyimpan sesi dengan aman: kunci enkripsi sesi belum diisi administrator. " +
        "Ini masalah konfigurasi server, bukan kesalahan pada cookie yang kamu masukkan. Hubungi administrator."
      );
    case "session_undecryptable":
      return "Sesi yang tersimpan tidak dapat dibaca. Kunci enkripsi server mungkin berubah atau datanya rusak. Impor ulang sesi untuk menggantinya.";
    case "approval_required":
      return `Persetujuan tidak sah, belum disetujui, atau sudah kedaluwarsa (${e.serverMessage ?? "approval_required"}). Muat ulang halaman dan periksa statusnya.`;
  }

  if (e.status === 401) return "Sesi login berakhir atau belum masuk. Masuk lagi, lalu ulangi.";
  if (e.status === 429) return `Terlalu banyak permintaan. Coba lagi dalam ${waitText(e.retryAfterSec)}.`;
  if (e.serverMessage) return `${fallback} (${e.serverMessage})`;
  if (e.rawText && /failed to fetch|networkerror|load failed/i.test(e.rawText)) return "Backend otomasi tidak dapat dihubungi. Coba lagi nanti.";
  return fallback;
}
