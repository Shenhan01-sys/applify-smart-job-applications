/**
 * Deteksi peramban bawaan aplikasi (WhatsApp, Instagram, Facebook, LINE, TikTok, Telegram, X, LinkedIn).
 *
 * Google menolak masuk lewat OAuth dari WebView seperti ini (galat "disallowed_useragent"), padahal tautan UAT biasanya
 * dibagikan lewat WhatsApp. Halaman masuk memakai hasil ini untuk menyarankan "Buka di Chrome/Safari" sebelum tombol
 * Google ditekan (temuan audit 25 November 2026). TypeScript murni supaya bisa diuji langsung.
 */

export type InAppBrowser = "WhatsApp" | "Instagram" | "Facebook" | "LINE" | "TikTok" | "Telegram" | "X" | "LinkedIn" | "WebView";

const RULES: ReadonlyArray<[RegExp, InAppBrowser]> = [
  [/\bWhatsApp\b/i, "WhatsApp"],
  [/\bInstagram\b/i, "Instagram"],
  [/\bFBAN\b|\bFBAV\b|\bFB_IAB\b|\bFBIOS\b/i, "Facebook"],
  [/\bLine\/\d/i, "LINE"],
  [/\bmusical_ly\b|\bBytedanceWebview\b|\bTikTok\b/i, "TikTok"],
  [/\bTelegram\b/i, "Telegram"],
  [/\bTwitter\b/i, "X"],
  [/\bLinkedInApp\b/i, "LinkedIn"],
  // WebView Android generik: penanda "; wv)" dari Chrome WebView.
  [/; wv\)/i, "WebView"],
  // WebView iOS (WKWebView) generik: iPhone/iPad + AppleWebKit tanpa penanda peramban penuh (Safari/CriOS/FxiOS/EdgiOS/OPiOS/DuckDuckGo).
  [/(?:iPhone|iPad|iPod).*AppleWebKit(?!.*Safari\/)(?!.*(?:CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo))/i, "WebView"],
];

/** Nama aplikasi bila `userAgent` milik peramban bawaan aplikasi, atau null untuk peramban biasa. */
export function detectInAppBrowser(userAgent: unknown): InAppBrowser | null {
  if (typeof userAgent !== "string" || !userAgent) return null;
  for (const [re, name] of RULES) if (re.test(userAgent)) return name;
  return null;
}

/** Teks peringatan untuk halaman masuk. */
export function inAppBrowserWarning(app: InAppBrowser): string {
  const where = app === "WebView" ? "peramban bawaan aplikasi" : `peramban bawaan ${app}`;
  return `Halaman ini terbuka di ${where}. Google biasanya menolak masuk dari sini. Ketuk menu titik tiga lalu pilih Buka di Chrome (Android) atau Buka di Safari (iPhone), atau masuk dengan email dan kata sandi.`;
}
