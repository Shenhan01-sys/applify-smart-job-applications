/**
 * Mengubah isian cookie LinkedIn yang ditempel pengguna menjadi peta { nama: nilai } yang diminta backend
 * (POST /api/linkedin/import wajib punya `cookies.li_at`). Murni dan tanpa impor, supaya bisa dites.
 *
 * Format yang diterima:
 *  1. JSON dari ekstensi cookie: [{"name":"li_at","value":"..."}, ...]
 *  2. JSON peta: {"li_at":"...","JSESSIONID":"..."}
 *  3. Teks header Cookie: li_at=...; JSESSIONID=...
 *
 * Nilai cookie tidak pernah dimasukkan ke pesan galat.
 */
export type CookieParse = { ok: true; cookies: Record<string, string> } | { ok: false; message: string };

const NEED_LI_AT = "Cookie li_at tidak ditemukan. Cookie ini wajib ada. Lihat tab Panduan untuk cara mengambilnya.";

export function parseCookieInput(raw: string): CookieParse {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, message: "Tempel cookie LinkedIn dulu di kolom yang tersedia." };

  const cookies: Record<string, string> = {};
  let parsed: unknown;
  let isJson = true;
  try {
    parsed = JSON.parse(text);
  } catch {
    isJson = false;
  }

  if (isJson) {
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const c = item as { name?: unknown; value?: unknown } | null;
        if (c && typeof c.name === "string" && typeof c.value === "string" && c.name) cookies[c.name] = c.value;
      }
    } else if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string" && k) cookies[k] = v;
      }
    } else {
      return { ok: false, message: "Isian bukan daftar cookie. Pakai format JSON dari panduan atau teks name=value." };
    }
  } else if (text.includes("=")) {
    for (const part of text.split(";")) {
      const i = part.indexOf("=");
      if (i <= 0) continue;
      const name = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();
      if (name && value) cookies[name] = value;
    }
  } else {
    return { ok: false, message: "Format tidak dikenali. Tempel JSON cookie atau teks seperti li_at=...; JSESSIONID=..." };
  }

  if (!cookies["li_at"]) return { ok: false, message: NEED_LI_AT };
  return { ok: true, cookies };
}
