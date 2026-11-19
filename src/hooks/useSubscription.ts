import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isMockMode } from "@/lib/appConfig";
import { mockSubscription } from "@/mocks/mockData";
import { parseQuotaStatus, type QuotaSummary } from "@/lib/quotaStatus";
import { planFromRow, type PlanTier } from "@/lib/subscriptionStore";
import { describeError } from "@/lib/authErrors";

export interface AccountPlan {
  tier: PlanTier;
  /** akhir periode langganan dari `subscriptions.current_period_end`, bila ada */
  periodEnd: string | null;
  loading: boolean;
  error: string;
  reload: () => void;
  /** kuota draf AI bulan ini dari RPC get_quota_status; null = belum diketahui */
  quota: QuotaSummary | null;
}

/**
 * Paket dan kuota pengguna, hanya dari database: tabel `subscriptions` (kolom ai_model_tier, plan_name) dan RPC
 * `get_quota_status`. Tidak membaca penyimpanan browser. Gagal membaca berarti `error` terisi, bukan paket tebakan.
 */
export function useSubscription(): AccountPlan {
  const [tier, setTier] = useState<PlanTier>("free");
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        if (isMockMode()) {
          if (!alive) return;
          setTier(planFromRow(mockSubscription));
          setQuota({ quota: mockSubscription.monthly_quota, used: mockSubscription.used_quota, remaining: mockSubscription.monthly_quota - mockSubscription.used_quota, allowed: true });
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const [sub, q] = await Promise.all([
          supabase.from("subscriptions").select("plan_name, ai_model_tier, current_period_end").eq("user_id", user.id).maybeSingle(),
          supabase.rpc("get_quota_status", { p_user_id: user.id }),
        ]);
        if (sub.error) throw new Error(sub.error.message);
        if (!alive) return;
        setTier(planFromRow(sub.data));
        setPeriodEnd((sub.data as { current_period_end?: string | null } | null)?.current_period_end ?? null);
        setQuota(q.error ? null : parseQuotaStatus(q.data));
      } catch (err) {
        if (alive) setError(describeError(err, "Paket dan kuotamu belum bisa dimuat."));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { tier, periodEnd, quota, loading, error, reload };
}
