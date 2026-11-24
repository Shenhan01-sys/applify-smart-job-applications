/**
 * Teks keadaan kosong tab Menunggu di halaman Persetujuan, murni supaya bisa dites dengan `node --test`.
 *
 * Pengguna yang belum pernah punya persetujuan apa pun tidak boleh membaca "Semua sudah diperiksa": belum ada
 * yang diperiksa. Kalimat itu hanya benar bila riwayatnya berisi persetujuan.
 */

export type PendingEmptyKind = "never_had_any" | "all_checked";

export interface PendingEmptyState {
  kind: PendingEmptyKind;
  title: string;
  body: string;
}

export const NEVER_HAD_ANY_TITLE = "Belum ada lamaran yang menunggu persetujuan";
export const NEVER_HAD_ANY_BODY =
  "Jalankan pencarian lowongan dulu. Draf lamaran yang kamu ajukan dari halaman Lowongan akan muncul di sini untuk kamu setujui.";

export const ALL_CHECKED_TITLE = "Semua sudah diperiksa";
export const ALL_CHECKED_BODY =
  "Tidak ada lamaran yang menunggu persetujuanmu. Draf baru dari halaman Lowongan (tombol \"Ajukan ke Persetujuan\") muncul di sini.";

/** `historyCount`: jumlah persetujuan di riwayat (disetujui, ditolak, atau kedaluwarsa). */
export function pendingEmptyState(historyCount: number): PendingEmptyState {
  if (historyCount > 0) return { kind: "all_checked", title: ALL_CHECKED_TITLE, body: ALL_CHECKED_BODY };
  return { kind: "never_had_any", title: NEVER_HAD_ANY_TITLE, body: NEVER_HAD_ANY_BODY };
}
