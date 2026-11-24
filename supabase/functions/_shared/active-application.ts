// Satu lowongan, satu lamaran aktif per pengguna.
//
// Temuan uji E2E 24 November 2026: papan Lamaran Saya punya kartu "Lamaran ke-1 dari 2" dan "ke-2 dari 2" untuk lowongan
// yang sama. Data produksi (hanya dibaca) memastikan itu baris ai_applications kembar dengan user_id dan job_id yang sama
// (12 pasangan, semuanya berstatus draft atau ready), bukan salah kelompok di tampilan. Satu-satunya kode yang membuat
// baris ai_applications adalah Edge Function generate-application (backend dan worker hanya mengubah baris yang ada),
// jadi penjaganya di sana: bila pengguna sudah punya lamaran aktif untuk lowongan itu, fungsi mengembalikan lamaran
// tersebut, tidak memanggil model, dan tidak memakai kuota.
//
// "Aktif" = status apa pun selain `closed`. Lamaran yang ditutup pengguna membuka jalan untuk draf baru.
// Penjaga kedua ada di basis data (migrasi DRAFT_2026-11-24_ai_applications_one_active_per_job.sql): bila dua permintaan
// bersamaan lolos pemeriksaan, indeks unik menolak yang kedua dengan kode 23505 dan fungsi mengembalikan baris pemenang.
//
// TypeScript murni tanpa API Deno atau peramban, supaya jalan di bawah `node --test`.

export const CLOSED_STATUS = "closed";

/** Urutan kemajuan status; dipakai untuk memilih satu baris bila data lama sudah punya lebih dari satu yang aktif. */
const STATUS_RANK: Record<string, number> = { draft: 1, ready: 2, submitted: 3, follow_up: 4, responded: 5 };

export interface ActiveApplicationRow {
  id?: string | null;
  status?: string | null;
  created_at?: string | null;
}

/** Aktif = belum ditutup. Status kosong atau tidak dikenal dianggap aktif: lebih baik menolak kembaran daripada membuatnya. */
export function isActiveApplication(row: ActiveApplicationRow | null | undefined): boolean {
  return !!row && row.status !== CLOSED_STATUS;
}

const timeOf = (iso: string | null | undefined): number => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};

/**
 * Satu lamaran aktif dari daftar baris milik pengguna untuk satu lowongan, atau null bila tidak ada.
 * Bila data lama punya beberapa, dipilih yang paling maju statusnya, lalu yang paling baru dibuat.
 */
export function pickActiveApplication<T extends ActiveApplicationRow>(rows: ReadonlyArray<T> | null | undefined): T | null {
  const active = (rows ?? []).filter((r) => isActiveApplication(r));
  if (active.length === 0) return null;
  return [...active].sort(
    (a, b) => (STATUS_RANK[String(b.status)] ?? 0) - (STATUS_RANK[String(a.status)] ?? 0) || timeOf(b.created_at) - timeOf(a.created_at),
  )[0];
}

/** PostgREST/Postgres: pelanggaran indeks unik (dua lamaran aktif untuk pengguna dan lowongan yang sama). */
export function isUniqueViolation(err: { code?: unknown } | null | undefined): boolean {
  return !!err && err.code === "23505";
}

/** Catatan untuk layar saat lamaran yang sudah ada dikembalikan sebagai ganti draf baru. */
export const ACTIVE_APPLICATION_NOTE =
  "Lowongan ini sudah punya lamaran aktif, jadi lamaran itu yang ditampilkan dan kuota tidak terpakai. Untuk membuat draf baru, tutup dulu lamaran yang lama lewat Ubah status di Lamaran Saya.";

/** Bentuk `analysis` untuk balasan yang memakai ulang lamaran: tanpa analisis baru, label model dari baris yang ada. */
export function reusedAnalysis(app: { model_used?: unknown } | null | undefined): {
  skillGaps: string[];
  warnings: string[];
  modelUsed: string | null;
  note: string;
} {
  const model = typeof app?.model_used === "string" && app.model_used.trim() ? app.model_used : null;
  return { skillGaps: [], warnings: [], modelUsed: model, note: ACTIVE_APPLICATION_NOTE };
}
