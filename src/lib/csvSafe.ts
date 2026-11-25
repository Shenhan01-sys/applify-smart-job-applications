/**
 * Sel CSV yang aman dibuka di Excel atau Sheets. Nilai dari pengisi form publik (misalnya daftar tunggu) tidak
 * boleh dibaca sebagai rumus: sel yang diawali = + - @ tab atau CR diberi apostrof di depan (anjuran OWASP).
 * Setelah itu sel diapit tanda kutip bila memuat koma, tanda kutip, atau pemisah baris.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (FORMULA_TRIGGER.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
