/**
 * Satu lowongan, satu lamaran aktif per pengguna (aturan yang sama dijaga Edge Function generate-application,
 * supabase/functions/_shared/active-application.ts). Aktif = status apa pun selain `closed`.
 *
 * TypeScript murni tanpa impor, supaya jalan di bawah `node --test`.
 */

/** Draf baru untuk lowongan ini hanya boleh dibuat bila lamaran terakhirnya sudah ditutup. */
export function canStartNewDraft(existingStatus: string | null | undefined): boolean {
  return existingStatus === "closed";
}

/** Toast saat server mengembalikan lamaran yang sudah ada sebagai ganti draf baru (permintaan ganda atau jendela lama). */
export const REUSED_DRAFT_NOTICE = "Lowongan ini sudah punya lamaran aktif, jadi yang itu ditampilkan dan kuota tidak terpakai.";

/** Penjelasan di jendela Lamar dengan AI saat lamaran aktif sudah ada dan tombol draf baru tidak ditawarkan. */
export const ACTIVE_APPLICATION_HINT =
  "Satu lowongan hanya punya satu lamaran aktif. Untuk membuat draf baru, ubah status lamaran ini menjadi Ditutup lewat Ubah status di Lamaran Saya.";
