/**
 * Pembersih state per-pengguna di browser saat sign-out (audit 47.6 FE-28):
 * menghapus draf persetujuan, draf asesmen Karier Hijau, status simulasi langganan, dan penanda sesi
 * milik pengguna sebelumnya agar akun berikutnya di perangkat yang sama tidak mewarisi state lama.
 */

export interface BrowserKeyStorage {
  length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

const USER_SESSION_PREFIXES = [
  "applify:approval-draft:",
  "green_career_draft:",
  "applify:",
];

const USER_LOCAL_PREFIXES = [
  "applify_profile_welcome_seen",
  "applify_profile_reminder_dismissed",
  "applify_subscription",
  "applify_billing",
];

function clearMatchingKeys(storage: BrowserKeyStorage | null | undefined, prefixes: readonly string[]): void {
  if (!storage) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && prefixes.some((p) => k.startsWith(p))) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      storage.removeItem(k);
    }
  } catch {
    // Abaikan jika penyimpanan browser dibatasi (mode privat/sandbox).
  }
}

export function clearUserBrowserState(
  session: BrowserKeyStorage | null = typeof window !== "undefined" ? window.sessionStorage : null,
  local: BrowserKeyStorage | null = typeof window !== "undefined" ? window.localStorage : null,
): void {
  clearMatchingKeys(session, USER_SESSION_PREFIXES);
  clearMatchingKeys(local, USER_LOCAL_PREFIXES);
}
