/**
 * Kode keamanan dari email ("Masukkan kode keamanan").
 *
 * Sebagian formulir lowongan (Greenhouse) mengirim kode sekali pakai ke email pelamar sesudah tombol kirim
 * ditekan. Worker lalu membiarkan formulir terbuka sampai 10 menit dan menulis log percobaan (action "apply")
 * berstatus "awaiting_code" dengan details.awaiting_until (ISO) dan details.code_length. Pengguna mengetik
 * kode di halaman Persetujuan; aplikasi meneruskannya ke POST /api/agent/security-code { queue_job_id, code }.
 * Bila tidak ada kode sampai waktunya habis, worker menulis log "ready" dengan details.reason "code_timeout".
 *
 * Fungsi murni tanpa impor, supaya bisa dites dengan `node --test`. Kode tidak pernah dicatat, disimpan, atau
 * dikirim ke tempat lain selain badan permintaan itu: modul ini hanya merapikan dan memeriksanya.
 */

export const CODE_MIN_LENGTH = 4;
export const CODE_MAX_LENGTH = 12;
/** Batas kode per percobaan di backend; dipakai pada teks galat 429. */
export const MAX_CODES_PER_ATTEMPT = 3;
/** Batas hitung mundur yang ditampilkan: worker menunggu paling lama 10 menit, tanggal yang jauh lebih jauh tidak dipercaya. */
export const MAX_WAIT_SECONDS = 15 * 60;

/** Muat ulang status agen: 15 detik biasanya, 5 detik selama agen menunggu kode. */
export const AGENT_POLL_MS = 15_000;
export const CODE_POLL_MS = 5_000;

export const SECURITY_CODE_HEADING = "Masukkan kode keamanan";
export const SECURITY_CODE_INTRO =
  "Cek kotak masuk email yang kamu pakai di Applify (juga folder Spam). Kode hanya diteruskan ke agen untuk lamaran ini, tidak dibaca AI, dan dihapus setelah dipakai.";
export const SECURITY_CODE_LABEL = "Kode dari email";
export const SECURITY_CODE_SEND_LABEL = "Kirim kode ke agen";
export const SECURITY_CODE_SENDING_LABEL = "Mengirim kode...";
export const SECURITY_CODE_FORWARDED_TEXT = "Kode diteruskan. Agen sedang mengirim lamaran.";
export const SECURITY_CODE_EXPIRED_TEXT =
  "Waktu menunggu kode habis. Statusnya diperbarui sebentar lagi, lalu kamu bisa menjalankan agen lagi untuk meminta kode baru.";
export const CODE_RERUN_LABEL = "Jalankan agen lagi";
export const CODE_RERUN_BUSY_LABEL = "Menjalankan agen...";
export const CODE_RERUN_STARTED_TEXT = "Agen berjalan lagi. Situs lowongan akan mengirim kode baru ke emailmu.";

export const CODE_EMPTY_MESSAGE = "Masukkan kode dari emailmu.";
export const CODE_CHARS_MESSAGE = "Kode hanya berisi huruf dan angka.";
export const CODE_RANGE_MESSAGE = `Kode harus ${CODE_MIN_LENGTH} sampai ${CODE_MAX_LENGTH} huruf atau angka.`;

// Spasi (termasuk spasi tanpa putus dan spasi lebar nol dari salinan email) dan tanda hubung/strip bermacam
// bentuk: "ab12 cd34" dan "AB12-CD34" dihitung sebagai satu kode.
const SEPARATORS = /[\s​-‍⁠﻿\-‐-―−]+/g;

/** Kode seperti diketik: spasi dan tanda hubung dibuang, huruf besar kecil dibiarkan (kode bisa membedakannya). */
export function normaliseCode(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(SEPARATORS, "") : "";
}

/** Panjang kode dari worker bila masuk akal (bilangan bulat 4 sampai 12), selain itu null (tidak diketahui). */
export function validCodeLength(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= CODE_MIN_LENGTH && value <= CODE_MAX_LENGTH ? value : null;
}

export interface CodeCheck {
  ok: boolean;
  /** Kode yang sudah dirapikan (normaliseCode); dipakai sebagai isi permintaan bila ok. */
  code: string;
  /** Pesan untuk pengguna bila tidak ok; kosong bila ok. */
  message: string;
}

/** Periksa kode: 4 sampai 12 huruf atau angka, dan tepat sepanjang `length` bila panjangnya diketahui. */
export function validateCode(raw: unknown, length?: number | null): CodeCheck {
  const code = normaliseCode(raw);
  if (!code) return { ok: false, code, message: CODE_EMPTY_MESSAGE };
  if (!/^[A-Za-z0-9]+$/.test(code)) return { ok: false, code, message: CODE_CHARS_MESSAGE };
  const known = validCodeLength(length);
  if (known !== null && code.length !== known) return { ok: false, code, message: `Kode harus ${known} karakter.` };
  if (code.length < CODE_MIN_LENGTH || code.length > CODE_MAX_LENGTH) return { ok: false, code, message: CODE_RANGE_MESSAGE };
  return { ok: true, code, message: "" };
}

/** Teks contoh di kolom kode: panjangnya bila diketahui. */
export function codePlaceholder(length: number | null | undefined): string {
  const known = validCodeLength(length);
  return known !== null ? `${known} karakter` : "Kode dari email";
}

/** Baris status agen yang dibaca untuk keputusan menunggu kode (AgentApplyRow memenuhi bentuk ini). */
export interface AwaitingCodeRow {
  /** automation_queue.status */
  status?: string | null;
  /** application_logs.status percobaan terbaru */
  log_status?: string | null;
  /** details.awaiting_until (ISO) */
  awaiting_until?: string | null;
  /** details.code_length */
  code_length?: number | null;
  /** details.reason */
  reason?: string | null;
}

export interface AwaitingCodeState {
  waiting: boolean;
  /** Detik tersisa sampai agen berhenti menunggu; 0 bila tidak menunggu. */
  secondsLeft: number;
  codeLength: number | null;
}

const NOT_WAITING: AwaitingCodeState = { waiting: false, secondsLeft: 0, codeLength: null };

/**
 * Agen menunggu kode bila log terbaru berstatus awaiting_code, awaiting_until masih di depan, dan tugas
 * antreannya belum selesai (processing, atau status antrean belum diketahui). Tugas yang menunggu giliran
 * (pending), selesai, atau gagal tidak menunggu: log awaiting_code yang tersisa dari percobaan lama tidak
 * boleh memunculkan kolom kode.
 */
export function awaitingCodeState(row: AwaitingCodeRow | null | undefined, now: number = Date.now()): AwaitingCodeState {
  if (!row || row.log_status !== "awaiting_code") return NOT_WAITING;
  if (typeof row.status === "string" && row.status !== "processing") return NOT_WAITING;
  const until = typeof row.awaiting_until === "string" ? Date.parse(row.awaiting_until) : NaN;
  if (!Number.isFinite(until) || !Number.isFinite(now)) return NOT_WAITING;
  const ms = until - now;
  if (ms <= 0) return NOT_WAITING;
  return { waiting: true, secondsLeft: Math.min(MAX_WAIT_SECONDS, Math.ceil(ms / 1000)), codeLength: validCodeLength(row.code_length) };
}

/**
 * Percobaan terbaru berakhir tanpa kode yang diterima: tidak dimasukkan tepat waktu (reason code_timeout) atau
 * 3 kode ditolak situs (reason code_rejected). Keduanya belum terkirim dan bisa dijalankan ulang.
 */
export function isCodeTimeout(row: Pick<AwaitingCodeRow, "log_status" | "reason"> | null | undefined): boolean {
  return !!row && row.log_status === "ready" && (row.reason === "code_timeout" || row.reason === "code_rejected");
}

/** Jeda muat ulang status agen: 5 detik bila ada agen yang menunggu kode, selain itu 15 detik. */
export function pollIntervalMs(rows: Iterable<AwaitingCodeRow | null | undefined>, now: number = Date.now()): number {
  for (const row of rows) if (awaitingCodeState(row, now).waiting) return CODE_POLL_MS;
  return AGENT_POLL_MS;
}

/** Detik -> "mm:ss" (tidak pernah negatif). */
export function formatCountdown(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** Jawaban 202 dari backend: hanya { accepted: true } yang berarti kode diteruskan ke agen. */
export function codeAccepted(res: unknown): boolean {
  return typeof res === "object" && res !== null && (res as { accepted?: unknown }).accepted === true;
}

/**
 * Status HTTP dan kode galat dari POST /api/agent/security-code -> pesan singkat untuk pengguna.
 * 400 invalid_code | invalid_job, 401, 404, 409 agent_not_waiting, 429 too_many_codes, 503 feature_unavailable,
 * 500. `status` kosong berarti permintaan tidak sampai ke server.
 */
export function securityCodeErrorMessage(status: number | undefined, error?: string | null): string {
  switch (status) {
    case 400:
      return error === "invalid_job" ? "Tugas agen ini tidak dikenali. Muat ulang halaman, lalu coba lagi." : CODE_RANGE_MESSAGE;
    case 401:
      return "Sesi masuk sudah berakhir. Masuk lagi, lalu kirim kodenya.";
    case 404:
      return "Tugas agen tidak ditemukan. Muat ulang halaman, lalu coba lagi.";
    case 409:
      return "Agen sudah tidak menunggu kode. Bila lamaran belum terkirim, jalankan agen lagi untuk meminta kode baru.";
    case 429:
      return error === "too_many_codes"
        ? `Batas ${MAX_CODES_PER_ATTEMPT} kode untuk percobaan ini sudah tercapai.`
        : "Terlalu sering mencoba. Tunggu sebentar, lalu kirim lagi.";
    case 503:
      return "Fitur kode keamanan belum aktif di server.";
    case undefined:
      return "Server belum bisa dihubungi. Periksa koneksimu, lalu coba lagi.";
    default:
      return "Kode belum bisa dikirim. Coba lagi sebentar lagi.";
  }
}

/**
 * Galat yang dilempar apiFetch (ApiError: `status`, dan `message` berisi teks jawaban server) -> pesan untuk
 * pengguna. Hanya kode galat dari server (`error`) yang dibaca; teks mentahnya tidak pernah ditampilkan.
 */
export function describeSecurityCodeError(err: unknown): string {
  const e = err as { status?: unknown; message?: unknown } | null | undefined;
  const status = typeof e?.status === "number" ? e.status : undefined;
  let error: string | null = null;
  if (typeof e?.message === "string") {
    try {
      const body: unknown = JSON.parse(e.message);
      const value = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
      if (typeof value === "string") error = value;
    } catch {
      /* bukan JSON */
    }
  }
  return securityCodeErrorMessage(status, error);
}
