/**
 * Teks dan pembantu kartu "Ekstensi Browser" di Pengaturan, murni supaya bisa dites dengan `node --test`.
 */

/** Tautan menuju panduan pemasangan ekstensi di halaman Bantuan. */
export const EXTENSION_GUIDE_HREF = "/bantuan#ekstensi";
export const EXTENSION_GUIDE_LINK_LABEL = "Baca panduan pasang ekstensi";

/**
 * Paket UAT ekstensi untuk dipasang dari zip (Muat yang belum dikemas), selama Chrome Web Store belum menyetujui.
 * Berkasnya ada di `public/downloads/` dan disalin dari `extension/store/applify-extension-uat-<versi>.zip`
 * (hasil `npm run package:uat`). Ganti versi, nama berkas, dan SHA256 bersamaan saat zip diganti.
 */
export const EXTENSION_DOWNLOAD_HREF = "/downloads/applify-extension-uat.zip";
export const EXTENSION_DOWNLOAD_FILENAME = "applify-extension-uat.zip";
export const EXTENSION_DOWNLOAD_VERSION = "0.1.3";
export const EXTENSION_DOWNLOAD_SHA256 = "72de72f1e88d393d60f9f4e242c94cec465772e80d7fbf0f02de961b4158d954";
export const EXTENSION_DOWNLOAD_LABEL = "Unduh ekstensi (zip)";
/** ID tetap dari `key` di manifest paket UAT, sama di semua laptop. */
export const EXTENSION_UAT_ID = "ikojbhmbbaignmlkcdailnbnekneplkj";

/**
 * Masa berlaku token ekstensi yang diminta dari server: 8 jam (keputusan Hans 26 Nov 2026), batas maksimum
 * `MAX_EXTENSION_TTL_SEC` di backend. Angka ini harus sama dengan `DEFAULT_EXTENSION_TTL_SEC` di backend.
 */
export const EXTENSION_TOKEN_TTL_SECONDS = 8 * 60 * 60;
export const EXTENSION_TOKEN_TTL_LABEL = "8 jam";

export const EXTENSION_LAPTOP_ONLY_NOTE =
  "Ekstensi ini khusus laptop (Chrome atau Edge) dan tidak bisa dipasang di HP.";

/** Langkah singkat menghubungkan ekstensi. Panduan lengkap ada di halaman Bantuan. */
export const EXTENSION_INSTALL_STEPS: readonly string[] = [
  "Pasang ekstensi Applify khusus laptop (Chrome atau Edge). Ekstensi tidak bisa dipasang di HP.",
  "Klik Hubungkan Ekstensi Chrome/Edge di bawah, lalu salin token yang muncul.",
  "Buka panel samping ekstensi Applify dan tempel tokennya di sana.",
];

export const EXTENSION_COPY_FAILED_TEXT =
  "Token belum bisa disalin otomatis. Pilih tokennya di kotak di bawah, lalu salin sendiri (Ctrl+C, atau Cmd+C di Mac).";

export const EXTENSION_TOKEN_PASTE_WARNING =
  "Tempel token ini hanya ke panel samping Ekstensi Browser Applify khusus laptop (Chrome atau Edge), jangan pernah ke situs lain.";

export interface ClipboardLike {
  clipboard?: { writeText?: (text: string) => Promise<void> } | null;
}

/** Salin teks. false bila peramban tidak punya Clipboard API (mis. halaman non-HTTPS) atau menolak izin. */
export async function copyToClipboard(text: string, host: ClipboardLike | null | undefined): Promise<boolean> {
  const clipboard = host?.clipboard;
  if (!clipboard || typeof clipboard.writeText !== "function") return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function humanDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} menit lagi`;
  const hours = Math.round(minutes / 60);
  return `sekitar ${hours} jam lagi`;
}

/**
 * Kapan token berhenti berlaku, dalam kata biasa: "Berlaku sampai pukul 14.30 (sekitar 8 jam lagi). Sesudah itu,
 * buat token baru." Waktu tidak terbaca = teks kosong. `timeZone` hanya untuk tes.
 */
export function describeTokenExpiry(expiresAt: string | null | undefined, now: number = Date.now(), timeZone?: string): string {
  const at = typeof expiresAt === "string" ? Date.parse(expiresAt) : NaN;
  if (Number.isNaN(at)) return "";
  if (at <= now) return "Token ini sudah tidak berlaku. Buat token baru.";
  const clock = new Date(at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
  return `Berlaku sampai pukul ${clock} (${humanDuration(at - now)}). Sesudah itu, buat token baru.`;
}
