/**
 * Validasi jalur pengalihan internal setelah login (`47.6 FE-18`).
 * Menerima hanya path relatif aplikasi (diawali `/` tunggal, bukan `//`, bukan `/\`, dan bukan `/login` atau `/auth`)
 * untuk mencegah open redirect dan loop pengalihan.
 */
export function safeRedirectPath(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return undefined;
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return undefined;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return undefined;
  if (/^\/(?:login|auth)(?:[/?#]|$)/i.test(trimmed)) return undefined;
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
