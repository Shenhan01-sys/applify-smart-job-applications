import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { Activity, BookOpen, ArrowRight, AlertTriangle, Loader2, Info } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ErrorState } from "@/components/ErrorState";
import { describeError } from "@/lib/authErrors";
import { isMockMode } from "@/lib/appConfig";
import {
  buildRadarData,
  describeRadar,
  findGaps,
  unmatchedSkillLabels,
  DEMO_SKILLS,
  UNMATCHED_SECTION_TEXT,
  UNMATCHED_SECTION_TITLE,
  type SkillAxis,
  type UserSkillRow,
} from "@/lib/skillRadar";

export const Route = createFileRoute("/skill-radar")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Peta Skill — Applify" }] }),
  component: SkillPage,
});

/* ── Geometri radar ── */
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
  const [skills, setSkills] = useState<UserSkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError("");
    try {
      if (isMockMode()) { setSkills([]); return; }
      const { data, error: dbError } = await supabase.from("user_skills").select("name, category, proficiency_level").eq("user_id", user.id);
      if (dbError) throw dbError;
      setSkills((data as UserSkillRow[]) || []);
    } catch (e) {
      setError(describeError(e, "Skill kamu belum bisa dimuat."));
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const built = buildRadarData(skills);
  // Data contoh hanya muncul di mode demo eksplisit; akun asli tidak pernah melihat angka karangan.
  const demo = isMockMode() && built.status !== "ok";
  const data = demo ? DEMO_SKILLS : built.data;

  if (loading) {
    return <AppShell><div role="status" className="flex items-center justify-center h-[60vh]"><Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0]" aria-label="Memuat" /></div></AppShell>;
  }

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight">Peta Skill</h1>
        <p className="text-muted-foreground text-sm mt-1">Lihat skill di profilmu dibandingkan dengan patokan perkiraan untuk enam bidang.</p>
      </header>

      {error ? (
        <ErrorState title="Peta skill belum bisa dimuat" message={error} onRetry={load} />
      ) : data.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[#D9741A]/55 bg-[#D9741A]/[10%] p-6 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-[#D9741A]" aria-hidden="true" />
          <h2 className="mt-2 text-lg font-bold">
            {built.status === "empty" ? "Skill-mu belum ada di profil" : "Skill-mu belum cocok dengan enam bidang di peta ini"}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-foreground/80">
            {built.status === "empty"
              ? "Tambahkan skill di Profil Saya, lalu peta ini akan terisi dari data kamu sendiri."
              : "Peta ini membaca nama skill seperti React, Node, Figma, Docker, SQL, atau Scrum. Coba tambahkan skill dengan nama yang umum di Profil Saya."}
          </p>
          <Link to="/profile" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0A5BE0] px-6 text-sm font-semibold text-white hover:opacity-90">
            Buka Profil Saya
          </Link>
          {/* Skill yang ada di profil tetap terlihat, jadi halaman tidak kosong walau tidak ada yang cocok dengan enam bidang. */}
          {built.status === "unmatched" && <UnmatchedSkills skills={built.unmatched} className="mt-6 text-left" />}
        </div>
      ) : (
        <>
          {demo && (
            <div role="note" className="mb-6 flex items-center gap-3 rounded-2xl border-2 border-dashed border-[#D9741A]/55 bg-[#D9741A]/[10%] p-4">
              <AlertTriangle className="h-5 w-5 text-[#D9741A] shrink-0" aria-hidden="true" />
              <p className="text-sm text-foreground/80">Mode demo: angka di bawah adalah contoh, bukan datamu.</p>
            </div>
          )}

          <div className="mb-6 flex items-start gap-3 rounded-2xl border-2 border-neutral-200 bg-neutral-50 p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" aria-hidden="true" />
            <p className="text-sm text-neutral-700">
              Garis putus-putus adalah patokan perkiraan yang tetap untuk tiap bidang. Angkanya tidak dihitung dari data lowongan atau survei pasar, jadi pakai sebagai gambaran kasar saja.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
            <div className="lg:col-span-6 flex flex-col items-center order-2 lg:order-1">
              <RadarScene data={data} />
              <RadarTable data={data} />
            </div>
            <div className="lg:col-span-6 flex flex-col justify-center order-1 lg:order-2">
              <ActionableInsights data={data} />
            </div>
          </div>
          {!demo && <UnmatchedSkills skills={built.unmatched} className="mt-10" />}
        </>
      )}
    </AppShell>
  );
}

/** Skill profil yang tidak masuk ke satu pun dari enam bidang: tidak ikut grafik, tetapi tetap ditampilkan. */
function UnmatchedSkills({ skills, className = "" }: { skills: UserSkillRow[]; className?: string }) {
  const labels = unmatchedSkillLabels(skills);
  if (labels.length === 0) return null;
  return (
    <section aria-labelledby="skill-luar-bidang" className={`rounded-2xl border-2 border-neutral-200 bg-white p-5 ${className}`}>
      <h2 id="skill-luar-bidang" className="text-lg font-bold">{UNMATCHED_SECTION_TITLE}</h2>
      <p className="mt-1 text-sm text-neutral-700">{UNMATCHED_SECTION_TEXT}</p>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label={UNMATCHED_SECTION_TITLE}>
        {labels.map((label) => (
          <li key={label} className="rounded-full border-2 border-neutral-200 bg-neutral-50 px-3 py-1 text-sm font-medium text-neutral-800">{label}</li>
        ))}
      </ul>
    </section>
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
          <svg
            viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
            role="img"
            aria-label={`Grafik radar skill. ${describeRadar(data)}.`}
            className="w-full h-full relative z-20 overflow-visible"
          >
            {/* jaring laba-laba */}
            {[20, 40, 60, 80, 100].map((level) => (
              <path key={level} d={polyPath(data, null, level)} fill="none" stroke={level === 100 ? "#d4d4d4" : "#e5e5e5"} strokeWidth={level === 100 ? 1.5 : 1} strokeDasharray={level !== 100 ? "4 4" : "none"} />
            ))}
            {/* jari-jari */}
            {data.map((_, i) => { const e = coord(100, i, data.length); return <line key={i} x1={CENTER} y1={CENTER} x2={e.x} y2={e.y} stroke="#d4d4d4" strokeWidth="1" strokeLinecap="round" />; })}
            {/* poligon patokan */}
            <path d={marketPath} fill="rgba(0,0,0,0.02)" stroke="#a3a3a3" strokeWidth="1.5" strokeDasharray="6 4" />
            {/* poligon skill pengguna */}
            {isLoaded && <path d={userPath} fill="rgba(10,91,224,0.22)" stroke="#0A5BE0" strokeWidth="3.5" strokeLinejoin="round" className="sr-path-draw animate-srUserPath" />}
            {/* penanda selisih */}
            {isLoaded && data.map((s, i) => {
              if (s.marketDemand <= s.userLevel + 10) return null;
              const m = coord(s.marketDemand, i, data.length), u = coord(s.userLevel, i, data.length);
              return <line key={`gap-${i}`} x1={u.x} y1={u.y} x2={m.x} y2={m.y} stroke="#D9741A" strokeWidth="2.5" strokeLinecap="round" className="opacity-0 animate-srFadeIn" style={{ animationDelay: `${i * 200 + 500}ms` }} />;
            })}
            {/* titik dan label */}
            {data.map((s, i) => {
              const m = coord(s.marketDemand, i, data.length), u = coord(s.userLevel, i, data.length), lp = coord(120, i, data.length);
              const isGap = s.marketDemand > s.userLevel + 10;
              let anchor: "middle" | "start" | "end" = "middle"; let xo = 0;
              if (lp.x > CENTER + 10) { anchor = "start"; xo = 10; } else if (lp.x < CENTER - 10) { anchor = "end"; xo = -10; }
              return (
                <g key={`node-${i}`} className="opacity-0 animate-srPopNode" style={{ animationDelay: `${i * 200 + 100}ms`, transformBox: "fill-box", transformOrigin: "center" }}>
                  <circle cx={m.x} cy={m.y} r="3" fill="#fff" stroke="#a3a3a3" strokeWidth="1.5" />
                  <circle cx={u.x} cy={u.y} r="5" fill="#fff" stroke="#0A5BE0" strokeWidth="2.5" />
                  <text x={lp.x + xo} y={lp.y} textAnchor={anchor} alignmentBaseline="middle" className={`font-display text-[13px] font-bold ${isGap ? "fill-[#B45A0E]" : "fill-neutral-800"}`}>{s.name}</text>
                  <text x={lp.x + xo} y={lp.y + 15} textAnchor={anchor} className="font-mono text-xs fill-neutral-600 font-bold">{s.userLevel}% / {s.marketDemand}%</text>
                </g>
              );
            })}
          </svg>
          <div aria-hidden="true" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-neutral-200 rounded-full z-10 shadow-inner" />
        </div>
      </div>
    </div>
  );
}

/** Angka tiap bidang dalam bentuk tabel: dibaca pembaca layar dan membantu siapa pun yang sulit membaca grafik. */
function RadarTable({ data }: { data: SkillAxis[] }) {
  return (
    <details className="mt-4 w-full max-w-md rounded-xl border-2 border-neutral-200 bg-white p-3">
      <summary className="min-h-11 cursor-pointer text-sm font-semibold leading-[2.75rem] md:leading-normal">Lihat angka tiap bidang</summary>
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">Skill kamu dan patokan perkiraan per bidang, dalam persen</caption>
        <thead>
          <tr className="text-left text-neutral-600">
            <th scope="col" className="py-1 pr-2 font-semibold">Bidang</th>
            <th scope="col" className="py-1 pr-2 font-semibold">Skill kamu</th>
            <th scope="col" className="py-1 font-semibold">Patokan</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.id} className="border-t border-neutral-100">
              <th scope="row" className="py-1.5 pr-2 text-left font-medium">{d.name}</th>
              <td className="py-1.5 pr-2 font-mono">{d.userLevel}%</td>
              <td className="py-1.5 font-mono">{d.marketDemand}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function ActionableInsights({ data }: { data: SkillAxis[] }) {
  const gaps = findGaps(data);

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="opacity-0 animate-srSlideUp" style={{ animationDelay: "300ms" }}>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-100 border-2 border-[#D9741A]/45 text-[#9a4a0a] text-xs font-bold shadow-sm mb-3">
          <Activity className="w-3.5 h-3.5" aria-hidden="true" /> Selisih dengan patokan
        </div>
        <h2 className="font-display text-2xl md:text-3xl font-bold text-neutral-900 leading-tight">
          {gaps.length > 0 ? `${gaps.length} bidang perlu diperkuat` : "Skill-mu sudah di atas patokan"}
        </h2>
        <p className="font-sans text-sm text-neutral-600 mt-2 leading-relaxed">
          Bidang berikut punya selisih lebih dari 10 poin dari patokan perkiraan. Selisih ini hanya petunjuk, bukan penilaian resmi.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {gaps.map((gap, index) => {
          const diff = gap.marketDemand - gap.userLevel;
          return (
            <div key={gap.id} className="bg-white border-2 border-neutral-300 rounded-[1.5rem] p-5 shadow-sm opacity-0 animate-srSlideUp" style={{ animationDelay: `${500 + index * 200}ms` }}>
              <h3 className="font-display font-bold text-neutral-900 text-lg">{gap.name}</h3>
              <p className="mt-1 text-sm text-neutral-600">
                Skill kamu <span className="font-mono font-bold text-neutral-800">{gap.userLevel}%</span>, patokan{" "}
                <span className="font-mono font-bold text-neutral-800">{gap.marketDemand}%</span>.{" "}
                <span className="font-bold text-[#B45A0E]">Selisih {diff} poin</span>
              </p>
              <div className="mt-4 pt-4 border-t border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 text-[#0A5BE0] rounded-xl flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <p className="text-sm text-neutral-700">Pelajari bidang ini lewat kursus atau proyek latihan pilihanmu, lalu catat hasilnya di profil.</p>
                </div>
                <Link to="/profile" className="shrink-0 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-[#0A5BE0] hover:underline">
                  Tambah skill di Profil <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
          );
        })}
        {gaps.length === 0 && (
          <div className="glass rounded-3xl p-6 text-center text-sm text-[#146B3D] font-medium">Skill-mu sudah berada di atas patokan perkiraan di semua bidang.</div>
        )}
      </div>
    </div>
  );
}
