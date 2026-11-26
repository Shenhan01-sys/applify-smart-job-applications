/**
 * Penjaga rute /reset-password (47.6 FE-13):
 * Hanya mengizinkan pemulihan kata sandi bila ada penanda recovery di URL (hash `type=recovery` / `access_token`
 * atau query `code=` / `token_hash=` / `type=recovery`) atau event `PASSWORD_RECOVERY` dari Supabase Auth.
 * Sesi login biasa yang langsung membuka `/reset-password` tanpa tautan pemulihan ditolak agar tidak bisa
 * mengganti kata sandi tanpa melewati alur recovery.
 */
export function hasRecoveryUrlParams(hrefOrParts: { search?: string; hash?: string }): boolean {
  const hash = (hrefOrParts.hash ?? "").replace(/^#/, "");
  const search = (hrefOrParts.search ?? "").replace(/^\?/, "");
  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(search);
  if (hashParams.get("type") === "recovery" || searchParams.get("type") === "recovery") return true;
  if (searchParams.has("token_hash") || searchParams.has("code")) return true;
  return false;
}
