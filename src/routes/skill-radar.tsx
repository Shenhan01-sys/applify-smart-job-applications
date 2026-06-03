import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { TrendingUp, TrendingDown, Minus, ArrowUpRight, Sparkles, AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

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

// Illustrative fallback when user has no skills yet
const DEFAULT_AXES = ["Technical", "Soft Skills", "Domain", "Tools", "Bahasa"];
const DEFAULT_YOU = [78, 64, 82, 70, 55];
const MARKET_BASE = [72, 70, 68, 66, 74, 69];

interface RadarModel { axes: string[]; you: number[]; market: number[]; real: boolean; }

function buildRadar(skills: any[]): RadarModel {
  if (!skills.length) {
    return { axes: DEFAULT_AXES, you: DEFAULT_YOU, market: DEFAULT_AXES.map((_, i) => MARKET_BASE[i] ?? 70), real: false };
  }
  const byCat: Record<string, number[]> = {};
  skills.forEach((s) => {
    const cat = (s.category || "Lainnya").toString();
    (byCat[cat] ??= []).push(Number(s.proficiency_level) || 0);
  });
  const maxP = Math.max(...skills.map((s) => Number(s.proficiency_level) || 0), 0);
  const norm = (v: number) => (maxP <= 5 ? v * 20 : v); // detect 1–5 vs 0–100 scale
  let cats = Object.keys(byCat).sort((a, b) => byCat[b].length - byCat[a].length).slice(0, 6);
  if (cats.length < 3) return { axes: DEFAULT_AXES, you: DEFAULT_YOU, market: DEFAULT_AXES.map((_, i) => MARKET_BASE[i] ?? 70), real: false };
  const you = cats.map((c) => Math.round(Math.min(100, norm(byCat[c].reduce((a, b) => a + b, 0) / byCat[c].length))));
  const market = cats.map((_, i) => MARKET_BASE[i] ?? 70);
  return { axes: cats, you, market, real: true };
}

function SkillPage() {
  const { user } = useAuth();
  const [skills, setSkills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user?.id) return;
      if (isMockMode()) { setSkills([]); setLoading(false); return; }
      const { data } = await supabase.from("user_skills").select("name, category, proficiency_level").eq("user_id", user.id);
      setSkills(data || []);
      setLoading(false);
    }
    load();
  }, [user]);

  const radar = buildRadar(skills);
  const gaps = radar.axes
    .map((a, i) => ({ axis: a, you: radar.you[i], market: radar.market[i], gap: radar.market[i] - radar.you[i] }))
    .filter((g) => g.gap > 4)
    .sort((a, b) => b.gap - a.gap);

  if (loading) {
    return <AppShell><div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0]" /></div></AppShell>;
  }

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight">Skill Radar</h1>
        <p className="text-muted-foreground text-sm mt-1">Pemetaan skill-mu vs permintaan pasar — dipersonalisasi.</p>
      </header>

      {!radar.real && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-dashed border-[#D9741A]/40 bg-[#D9741A]/[6%] p-4">
          <AlertTriangle className="h-5 w-5 text-[#D9741A] shrink-0" />
          <p className="text-sm text-foreground/80">Radar di bawah masih ilustratif. <Link to="/profile" className="text-[#0A5BE0] font-semibold">Lengkapi skill di Profil</Link> agar radar memetakan kemampuan aslimu.</p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.05fr]">
        {/* Radar diorama */}
        <div className="relative glass rounded-3xl p-5 overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-40" aria-hidden="true" />
          <div className="relative flex items-center justify-between">
            <h2 className="font-display font-bold">Profil Skill Kamu</h2>
            <span className="text-[10px] uppercase tracking-wider text-[#1C9656] font-mono">vs Market</span>
          </div>
          <div className="relative mt-2 grid place-items-center">
            <RadarChart axes={radar.axes} you={radar.you} market={radar.market} />
          </div>
          <div className="relative mt-2 flex items-center justify-center gap-5 text-xs">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-3 rounded bg-[#0A5BE0]" />Kamu</span>
            <span className="inline-flex items-center gap-2"><span className="h-2 w-3 rounded bg-[#16150F]" />Market</span>
          </div>
        </div>

        {/* Gap + trending */}
        <div className="space-y-5">
          <div className="glass rounded-3xl p-5 animate-fade-in-up">
            <h2 className="font-display font-bold">Gap Analysis</h2>
            <p className="text-xs text-muted-foreground">Area di bawah rata-rata pasar</p>
            {gaps.length > 0 ? (
              <ul className="mt-4 space-y-2.5">
                {gaps.map((g) => (
                  <li key={g.axis} className="rounded-2xl border border-[color:var(--border)] bg-[#FBF9F2] p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{g.axis}</span>
                      <span className="font-mono text-xs font-bold text-[#D9741A]">−{g.gap} poin</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-black/[6%] overflow-hidden relative">
                      <div className="absolute inset-y-0 left-0 bg-[#16150F]/30 rounded-full" style={{ width: `${g.market}%` }} />
                      <div className="absolute inset-y-0 left-0 bg-[#0A5BE0] rounded-full" style={{ width: `${g.you}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-[#1C9656] font-medium">🎉 Skill-mu sudah di atas rata-rata pasar di semua sumbu!</p>
            )}
          </div>

          <div className="glass rounded-3xl p-5 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
            <h2 className="font-display font-bold mb-3">Trending Skills · Minggu Ini</h2>
            <ul className="space-y-2">
              {trending.map((s, i) => {
                const Icon = s.dir === "up" ? TrendingUp : s.dir === "down" ? TrendingDown : Minus;
                const color = s.dir === "up" ? "text-[#1C9656]" : s.dir === "down" ? "text-[#C0341A]" : "text-muted-foreground";
                return (
                  <li key={s.n} className="rounded-xl border border-[color:var(--border)] bg-[#FBF9F2] p-3 flex items-center gap-3" style={{ animation: `fadeInUp 0.35s ease-out ${0.15 + i * 0.05}s both` }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{s.n}</p>
                        <span className={`inline-flex items-center gap-0.5 text-xs font-mono font-bold ${color}`}><Icon className="h-3 w-3" />{s.g > 0 ? "+" : ""}{s.g}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{s.c.toLocaleString("id-ID")} lowongan menyebut minggu ini</p>
                    </div>
                    <button className="text-xs text-[#0A5BE0] font-semibold inline-flex items-center gap-1 shrink-0">Pelajari <ArrowUpRight className="h-3 w-3" /></button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          { t: "FastAPI", impact: "+43% callback", bg: "bg-[#D2F801]", txt: "text-[#16150F]", sub: "text-[#16150F]/70" },
          { t: "Kubernetes", impact: "+28% match rate", bg: "bg-[#0A5BE0]", txt: "text-white", sub: "text-white/80" },
          { t: "System Design", impact: "+19% interview", bg: "bg-[#16150F]", txt: "text-white", sub: "text-white/70" },
        ].map((c, i) => (
          <div key={c.t} className={`relative overflow-hidden rounded-3xl ${c.bg} p-5 hover:-translate-y-1 transition-transform duration-300`} style={{ animation: `fadeInUp 0.4s ease-out ${0.2 + i * 0.08}s both` }}>
            <Sparkles className={`h-5 w-5 ${c.txt}`} />
            <p className={`mt-3 text-sm font-semibold ${c.txt}`}>Tambahkan <span className="font-bold">{c.t}</span></p>
            <p className={`text-xs mt-1 ${c.sub}`}>Estimasi {c.impact}</p>
            <button className={`mt-4 text-xs font-semibold inline-flex items-center gap-1 ${c.txt}`}>Mulai belajar <ArrowUpRight className="h-3 w-3" /></button>
          </div>
        ))}
      </section>
    </AppShell>
  );
}

function RadarChart({ axes, you, market }: { axes: string[]; you: number[]; market: number[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 150); return () => clearTimeout(t); }, []);

  const cx = 160, cy = 160, R = 120;
  const n = axes.length;
  const pt = (v: number, i: number): [number, number] => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = (v / 100) * R;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const path = (vals: number[]) => vals.map((v, i) => pt(v, i).join(",")).join(" ");

  return (
    <div className="relative w-full max-w-[340px]">
      {/* radar sweep (reuse global radar-cone + radarSpin) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[75%] aspect-square rounded-full radar-cone animate-radarSpin opacity-25 pointer-events-none" aria-hidden="true" />
      <svg viewBox="0 0 320 320" className="relative w-full">
        {/* grid rings */}
        {[1, 0.75, 0.5, 0.25].map((s) => (
          <polygon key={s} points={path(axes.map(() => s * 100))} fill="none" stroke="rgba(22,21,15,0.06)" />
        ))}
        {axes.map((_, i) => { const [x, y] = pt(100, i); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(22,21,15,0.06)" />; })}
        {/* market polygon */}
        <polygon points={path(market)} fill="rgba(22,21,15,0.04)" stroke="rgba(22,21,15,0.2)" strokeDasharray="4 4" strokeWidth="1.5" />
        {/* you polygon + nodes — grows from center on mount */}
        <g style={{ transform: mounted ? "scale(1)" : "scale(0.05)", transformOrigin: "160px 160px", transformBox: "view-box", opacity: mounted ? 1 : 0, transition: "transform .9s cubic-bezier(.22,1,.36,1), opacity .5s ease" }}>
          <polygon points={path(you)} fill="#0A5BE0" fillOpacity="0.18" stroke="#0A5BE0" strokeWidth="2" />
          {you.map((v, i) => { const [x, y] = pt(v, i); return <circle key={i} cx={x} cy={y} r="3.5" fill="#0A5BE0" stroke="#fff" strokeWidth="1.5" />; })}
        </g>
        {/* center pulse */}
        <circle cx={cx} cy={cy} r="3" fill="#1C9656" className="animate-pulse-glow" />
        {/* labels */}
        {axes.map((label, i) => { const [x, y] = pt(116, i); return <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: "11px", fill: "var(--muted-foreground)", fontWeight: 600 }}>{label}</text>; })}
      </svg>
    </div>
  );
}
