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
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Settings</h1>
      <div className="space-y-4 max-w-3xl">
        <Card icon={Chrome} title="Browser Extension" desc="Install ekstensi agar agen bisa mengirim lamaran atas nama kamu di 7 platform.">
          <div className="flex flex-wrap gap-2 mt-4">
            <button className="h-10 px-4 rounded-lg gradient-primary text-white text-sm font-semibold glow-primary">Install untuk Chrome</button>
            <button className="h-10 px-4 rounded-lg border border-black/[8%] bg-black/[4%] text-sm">Install untuk Firefox</button>
          </div>
        </Card>
        <Card icon={Bell} title="Notifikasi" desc="Atur kapan kamu ingin diberi tahu.">
          <div className="mt-4 space-y-3">
            {["Lamaran terkirim","Callback masuk","Golden Window","Skill gap baru"].map((n,i) => (
              <div key={n} className="flex items-center justify-between text-sm">
                <span>{n}</span>
                <div className={`h-6 w-11 rounded-full relative ${i<3?'gradient-success':'bg-black/[6%]'}`}>
                  <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white ${i<3?'left-[22px]':'left-0.5'}`}/>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card icon={CreditCard} title="Billing" desc="Plan kamu saat ini: Pro · Rp 69.000/bulan, perpanjang otomatis.">
          <button className="mt-4 h-10 px-4 rounded-lg border border-black/[8%] bg-black/[4%] text-sm">Kelola Tagihan</button>
        </Card>
        <Card icon={Lock} title="Privasi & Keamanan" desc="Kontrol siapa yang melihat data kamu.">
          <button className="mt-4 h-10 px-4 rounded-lg border border-black/[8%] bg-black/[4%] text-sm">Ekspor Data</button>
        </Card>
      </div>
    </AppShell>
  ),
});

function Card({ icon: Icon, title, desc, children }: any) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#0367FC] text-white border-[#0367FC] grid place-items-center"><Icon className="h-5 w-5"/></div>
        <div className="flex-1">
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{desc}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
