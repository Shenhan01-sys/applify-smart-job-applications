/**
 * Baris kemajuan pada panel Pencarian Lowongan (AIJobScanner), dibuat murni supaya bisa dites dengan `node --test`.
 *
 * Selama pencarian berjalan, baris kemajuan ("Menghubungi 9 situs lowongan...", "Mencari lowongan...") bertambah.
 * Begitu pencarian berakhir (selesai, dibatalkan, tanpa hasil, atau gagal), baris kemajuan itu sudah usang dan tidak
 * boleh tampil bersama kalimat hasil (uji E2E production 26 November 2026: "Menghubungi 9 situs lowongan..." masih
 * terlihat di bawah "Selesai. 28 lowongan ditemukan"). Yang tersisa hanya kalimat hasil dan galat per situs.
 */

export type ScanStageType = "info" | "success" | "analysis" | "error";

export interface ScanStage {
  message: string;
  type: ScanStageType;
}

/** Paling banyak baris kemajuan yang diingat selama pencarian berjalan. */
export const MAX_SCAN_PROGRESS_LINES = 5;

/** Tambah satu baris kemajuan. Galat disimpan terpisah dan selalu tampil di bawah baris kemajuan. */
export function appendScanStage(prev: readonly ScanStage[], message: string, type: ScanStageType = "info"): ScanStage[] {
  const errs = prev.filter((s) => s.type === "error");
  const others = prev.filter((s) => s.type !== "error");
  const nextOthers = type === "error" ? others : [...others, { message, type }].slice(-MAX_SCAN_PROGRESS_LINES);
  const nextErrs = type === "error" ? [...errs, { message, type }] : errs;
  return [...nextOthers, ...nextErrs];
}

/**
 * Akhiri pencarian dengan satu kalimat hasil. Baris kemajuan dibuang. Hasil sukses tampil di atas galat per situs yang
 * sudah ada, sedangkan hasil galat (gagal, tanpa hasil) ditambahkan ke daftar galat.
 */
export function settleScanStages(prev: readonly ScanStage[], message: string, type: ScanStageType): ScanStage[] {
  const errs = prev.filter((s) => s.type === "error");
  if (type === "error") return [...errs, { message, type }];
  return [{ message, type }, ...errs];
}
