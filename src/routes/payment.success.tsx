import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CheckCircle2, ArrowRight, Sparkles, Copy, Loader2, Crown,
  Calendar, CreditCard, Wallet, Smartphone, QrCode,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription, PLAN_PRICE, type PaymentMethod, type PlanTier } from "@/lib/subscriptionStore";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

type SuccessSearch = { txn?: string };

export const Route = createFileRoute("/payment/success")({
  validateSearch: (input: Record<string, unknown>): SuccessSearch => ({
    txn: (input.txn as string) || undefined,
  }),
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Pembayaran Berhasil — Applify" }] }),
  component: PaymentSuccessPage,
});

import { supabase } from "@/lib/supabase";
import { redirect } from "@tanstack/react-router";

const METHOD_LABEL: Record<PaymentMethod, { name: string; icon: typeof Wallet }> = {
  gopay: { name: "GoPay", icon: Smartphone },
  ovo: { name: "OVO", icon: Wallet },
  dana: { name: "DANA", icon: Wallet },
  qris: { name: "QRIS", icon: QrCode },
};

function PaymentSuccessPage() {
  const { txn } = Route.useSearch();
  const sub = useSubscription();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!sub.activatedAt) {
      const t = setTimeout(() => navigate({ to: "/subscription" }), 50);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRevealed(true), 80);
    return () => clearTimeout(t);
  }, [sub, navigate]);

  const tier = (sub.tier as PlanTier) ?? "pro";
  const price = PLAN_PRICE[tier];
  const method = sub.paymentMethod ? METHOD_LABEL[sub.paymentMethod] : null;
  const txnId = sub.transactionId ?? txn ?? "—";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(txnId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-[#F4F1E8]">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#F4F1E8]/85 border-b border-[color:var(--border)]">
        <div className="max-w-3xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary text-white font-bold">A</div>
            <span className="text-lg font-bold">Applify</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-8 py-10 md:py-16">
        {/* Hero success */}
        <div
          className={`text-center transition-all duration-500 ${
            revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
        >
          <div className="mx-auto h-20 w-20 rounded-full bg-[#1C9656] grid place-items-center text-white shadow-lg shadow-[#1C9656]/30">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <p className="mt-5 text-xs uppercase tracking-[0.22em] text-[#1C9656] font-bold">Pembayaran Berhasil</p>
          <h1 className="mt-2 font-display text-3xl md:text-4xl font-extrabold tracking-tight">
            Selamat, <span className="text-gradient-primary">{user?.email?.split("@")[0] ?? "kamu"}!</span>
          </h1>
          <p className="mt-2 text-muted-foreground max-w-md mx-auto">
            Paket <span className="font-bold capitalize text-foreground">{tier}</span> sudah aktif. Agen Applify siap
            melamar otomatis 24/7 untukmu.
          </p>
        </div>

        {/* Receipt card */}
        <div
          className={`mt-10 glass rounded-2xl p-6 md:p-8 transition-all duration-500 delay-150 ${
            revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground font-bold">Bukti Pembayaran</p>
            <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-[#1C9656]/10 border border-[#1C9656]/30 text-[10px] font-bold text-[#1C9656] uppercase">
              <Crown className="h-3 w-3" /> {tier.toUpperCase()}
            </span>
          </div>

          <div className="mt-5 grid sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <Row label="ID Transaksi">
              <button
                onClick={copy}
                className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-[#0A5BE0] transition"
              >
                {txnId}
                {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-[#1C9656]" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </Row>
            <Row label="Tanggal Aktivasi">
              {sub.activatedAt
                ? new Date(sub.activatedAt).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—"}
            </Row>
            <Row label="Metode Pembayaran">
              {method ? (
                <span className="inline-flex items-center gap-1.5">
                  <method.icon className="h-3.5 w-3.5 text-[#0A5BE0]" />
                  {method.name}
                </span>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Aktif Sampai">
              {sub.expiresAt ? (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-[#0A5BE0]" />
                  {new Date(sub.expiresAt).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Paket">{price.label} {price.period}</Row>
            <Row label="Total Dibayar">
              <span className="font-display text-base font-extrabold">
                {new Intl.NumberFormat("id-ID", {
                  style: "currency",
                  currency: "IDR",
                  maximumFractionDigits: 0,
                }).format(price.amount)}
              </span>
            </Row>
          </div>
        </div>

        {/* What's next */}
        <div
          className={`mt-6 glass rounded-2xl p-6 md:p-7 transition-all duration-500 delay-300 ${
            revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
        >
          <p className="text-xs uppercase tracking-[0.22em] text-[#0A5BE0] font-bold">Apa selanjutnya?</p>
          <ol className="mt-3 space-y-2.5 text-sm text-muted-foreground">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-[#0A5BE0] text-white text-[10px] font-bold grid place-items-center shrink-0">1</span>
              <span>Lengkapi <span className="font-semibold text-foreground">profil singkat</span> supaya agen bisa matching ke lowongan yang relevan.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-[#0A5BE0] text-white text-[10px] font-bold grid place-items-center shrink-0">2</span>
              <span>Aktifkan <span className="font-semibold text-foreground">Auto-Apply</span> di dashboard. Agen langsung melamar 24/7.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 h-5 w-5 rounded-full bg-[#0A5BE0] text-white text-[10px] font-bold grid place-items-center shrink-0">3</span>
              <span>Pantau status lamaran di tab <span className="font-semibold text-foreground">Applications</span>. Golden Window Sniper akan ping kamu.</span>
            </li>
          </ol>
        </div>

        {/* CTAs */}
        <div
          className={`mt-8 flex flex-col sm:flex-row gap-3 transition-all duration-500 delay-500 ${
            revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
        >
          <Link
            to="/dashboard"
            className="flex-1 h-12 rounded-xl gradient-primary text-white font-semibold text-sm hover:opacity-90 transition inline-flex items-center justify-center gap-2"
          >
            Mulai Lamaran <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/settings"
            className="h-12 px-5 rounded-xl border-2 border-[color:var(--border)] bg-white text-sm font-semibold hover:bg-black/[3%] transition inline-flex items-center justify-center"
          >
            Lihat Tagihan
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Bukti pembayaran ini dikirim ke <span className="font-semibold text-foreground">{user?.email ?? "demo@applify.id"}</span>.
          Hubungi support@applify.id bila ada pertanyaan.
        </p>
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 font-semibold">{children}</div>
    </div>
  );
}
