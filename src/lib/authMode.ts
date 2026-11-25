/**
 * Mode halaman masuk terakhir ("masuk" atau "daftar") saat tombol Google atau LinkedIn ditekan.
 * Disimpan di sessionStorage tab ini, supaya halaman galat /auth/callback bisa mengembalikan pengguna
 * ke formulir yang sama. Tanpa impor React, supaya bisa dites dengan `node --test`.
 */

export type AuthMode = "masuk" | "daftar";

const AUTH_MODE_KEY = "applify_auth_mode";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Catat mode yang dipakai sebelum browser pindah ke penyedia. Penyimpanan tertutup tidak menghentikan masuk. */
export function rememberAuthMode(mode: AuthMode, storage?: StorageLike | null): void {
  try {
    (storage ?? defaultStorage())?.setItem(AUTH_MODE_KEY, mode);
  } catch {
    /* penyimpanan tertutup (mode privat): tombol kembali nanti memakai /login biasa */
  }
}

export function recallAuthMode(storage?: StorageLike | null): AuthMode | null {
  try {
    const value = (storage ?? defaultStorage())?.getItem(AUTH_MODE_KEY);
    return value === "masuk" || value === "daftar" ? value : null;
  } catch {
    return null;
  }
}

/** Hapus penanda setelah masuk berhasil, supaya kunjungan berikutnya tidak membawa mode lama. */
export function clearAuthMode(storage?: StorageLike | null): void {
  try {
    (storage ?? defaultStorage())?.removeItem(AUTH_MODE_KEY);
  } catch {
    /* abaikan: tidak ada yang perlu dipulihkan */
  }
}

/** Parameter pencarian untuk tombol kembali: asal daftar membawa ?mode=daftar, selain itu tanpa parameter. */
export function backSearchFor(mode: AuthMode | null): { mode?: "daftar" } {
  return mode === "daftar" ? { mode: "daftar" } : {};
}
