import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { Chrome, Bell, CreditCard, Lock } from "lucide-react";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Settings — Applify" }] }),
  component: () => (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Kelola preferensi akun dan notifikasi</p>
      </header>
      <div className="space-y-4 max-w-3xl">
        <Card icon={Chrome} title="Browser Extension" desc="Install ekstensi agar agen bisa mengirim lamaran atas nama kamu di 7 platform." color="#0367FC">
          <div className="flex flex-wrap gap-2 mt-4">
            <button className="h-10 px-4 rounded-lg bg-[#0367FC] text-white text-sm font-semibold hover:bg-[#0256d3] transition shadow-lg shadow-[#0367FC]/20 hover:-translate-y-0.5">Install untuk Chrome</button>
            <button className="h-10 px-4 rounded-lg border border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition">Install untuk Firefox</button>
          </div>
        </Card>
        <Card icon={Bell} title="Notifikasi" desc="Atur kapan kamu ingin diberi tahu." color="#D2F801">
          <div className="mt-4 space-y-3">
            {["Lamaran terkirim","Callback masuk","Golden Window","Skill gap baru"].map((n,i) => (
              <div key={n} className="flex items-center justify-between text-sm py-1">
                <span>{n}</span>
                <button className={`h-6 w-11 rounded-full transition-colors duration-200 relative ${i<3?'bg-[#D2F801]':'bg-black/[12%]'}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${i<3?'left-[22px]':'left-0.5'}`}/>
                </button>
              </div>
            ))}
          </div>
        </Card>
        <Card icon={CreditCard} title="Billing" desc="Plan kamu saat ini: Pro · Rp 69.000/bulan, perpanjang otomatis." color="#059669">
          <button className="mt-4 h-10 px-4 rounded-lg border border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition inline-flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Kelola Tagihan
          </button>
        </Card>
        <Card icon={Lock} title="Privasi & Keamanan" desc="Kontrol siapa yang melihat data kamu." color="#6366F1">
          <button className="mt-4 h-10 px-4 rounded-lg border border-black/[8%] bg-black/[4%] text-sm hover:bg-black/[7%] transition inline-flex items-center gap-2">
            <Lock className="h-4 w-4" /> Ekspor Data
          </button>
        </Card>
      </div>
    </AppShell>
  ),
});

function Card({ icon: Icon, title, desc, children, color = '#0367FC' }: any) {
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
