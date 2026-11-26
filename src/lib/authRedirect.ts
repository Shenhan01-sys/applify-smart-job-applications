const NORMALIZE_BASE = "https://applify.local";
const AUTH_ROUTE_RE = /^\/(?:login|auth)(?:[/?#]|$)/i;

/**
 * Validasi jalur pengalihan internal setelah login (`47.6 FE-18`).
 * Menerima hanya path relatif aplikasi (diawali `/` tunggal, bukan `//`, bukan `/\`, dan bukan `/login` atau `/auth`)
 * untuk mencegah open redirect dan loop pengalihan.
 *
 * Pemeriksaan awal hanya melihat teks mentah, padahal peramban membuang dot-segment: `/./\evil.com` atau `/a/..//evil.com`
 * berubah menjadi path `//evil.com`. Karena itu hasil normalisasi `URL` (juga bentuk yang sudah didekode) diperiksa lagi.
 */
export function safeRedirectPath(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return undefined;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return undefined;
  if (/[\u0000-\u001f\u007f\\]/.test(trimmed)) return undefined;
  if (AUTH_ROUTE_RE.test(trimmed)) return undefined;
  let normalized: URL;
  let decodedPath: string;
  try {
    normalized = new URL(trimmed, NORMALIZE_BASE);
    decodedPath = decodeURIComponent(normalized.pathname);
  } catch {
    return undefined;
  }
  if (normalized.origin !== NORMALIZE_BASE) return undefined;
  for (const path of [normalized.pathname, decodedPath]) {
    if (path.startsWith("//") || path.includes("\\") || AUTH_ROUTE_RE.test(path)) return undefined;
  }
  return trimmed;
}

/** Bangun query search untuk redirect ke `/login` dari lokasi rute terlindungi. */
export function loginSearchWithRedirect(location?: {
  href?: string;
  pathname?: string;
  searchStr?: string;
}): { redirect?: string } {
  const candidate =
    typeof location?.href === "string" && location.href.startsWith("/")
      ? location.href
      : `${location?.pathname ?? ""}${location?.searchStr ?? ""}`;
  const redirect = safeRedirectPath(candidate);
  return redirect ? { redirect } : {};
}
