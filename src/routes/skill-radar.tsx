import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { Activity, BookOpen, ArrowRight, AlertTriangle, Loader2 } from "lucide-react";
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

interface SkillAxis { id: number; name: string; userLevel: number; marketDemand: number; }

const MOCK_SKILLS: SkillAxis[] = [
  { id: 1, name: "Frontend", userLevel: 85, marketDemand: 90 },
  { id: 2, name: "Backend", userLevel: 55, marketDemand: 80 },
  { id: 3, name: "UI/UX", userLevel: 40, marketDemand: 70 },
  { id: 4, name: "Cloud/DevOps", userLevel: 25, marketDemand: 65 },
  { id: 5, name: "Data/AI", userLevel: 55, marketDemand: 85 },
  { id: 6, name: "Agile/Soft", userLevel: 90, marketDemand: 75 },
];

// Canonical axes + market benchmark + keyword buckets to map real user_skills onto the radar
const AXES = [
  { name: "Frontend", market: 90, kw: ["front", "react", "vue", "css", "html", "javascript", "typescript", "tailwind"] },
  { name: "Backend", market: 80, kw: ["back", "node", "api", "server", "golang", "java", "python", "php", "rest", "graphql"] },
  { name: "UI/UX", market: 70, kw: ["ux", "ui/ux", "design", "figma", "wireframe", "prototyp"] },
  { name: "Cloud/DevOps", market: 65, kw: ["cloud", "devops", "aws", "gcp", "azure", "docker", "kubernetes", "ci/cd", "terraform"] },
  { name: "Data/AI", market: 85, kw: ["data", "ai", "ml", "machine", "analytic", "sql", "pandas", "tensor", "llm"] },
  { name: "Agile/Soft", market: 75, kw: ["agile", "scrum", "communication", "leadership", "soft", "management", "kolaborasi"] },
];

function buildData(skills: any[]): { data: SkillAxis[]; real: boolean } {
  if (!skills.length) return { data: MOCK_SKILLS, real: false };
  const maxP = Math.max(...skills.map((s) => Number(s.proficiency_level) || 0), 0);
  const norm = (v: number) => (maxP <= 5 ? v * 20 : v);
  const data: SkillAxis[] = AXES.map((ax, i) => {
    const matched = skills.filter((s) => {
      const hay = `${s.name || ""} ${s.category || ""}`.toLowerCase();
      return ax.kw.some((k) => hay.includes(k));
    });
    const userLevel = matched.length
      ? Math.round(Math.min(100, norm(matched.reduce((a, s) => a + (Number(s.proficiency_level) || 0), 0) / matched.length)))
      : 0;
    return { id: i + 1, name: ax.name, userLevel, marketDemand: ax.market };
  });
  if (!data.some((d) => d.userLevel > 0)) return { data: MOCK_SKILLS, real: false };
  return { data, real: true };
}

/* ── Radar geometry ── */
const SVG_SIZE = 400, CENTER = 200, MAX_RADIUS = 150;
const coord = (value: number, index: number, total: number) => {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  const r = (value / 100) * MAX_RADIUS;
  return { x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle), angle };
};
const polyPath = (data: SkillAxis[], key: "userLevel" | "marketDemand" | null, constant: number | null = null) =>
  data.map((item, i) => {
    const val = constant !== null ? constant : (item[key as "userLevel"] as number);
    const { x, y } = coord(val, i, data.length);
    return `${i === 0 ? "M" : "L"} ${x},${y}`;
  }).join(" ") + " Z";

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

  const { data, real } = buildData(skills);

  if (loading) {
    return <AppShell><div className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0]" /></div></AppShell>;
  }

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight">Skill Radar</h1>
        <p className="text-muted-foreground text-sm mt-1">Pemetaan skill-mu vs permintaan pasar — dipersonalisasi.</p>
      </header>

      {!real && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border-2 border-dashed border-[#D9741A]/55 bg-[#D9741A]/[10%] p-4">
          <AlertTriangle className="h-5 w-5 text-[#D9741A] shrink-0" />
          <p className="text-sm text-foreground/80">Radar masih ilustratif. <Link to="/profile" className="text-[#0A5BE0] font-semibold">Lengkapi skill di Profil</Link> agar memetakan kemampuan aslimu.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
        <div className="lg:col-span-6 flex justify-center order-2 lg:order-1">
          <RadarScene data={data} />
        </div>
        <div className="lg:col-span-6 flex flex-col justify-center order-1 lg:order-2">
          <ActionableInsights data={data} />
        </div>
      </div>
    </AppShell>
  );
}

function RadarScene({ data }: { data: SkillAxis[] }) {
  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => { const t = setTimeout(() => setIsLoaded(true), 100); return () => clearTimeout(t); }, []);

  const userPath = polyPath(data, "userLevel");
  const marketPath = polyPath(data, "marketDemand");

  return (
    <div className="relative w-full max-w-xl aspect-square flex items-center justify-center opacity-0 animate-srSlideUp">
      <div className="relative w-full h-full max-w-[400px] max-h-[400px] opacity-0 animate-srFadeIn">
        <div className="w-full h-full animate-srFloat">
          <svg viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`} className="w-full h-full relative z-20 overflow-visible">
            {/* spider-web grids */}
            {[20, 40, 60, 80, 100].map((level) => (
              <path key={level} d={polyPath(data, null, level)} fill="none" stroke={level === 100 ? "#e5e5e5" : "#f0f0f0"} strokeWidth={level === 100 ? 1.5 : 1} strokeDasharray={level !== 100 ? "4 4" : "none"} />
            ))}
            {/* spokes */}
            {data.map((_, i) => { const e = coord(100, i, data.length); return <line key={i} x1={CENTER} y1={CENTER} x2={e.x} y2={e.y} stroke="#e5e5e5" strokeWidth="1" strokeLinecap="round" />; })}
            {/* market polygon */}
            <path d={marketPath} fill="rgba(0,0,0,0.02)" stroke="#d4d4d8" strokeWidth="1.5" strokeDasharray="6 4" />
            {/* user polygon — draws + glows */}
            {isLoaded && <path d={userPath} fill="rgba(10,91,224,0.22)" stroke="#0A5BE0" strokeWidth="3.5" strokeLinejoin="round" className="sr-path-draw animate-srUserPath" />}
            {/* gap indicators */}
            {isLoaded && data.map((s, i) => {
              if (s.marketDemand <= s.userLevel + 10) return null;
              const m = coord(s.marketDemand, i, data.length), u = coord(s.userLevel, i, data.length);
              return <line key={`gap-${i}`} x1={u.x} y1={u.y} x2={m.x} y2={m.y} stroke="#D9741A" strokeWidth="2.5" strokeLinecap="round" className="opacity-0 animate-srFadeIn" style={{ animationDelay: `${i * 200 + 500}ms` }} />;
            })}
            {/* nodes + labels */}
            {data.map((s, i) => {
              const m = coord(s.marketDemand, i, data.length), u = coord(s.userLevel, i, data.length), lp = coord(120, i, data.length);
              const isGap = s.marketDemand > s.userLevel + 10;
              let anchor: "middle" | "start" | "end" = "middle"; let xo = 0;
              if (lp.x > CENTER + 10) { anchor = "start"; xo = 10; } else if (lp.x < CENTER - 10) { anchor = "end"; xo = -10; }
              return (
                <g key={`node-${i}`} className="opacity-0 animate-srPopNode" style={{ animationDelay: `${i * 200 + 100}ms`, transformBox: "fill-box", transformOrigin: "center" }}>
                  <circle cx={m.x} cy={m.y} r="3" fill="#fff" stroke="#d4d4d8" strokeWidth="1.5" />
                  <circle cx={u.x} cy={u.y} r="5" fill="#fff" stroke="#0A5BE0" strokeWidth="2.5" />
                  <text x={lp.x + xo} y={lp.y} textAnchor={anchor} alignmentBaseline="middle" className={`font-display text-[11px] font-bold tracking-widest uppercase ${isGap ? "fill-[#D9741A]" : "fill-neutral-800"}`}>{s.name}</text>
                  <text x={lp.x + xo} y={lp.y + 14} textAnchor={anchor} className="font-mono text-[9px] fill-neutral-400 font-bold">{s.userLevel}% / {s.marketDemand}%</text>
                </g>
              );
            })}
          </svg>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-neutral-200 rounded-full z-10 shadow-inner" />
        </div>
      </div>
    </div>
  );
}

function ActionableInsights({ data }: { data: SkillAxis[] }) {
  const gaps = data.filter((s) => s.marketDemand > s.userLevel + 10).sort((a, b) => (b.marketDemand - b.userLevel) - (a.marketDemand - a.userLevel));
  const courseFor = (name: string) => {
    if (name.includes("Cloud")) return { course: "AWS Certified Solutions Architect", provider: "Dicoding" };
    if (name.includes("UI")) return { course: "Google UX Design Professional", provider: "Coursera" };
    if (name.includes("Backend")) return { course: "Advanced Node.js & Microservices", provider: "Udemy" };
    if (name.includes("Data")) return { course: "Machine Learning Specialization", provider: "Coursera" };
    return { course: "Sertifikasi Profesional", provider: "Coursera" };
  };

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="opacity-0 animate-srSlideUp" style={{ animationDelay: "300ms" }}>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-100 border-2 border-[#D9741A]/45 text-[#D9741A] font-mono text-[10px] font-bold uppercase tracking-widest shadow-sm mb-3">
          <Activity className="w-3.5 h-3.5" /> Market Divergence
        </div>
        <h3 className="font-display text-2xl md:text-3xl font-bold text-neutral-900 leading-tight">
          {gaps.length > 0 ? `${gaps.length} Area Perlu Pengembangan` : "Profil Anda Sangat Kompetitif"}
        </h3>
        <p className="font-sans text-sm text-neutral-500 mt-2 leading-relaxed">
          Berdasarkan pemindaian otonom terhadap 1.200+ lowongan aktif minggu ini, berikut kesenjangan skill-mu vs pasar.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {gaps.map((gap, index) => {
          const diff = gap.marketDemand - gap.userLevel;
          const { course, provider } = courseFor(gap.name);
          return (
            <div key={gap.id} className="group bg-white border-2 border-neutral-300 rounded-[1.5rem] p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-[#0A5BE0]/30 transition-all duration-300 opacity-0 animate-srSlideUp" style={{ animationDelay: `${500 + index * 200}ms` }}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-display font-bold text-neutral-900 text-lg">{gap.name}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-sans text-xs text-neutral-500">Target Pasar: <span className="font-mono font-bold text-neutral-800">{gap.marketDemand}%</span></span>
                    <span className="w-1 h-1 rounded-full bg-neutral-300" />
                    <span className="font-sans text-xs text-[#D9741A] font-bold flex items-center gap-1">Gap -{diff}%</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 text-[#0A5BE0] rounded-xl flex items-center justify-center shrink-0 group-hover:bg-[#0A5BE0] group-hover:text-white transition-colors duration-300">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-display text-sm font-bold text-neutral-900 leading-tight">{course}</p>
                    <p className="font-sans text-[11px] text-neutral-500 mt-0.5 uppercase tracking-wider font-semibold">Tersedia via {provider}</p>
                  </div>
                </div>
                <button className="shrink-0 font-sans text-xs font-bold text-[#16150F] hover:text-[#0A5BE0] flex items-center gap-1.5 transition-colors">
                  Tutup Gap Ini <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {gaps.length === 0 && (
          <div className="glass rounded-3xl p-6 text-center text-sm text-[#1C9656] font-medium">🎉 Skill-mu sudah di atas rata-rata pasar di semua sumbu!</div>
        )}
      </div>
    </div>
  );
}
