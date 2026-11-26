const POST_LOGIN_REDIRECT_KEY = "applify:post-login-redirect";

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

/** Ubah path internal yang aman menjadi objek navigasi TanStack Router. */
export function navigateArgsForRedirect(raw: unknown): { to: string; search?: Record<string, string>; hash?: string } | null {
  const safeNext = safeRedirectPath(raw);
  if (!safeNext) return null;
  const u = new URL(safeNext, "https://applify.local");
  return {
    to: u.pathname,
    ...(u.search ? { search: Object.fromEntries(u.searchParams.entries()) } : {}),
    ...(u.hash ? { hash: u.hash.slice(1) } : {}),
  };
}

/** Simpan tujuan pasca-login di sessionStorage agar jalur OAuth (/auth/callback) ikut mempertahankannya. */
export function rememberPostLoginRedirect(raw: unknown): void {
  if (typeof window === "undefined") return;
  try {
    const safe = safeRedirectPath(raw);
    if (safe) window.sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, safe);
    else window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  } catch {}
}

/** Baca sekali dan bersihkan tujuan pasca-login yang disimpan sebelum OAuth. */
export function consumePostLoginRedirect(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const val = window.sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    return safeRedirectPath(val);
  } catch {
    return undefined;
  }
}

export function clearPostLoginRedirect(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  } catch {}
}
