import { createFileRoute } from "@tanstack/react-router";
import AppShell from "@/components/app/AppShell";
import { Rocket, Target, CalendarCheck, Zap, TrendingUp, ArrowUpRight, Bell, Award } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Applify" }] }),
  component: DashboardPage,
});

const stats = [
  { label: "Lamaran Bulan Ini", value: 67, suffix: "", target: 100, icon: Rocket, tone: "primary", delta: "+12%" },
  { label: "ATS Pass Rate", value: 91, suffix: "%", icon: Target, tone: "teal", delta: "+4%" },
  { label: "Interview Callbacks", value: 14, suffix: "", icon: CalendarCheck, tone: "gold", delta: "+8" },
  { label: "Golden Window Hits", value: 23, suffix: "", icon: Zap, tone: "warm", delta: "+9" },
] as const;

const activity = [
  { c: "Gojek", r: "Senior Backend Engineer", p: "LinkedIn", time: "2 menit lalu", status: "ATS Lolos", tone: "teal", golden: true },
  { c: "Tokopedia", r: "Product Manager - Fintech", p: "Jobstreet", time: "8 menit lalu", status: "Terkirim", tone: "primary", golden: false },
  { c: "Shopee", r: "Data Analyst", p: "Glints", time: "23 menit lalu", status: "Callback", tone: "gold", golden: true },
  { c: "BCA Digital", r: "UI/UX Designer", p: "Kalibrr", time: "1 jam lalu", status: "Terkirim", tone: "primary", golden: false },
  { c: "Bukalapak", r: "Backend Engineer", p: "KitaLulus", time: "2 jam lalu", status: "Manual", tone: "warm", golden: false },
  { c: "Traveloka", r: "Mobile Engineer", p: "Dealls", time: "3 jam lalu", status: "Ditolak", tone: "danger", golden: false },
];

const platformColor: Record<string, string> = {
  LinkedIn: "bg-[#0A66C2]/15 text-[#5BA0FF] border-[#0A66C2]/30",
  Jobstreet: "bg-[#E8192C]/15 text-[#FF6B7A] border-[#E8192C]/30",
  Glints: "bg-[#0BD461]/15 text-[#3DEA8A] border-[#0BD461]/30",
  KitaLulus: "bg-[#FF6B00]/15 text-[#FFA866] border-[#FF6B00]/30",
  Kalibrr: "bg-[#2563EB]/15 text-[#7AA8FF] border-[#2563EB]/30",
  Dealls: "bg-[#6366F1]/15 text-[#9DA0FF] border-[#6366F1]/30",
  Facebook: "bg-[#1877F2]/15 text-[#6BA8FF] border-[#1877F2]/30",
};

const statusBadge: Record<string, string> = {
  Terkirim: "bg-primary/15 text-primary border-primary/30",
  "ATS Lolos": "bg-teal/15 text-teal border-teal/30",
  Callback: "bg-gold/15 text-gold border-gold/30",
  Manual: "bg-warm/15 text-warm border-warm/30",
  Ditolak: "bg-danger/15 text-danger border-danger/30",
};

function DashboardPage() {
  return (
    <AppShell rightPanel={<RightPanel />}>
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Selamat pagi, Rizky 👋</h1>
        <p className="text-muted-foreground mt-1">Agen kamu sudah mengirim <span className="text-foreground font-semibold">23 lamaran</span> hari ini.</p>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {stats.map((s, i) => <StatCard key={s.label} {...s} delay={i*60} />)}
      </div>

      {/* Activity */}
      <section className="mt-8 glass rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold">Aktivitas Terkini</h2>
            <p className="text-xs text-muted-foreground">Real-time dari agen kamu</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["Semua", "Terkirim", "Callback", "Ditolak", "Manual"].map((f, i) => (
              <button key={f} className={`text-xs px-3 py-1.5 rounded-full border ${i===0?'gradient-primary text-white border-transparent':'border-white/10 bg-white/5 text-muted-foreground hover:text-foreground'}`}>{f}</button>
            ))}
          </div>
        </div>
        <ul className="mt-5 divide-y divide-white/5">
          {activity.map((a, i) => (
            <li key={i} className="py-3 flex items-center gap-3 hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition">
              <div className="h-10 w-10 rounded-lg gradient-primary grid place-items-center text-white text-sm font-bold shrink-0">{a.c[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm truncate">{a.c}</p>
                  {a.golden && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-warm/15 text-warm border border-warm/40 animate-pulse-glow">⚡ Golden</span>}
                </div>
                <p className="text-xs text-muted-foreground truncate">{a.r}</p>
              </div>
              <div className="hidden md:flex items-center gap-2">
                <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border font-semibold ${platformColor[a.p]}`}>{a.p}</span>
              </div>
              <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border font-semibold whitespace-nowrap ${statusBadge[a.status]}`}>{a.status}</span>
              <span className="hidden md:block text-xs text-muted-foreground w-20 text-right shrink-0">{a.time}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ATS Heatmap */}
      <section className="mt-6 glass rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">ATS Intelligence</h2>
            <p className="text-xs text-muted-foreground">Berdasarkan 12.400+ data lamaran komunitas</p>
          </div>
          <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-teal/15 text-teal border border-teal/30">Live</span>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Perusahaan</th>
                <th className="py-2 pr-4">ATS System</th>
                <th className="py-2 pr-4">Match Rate</th>
                <th className="py-2">Tips</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Gojek","Workday",87,"+ Golang, gRPC"],
                ["Tokopedia","Lever",74,"+ kubernetes, GCP"],
                ["Shopee","Greenhouse",92,"+ A/B testing"],
                ["BCA Digital","SAP SuccessFactors",68,"+ regulatori OJK"],
                ["Traveloka","Workday",81,"+ system design"],
              ].map(([c,a,m,t]) => (
                <tr key={c as string} className="border-t border-white/5">
                  <td className="py-3 pr-4 font-medium">{c}</td>
                  <td className="py-3 pr-4 text-muted-foreground font-mono text-xs">{a}</td>
                  <td className="py-3 pr-4 w-[40%]">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${(m as number)>=80?'gradient-success':(m as number)>=60?'gradient-primary':'gradient-warm'}`} style={{width:`${m}%`}}/>
                      </div>
                      <span className="font-mono text-xs font-bold w-10 text-right">{m as number}%</span>
                    </div>
                  </td>
                  <td className="py-3 text-xs text-muted-foreground">{t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function StatCard({ label, value, suffix, target, icon: Icon, tone, delta, delay }: any) {
  const [n, setN] = useState(0);
  useEffect(() => { const t = setTimeout(() => setN(value), 80 + delay); return () => clearTimeout(t); }, [value, delay]);
  const color = tone==='teal'?'text-teal':tone==='gold'?'text-gold':tone==='warm'?'text-warm':'text-primary';
  return (
    <div className="glass rounded-2xl p-4 md:p-5 hover:scale-[1.02] transition group" style={{animation:`fade-up .5s both ${delay}ms`}}>
      <div className="flex items-start justify-between">
        <div className={`h-9 w-9 rounded-lg grid place-items-center bg-white/5 border border-white/10 ${color}`}><Icon className="h-4 w-4" /></div>
        <span className="text-[10px] uppercase tracking-wider text-teal font-mono flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />{delta}</span>
      </div>
      <p className="mt-4 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={`font-mono text-2xl md:text-3xl font-bold mt-1 ${color} transition-all`}>{Math.round(n)}{suffix}</p>
      {target && (
        <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full gradient-primary rounded-full transition-all duration-1000" style={{width:`${(value/target)*100}%`}}/>
        </div>
      )}
    </div>
  );
}

function RightPanel() {
  return (
    <div className="space-y-5 sticky top-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /> Notifikasi Live</h3>
          <a href="#" className="text-xs text-primary">Lihat semua</a>
        </div>
        <div className="space-y-2">
          {[
            { i: "🎯", t: "Callback dari Tokopedia", s: "5 menit lalu", tone: "gold" },
            { i: "✅", t: "Lamaran Gojek lolos ATS", s: "12 menit lalu", tone: "teal" },
            { i: "⚡", t: "Golden Window: Shopee Data", s: "18 menit lalu", tone: "warm" },
          ].map((n, i) => (
            <div key={i} className="glass rounded-xl p-3 flex items-start gap-3">
              <span className="text-lg">{n.i}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{n.t}</p>
                <p className="text-[11px] text-muted-foreground">{n.s}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-lg gradient-warm grid place-items-center"><Award className="h-4 w-4 text-white" /></div>
          <p className="text-xs uppercase tracking-wider text-warm font-semibold">Skill Gap Alert</p>
        </div>
        <p className="text-sm font-semibold leading-snug"><span className="font-mono text-warm">FastAPI</span> trending <span className="text-teal">+171%</span> minggu ini di posisi Backend.</p>
        <a href="#" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">Pelajari di Dicoding <ArrowUpRight className="h-3 w-3"/></a>
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Kuota Bulan Ini</span>
          <span className="font-mono"><span className="text-foreground font-bold">67</span> / 100</span>
        </div>
        <div className="mt-2 h-2 bg-white/5 rounded-full overflow-hidden">
          <div className="h-full gradient-primary rounded-full" style={{width:'67%'}}/>
        </div>
        <button className="mt-3 w-full h-9 rounded-lg gradient-primary text-white text-xs font-semibold glow-primary">Upgrade ke Annual</button>
      </div>
    </div>
  );
}
