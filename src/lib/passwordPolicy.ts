/**
 * Aturan kata sandi untuk pendaftaran dan penggantian sandi, selaras dengan Supabase Auth:
 * Minimum password length 8 dan Password requirements "Letters and digits" (minimal satu huruf dan satu angka).
 * Perlindungan sandi bocor (leaked password protection) tidak tersedia di paket Free, jadi tidak dicek di sini.
 *
 * Modul murni: dipakai hanya saat pengguna MEMBUAT atau MENGGANTI sandi (daftar, reset). Jangan dipakai di
 * alur masuk: pengguna lama masih punya sandi 6 karakter dan harus tetap bisa masuk. Server tetap penentu akhir.
 */

export const PASSWORD_MIN_LENGTH = 8;

/** Pesan tunggal untuk pelanggaran aturan di klien dan untuk galat `weak_password` dari Supabase. */
export const PASSWORD_POLICY_MESSAGE = "Kata sandi minimal 8 karakter dan berisi huruf serta angka.";

/** Petunjuk singkat di bawah kolom sandi saat membuat sandi baru. */
export const PASSWORD_POLICY_HINT = "Minimal 8 karakter, berisi huruf dan angka.";

// Huruf ASCII dan angka ASCII, sama seperti kumpulan karakter wajib di Supabase ("Letters and digits").
const HAS_LETTER = /[A-Za-z]/;
const HAS_DIGIT = /[0-9]/;

export function isPasswordPolicyMet(password: unknown): boolean {
  if (typeof password !== "string") return false;
  return password.length >= PASSWORD_MIN_LENGTH && HAS_LETTER.test(password) && HAS_DIGIT.test(password);
}

/** Pesan galat bila sandi melanggar aturan, atau `null` bila sudah memenuhi. */
export function passwordPolicyError(password: unknown): string | null {
  return isPasswordPolicyMet(password) ? null : PASSWORD_POLICY_MESSAGE;
}
