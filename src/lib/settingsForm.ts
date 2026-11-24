/**
 * Nilai formulir Pengaturan Agen, murni supaya bisa dites dengan `node --test`.
 *
 * Dua kesalahan lama: kolom daftar dipisah koma disusun ulang dari array setiap ketikan (spasi dan koma yang
 * baru diketik hilang), dan kolom angka yang dikosongkan terkirim sebagai 0 (Number("") === 0).
 */

/** "React, Node ,, Go" -> ["React", "Node", "Go"]. Potongan kosong dibuang, spasi pinggir dipangkas. */
export function parseCommaList(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Daftar untuk ditampilkan di kolom isian. */
export function listToText(list: readonly string[] | null | undefined): string {
  return Array.isArray(list) ? list.join(", ") : "";
}

export function sameList(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((item, i) => item === y[i]);
}

/**
 * Angka dari kolom isian. Kosong, bukan angka, nol, negatif, atau tak terhingga = null (kolom database boleh
 * null). Backend juga membuang 0 jadi null, jadi 0 tidak pernah jawaban yang dimaksud.
 */
export function parseOptionalNumber(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Angka yang tersimpan -> isi kolom. null, tidak ada, atau 0 = kolom kosong: backend memperlakukan 0 sebagai
 * "tidak diisi" (sisa dari kolom yang dulu terkirim sebagai 0), dan tidak ada angka bawaan yang tak pernah disimpan.
 */
export function numberToText(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? String(value) : "";
}
