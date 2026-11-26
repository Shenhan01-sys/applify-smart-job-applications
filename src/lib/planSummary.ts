/**
 * Ringkasan paket untuk Pengaturan saat pembayaran dimatikan (VITE_ENABLE_BILLING bukan "true").
 *
 * Kartu "Paket & Tagihan" memang disembunyikan selama uji coba karena tombolnya mengarah ke pembayaran. Tanpa
 * kartu apa pun, responden tidak tahu paket dan batas draf miliknya (uji E2E production 26 November 2026: tidak ada
 * kartu paket di Pengaturan). Ringkasan ini hanya membaca: paket, jumlah draf AI per bulan, dan catatan bahwa
 * pembayaran belum dibuka. Tidak ada tombol bayar atau upgrade.
 *
 * Murni (tanpa React atau Supabase) supaya bisa dites dengan `node --test`.
 */

import { monthlyQuotaForTier } from "./quotaStatus.ts";

export type PlanSummaryTier = "free" | "pro" | "kampus";

const TIER_LABEL: Record<PlanSummaryTier, string> = { free: "Gratis", pro: "Pro", kampus: "Kampus" };

export interface PlanSummary {
  /** Contoh: "Paket Gratis". */
  heading: string;
  /** Contoh: "10 draf AI per bulan". Kosong bila jumlahnya belum diketahui. */
  allowance: string;
  /** Satu kalimat lengkap untuk layar: "Paket Gratis, 10 draf AI per bulan." */
  sentence: string;
  note: string;
}

export const PLAN_READONLY_NOTE =
  "Pembayaran belum dibuka selama masa uji coba, jadi tidak ada tagihan atau tombol upgrade. Sisa kuota bulan ini ada di kartu Kuota Draf AI.";

/**
 * @param quotaPerMonth batas draf bulanan dari database (`get_quota_status`), bila sudah terbaca. Angka dari database
 *   dipakai apa adanya, karena `subscriptions.monthly_quota` bisa diatur per akun (mis. akun peneliti).
 *   Tanpa angka itu, paket Free dan Pro memakai angka bawaannya; paket lain tidak menyebut angka.
 */
export function describePlanSummary(tier: PlanSummaryTier, quotaPerMonth: number | null | undefined): PlanSummary {
  const label = TIER_LABEL[tier] ?? TIER_LABEL.free;
  const known = typeof quotaPerMonth === "number" && Number.isFinite(quotaPerMonth) && quotaPerMonth >= 0 ? Math.floor(quotaPerMonth) : null;
  const count = known ?? (tier === "free" || tier === "pro" ? monthlyQuotaForTier(tier) : null);
  const allowance = count === null ? "" : `${count} draf AI per bulan`;
  const heading = `Paket ${label}`;
  return {
    heading,
    allowance,
    sentence: allowance ? `${heading}, ${allowance}.` : `${heading}.`,
    note: PLAN_READONLY_NOTE,
  };
}
