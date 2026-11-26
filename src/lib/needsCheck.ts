import { groupByStatus, type DashStatus } from "./dashboardStats.ts";
import { isCodeTimeout } from "./securityCode.ts";

/**
 * "Perlu dicek": percobaan agen berhenti karena situs lowongan meminta kode keamanan lewat email dan kodenya
 * tidak sampai ke agen (log "ready" dengan reason code_timeout atau code_rejected; worker/src/lib/submitCheck.ts
 * verdict needs_code). Keputusan Hans, 26 November 2026: keadaan ini berarti "perlu dicek", bukan sekadar
 * "belum terkirim". Pelamar bisa membuka email, memasukkan kode di halaman situs lowongan, lalu mengirim sendiri.
 *
 * Bukan status baru. `ai_applications.status` tetap `ready` (constraint database tidak berubah). Papan Kanban
 * menaruh kartunya di kolom "Perlu tindak lanjut" lewat `groupForBoard`, tanpa mengubah status di database, karena:
 *   - `follow_up` dihitung "terkirim" oleh `isApplicationSent`, padahal lamaran ini belum tentu terkirim;
 *   - worker, ekstensi, dan backend hanya memindahkan status maju (rank), jadi pengiriman yang berhasil sesudah
 *     jalan ulang tidak akan bisa mengubah `follow_up` kembali menjadi `submitted`;
 *   - `follow_up` memicu pesan "Waktunya follow-up" di Telegram, email, dan lonceng.
 * Hitungan terkirim di Beranda dan Lamaran Saya memakai status asli dan tidak berubah.
 *
 * Fungsi murni tanpa React dan tanpa Supabase.
 */

export const NEEDS_CHECK_LABEL = "Perlu dicek";
export const NEEDS_CHECK_HEADING = "Perlu dicek: kode keamanan dari situs lowongan";
export const NEEDS_CHECK_INTRO =
  "Situs lowongan mengirim kode keamanan ke emailmu dan kodenya tidak sampai ke agen, jadi hasilnya perlu kamu periksa sendiri. Lamaran ini belum dihitung terkirim sebelum ada bukti pengiriman.";
export const NEEDS_CHECK_STEPS: readonly string[] = [
  "Buka emailmu dan cari kode keamanan dari situs lowongan.",
  "Buka formulir lowongan, masukkan kodenya di halaman situs, lalu kirim lamarannya sendiri. Bila kodenya sudah kedaluwarsa, minta kode baru lewat tombol Jalankan agen lagi di halaman Persetujuan.",
  "Simpan email konfirmasi dari perusahaan. Status Terkirim di Applify hanya diisi oleh agen atau email, jadi kartu ini tetap di Perlu tindak lanjut sampai ada bukti pengiriman.",
];
export const NEEDS_CHECK_OPEN_FORM_LABEL = "Buka formulir lowongan";
export const NEEDS_CHECK_APPROVALS_LABEL = "Buka Persetujuan";

/** Kolom papan tempat kartu "Perlu dicek" ditampilkan (status asli di database tetap `ready`). */
export const NEEDS_CHECK_BOARD_COLUMN = "follow_up";

/** Fakta log yang dipakai: bentuk minimal, supaya AgentLogFacts dan AgentApplyRow sama-sama memenuhinya. */
export interface NeedsCheckFacts {
  log_status?: string | null;
  reason?: string | null;
  /** details.manual === true: log lama yang ditandai terkirim oleh pengguna. */
  manual?: boolean | null;
}

/** Log percobaan terbaru berakhir di tunggu kode (kode tidak masuk tepat waktu, atau ditolak situs) dan bukan tanda manual. */
export function isNeedsCheckLog(facts: NeedsCheckFacts | null | undefined): boolean {
  return !!facts && facts.manual !== true && isCodeTimeout(facts);
}

/**
 * Lamaran ini "Perlu dicek": masih `ready` (belum ada bukti terkirim), percobaan agen memang untuk lamaran ini
 * (`hasAttempt`, lihat attemptForApplication), dan percobaan terbaru berakhir di tunggu kode.
 */
export function isNeedsCheckApplication(
  app: { status?: string | null } | null | undefined,
  facts: NeedsCheckFacts | null | undefined,
  hasAttempt: boolean,
): boolean {
  return !!app && app.status === "ready" && hasAttempt && isNeedsCheckLog(facts);
}

/** Kolom papan sebuah lamaran: kolom `follow_up` untuk "Perlu dicek", selain itu status aslinya. */
export function boardColumnOf(status: string | null | undefined, needsCheck: boolean): string {
  return needsCheck && status === "ready" ? NEEDS_CHECK_BOARD_COLUMN : (status ?? "");
}

/**
 * Pengelompokan untuk papan Kanban: sama dengan groupByStatus (Beranda memakainya untuk hitungan), kecuali kartu
 * "Perlu dicek" ikut ke kolom `follow_up`. Kartu tidak diubah: statusnya tetap `ready`. Urutan kartu dalam kolom
 * mengikuti urutan masukan; kartu "Perlu dicek" ditaruh di akhir kolom `follow_up`.
 */
export function groupForBoard<T extends { status?: string | null }>(
  rows: ReadonlyArray<T> | null | undefined,
  needsCheck: (row: T) => boolean,
): Record<DashStatus, T[]> {
  const all = rows ?? [];
  const groups = groupByStatus(all.filter((r) => !(r && needsCheck(r) && r.status === "ready")));
  for (const r of all) {
    if (r && r.status === "ready" && needsCheck(r)) groups[NEEDS_CHECK_BOARD_COLUMN].push(r);
  }
  return groups;
}
