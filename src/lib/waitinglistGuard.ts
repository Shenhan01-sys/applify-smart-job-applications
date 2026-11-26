/**
 * Penjaga honeypot halaman daftar tunggu. Nama bidang memakai pengenal internal non-standar
 * agar pengisian otomatis peramban/manajer sandi tidak ikut mengisi kolom jebakan bot.
 */
export const WAITLIST_HONEYPOT_NAME = "applify_hp_confirm";

/** Mengembalikan true hanya jika kolom jebakan diisi teks non-kosong. */
export function shouldBlockHoneypot(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
