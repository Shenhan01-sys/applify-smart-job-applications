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
 * Membaca nominal gaji Indonesia. Titik/koma berkelompok tiga digit dianggap pemisah ribuan; koma atau titik
 * desimal diperbolehkan sebelum satuan (mis. "6,5 jt"). Tanpa satuan, "6.500" berarti enam ribu lima ratus.
 */
export function parseIndonesianSalary(raw: string): number | null {
  let text = raw.trim().toLowerCase().replace(/\u00a0/g, " ")
    .replace(/^(?:rp\.?|idr)\s*/i, "")
    .replace(/\s*(?:\/|per\s*)(?:bulan|bln|bulanan)$|\s*sebulan$/i, "")
    .replace(/,-$/, "")
    .trim();
  if (!text) return null;
  text = text.replace(/\s+/g, " ");

  const withUnit = text.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(jt|juta(?:an)?|juta|rb|ribu|m|miliar|milyar)$/i);
  if (withUnit) {
    const amount = Number(withUnit[1].replace(",", "."));
    const unit = withUnit[2].toLowerCase();
    const multiplier = ["jt", "juta", "jutaan", "m"].includes(unit)
      ? 1_000_000
      : ["miliar", "milyar"].includes(unit) ? 1_000_000_000 : 1_000;
    const result = amount * multiplier;
    return Number.isFinite(result) && result > 0 ? Math.round(result) : null;
  }

  // Hapus pemisah ribuan bergaya Indonesia (1.234.567) atau gaya Inggris (1,234,567).
  if (/^\d{1,3}(?:\.\d{3})+$/.test(text) || /^\d{1,3}(?:,\d{3})+$/.test(text)) {
    text = text.replace(/[.,]/g, "");
  } else if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(text)) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(text)) {
    text = text.replace(/,/g, "");
  } else if (/^\d+[,.]\d+$/.test(text)) {
    // Desimal tanpa satuan ("6,5") ambigu: enam setengah juta atau Rp 6,5? Minta satuan, jangan menebak.
    return null;
  }

  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const result = Number(text);
  return Number.isFinite(result) && result > 0 ? Math.round(result) : null;
}

/**
 * Angka yang tersimpan -> isi kolom. null, tidak ada, atau 0 = kolom kosong: backend memperlakukan 0 sebagai
 * "tidak diisi" (sisa dari kolom yang dulu terkirim sebagai 0), dan tidak ada angka bawaan yang tak pernah disimpan.
 */
export function numberToText(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? String(value) : "";
}
