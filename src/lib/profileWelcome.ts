/**
 * Banner sambutan di halaman Profil: tampil penuh sekali, sesudah itu hanya pengingat ringkas selama profil belum lengkap.
 *
 * Status "sudah dilihat" dan "pengingat ditutup" disimpan di localStorage dengan penjaga galat (mode privat, kuota,
 * atau penyimpanan yang diblokir tidak boleh merusak halaman). TypeScript murni tanpa React, supaya bisa diuji
 * langsung oleh `node --test`.
 */

export const WELCOME_SEEN_KEY = "applify_profile_welcome_seen_v1";
export const REMINDER_DISMISSED_KEY = "applify_profile_reminder_dismissed_v1";

export const WELCOME_HEADING = "Selamat datang di Applify";
export const WELCOME_LEAD = "Agar AI bisa menulis lamaran yang pas untukmu, lengkapi profil dulu. Ini cuma sekali.";
export const WELCOME_CV_LINE = "Unggah CV PDF untuk mengisi profil otomatis. Kamu periksa hasilnya dulu sebelum masuk ke profil.";
export const WELCOME_NO_SEND_LINE = "Tidak ada lamaran yang dikirim sebelum kamu menekan Setujui di halaman Persetujuan.";
export const WELCOME_CLOSE_LABEL = "Mengerti";

export const REMINDER_HEADING = "Lanjutkan mengisi profil";
export const REMINDER_LEAD = "Profilmu belum lengkap, jadi draf lamaran AI belum bisa dibuat. Masih kurang:";
export const REMINDER_CLOSE_LABEL = "Tutup";

export interface FlagStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** localStorage bila bisa dipakai, selain itu null. Mengaksesnya saja bisa melempar galat (penyimpanan diblokir). */
export function browserStore(): FlagStore | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readFlag(store: FlagStore | null, key: string): boolean {
  if (!store) return false;
  try {
    return store.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function writeFlag(store: FlagStore | null, key: string): void {
  if (!store) return;
  try {
    store.setItem(key, "1");
  } catch {
    // Penyimpanan penuh atau diblokir: banner boleh muncul lagi, halaman tetap jalan.
  }
}

export type WelcomeMode = "full" | "reminder" | "none";

/**
 * Banner penuh hanya bila datang dari daftar atau masuk pertama (`?welcome=1`) dan belum pernah dilihat. Selain itu
 * pengingat ringkas, hanya bila profil belum lengkap dan pengingat belum ditutup.
 */
export function welcomeMode(input: { welcomeParam: boolean; seen: boolean; reminderDismissed: boolean; incomplete: boolean }): WelcomeMode {
  if (input.welcomeParam && !input.seen) return "full";
  if (input.incomplete && !input.reminderDismissed) return "reminder";
  return "none";
}
