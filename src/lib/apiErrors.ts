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
 *   /api/automation/queue, /api/queue/apply, /api/approvals/:id/approve (services/queue-guard.ts, queue.service.ts)
 *              -> 403 { error, code:'approval_required' }
 *                 409 { error, code:'channel_conflict' }                         persetujuan sudah punya antrean aktif, sudah diklaim, atau milik kanal lain
 *                 429 { error, code:'platform_limit_reached' }                   batas lamaran per jam per situs (tanpa Retry-After)
 *   /api/profile/import*  -> 400 { error, code:'ai_consent_required' }          header x-ai-consent tidak ada
 *   /api/notifications/whatsapp/*
 *              -> 429 { error, code:'otp_daily_limit' | 'otp_cooldown' | 'otp_too_many_attempts' }
 *                 400 { error, code:'otp_mismatch' | 'otp_expired' | 'otp_not_found' | 'invalid_otp' | 'invalid_whatsapp_phone' }
 *                 502 { error, code:'whatsapp_send_failed' }  (isi galat penyedia tidak dikirim server)
 *                 503 { error, code:'notifications_disabled' | 'otp_not_configured' | 'otp_attempts_unavailable' | ... }
 *   /api/approvals/:id/*
 *              -> 400 { error, code:'invalid_id' }; 409 { code:'claim_in_progress' | 'already_resolved' | 'already_logged' }
 *   500 jawaban server kini generik ({ error, code:'internal_error' | ... }); teks galat database tidak pernah dikirim.
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

/** Kalimat saran tunggu: pakai detik dari Retry-After bila ada, kalau tidak minta pengguna menunggu sebentar. */
function retryHint(sec: number | undefined): string {
  return sec && sec > 0 ? `Coba lagi dalam ${waitText(sec)}.` : "Tunggu beberapa saat lagi, lalu coba lagi.";
}

/** Jalur email lewat Gmail belum bisa dipakai karena Google belum disiapkan di server. */
export const GMAIL_UNAVAILABLE_MESSAGE = "Kirim lewat Gmail belum tersedia.";

/** Pencarian lowongan tanpa kata kunci tersimpan dan tanpa jabatan di profil (400 keywords_required). */
export const KEYWORDS_REQUIRED_MESSAGE =
  "Pencarian belum tahu apa yang dicari. Isi kata kunci di Pengaturan Agen (tab Pencarian) atau jabatan di Profil Saya, lalu cari lagi.";

/** Kode jawaban 500 generik dari server: teks galat sebenarnya hanya ada di log server. */
const GENERIC_SERVER_CODES = new Set([
  "internal_error",
  "otp_request_failed",
  "otp_verify_failed",
  "otp_lookup_failed",
  "otp_store_failed",
  "otp_consume_failed",
  "settings_lookup_failed",
  "settings_save_failed",
  "preferences_failed",
  "status_notify_failed",
  "rerun_failed",
  "mark_failed",
  "queue_failed",
  "claims_lookup_failed",
  "claim_resolve_failed",
  "regenerate_failed",
]);

/**
 * Message for the user. `fallback` is used when the response says nothing we recognise, so each screen keeps its
 * own wording ("Gagal membuat surat") for plain failures.
 */
export function describeApiError(err: unknown, fallback = "Terjadi kesalahan. Coba lagi."): string {
  // Build produksi tanpa VITE_API_URL: pesannya sudah ditulis untuk pengguna (lihat ApiConfigError).
  if (err instanceof Error && (err as { code?: unknown }).code === "api_not_configured") return err.message;
  const e = parseApiError(err);

  switch (e.code) {
    case "quota_exhausted": {
      const q = e.quota;
      const used = q?.used !== undefined && q?.quota !== undefined ? ` (${q.used} dari ${q.quota} terpakai)` : "";
      return `Kuota draf AI bulan ini sudah habis${used}. Kuota dihitung per bulan dan akan direset bulan depan. Sementara itu kamu masih bisa melihat lowongan dan mengelola lamaran yang sudah ada.`;
    }
    case "rate_limited":
      return `Terlalu banyak permintaan AI dalam waktu singkat. ${retryHint(e.retryAfterSec)}`;
    case "quota_check_failed":
      return "Kuota AI tidak dapat diperiksa saat ini, jadi permintaan ditolak agar kuota tidak terlewati. Coba lagi nanti.";
    case "rate_limit_check_failed":
      return "Batas permintaan AI tidak dapat diperiksa saat ini, jadi permintaan ditolak demi keamanan. Coba lagi nanti.";
    case "session_encryption_not_configured":
      return (
        "Penyimpanan sesi belum tersedia untuk sementara, jadi sesi yang kamu masukkan belum bisa disimpan. " +
        "Ini bukan kesalahan pada cookie yang kamu masukkan. Coba lagi nanti."
      );
    case "session_undecryptable":
      return "Sesi yang tersimpan tidak dapat dibaca. Kunci enkripsi server mungkin berubah atau datanya rusak. Impor ulang sesi untuk menggantinya.";
    case "otp_daily_limit":
      return "Batas permintaan kode OTP hari ini sudah tercapai. Kode OTP dibatasi 5 permintaan per akun dan 5 per nomor dalam 24 jam. Coba lagi besok.";
    case "otp_cooldown":
      return "Kode OTP baru saja dikirim. Tunggu sekitar satu menit sebelum meminta kode lagi.";
    case "otp_too_many_attempts":
      return "Batas percobaan kode OTP tercapai atau kode sudah dipakai. Minta kode baru (tetap terhitung dalam batas harian).";
    case "otp_mismatch":
      return "Kode OTP salah. Periksa kode di WhatsApp, lalu coba lagi.";
    case "otp_expired":
      return "Kode OTP sudah kedaluwarsa. Minta kode baru.";
    case "otp_not_found":
      return "Belum ada kode OTP aktif untuk nomor ini. Minta kode baru.";
    case "invalid_otp":
      return "Kode OTP harus 6 digit angka.";
    case "invalid_whatsapp_phone":
      return "Nomor WhatsApp tidak valid. Gunakan format +628... atau 08...";
    case "whatsapp_not_verified":
      return "Verifikasi nomor WhatsApp lewat kode OTP lebih dulu sebelum mengaktifkannya.";
    case "whatsapp_send_failed":
      return "Kode OTP gagal dikirim ke WhatsApp. Pastikan nomor aktif dan sudah pernah chat ke nomor bot Applify, lalu coba lagi nanti.";
    case "notifications_disabled":
      return "Notifikasi WhatsApp belum tersedia, jadi tidak ada pesan yang dikirim.";
    case "otp_not_configured":
    case "otp_attempts_unavailable":
    case "kapso_not_configured":
    case "notification_tables_unavailable":
      return "Notifikasi WhatsApp belum tersedia. Coba lagi nanti.";
    case "account_email_unavailable":
      return "Email akunmu belum terkonfirmasi atau tidak tersedia, jadi notifikasi email belum bisa diaktifkan.";
    case "invalid_id":
      return "ID tidak valid. Muat ulang halaman, lalu coba lagi.";
    case "claim_in_progress":
      return "Pengiriman untuk persetujuan ini masih berjalan atau statusnya belum bisa dipastikan. Tunggu beberapa menit, lalu muat ulang halaman.";
    case "already_resolved":
      return "Klaim ini sudah diselesaikan sebelumnya, jadi tidak ada yang diubah lagi.";
    case "already_logged":
      return "Lamaran ini sudah tercatat terkirim, jadi tidak perlu dipulihkan lagi.";
    case "approval_required":
      return "Persetujuan tidak sah, belum disetujui, atau sudah kedaluwarsa. Muat ulang halaman dan periksa statusnya.";
    case "channel_conflict":
      return "Persetujuan ini sudah punya pengiriman yang sedang berjalan atau sudah terpakai. Jangan tekan Setujui dua kali. Muat ulang halaman dan periksa statusnya.";
    case "platform_limit_reached":
      return `Batas lamaran per jam ke situs ini sudah tercapai, jadi lamaran belum dimasukkan ke antrean. ${
        e.retryAfterSec && e.retryAfterSec > 0
          ? retryHint(e.retryAfterSec)
          : "Batas dihitung per jam: tunggu sampai satu jam, lalu kirim lagi, atau lamar ke situs lain dulu."
      }`;
    case "ai_consent_required":
      return "Centang persetujuan pemrosesan CV oleh layanan AI dulu, lalu coba lagi.";
    case "gmail_not_configured":
      return GMAIL_UNAVAILABLE_MESSAGE;
    case "keywords_required":
      return KEYWORDS_REQUIRED_MESSAGE;
    case "empty_off_portal_input":
      return "Isi teks caption, tautan lowongan, atau unggah gambar poster lebih dulu.";
    case "off_portal_text_too_long":
      return "Teks caption terlalu panjang. Ringkas menjadi maksimal 12.000 karakter lalu coba lagi.";
    case "empty_image":
    case "invalid_image":
      return "Berkas gambar poster tidak valid. Unggah gambar PNG, JPG, atau WebP yang utuh.";
    case "image_too_large":
      return "Ukuran gambar poster terlalu besar, maksimal 5 MB.";
    case "private_jobs_migration_required":
      return "Penyimpanan lowongan pribadi belum aktif di database (migrasi belum dijalankan). Pratinjau tetap bisa dibaca.";
    case "off_portal_save_failed":
      return "Lowongan pribadi belum bisa disimpan saat ini. Coba lagi beberapa saat lagi.";
    case "private_jobs_limit_reached":
      return "Daftar lowongan pribadi sudah penuh (maksimal 200). Hapus lowongan pribadi yang tidak dipakai lalu simpan lagi.";
  }

  if (e.code && GENERIC_SERVER_CODES.has(e.code)) return `${fallback} Server sedang bermasalah. Coba lagi beberapa saat lagi.`;
  if (e.status === 401) return "Sesi login berakhir atau belum masuk. Masuk lagi, lalu ulangi.";
  if (e.status === 429) return `Terlalu banyak permintaan. ${retryHint(e.retryAfterSec)}`;
  // Server lama belum mengirim kode untuk Gmail yang belum dikonfigurasi: kenali dari statusnya, lalu tampilkan pesan buatan sendiri.
  if (e.status === 503 && e.serverMessage && /gmail not configured/i.test(e.serverMessage)) return GMAIL_UNAVAILABLE_MESSAGE;
  // Teks galat server (sering berbahasa Inggris atau memuat nama pengaturan) bukan untuk pengguna: hanya ke konsol.
  if (e.serverMessage && typeof console !== "undefined") console.debug("[api] pesan server tidak ditampilkan:", e.serverMessage);
  if (e.rawText && /failed to fetch|networkerror|load failed|network request failed/i.test(e.rawText)) {
    return "Server Applify tidak dapat dihubungi. Periksa koneksi internetmu, lalu coba lagi. Bila koneksimu normal, server sedang bermasalah; coba lagi beberapa menit lagi.";
  }
  if (e.status !== undefined && e.status >= 500) return `${fallback} Server sedang bermasalah. Coba lagi beberapa saat lagi.`;
  return fallback;
}
