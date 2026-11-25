import { fieldValueText, type AgentFilledField, type AgentLogFacts, type FilledFieldKind } from "./agentEvidence.ts";
import { isAgentApplyActive, type AgentApplyRow } from "./agentApplyStatus.ts";
import { questionsToAnswer } from "./formQuestions.ts";
import { isCodeTimeout } from "./securityCode.ts";

/**
 * Jalan keluar saat agen berhenti sebelum tombol kirim (log apply berstatus "ready").
 *
 * Penyebab paling sering: `details.submit_blocked` = "not_allowed", yaitu situs lowongan belum masuk daftar
 * kirim otomatis di server, atau ALLOW_REAL_SUBMIT mati. Sesi browser agen ada di server dan tidak bisa dijangkau
 * pengguna, jadi pengguna tidak bisa menekan kirim di sana. Layar memberi dua hal: buka formulir lowongan di tab
 * baru, dan salin isian serta cover letter yang disiapkan agen. Tidak ada tombol "sudah kukirim sendiri": status
 * Terkirim hanya datang dari log pengiriman agen atau email. Tombol "Coba kirim otomatis lagi" memakai endpoint
 * rerun yang sudah ada.
 *
 * Fungsi murni tanpa React dan tanpa Supabase, supaya bisa dites dengan `node --test`. Masukan dari database
 * tidak dipercaya: bentuk yang rusak diabaikan dan tidak pernah melempar galat.
 */

export type ManualSubmitKind = "not_allowed" | "required_remaining" | "page_mismatch" | "other";

export interface ManualSubmitState {
  kind: ManualSubmitKind;
  /** Penjelasan singkat dan jujur untuk pengguna. Selalu menyebut bahwa lamaran belum terkirim. */
  text: string;
  /** "Coba kirim otomatis lagi" hanya masuk akal bila situs belum diizinkan: ia bisa berubah, isian wajib tidak. */
  canRerun: boolean;
}

export const MANUAL_HEADING = "Kirim sendiri di situs lowongan";

export const MANUAL_NOT_ALLOWED_TEXT =
  "Situs lowongan ini belum didukung untuk kirim otomatis, jadi agen berhenti sebelum tombol kirim. Lamaran belum terkirim.";
export const MANUAL_REQUIRED_REMAINING_TEXT =
  "Agen berhenti karena masih ada isian wajib yang kosong. Lamaran belum terkirim. Kamu bisa melengkapinya dan mengirimnya sendiri di situs lowongan.";
export const MANUAL_PAGE_MISMATCH_TEXT =
  "Halaman lowongan berpindah ke situs lain sebelum tombol kirim, jadi agen berhenti demi keamanan. Lamaran belum terkirim.";
export const MANUAL_OTHER_TEXT = "Agen berhenti sebelum tombol kirim. Lamaran belum terkirim.";
export const MANUAL_STEPS_TEXT = "Buka formulirnya, lalu tempel isian dan cover letter dari agen bila kamu ingin mengirimnya sendiri.";

export const OPEN_FORM_LABEL = "Buka formulir lowongan";
export const NO_JOB_URL_TEXT = "Alamat lowongan tidak tersimpan. Buka lowongannya dari halaman Lowongan.";

export const COPY_PANEL_LABEL = "Salin isian agen";
export const COPY_LETTER_LABEL = "Salin cover letter";
export const COPIED_TEXT = "Tersalin";
export const COPY_UNAVAILABLE_TEXT =
  "Peramban ini tidak mengizinkan menyalin otomatis. Pilih teksnya dengan kursor, lalu salin sendiri.";
export const LETTER_LOADING_TEXT = "Memuat surat lamaran...";
export const LETTER_UNAVAILABLE_TEXT = "Cover letter yang disetujui belum bisa dimuat.";

export const RERUN_LABEL = "Coba kirim otomatis lagi";
export const RERUN_BUSY_LABEL = "Menjalankan agen...";
export const RERUN_NOTE_TEXT =
  "Agen berjalan lagi. Bila situs ini masih belum diizinkan, agen akan berhenti lagi sebelum tombol kirim.";

/** submit_blocked yang punya alur sendiri (kode keamanan, kirim sebelumnya belum terkonfirmasi, klaim) atau tidak ada isiannya. */
const OTHER_FLOW_BLOCKS: ReadonlySet<string> = new Set(["prior_unverified", "already_claimed", "claim_failed", "nothing_filled"]);

/**
 * Apakah percobaan terbaru (log "ready") berhenti sebelum kirim dan pengguna perlu jalan keluar? null bila tidak:
 * log bukan "ready", agen masih bekerja, ini sudah ditandai terkirim, atau ada alur lain yang lebih tepat
 * (pertanyaan untuk dijawab, kode keamanan, kode tidak dimasukkan, kirim sebelumnya belum terkonfirmasi, klaim).
 */
export function manualSubmitState(row: AgentApplyRow | null | undefined): ManualSubmitState | null {
  if (!row || row.manual === true) return null;
  // Log "incomplete" page_mismatch (25 November 2026, Datadog): halaman berpindah sebelum kirim. Alamat lowongan bisa
  // diperbaiki di server, jadi pengguna perlu tombol coba lagi; sebelumnya kartu hanya berkata "coba ajukan lagi".
  const pageMismatch = row.log_status === "incomplete" && row.reason === "page_mismatch";
  if (row.log_status !== "ready" && !pageMismatch) return null;
  if (isAgentApplyActive(row)) return null;
  // Tugas yang gagal atau dilewati setelah log itu punya penjelasan sendiri. Fakta tanpa status tugas (jendela detail) lolos.
  if (row.status && row.status !== "completed") return null;
  if (questionsToAnswer(row).length > 0) return null;
  if (isCodeTimeout(row)) return null;
  const blocked = row.submit_blocked ?? null;
  if (blocked !== null && OTHER_FLOW_BLOCKS.has(blocked)) return null;
  if (pageMismatch) return { kind: "page_mismatch", text: MANUAL_PAGE_MISMATCH_TEXT, canRerun: true };
  if (blocked === "not_allowed") return { kind: "not_allowed", text: MANUAL_NOT_ALLOWED_TEXT, canRerun: true };
  if (blocked === "required_remaining") return { kind: "required_remaining", text: MANUAL_REQUIRED_REMAINING_TEXT, canRerun: false };
  return { kind: "other", text: MANUAL_OTHER_TEXT, canRerun: false };
}

/** Log lama: lamaran ini ditandai terkirim oleh pengguna (log success dengan details.manual). Tombol penandanya sudah dihapus. */
export function isManualSent(row: AgentLogFacts | null | undefined): boolean {
  return !!row && row.log_status === "success" && row.manual === true;
}

/**
 * Baris status agen untuk persetujuan yang ditandai terkirim oleh pengguna. Log manual tidak punya queue_job_id,
 * jadi tidak terhubung ke tugas antrean; barisnya dibuat dari tugas terakhir (bila ada) dengan hasil log success
 * manual. Isian dan tangkapan layar dari percobaan agen sebelumnya ikut terbawa (keduanya memang dibuat agen).
 */
export function manualSentRow(previous: AgentApplyRow | undefined, loggedAt: unknown): AgentApplyRow {
  return {
    ...previous,
    status: previous?.status ?? "completed",
    log_status: "success",
    manual: true,
    submit_blocked: null,
    reason: "manual_submit",
    questions: [],
    logged_at: typeof loggedAt === "string" ? loggedAt : (previous?.logged_at ?? null),
  };
}

/** Hanya alamat http(s) yang dipakai sebagai tautan; selain itu (javascript:, data:, kosong) null. */
export function safeJobUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 2000) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

const KIND_LABEL: Record<FilledFieldKind, string> = {
  text: "Teks",
  select: "Pilihan",
  check: "Kotak centang",
  upload: "Berkas",
};

export interface CopyableField {
  key: string;
  label: string;
  /** Jenis isian dalam bahasa Indonesia. */
  kind: string;
  /** Yang tampil: nilainya, atau penjelasan jenisnya bila nilai tidak dicatat. */
  shown: string;
  /** Teks yang disalin; null bila isian tidak punya nilai yang bisa ditempel (kotak centang tanpa nilai, dan sejenisnya). */
  copy: string | null;
}

/** Isian yang diisi agen -> baris yang bisa disalin satu per satu. Berkas ditampilkan dengan nama berkasnya. */
export function copyableFields(fields: readonly AgentFilledField[] | null | undefined): CopyableField[] {
  if (!Array.isArray(fields)) return [];
  const list: readonly AgentFilledField[] = fields;
  return list.map((f, i) => {
    const value = typeof f.value === "string" ? f.value.trim() : "";
    return {
      key: `${i}-${f.label}`,
      label: f.label,
      kind: KIND_LABEL[f.kind] ?? KIND_LABEL.text,
      shown: fieldValueText(f),
      copy: value || null,
    };
  });
}

/** Cover letter yang disetujui, atau null bila kosong atau bukan teks. */
export function cleanCoverLetter(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

export type CopyResult = { ok: true } | { ok: false; error: string };

/** Subset navigator yang dipakai, supaya bisa dites tanpa peramban. */
export interface ClipboardHost {
  clipboard?: { writeText?: (text: string) => Promise<void> } | null;
}

/**
 * Salin teks ke papan klip. Gagal dengan pesan jujur bila peramban tidak punya Clipboard API (halaman non-HTTPS,
 * peramban lama) atau menolak izin; teksnya tetap bisa dipilih dan disalin pengguna sendiri.
 */
export async function copyText(text: string, host: ClipboardHost | null | undefined): Promise<CopyResult> {
  const write = host?.clipboard?.writeText;
  if (typeof write !== "function") return { ok: false, error: COPY_UNAVAILABLE_TEXT };
  try {
    await write.call(host!.clipboard, text);
    return { ok: true };
  } catch {
    return { ok: false, error: COPY_UNAVAILABLE_TEXT };
  }
}
