import { parseQuotaStatus, type QuotaSummary } from "../../supabase/functions/_shared/quota.ts";

// The shared parser also runs inside the generate-application Edge Function, so it lives next to it.
export {
  parseQuotaStatus,
  DEFAULT_MONTHLY_QUOTA,
  FREE_MONTHLY_QUOTA,
  PRO_MONTHLY_QUOTA,
  monthlyQuotaForTier,
  type QuotaSummary,
} from "../../supabase/functions/_shared/quota.ts";

const whole = (v: unknown): number | undefined => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
};

/**
 * The `quota` field of a generate-application response. The function sends it already parsed
 * ({ quota, used, remaining, allowed }), which parseQuotaStatus would misread: it looks for `limit_qty` and falls
 * back to the default of 10, wrong for a plan with another limit. A raw RPC row still goes through parseQuotaStatus.
 * Returns null when there is nothing usable, so the screen shows "unknown" instead of an invented 10 / 10.
 */
export function quotaFromEdgeResponse(raw: unknown): QuotaSummary | null {
  const row: any = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== "object") return null;
  if ("limit_qty" in row || "limit" in row) return parseQuotaStatus(row);
  const quota = whole(row.quota);
  const remaining = whole(row.remaining);
  if (quota === undefined || remaining === undefined) return null;
  return {
    quota,
    used: whole(row.used) ?? Math.max(0, quota - remaining),
    remaining,
    allowed: typeof row.allowed === "boolean" ? row.allowed : remaining > 0,
  };
}
