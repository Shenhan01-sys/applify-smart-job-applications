/**
 * Terjemahan galat Supabase (auth, PostgREST, Edge Function) dan galat jaringan ke pesan Indonesia yang
 * memberi tahu pengguna apa yang bisa dilakukan. Pesan mentah tidak pernah ditampilkan apa adanya kecuali
 * sudah berbahasa Indonesia. Tanpa impor, supaya bisa dites dengan `node --test`.
 */

interface ErrLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  error_description?: unknown;
  details?: unknown;
}

interface Norm {
  msg: string;
  code: string;
  status?: number;
}

function norm(err: unknown): Norm {
  if (typeof err === "string") return { msg: err.toLowerCase(), code: "" };
  const e = (err ?? {}) as ErrLike;
  const raw = typeof e.message === "string" && e.message ? e.message : typeof e.error_description === "string" ? e.error_description : "";
  return {
    msg: raw.toLowerCase(),
    code: typeof e.code === "string" ? e.code.toLowerCase() : "",
    status: typeof e.status === "number" ? e.status : undefined,
  };
}

const NETWORK = /failed to fetch|networkerror|load failed|network request failed|fetch failed|err_internet|timeout|timed out/;
const MSG_NETWORK = "Tidak ada koneksi ke server. Periksa internetmu, lalu coba lagi.";
const MSG_RELOGIN = "Sesi masuk sudah berakhir. Masuk lagi untuk melanjutkan.";
const MSG_RATE = "Terlalu banyak percobaan dalam waktu singkat. Tunggu beberapa menit, lalu coba lagi.";

/** Tebakan murah: pesan yang sudah ditulis tim ini (Indonesia) boleh ditampilkan apa adanya. */
const INDONESIAN = /\b(gagal|tidak|belum|silakan|kamu|coba|harus|sudah|lowongan|kuota|draf|surat|profil|simpan|masuk)\b/i;
export const looksIndonesian = (text: string) => INDONESIAN.test(text);

/** Penyedia masuk pihak ketiga yang ditawarkan halaman masuk. */
export type AuthProvider = "google" | "linkedin";

export const AUTH_PROVIDER_LABEL: Record<AuthProvider, string> = { google: "Google", linkedin: "LinkedIn" };

/** Penyedia lain yang masih bisa dipakai bila satu penyedia tidak tersedia. */
const AUTH_PROVIDER_ALTERNATIVE: Record<AuthProvider, string> = {
  google: "Pakai LinkedIn atau email dan kata sandi.",
  linkedin: "Pakai Google atau email dan kata sandi.",
};

const PROVIDER_STORAGE_KEY = "applify_oauth_provider";

/** Penyedia dari pesan galat (Supabase menyebut nama penyedianya di sebagian pesan); null bila tidak jelas. */
export function detectAuthProvider(msg: string): AuthProvider | null {
  if (/linkedin/i.test(msg)) return "linkedin";
  if (/google/i.test(msg)) return "google";
  return null;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Ingat penyedia yang dipilih sebelum browser pindah ke halaman penyedia, supaya halaman /auth/callback tahu
 * penyedia mana yang gagal (alamat galat dari Supabase tidak menyebutnya). Disimpan di sessionStorage tab ini.
 */
export function rememberAuthProvider(provider: AuthProvider, storage?: StorageLike | null): void {
  try {
    (storage ?? (typeof sessionStorage === "undefined" ? null : sessionStorage))?.setItem(PROVIDER_STORAGE_KEY, provider);
  } catch {
    /* penyimpanan tertutup (mode privat): pesan galat cukup memakai kata umum */
  }
}

export function recallAuthProvider(storage?: StorageLike | null): AuthProvider | null {
  try {
    const value = (storage ?? (typeof sessionStorage === "undefined" ? null : sessionStorage))?.getItem(PROVIDER_STORAGE_KEY);
    return value === "google" || value === "linkedin" ? value : null;
  } catch {
    return null;
  }
}

/** Galat dari supabase.auth: masuk, daftar, OAuth (Google atau LinkedIn), reset kata sandi. */
export function describeAuthError(err: unknown, fallback = "Proses akun belum berhasil. Coba lagi.", provider?: AuthProvider | null): string {
  const { msg, code, status } = norm(err);
  const who = provider ?? detectAuthProvider(msg);

  if (NETWORK.test(msg)) return MSG_NETWORK;
  if (code === "invalid_credentials" || /invalid login credentials/.test(msg)) {
    return 'Email atau kata sandi salah. Periksa lagi ketikanmu. Bila lupa kata sandi, pilih "Lupa kata sandi".';
  }
  if (code === "email_not_confirmed" || /email not confirmed/.test(msg)) {
    return "Email belum diverifikasi. Buka email dari Applify (cek juga folder spam), klik tautan verifikasinya, lalu masuk lagi.";
  }
  if (code === "user_already_exists" || code === "email_exists" || /already (been )?registered|already exists/.test(msg)) {
    return 'Email ini sudah terdaftar. Pilih "Masuk", atau "Lupa kata sandi" bila kamu lupa kata sandinya.';
  }
  if (code === "weak_password" || /password should be at least|password is known to be weak|weak password/.test(msg)) {
    return "Kata sandi terlalu pendek atau mudah ditebak. Pakai minimal 6 karakter dan campur huruf dengan angka.";
  }
  if (code === "same_password" || /different from the old password/.test(msg)) {
    return "Kata sandi baru harus berbeda dari kata sandi yang lama.";
  }
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || status === 429 || /rate limit|too many requests|for security purposes/.test(msg)) {
    return MSG_RATE;
  }
  if (code === "email_address_invalid" || /unable to validate email|invalid email|invalid format/.test(msg)) {
    return "Format email tidak valid. Periksa penulisannya, misalnya nama@email.com.";
  }
  if (code === "signup_disabled" || /signups? not allowed|signups? (are )?disabled/.test(msg)) {
    return "Pendaftaran akun baru sedang ditutup. Hubungi pengelola aplikasi.";
  }
  if (/database error saving new user/.test(msg)) {
    return "Akun belum bisa dibuat karena gangguan di server. Coba lagi beberapa menit lagi. Bila tetap gagal, hubungi pengelola aplikasi.";
  }
  if (code === "provider_disabled" || /provider is not enabled|unsupported provider/.test(msg)) {
    return who
      ? `Masuk dengan ${AUTH_PROVIDER_LABEL[who]} belum diaktifkan di aplikasi ini. ${AUTH_PROVIDER_ALTERNATIVE[who]}`
      : "Masuk dengan akun pihak ketiga belum diaktifkan di aplikasi ini. Pakai email dan kata sandi.";
  }
  if (code === "access_denied" || /access_denied|access denied|user cancel/.test(msg)) {
    return who
      ? `Proses masuk dengan ${AUTH_PROVIDER_LABEL[who]} dibatalkan. Coba lagi bila kamu ingin melanjutkan.`
      : "Proses masuk dibatalkan. Coba lagi bila kamu ingin melanjutkan.";
  }
  if (code === "otp_expired" || /otp_expired|token has expired|link.*expired|expired.*link/.test(msg)) {
    return "Tautan sudah kedaluwarsa atau sudah dipakai. Minta tautan baru, lalu buka tautan itu segera.";
  }
  if (code === "session_not_found" || code === "bad_jwt" || /jwt expired|invalid jwt|refresh token|session (missing|not found)|auth session missing/.test(msg)) {
    return MSG_RELOGIN;
  }
  if (code === "user_not_found") return "Akun dengan email itu tidak ditemukan. Periksa penulisannya atau daftar akun baru.";
  if (status !== undefined && status >= 500) return "Server sedang bermasalah. Coba lagi beberapa menit lagi.";
  if (msg && looksIndonesian(msg)) return String((err as ErrLike).message);
  return fallback;
}

/** Galat umum dari Supabase (basis data, Edge Function) dan jaringan. */
export function describeError(err: unknown, fallback = "Terjadi kesalahan. Coba lagi."): string {
  const { msg, code, status } = norm(err);

  if (NETWORK.test(msg)) return MSG_NETWORK;
  if (status === 401 || code === "pgrst301" || /invalid token|missing auth token|jwt expired|invalid jwt|not authenticated|auth session missing/.test(msg)) {
    return MSG_RELOGIN;
  }
  if (/kuota bulanan habis/.test(msg)) {
    return "Kuota draf AI bulan ini sudah habis. Kuota dihitung per bulan dan akan direset bulan depan. Sementara itu kamu masih bisa melihat lowongan dan mengelola lamaran yang sudah ada.";
  }
  if (status === 429 || /rate limit|too many requests/.test(msg)) return MSG_RATE;
  if (code === "42501" || /row-level security|permission denied/.test(msg)) {
    return "Kamu tidak punya izin untuk tindakan ini. Masuk lagi, lalu coba sekali lagi.";
  }
  if (code === "23505" || /duplicate key/.test(msg)) return "Data ini sudah ada, jadi tidak disimpan dua kali.";
  if (/job not found|assessment not found/.test(msg) || status === 404) {
    return "Data yang dicari tidak ditemukan. Mungkin sudah dihapus; muat ulang halaman lalu coba lagi.";
  }
  if (/ai not configured/.test(msg)) {
    return "Layanan AI belum siap di server. Ini masalah konfigurasi, bukan kesalahanmu. Hubungi pengelola aplikasi.";
  }
  if (/ai generation failed|non-2xx|failed to save draft|quota (check|update) failed/.test(msg) || status === 502 || status === 503) {
    return "Layanan AI sedang sibuk atau tidak menjawab. Coba lagi beberapa menit lagi.";
  }
  if (status !== undefined && status >= 500) return "Server sedang bermasalah. Coba lagi beberapa menit lagi.";
  const raw = (err as ErrLike | null)?.message;
  if (typeof raw === "string" && raw && looksIndonesian(raw)) return raw;
  return fallback;
}
