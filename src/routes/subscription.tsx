import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { isBillingEnabled } from "@/lib/appConfig";
import { Check, Sparkles, ArrowRight, ArrowLeft, Building2, GraduationCap, Zap, Loader2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { FREE_FEATURES, PRO_FEATURES } from "@/lib/planInfo";
import { PLAN_PRICE, type PlanTier } from "@/lib/subscriptionStore";
import { useSubscription } from "@/hooks/useSubscription";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/subscription")({
  beforeLoad: async () => {
    // Langganan dan pembayaran disembunyikan dari uji coba kecuali VITE_ENABLE_BILLING=true.
    if (!isBillingEnabled()) throw redirect({ to: "/dashboard" });
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Pilih Paket — Applify" }] }),
  component: SubscriptionPage,
});

import { supabase } from "@/lib/supabase";

const TIERS: Array<{
  id: PlanTier;
  name: string;
  blurb: string;
  icon: typeof Zap;
  popular?: boolean;
  features: string[];
  highlight?: string;
}> = [
  {
    id: "free",
    name: "Free",
    blurb: "Mulai rasakan agen AI tanpa biaya.",
    icon: Zap,
    features: FREE_FEATURES,
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "Untuk pencari kerja serius yang ingin hasil.",
    icon: Sparkles,
    popular: true,
    highlight: "Paling Populer",
    features: PRO_FEATURES,
  },
  {
    id: "kampus",
    name: "Kampus",
    blurb: "Lisensi B2B2C untuk kemitraan kampus.",
    icon: GraduationCap,
    features: [
      "Lisensi B2B2C kampus",
      "Dashboard karier kampus",
      "Semua fitur Pro untuk mahasiswa",
      "Laporan penempatan kerja",
      "Onboarding & pelatihan",
      "Co-branding kampus",
    ],
  },
];

function SubscriptionPage() {
  const { user } = useAuth();
  const current = useSubscription();
  const navigate = useNavigate();
  const [busyTier, setBusyTier] = useState<PlanTier | null>(null);
  const [kampusOpen, setKampusOpen] = useState(false);

  const onSelect = async (tier: PlanTier) => {
    if (tier === current.tier) return;
    if (tier === "kampus") {
      setKampusOpen(true);
      return;
    }
    setBusyTier(tier);
    if (tier === "free") {
      navigate({ to: "/dashboard" });
      return;
    }
    navigate({
      to: "/payment",
      search: { plan: tier, from: "/subscription" as const },
    } as any);
  };

  return (
    <div className="min-h-screen bg-[#F4F1E8]">
      {/* Top bar */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#F4F1E8]/85 border-b border-[color:var(--border)]">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary text-white font-bold">A</div>
            <span className="text-lg font-bold">Applify</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-muted-foreground">
              Login sebagai <span className="font-semibold text-foreground">{user?.email ?? "demo@applify.id"}</span>
            </span>
            <Link
              to={current.tier === "free" ? "/dashboard" : "/settings"}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border-2 border-[color:var(--border)] bg-white text-sm font-semibold hover:bg-black/[3%] transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Kembali
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 pt-12 md:pt-16 pb-8 text-center">
        <p className="text-xs uppercase tracking-[0.22em] text-[#0A5BE0] font-bold">Harga</p>
        <h1 className="mt-3 font-display text-3xl md:text-5xl font-extrabold tracking-tight">
          Mulai gratis, <span className="text-gradient-primary">upgrade saat siap.</span>
        </h1>
        <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
          Pilih paket yang paling cocok. Pembayaran via GoPay, OVO, DANA, dan QRIS — tanpa kartu kredit.
        </p>

        {current.tier !== "free" && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border-2 border-[#1C9656]/30 bg-[#1C9656]/5 px-4 py-1.5 text-sm">
            <Sparkles className="h-3.5 w-3.5 text-[#1C9656]" />
            <span>
              Paket aktif: <span className="font-bold capitalize">{current.tier}</span>
              {current.periodEnd && (
                <span className="text-muted-foreground">
                  {" · aktif sampai "}
                  {new Date(current.periodEnd).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
            </span>
          </div>
        )}
      </section>

      {/* Pricing cards */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 pb-16">
        <div className="grid gap-6 md:grid-cols-3 md:items-stretch">
          {TIERS.map((t) => {
            const price = PLAN_PRICE[t.id];
            const isCurrent = current.tier === t.id;
            return (
              <div
                key={t.id}
                className={`relative glass rounded-3xl p-7 flex flex-col ${
                  t.popular ? "md:scale-[1.04] ring-2 ring-[#0A5BE0]" : ""
                } ${isCurrent ? "ring-2 ring-[#1C9656]" : ""}`}
              >
                {t.popular && !isCurrent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0A5BE0] text-white text-xs font-bold px-3 py-1 rounded-full">
                    {t.highlight}
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#1C9656] text-white text-xs font-bold px-3 py-1 rounded-full">
                    PAKET AKTIF
                  </span>
                )}

                <div className="flex items-center gap-2">
                  <div className={`h-9 w-9 rounded-lg grid place-items-center ${t.popular ? "bg-[#0A5BE0] text-white" : "bg-black/[5%] text-foreground"}`}>
                    <t.icon className="h-4 w-4" />
                  </div>
                  <h3 className="font-display text-lg font-bold">{t.name}</h3>
                </div>

                <p className="mt-3 text-sm text-muted-foreground">{t.blurb}</p>

                <div className="mt-5 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-extrabold">{price.label}</span>
                  <span className="text-sm text-muted-foreground">{price.period}</span>
                </div>

                <ul className="mt-6 space-y-3 flex-1">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-[#1C9656] mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => onSelect(t.id)}
                  disabled={busyTier === t.id}
                  className={`mt-7 inline-flex justify-center items-center h-11 rounded-xl text-sm font-semibold transition disabled:opacity-60 ${
                    isCurrent
                      ? "border-2 border-[color:var(--border)] bg-white hover:bg-black/[3%]"
                      : t.popular
                      ? "bg-[#16150F] text-[#F4F1E8] hover:bg-black"
                      : "border-2 border-[color:var(--border)] bg-white hover:bg-black/[3%]"
                  }`}
                >
                  {busyTier === t.id ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Memuat…
                    </>
                  ) : isCurrent ? (
                    "Paket Saat Ini"
                  ) : t.id === "free" ? (
                    "Aktifkan Gratis"
                  ) : t.id === "kampus" ? (
                    <>
                      <Building2 className="h-3.5 w-3.5 mr-1.5" />
                      Hubungi Kami
                    </>
                  ) : (
                    <>
                      Pilih Paket <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground max-w-2xl mx-auto">
          Harga final transparan sesuai paket yang dipilih.
          {" "}Pembayaran diproses secara aman via <span className="font-semibold">Midtrans Snap</span> (rencana integrasi).
        </p>
      </section>

      {/* Trust strip */}
      <section className="max-w-6xl mx-auto px-4 md:px-8 pb-20">
        <div className="glass rounded-2xl p-5 md:p-6 flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-[0.22em] text-[#1C9656] font-bold">Pembayaran Lokal</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Dukung e-wallet favorit kamu: GoPay, OVO, DANA, dan QRIS. Tanpa kartu kredit, tanpa drama.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {["GoPay", "OVO", "DANA", "QRIS"].map((m) => (
              <span key={m} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white border border-[color:var(--border)] text-xs font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-[#1C9656]" />
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      <Dialog open={kampusOpen} onOpenChange={setKampusOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-[#0A5BE0]" aria-hidden="true" />
              Kemitraan Paket Kampus (B2B2C)
            </DialogTitle>
            <DialogDescription>
              Lisensi kampus tidak dibeli lewat e-wallet satuan. Daftarkan minat kampusmu atau hubungi tim Applify untuk onboarding, co-branding, dan pelaporan penempatan kerja mahasiswa.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setKampusOpen(false)}
              className="min-h-11 rounded-xl border-2 border-[#999999] px-4 text-sm font-semibold hover:bg-black/[4%] transition"
            >
              Tutup
            </button>
            <Link
              to="/waitinglist"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#16150F] px-5 text-sm font-semibold text-[#F4F1E8] hover:bg-black transition"
            >
              Ajukan Kemitraan
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
