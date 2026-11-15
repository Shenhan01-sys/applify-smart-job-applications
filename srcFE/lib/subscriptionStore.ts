import { useEffect, useState } from "react";

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
  kampus: { amount: 50_000_000, label: "Rp 50jt", period: "/semester" },
};

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

export function activateSubscription(tier: PlanTier, method: PaymentMethod) {
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

export function cancelSubscription() {
  writeToStorage(DEFAULT_STATE);
}

export function getSubscriptionSnapshot(): SubscriptionState {
  return readFromStorage();
}

export function useSubscription(): SubscriptionState {
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
