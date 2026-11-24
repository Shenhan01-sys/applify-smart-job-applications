/**
 * Izin memakai Ekstensi Browser untuk mengisi formulir lowongan yang perlu login.
 *
 * Alur: pengguna menyetujui lamaran, lalu backend TIDAK langsung mengantre tugas ekstensi. Jawaban
 * POST /api/approvals/:id/approve memuat `apply_channel: "extension"` dan `extension_consent_required: true`.
 * Pengguna mengizinkan lewat POST /api/approvals/:id/extension-consent { always? } (tugas extension_apply masuk
 * antrean; 409 bila sudah aktif). Bila `always` true, backend juga menyalakan pengaturan `extension_auto_use`,
 * dan persetujuan berikutnya langsung diantre tanpa bertanya. Ekstensi hanya mengisi dan berhenti sebelum
 * tombol kirim: pengguna sendiri yang menekan Kirim di tab itu.
 *
 * Fungsi murni tanpa React atau Supabase, supaya bisa dites dengan `node --test`.
 */

import { classifyJobChannel } from "./applyChannel.ts";
import { describeApiError, parseApiError } from "./apiErrors.ts";
import { isAgentApplyActive, type AgentApplyRow } from "./agentApplyStatus.ts";

export const EXTENSION_CONSENT_TITLE = "Izinkan ekstensi browser mengisi formulir ini";
export const EXTENSION_CONSENT_BUTTON = "Izinkan";
export const EXTENSION_CONSENT_BUSY_LABEL = "Memproses...";
export const EXTENSION_CONSENT_ALWAYS_LABEL = "Selalu izinkan tanpa bertanya";
export const EXTENSION_CONSENT_EXPLAIN =
  "Ekstensi mengisi formulir di tab latar belakang dan berhenti sebelum mengirim. Kamu sendiri yang menekan Kirim di tab itu.";
export const EXTENSION_CONSENT_LOGIN_NOTE =
  "Situs ini meminta kamu masuk ke akun pelamar. Ekstensi membuka situsnya dan menunggu kamu login di tab itu.";
export const EXTENSION_CONSENT_CONNECT_PREFIX = "Pastikan ekstensi sudah terhubung.";
export const EXTENSION_CONSENT_CONNECT_LINK = "Hubungkan di Pengaturan";
export const EXTENSION_CONSENT_GRANTED_TEXT = "Izin diberikan. Ekstensi akan membuka situs lowongan di tab latar belakang.";
export const EXTENSION_CONSENT_ALWAYS_GRANTED_TEXT =
  "Izin diberikan. Ekstensi akan dipakai otomatis untuk situs yang perlu login. Kamu bisa mematikannya di Pengaturan Agen.";
export const EXTENSION_CONSENT_ALREADY_RUNNING_TEXT = "Ekstensi sudah berjalan untuk lamaran ini.";
export const EXTENSION_CONSENT_REQUIRED_TOAST = "Disetujui. Izinkan ekstensi browser untuk mengisi formulirnya di tab Riwayat.";
export const EXTENSION_CONSENT_EXPIRED_TEXT = "Persetujuan ini sudah kedaluwarsa. Ajukan lagi dari halaman Lowongan.";

/** Alasan blok izin tampil. */
export type ExtensionConsentReason = "not_started" | "flagged" | "login_needed";

export interface ExtensionConsentInput {
  /** Status persetujuan (hanya "approved" yang bisa diizinkan). */
  approvalStatus: string | null | undefined;
  /** approval.platform, untuk klasifikasi kanal. */
  platform?: string | null;
  /** jobs.external_url dari lowongan persetujuan ini (http atau https). */
  jobUrl?: string | null;
  /** Status agen terbaru untuk persetujuan ini (tugas antrean dan log); undefined bila tidak ada tugas. */
  row: AgentApplyRow | null | undefined;
  /** Status agen sudah terbaca dari database. Sebelum itu "tidak ada tugas" belum berarti apa-apa. */
  agentKnown: boolean;
  /** Persetujuan ini sudah tercatat terkirim (application_logs success). */
  submitted?: boolean;
  /** Jawaban approve bilang izin dibutuhkan (extension_consent_required). */
  consentRequired?: boolean;
}

export interface ExtensionConsentState {
  show: boolean;
  reason?: ExtensionConsentReason;
}

const HIDDEN: ExtensionConsentState = { show: false };

/** Log menunjukkan lamaran sudah dikirim atau pengiriman sedang diurus: izin tidak relevan lagi. */
function alreadySentOrClaimed(row: AgentApplyRow | null | undefined, submitted: boolean): boolean {
  if (submitted) return true;
  if (!row) return false;
  if (row.log_status === "success" || row.log_status === "submit_unverified") return true;
  return row.claim_state === "submitted" || row.claim_state === "in_progress" || row.claim_state === "locked_stuck";
}

/**
 * Apakah blok "Izinkan ekstensi" tampil untuk satu persetujuan. Syarat umum: disetujui, belum terkirim, dan tidak
 * ada tugas apply atau extension_apply yang sedang aktif. Lalu salah satu alasan:
 *   - flagged: jawaban approve meminta izin;
 *   - login_needed: percobaan terakhir berhenti karena situs meminta login atau mengalihkan ke domain lain
 *     (auth_required, external_redirect) dan situsnya didukung ekstensi;
 *   - not_started: belum ada tugas sama sekali dan situsnya didukung ekstensi (lowongan portal login, situs karier).
 */
export function extensionConsentState(input: ExtensionConsentInput): ExtensionConsentState {
  if (input.approvalStatus !== "approved") return HIDDEN;
  const submitted = input.submitted === true;
  if (alreadySentOrClaimed(input.row, submitted)) return HIDDEN;
  if (isAgentApplyActive(input.row)) return HIDDEN;

  // Jawaban approve meminta izin dan belum ada tugas apa pun: izin dulu. Begitu ada tugas (atau hasilnya), yang tampil status tugas itu.
  if (input.consentRequired === true && !input.row?.status) return { show: true, reason: "flagged" };

  const channel = classifyJobChannel({ platform: input.platform, external_url: input.jobUrl });
  const eligible = channel.extensionSupported && !channel.manualOnly;
  if (!eligible) return HIDDEN;

  const row = input.row;
  if (row?.log_status === "incomplete" && (row.reason === "auth_required" || row.reason === "external_redirect")) {
    return { show: true, reason: "login_needed" };
  }
  // "Belum ada tugas" hanya berarti bila status agen sudah terbaca; tugas yang tidak terbaca tidak boleh ditebak.
  if (input.agentKnown && (!row || !row.status)) return { show: true, reason: "not_started" };
  return HIDDEN;
}

export interface ConsentFailure {
  /** 409: tugas ekstensi sudah aktif. Bukan galat bagi pengguna, tampilan cukup dimuat ulang. */
  alreadyActive: boolean;
  message: string;
}

/** Galat POST /extension-consent -> pesan untuk pengguna (teks server tidak ditampilkan). */
export function describeConsentError(err: unknown): ConsentFailure {
  const e = parseApiError(err);
  if (e.status === 409) {
    return { alreadyActive: true, message: EXTENSION_CONSENT_ALREADY_RUNNING_TEXT };
  }
  if (e.status === 410 || e.code === "approval_expired") {
    return { alreadyActive: false, message: EXTENSION_CONSENT_EXPIRED_TEXT };
  }
  if (e.status === 404) {
    return { alreadyActive: false, message: "Izin belum bisa diberikan untuk persetujuan ini. Muat ulang halaman, lalu coba lagi." };
  }
  return { alreadyActive: false, message: describeApiError(err, "Izin belum bisa diberikan. Coba lagi.") };
}

/** Jawaban POST /approve: lamaran belum diantre, pengguna harus mengizinkan ekstensi lebih dulu. */
export function consentRequiredFrom(approveResponse: unknown): boolean {
  return (
    typeof approveResponse === "object" &&
    approveResponse !== null &&
    (approveResponse as { extension_consent_required?: unknown }).extension_consent_required === true
  );
}

/** Isi badan POST: `always` hanya dikirim bila dicentang. */
export function consentRequestBody(always: boolean): { always?: true } {
  return always ? { always: true } : {};
}
