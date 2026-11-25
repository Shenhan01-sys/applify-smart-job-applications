import { useEffect, useState } from "react";

// Paket dan kuota pengguna dibaca dari database (tabel `subscriptions` dan RPC `get_quota_status`), lewat
// src/hooks/useSubscription.ts. File ini hanya memuat tipe, daftar harga, dan simulasi alur pembayaran.
//
// Simulasi pembayaran (activateSimulatedCheckout dan seterusnya) hanya dipakai halaman /payment dan
// /payment/success, yang tertutup kecuali VITE_ENABLE_BILLING=true. Ia menulis ke localStorage untuk
// menampilkan struk demo dan TIDAK mengubah paket pengguna di database.

export type PlanTier = "free" | "pro" | "kampus";
export type PaymentMethod = "gopay" | "ovo" | "dana" | "qris";

export interface SubscriptionState {
  tier: PlanTier;
  paymentMethod: PaymentMethod | null;
  activatedAt: string | null;
  expiresAt: string | null;
  transactionId: string | null;
}

const STORAGE_KEY = "applify_subscription_v1";
const EVENT_NAME = "applify:subscription-change";

export const PLAN_PRICE: Record<PlanTier, { amount: number; label: string; period: string }> = {
  free: { amount: 0, label: "Gratis", period: "selamanya" },
  pro: { amount: 69000, label: "Rp 69.000", period: "/bulan" },
  // Tarif Kampus tidak ada di kode maupun dokumen keuangan (Laporan-Keuangan-Applify memuat paket Silver, Gold, dan
  // Platinum per jumlah mahasiswa, bukan satu angka tetap). Karena itu tidak ada harga yang ditampilkan: paket ini
  // dibahas lewat tim Applify (UX-P7-07). amount 0 aman karena halaman pembayaran menolak paket kampus.
  kampus: { amount: 0, label: "Hubungi kami", period: "" },
};

/**
 * Paket dari satu baris `subscriptions`. Edge Function dan worker memilih model AI dari `ai_model_tier`,
 * jadi kolom itu yang menentukan; `plan_name` hanya membedakan paket Kampus. Baris kosong berarti Free.
 */
export function planFromRow(row: { ai_model_tier?: unknown; plan_name?: unknown } | null | undefined): PlanTier {
  if (!row) return "free";
  if (String(row.plan_name ?? "").toLowerCase() === "kampus") return "kampus";
  return String(row.ai_model_tier ?? "").toLowerCase() === "pro" ? "pro" : "free";
}

const DEFAULT_STATE: SubscriptionState = {
  tier: "free",
  paymentMethod: null,
  activatedAt: null,
  expiresAt: null,
  transactionId: null,
};

function readFromStorage(): SubscriptionState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<SubscriptionState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeToStorage(state: SubscriptionState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: state }));
}

/** SIMULASI demo: menyimpan struk di localStorage. Tidak mengubah paket di database. */
export function activateSimulatedCheckout(tier: PlanTier, method: PaymentMethod) {
  const now = new Date();
  const expires = new Date(now);
  if (tier === "pro") expires.setMonth(expires.getMonth() + 1);
  if (tier === "kampus") expires.setMonth(expires.getMonth() + 6);
  const next: SubscriptionState = {
    tier,
    paymentMethod: method,
    activatedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    transactionId: `TRX-${now.getTime().toString(36).toUpperCase()}`,
  };
  writeToStorage(next);
  return next;
}

/** Struk simulasi terakhir (hanya untuk halaman /payment/success). */
export function useSimulatedCheckout(): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>(() => readFromStorage());
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<SubscriptionState>).detail;
      setState(detail ?? readFromStorage());
    };
    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setState(readFromStorage());
    };
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);
  return state;
}
