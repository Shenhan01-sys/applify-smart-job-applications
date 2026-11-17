// The shared parser also runs inside the generate-application Edge Function, so it lives next to it.
export { parseQuotaStatus, DEFAULT_MONTHLY_QUOTA, type QuotaSummary } from "../../supabase/functions/_shared/quota.ts";
