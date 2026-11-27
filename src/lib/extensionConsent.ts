/**
 * Izin memakai Ekstensi Browser untuk mengisi formulir lowongan yang perlu login.
 *
 * Alur: pengguna menyetujui lamaran, lalu backend TIDAK langsung mengantre tugas ekstensi. Jawaban
 * POST /api/approvals/:id/approve memuat `apply_channel: "extension"` dan `extension_consent_required: true`.
 * Pengguna mengizinkan lewat POST /api/approvals/:id/extension-consent { always? } (tugas extension_apply masuk
 * antrean; 409 bila sudah aktif). Bila `always` true, backend juga menyalakan pengaturan `extension_auto_use`,
 * dan persetujuan berikutnya langsung diantre tanpa bertanya. Ekstensi hanya mengisi dan berhenti sebelum
 * tombol kirim: pengguna menekan Kirim Sekarang di panel ekstensi.
 *
 * Fungsi murni tanpa React atau Supabase, supaya bisa dites dengan `node --test`.
 */

import { describeApiError, parseApiError } from "./apiErrors.ts";
import { type AgentApplyRow } from "./agentApplyStatus.ts";

export const EXTENSION_CONSENT_TITLE = "Izinkan ekstensi browser mengisi formulir ini";
export const EXTENSION_CONSENT_BUTTON = "Izinkan";
export const EXTENSION_HANDOFF_TITLE = "Lanjutkan di ekstensi";
export const EXTENSION_HANDOFF_BUTTON = "Lanjutkan di ekstensi";
export const EXTENSION_HANDOFF_NOTE =
  "Pengisian berhenti sebelum mengirim karena formulir membutuhkan login, unggah berkas, CAPTCHA, atau jawaban tambahan. Lanjutkan pengisian lewat Ekstensi Browser di tab Chrome/Edge milikmu.";
export const EXTENSION_CONSENT_BUSY_LABEL = "Memproses...";
export const EXTENSION_CONSENT_ALWAYS_LABEL = "Selalu izinkan tanpa bertanya";
export const EXTENSION_CONSENT_EXPLAIN =
  "Ekstensi membuka tab baru di browser kamu, mengisi formulir di sana, lalu berhenti sebelum mengirim. Kamu yang menekan Kirim Sekarang di panel ekstensi.";
export const EXTENSION_CONSENT_LOGIN_NOTE =
  "Situs ini meminta kamu masuk ke akun pelamar. Ekstensi membuka situsnya dan menunggu kamu login di tab itu.";
export const EXTENSION_CONSENT_CONNECT_PREFIX = "Pastikan ekstensi sudah terhubung.";
export const EXTENSION_CONSENT_CONNECT_LINK = "Hubungkan di Pengaturan";
export const EXTENSION_CONSENT_GRANTED_TEXT = "Izin diberikan. Ekstensi akan membuka situs lowongan di tab baru di browser kamu.";
export const EXTENSION_CONSENT_ALWAYS_GRANTED_TEXT =
  "Izin diberikan. Ekstensi akan dipakai otomatis untuk situs yang perlu login. Kamu bisa mematikannya di Pengaturan Agen.";
export const EXTENSION_CONSENT_ALREADY_RUNNING_TEXT = "Ekstensi sudah berjalan untuk lamaran ini.";
export const EXTENSION_CONSENT_REQUIRED_TOAST = "Disetujui. Izinkan ekstensi browser untuk mengisi formulirnya di tab Menunggu.";
export const EXTENSION_CONSENT_EXPIRED_TEXT = "Persetujuan ini sudah kedaluwarsa. Ajukan lagi dari halaman Lowongan.";

/** Alasan blok izin tampil. */
export type ExtensionConsentReason = "not_started" | "flagged" | "login_needed" | "handoff_needed";

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

/**
 * Percobaan agen terbaru berhenti karena pengisian harus dialihkan ke Ekstensi Browser (Google Form dengan pertanyaan
 * wajib atau unggah berkas, login, CAPTCHA). Dipakai tindakan di kartu Persetujuan.
 */
export function isExtensionHandoffRow(row: Pick<AgentApplyRow, "extension_handoff" | "reason"> | null | undefined): boolean {
  return (
    row?.extension_handoff === true || row?.reason === "file_upload_required" || row?.reason === "google_forms_missing_required"
  );
}

/**
 * Blok izin ekstensi ("Izinkan" / "Lanjutkan di ekstensi" + "Selalu izinkan tanpa bertanya") tidak lagi ditampilkan
 * karena pengalihan dan antrean Ekstensi Browser berjalan otomatis.
 */
export function extensionConsentState(_input: ExtensionConsentInput): ExtensionConsentState {
  // Ekstensi Browser dipakai otomatis tanpa meminta persetujuan/izin berulang di kartu Persetujuan.
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
  if (e.code === "not_extension_channel") {
    return {
      alreadyActive: false,
      message: "Situs lowongan ini belum didukung Ekstensi Browser. Buka situsnya dan lamar manual.",
    };
  }
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
