import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, Sparkles } from "lucide-react";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/skill-radar")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Skill Radar — Applify" }] }),
  component: SkillPage,
});

const trending = [
  { n: "FastAPI", g: 171, c: 432, dir: "up" },
  { n: "TypeScript", g: 84, c: 1208, dir: "up" },
  { n: "Kubernetes", g: 56, c: 612, dir: "up" },
  { n: "PHP", g: -34, c: 287, dir: "down" },
  { n: "Tableau", g: 12, c: 198, dir: "stable" },
  { n: "Rust", g: 192, c: 142, dir: "up" },
];

function SkillPage() {
  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Skill Radar</h1>
        <p className="text-muted-foreground text-sm mt-1">Real-time tren skill di pasar Indonesia, dipersonalisasi untuk profil kamu.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <div className="glass rounded-2xl p-5 animate-fade-in-up">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Profil Skill Kamu</h2>
            <span className="text-[10px] uppercase tracking-wider text-teal font-mono">vs Market Avg</span>
          </div>
          <div className="mt-4 grid place-items-center">
            <RadarChart />
          </div>
          <div className="mt-4 flex items-center justify-center gap-5 text-xs">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-3 rounded bg-primary"/>Kamu</span>
            <span className="inline-flex items-center gap-2"><span className="h-2 w-3 rounded bg-[#161616]"/>Market Average</span>
          </div>
        </div>

        <div className="glass rounded-2xl p-5 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Trending Skills · Minggu Ini</h2>
          </div>
          <ul className="space-y-2">
            {trending.map((s, i) => {
              const Icon = s.dir==='up'?TrendingUp:s.dir==='down'?TrendingDown:Minus;
              const color = s.dir==='up'?'text-teal':s.dir==='down'?'text-danger':'text-muted-foreground';
              return (
                <li key={s.n} className="rounded-xl bg-black/[3%] border border-black/[6%] p-3 flex items-center gap-3 hover:border-black/[10%] transition-all" style={{ animation: `fadeInUp 0.35s ease-out ${0.15 + i * 0.05}s both` }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{s.n}</p>
                      <span className={`inline-flex items-center gap-0.5 text-xs font-mono font-bold ${color}`}><Icon className="h-3 w-3"/>{s.g>0?'+':''}{s.g}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{s.c.toLocaleString('id-ID')} lowongan menyebutkan minggu ini</p>
                  </div>
                  <button className="text-xs text-primary font-semibold inline-flex items-center gap-1 shrink-0">Pelajari <ArrowUpRight className="h-3 w-3"/></button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          { t: "FastAPI", impact: "+43% callback", bg: "bg-[#D2F801]", txt: "text-[#161616]", sub: "text-[#444444]" },
          { t: "Kubernetes", impact: "+28% match rate", bg: "bg-[#0367FC]", txt: "text-white", sub: "text-white/80" },
          { t: "System Design", impact: "+19% interview", bg: "bg-[#161616]", txt: "text-white", sub: "text-white/70" },
        ].map((c, i) => (
          <div key={c.t} className={`relative overflow-hidden rounded-2xl ${c.bg} p-5 hover:scale-[1.02] transition-transform duration-300`} style={{ animation: `fadeInUp 0.4s ease-out ${0.2 + i * 0.08}s both` }}>
            <div className="relative">
              <Sparkles className={`h-5 w-5 ${c.txt}`} />
              <p className={`mt-3 text-sm font-semibold ${c.txt}`}>Tambahkan <span className="font-bold">{c.t}</span></p>
              <p className={`text-xs mt-1 ${c.sub}`}>Estimasi {c.impact}</p>
              <button className={`mt-4 text-xs font-semibold inline-flex items-center gap-1 ${c.txt}`}>Mulai belajar <ArrowUpRight className="h-3 w-3"/></button>
            </div>
          </div>
        ))}
      </section>
    </AppShell>
  );
}

function RadarChart() {
  const axes = ["Technical", "Soft Skills", "Domain", "Tools", "Languages"];
  const you = [78, 64, 82, 70, 55];
  const market = [70, 72, 68, 65, 60];
  const cx = 160, cy = 160, R = 120;
  const pt = (v: number, i: number) => {
    const a = -Math.PI/2 + i * 2*Math.PI/axes.length;
    const r = (v/100)*R;
    return [cx + r*Math.cos(a), cy + r*Math.sin(a)];
  };
  const path = (vals: number[]) => vals.map((v,i)=>pt(v,i).join(',')).join(' ');

  return (
    <svg viewBox="0 0 320 320" className="w-full max-w-[340px]">
      {[1,0.75,0.5,0.25].map(s => (
        <polygon key={s} points={path(axes.map(()=>s*100))} fill="none" stroke="rgba(0,0,0,0.05)"/>
      ))}
      {axes.map((_, i) => {
        const [x,y] = pt(100, i);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(0,0,0,0.05)"/>;
      })}
      <polygon points={path(market)} fill="rgba(0,0,0,0.04)" stroke="rgba(0,0,0,0.15)" strokeDasharray="4 4" strokeWidth="1.5"/>
      <polygon points={path(you)} fill="#0367FC" fillOpacity="0.18" stroke="#0367FC" strokeWidth="2"/>
      {axes.map((label, i) => {
        const [x,y] = pt(118, i);
        return <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" style={{fontSize:'11px'}}>{label}</text>;
      })}
    </svg>
  );
}
