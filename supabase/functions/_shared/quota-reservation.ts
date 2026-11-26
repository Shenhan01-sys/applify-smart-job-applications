/**
 * Reservasi slot kuota bulanan sebelum panggilan AI mahal di `generate-application` (47.5 U6-P2-09).
 *
 * Mencegah dua permintaan paralel untuk dua lowongan berbeda pada sisa kuota 1 sama-sama lolos
 * `get_quota_status` lalu memanggil model AI. Bekerja langsung memakai `application_logs` dan
 * meningkat otomatis ke RPC atomik `reserve_monthly_quota_slot` bila migrasi DRAFT sudah diterapkan.
 */

export const INFLIGHT_ACTION = "ai_draft_inflight";
export const INFLIGHT_TTL_MS = 120_000;

export function effectiveMonthlyRemaining(quotaRemaining: number, activeInflightCount: number): number {
  const rem = Number.isFinite(quotaRemaining) ? Math.max(0, Math.floor(quotaRemaining)) : 0;
  const inflight = Number.isFinite(activeInflightCount) ? Math.max(0, Math.floor(activeInflightCount)) : 0;
  return Math.max(0, rem - inflight);
}

export interface MonthlySlotHandle {
  allowed: boolean;
  effectiveRemaining: number;
  release: () => Promise<void>;
}

export async function acquireMonthlyInflightSlot(
  admin: any,
  args: { userId: string; jobId: string; quotaRemaining: number; now?: Date },
): Promise<MonthlySlotHandle> {
  const now = args.now ?? new Date();
  const reservationId = crypto.randomUUID();

  // Jalur 1: RPC atomik ber-advisory lock (jika migrasi DRAFT sudah dijalankan)
  if (typeof admin?.rpc === "function") {
    try {
      const { data, error } = await admin.rpc("reserve_monthly_quota_slot", {
        p_user_id: args.userId,
        p_job_id: args.jobId,
        p_reservation_id: reservationId,
        p_ttl_seconds: Math.floor(INFLIGHT_TTL_MS / 1000),
      });
      if (!error && data && typeof data === "object") {
        const allowed = Boolean((data as any).allowed);
        const eff = Number((data as any).remaining ?? 0);
        return {
          allowed,
          effectiveRemaining: Number.isFinite(eff) ? Math.max(0, eff) : 0,
          release: async () => {
            if (!allowed) return;
            try {
              await admin
                .from("application_logs")
                .update({ status: "released" })
                .eq("user_id", args.userId)
                .eq("action", INFLIGHT_ACTION)
                .eq("status", "processing")
                .contains("details", { reservation_id: reservationId });
            } catch {
              // Abaikan kegagalan pelepasan slot
            }
          },
        };
      }
    } catch {
      // Lanjut ke jalur cadangan berbasis application_logs di bawah.
    }
  }

  // Jalur 2: Cadangan aman pra-migrasi memakai baris `ai_draft_inflight` pada `application_logs`
  const cutoffIso = new Date(now.getTime() - INFLIGHT_TTL_MS).toISOString();
  const { count, error: cntErr } = await admin
    .from("application_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .eq("action", INFLIGHT_ACTION)
    .eq("status", "processing")
    .gte("created_at", cutoffIso);

  const eff = effectiveMonthlyRemaining(args.quotaRemaining, cntErr ? 0 : (count ?? 0));
  if (eff <= 0) {
    return { allowed: false, effectiveRemaining: 0, release: async () => {} };
  }

  const { data: inserted, error: insErr } = await admin
    .from("application_logs")
    .insert({
      user_id: args.userId,
      action: INFLIGHT_ACTION,
      status: "processing",
      details: { job_id: args.jobId, reservation_id: reservationId },
    })
    .select("id")
    .maybeSingle();

  const rowId = !insErr && inserted?.id ? String(inserted.id) : null;
  return {
    allowed: true,
    effectiveRemaining: Math.max(0, eff - 1),
    release: async () => {
      if (!rowId) return;
      try {
        await admin
          .from("application_logs")
          .update({ status: "released" })
          .eq("id", rowId)
          .eq("user_id", args.userId);
      } catch {
        // Abaikan kegagalan pelepasan slot
      }
    },
  };
}
