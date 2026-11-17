import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { Chrome, Bell, CreditCard, Lock, Sparkles, Calendar, Wallet, Smartphone, QrCode } from "lucide-react";
import { useSubscription, PLAN_PRICE, type PlanTier, type PaymentMethod } from "@/lib/subscriptionStore";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Settings — Applify" }] }),
  component: SettingsPage,
});

const TIER_LABEL: Record<PlanTier, string> = { free: "Free", pro: "Pro", kampus: "Kampus" };
const METHOD_ICON: Record<PaymentMethod, typeof Wallet> = {
  gopay: Smartphone,
  ovo: Wallet,
  dana: Wallet,
  qris: QrCode,
};
const METHOD_NAME: Record<PaymentMethod, string> = {
  gopay: "GoPay",
  ovo: "OVO",
  dana: "DANA",
  qris: "QRIS",
};

function SettingsPage() {
  const sub = useSubscription();
  const price = PLAN_PRICE[sub.tier as PlanTier];

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Kelola preferensi akun dan notifikasi</p>
      </header>
      <div className="space-y-4 max-w-3xl">
        {[
          { icon: Chrome, title: "Browser Extension", desc: "Install ekstensi agar agen bisa mengirim lamaran atas nama kamu di 7 platform.", color: "#0A5BE0", children: (
            <div className="flex flex-wrap gap-2 mt-4">
              <button className="h-10 px-4 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold hover:bg-[#0256d3] transition shadow-lg shadow-[#0A5BE0]/20 hover:-translate-y-0.5">Install untuk Chrome</button>
              <button className="h-10 px-4 rounded-lg border-2 border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition">Install untuk Firefox</button>
            </div>
          )},
          { icon: Bell, title: "Notifikasi", desc: "Atur kapan kamu ingin diberi tahu.", color: "#D2F801", children: (
            <div className="mt-4 space-y-3">
              {["Lamaran terkirim","Callback masuk","Golden Window (segera hadir)","Skill gap baru"].map((n,i) => (
                <div key={n} className="flex items-center justify-between text-sm py-1">
                  <span>{n}</span>
                  <button className={`h-6 w-11 rounded-full transition-colors duration-200 relative ${i<3?'bg-[#D2F801]':'bg-black/[12%]'}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${i<3?'left-[22px]':'left-0.5'}`}/>
                  </button>
                </div>
              ))}
            </div>
          )},
          {
            icon: CreditCard,
            title: "Billing",
            desc: sub.tier === "free"
              ? "Kamu saat ini di paket Free · upgrade untuk membuka semua fitur."
              : `Paket ${TIER_LABEL[sub.tier]} · ${price.label}${price.period}, perpanjang otomatis.`,
            color: "#059669",
            children: (
              <div className="mt-4 space-y-3">
                {sub.tier !== "free" && sub.paymentMethod && (() => {
                  const Icon = METHOD_ICON[sub.paymentMethod!];
                  return (
                  <div className="rounded-xl border border-[color:var(--border)] bg-white/60 p-3 text-xs text-muted-foreground space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-[#0A5BE0]" />
                      <span className="font-semibold text-foreground">{METHOD_NAME[sub.paymentMethod!]}</span>
                      {sub.transactionId && (
                        <span className="font-mono text-[10px]">· {sub.transactionId}</span>
                      )}
                    </div>
                    {sub.expiresAt && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-[#0A5BE0]" />
                        <span>
                          Aktif sampai{" "}
                          <span className="font-semibold text-foreground">
                            {new Date(sub.expiresAt).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </span>
                        </span>
                      </div>
                    )}
                  </div>
                  );
                })()}
                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/subscription"
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold hover:bg-[#0256d3] transition shadow-lg shadow-[#0A5BE0]/20"
                  >
                    <Sparkles className="h-4 w-4" />
                    {sub.tier === "free" ? "Upgrade Sekarang" : "Kelola Paket"}
                  </Link>
                  {sub.tier !== "free" && (
                    <button className="h-10 px-4 rounded-lg border-2 border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition inline-flex items-center gap-2">
                      <CreditCard className="h-4 w-4" /> Riwayat Tagihan
                    </button>
                  )}
                </div>
              </div>
            ),
          },
          { icon: Lock, title: "Privasi & Keamanan", desc: "Kontrol siapa yang melihat data kamu.", color: "#6366F1", children: (
            <button className="mt-4 h-10 px-4 rounded-lg border-2 border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition inline-flex items-center gap-2">
              <Lock className="h-4 w-4" /> Ekspor Data
            </button>
          )},
        ].map((card, i) => (
          <div key={card.title} style={{ animation: `fadeInUp 0.4s ease-out ${i * 0.08}s both` }}>
            <Card icon={card.icon} title={card.title} desc={card.desc} color={card.color}>
              {card.children}
            </Card>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function Card({ icon: Icon, title, desc, children, color = '#0A5BE0' }: any) {
  return (
    <div className="glass rounded-2xl p-5 hover:shadow-md transition-all duration-200">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg grid place-items-center text-white shrink-0" style={{ backgroundColor: color }}>
          <Icon className="h-5 w-5"/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{desc}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
