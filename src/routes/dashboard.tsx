import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { Bot, Zap, Send, Clock, Search, Leaf, Settings, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { mockProfile as mockProfileData, mockSubscription, mockApplications as mockAppData } from "@/mocks/mockData";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Dashboard — Applify" }] }),
  component: DashboardPage,
});

const TIER_LABEL: Record<string, string> = { free: "Free", pro: "Pro", ultimate: "Ultimate", kampus: "Kampus" };

function CountUp({ to, duration = 1500 }: { to: number; duration?: number }) {
  const remotion = typeof window !== "undefined" && (window as any).__REMOTION_STATIC__;
  const [val, setVal] = useState(remotion ? to : 0);
  useEffect(() => {
    if (remotion) { setVal(to); return; }
    let raf = 0; let start: number | null = null;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setVal(Math.floor((1 - Math.pow(1 - p, 4)) * to));
      if (p < 1) raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, remotion]);
  return <span>{val}</span>;
}

function relTime(d?: string): string {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

function statusStyle(status: string): { dot: string; bg: string } {
  switch (status) {
    case "Terkirim": return { dot: "bg-[#0A5BE0]", bg: "bg-blue-50 border-blue-200 text-blue-700" };
    case "ATS Lolos": case "Lolos ATS": case "Offer": return { dot: "bg-[#A3E635]", bg: "bg-lime-50 border-lime-300 text-lime-800" };
    case "Callback": case "Interview": return { dot: "bg-[#14B8A6]", bg: "bg-teal-50 border-teal-200 text-teal-700" };
    case "Ditolak": return { dot: "bg-[#C0341A]", bg: "bg-red-50 border-red-200 text-red-700" };
    default: return { dot: "bg-neutral-400", bg: "bg-neutral-100 border-neutral-200 text-neutral-700" };
  }
}

export function DashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!user?.id) return;
      if (isMockMode()) {
        setProfile(mockProfileData); setApplications(mockAppData as any[]); setSubscription(mockSubscription); setLoading(false); return;
      }
      const [{ data: p }, { data: apps }, { data: sub }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("applications").select("*").eq("user_id", user.id).order("applied_at", { ascending: false }).limit(6),
        supabase.from("subscriptions").select("*").eq("user_id", user.id).single(),
      ]);
      setProfile(p || mockProfileData);
      setApplications((apps?.length ? apps : mockAppData) as any[]);
      setSubscription(sub || mockSubscription);
      setLoading(false);
    }
    loadData();
  }, [user]);

  if (loading) {
    return (
      <AppShell>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
          <div className="relative w-12 h-12 flex items-center justify-center">
            <div className="absolute inset-0 border-2 border-neutral-200 rounded-full" />
            <div className="absolute inset-0 border-2 border-[#A3E635] rounded-full border-t-transparent animate-spin" />
            <Bot className="w-5 h-5 text-neutral-400" />
          </div>
          <p className="font-mono text-xs text-neutral-500 tracking-widest uppercase">Inisiasi Sistem...</p>
        </div>
      </AppShell>
    );
  }

  const name = profile?.full_name || user?.email?.split("@")[0] || "User";
  const tier = TIER_LABEL[(subscription?.plan_name || "free").toLowerCase()] || "Free";
  const quota = subscription?.monthly_quota || 10;
  const used = subscription?.used_quota || 0;
  const remaining = Math.max(quota - used, 0);

  const sent = applications.length;
  const atsPassed = applications.filter((a) => ["ATS Lolos", "Callback", "Interview", "Offer"].includes(a.status)).length;
  const callback = applications.filter((a) => ["Callback", "Interview", "Offer"].includes(a.status)).length;

  const C = 2 * Math.PI * 18;
  const ringOffset = C - (Math.min(used / Math.max(quota, 1), 1)) * C;

  return (
    <AppShell>
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-10">
        {/* Top row: greeting + quota */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 opacity-0 animate-dbFadeUp">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-neutral-900 text-white font-mono text-[10px] font-bold uppercase tracking-widest shadow-sm">
              <Zap className="text-[#A3E635] w-3.5 h-3.5" /> Tier {tier}
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-neutral-900 mt-4 tracking-tight">Halo, {name}.</h1>
            <p className="font-sans text-neutral-500 mt-1.5 text-sm sm:text-base">Agenmu aktif bekerja. Berikut pantauan hari ini.</p>
          </div>
          <div className="glass-solid rounded-2xl p-3 flex items-center gap-4 min-w-[200px] hover:shadow-md transition-shadow">
            <div className="relative w-12 h-12 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="18" fill="none" stroke="#f5f5f5" strokeWidth="4" />
                <circle cx="24" cy="24" r="18" fill="none" stroke="#A3E635" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={ringOffset} className="transition-all duration-1000 ease-out" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-xs text-neutral-900">{remaining}</div>
            </div>
            <div>
              <p className="font-display text-sm font-bold text-neutral-900">Sisa Kuota</p>
              <p className="font-sans text-[10px] text-neutral-500 uppercase tracking-widest mt-0.5">Bulan Ini</p>
            </div>
          </div>
        </div>

        {/* Mission Control diorama */}
        <MissionControlStage sent={sent} atsPassed={atsPassed} callback={callback} />

        {/* Bottom: activity log + quick actions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 opacity-0 animate-dbFadeUp" style={{ animationDelay: "300ms" }}>
          <div className="lg:col-span-8 glass-solid rounded-3xl p-6 sm:p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-display text-lg font-bold text-neutral-900">Jejak Aktivitas</h3>
              <Link to="/applications" className="text-xs font-bold text-[#0A5BE0] flex items-center gap-1 hover:underline">Lihat Semua <ChevronRight className="w-3 h-3" /></Link>
            </div>
            {applications.length > 0 ? (
              <div className="space-y-3">
                {applications.map((a, i) => {
                  const st = statusStyle(a.status);
                  return (
                    <div key={a.id || i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border-2 border-neutral-200 bg-neutral-50/50 hover:bg-white hover:shadow-md hover:scale-[1.01] transition-all duration-300 gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white border-2 border-neutral-300 rounded-xl flex items-center justify-center shrink-0 shadow-sm"><Bot className="w-5 h-5 text-neutral-600" /></div>
                        <div>
                          <p className="font-display font-bold text-neutral-900 text-sm">{a.role_title || "—"}</p>
                          <p className="font-sans text-xs text-neutral-500 mt-0.5">{a.company_name} <span className="mx-1">•</span> {relTime(a.applied_at)}</p>
                        </div>
                      </div>
                      <div className={`px-3 py-1.5 rounded-lg border shadow-sm flex items-center gap-2 w-fit ${st.bg}`}>
                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${st.dot}`} />
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider">{a.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 text-sm text-muted-foreground">Belum ada aktivitas. Mulai dari <Link to="/jobs" className="text-[#0A5BE0] font-semibold">Job Feed</Link>.</div>
            )}
          </div>

          <div className="lg:col-span-4 flex flex-col gap-3">
            <h3 className="font-display text-lg font-bold text-neutral-900 mb-1">Aksi Cepat</h3>
            <Link to="/jobs" className="w-full flex items-center gap-4 p-5 bg-[#16150F] text-white rounded-2xl transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl group">
              <div className="w-10 h-10 bg-[#A3E635] text-[#16150F] rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 shadow-sm"><Search className="w-5 h-5" /></div>
              <div className="text-left">
                <p className="font-display font-bold text-base leading-tight group-hover:text-[#A3E635] transition-colors">Eksplorasi Manual</p>
                <p className="font-sans text-xs text-neutral-400 mt-1">Cari spesifik di luar antrean</p>
              </div>
            </Link>
            <Link to="/green-career" className="w-full flex items-center gap-4 p-4 glass-solid rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-emerald-300 group">
              <div className="w-10 h-10 bg-emerald-50 border-2 border-emerald-200 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:bg-emerald-500 group-hover:text-white group-hover:border-emerald-500"><Leaf className="w-5 h-5" /></div>
              <div className="text-left">
                <p className="font-display font-bold text-neutral-900 text-sm">Green Career</p>
                <p className="font-sans text-xs text-neutral-500 mt-0.5 group-hover:text-neutral-700 transition-colors">Filter loker ber-ESG tinggi</p>
              </div>
            </Link>
            <Link to="/automation-settings" className="w-full flex items-center gap-4 p-4 glass-solid rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-neutral-400 group">
              <div className="w-10 h-10 bg-neutral-50 border-2 border-neutral-300 text-neutral-600 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:bg-neutral-900 group-hover:text-white group-hover:border-neutral-900"><Settings className="w-5 h-5" /></div>
              <div className="text-left">
                <p className="font-display font-bold text-neutral-900 text-sm">Pengaturan Agen</p>
                <p className="font-sans text-xs text-neutral-500 mt-0.5 group-hover:text-neutral-700 transition-colors">Ubah kriteria otomatisasi</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function MissionControlStage({ sent, atsPassed, callback }: { sent: number; atsPassed: number; callback: number }) {
  return (
    <div className="relative w-full flex flex-col items-center pt-8 pb-12 opacity-0 animate-dbFadeUp" style={{ animationDelay: "100ms" }}>
      <div className="absolute inset-0 bg-tech-grid z-0 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[250px] h-[250px] bg-[#A3E635]/10 rounded-full blur-[60px] z-0" />

      {/* Agent core */}
      <div className="relative z-20 flex flex-col items-center group">
        <div className="relative animate-dbBotIdle transition-transform duration-500 group-hover:-translate-y-2">
          <div className="absolute -inset-4 border border-[#A3E635]/30 rounded-full animate-dbSpinSlow" />
          <div className="absolute -inset-8 border-2 border-neutral-300/80 rounded-full animate-dbSpinSlowRev" />
          <div className="w-20 h-20 bg-[#16150F] rounded-2xl border-2 border-neutral-800 shadow-[0_10px_30px_rgba(0,0,0,0.15)] flex items-center justify-center text-[#A3E635] relative z-10 transition-shadow duration-300 group-hover:shadow-[0_15px_40px_rgba(163,230,53,0.3)]">
            <Bot className="w-8 h-8 transition-transform duration-300 group-hover:scale-110" />
          </div>
          <div className="absolute -top-3 -right-6 bg-white border-2 border-neutral-300 px-2.5 py-0.5 rounded-full shadow-sm flex items-center gap-1.5 z-20">
            <span className="relative flex h-2 w-2">
              <span className="animate-dbPingSubtle absolute inline-flex h-full w-full rounded-full bg-[#A3E635] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#A3E635]" />
            </span>
            <span className="font-mono text-[9px] font-bold text-neutral-800 tracking-widest">LIVE</span>
          </div>
        </div>
        <div className="mt-8 px-4 py-1.5 bg-neutral-900 text-white rounded-full font-mono text-[10px] uppercase tracking-widest shadow-md transition-colors duration-300 group-hover:bg-[#A3E635] group-hover:text-[#16150F]">Agent Core</div>
      </div>

      {/* umbilical cords */}
      <div className="w-full max-w-2xl h-24 relative z-10 -mt-2 opacity-70">
        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 50">
          <path d="M 50,0 C 50,30 20,20 20,50" fill="none" stroke="#0A5BE0" strokeWidth="1.5" className="path-flow animate-dbDataFlow" />
          <path d="M 50,0 L 50,50" fill="none" stroke="#A3E635" strokeWidth="2" className="path-flow animate-dbDataFlow" strokeDasharray="8 6" />
          <path d="M 50,0 C 50,30 80,20 80,50" fill="none" stroke="#14B8A6" strokeWidth="1.5" className="path-flow animate-dbDataFlow" />
        </svg>
      </div>

      {/* stat orbs */}
      <div className="relative z-30 w-full max-w-3xl px-4 flex justify-between sm:justify-center sm:gap-12 lg:gap-24 -mt-4">
        <Orb icon={Send} value={sent} label="Terkirim" accent="#0A5BE0" delay={100} />
        <Orb icon={CheckCircle2} value={atsPassed} label="Lolos ATS" accent="#A3E635" delay={200} prominent />
        <Orb icon={Clock} value={callback} label="Callback" accent="#14B8A6" delay={300} />
      </div>
    </div>
  );
}

function Orb({ icon: Icon, value, label, accent, delay, prominent = false }: { icon: any; value: number; label: string; accent: string; delay: number; prominent?: boolean }) {
  return (
    <div className={`flex flex-col items-center opacity-0 animate-dbPopIn group ${prominent ? "-mt-6" : ""}`} style={{ animationDelay: `${delay}ms` }}>
      <div
        className={`bg-white rounded-full glass-solid flex flex-col items-center justify-center relative transition-all duration-300 ease-out group-hover:-translate-y-3 ${prominent ? "w-28 h-28 sm:w-32 sm:h-32" : "w-24 h-24 sm:w-28 sm:h-28"}`}
        style={{ borderBottom: `4px solid ${accent}`, boxShadow: prominent ? `0 10px 25px ${accent}26` : undefined }}
      >
        <Icon className={`${prominent ? "w-7 h-7 sm:w-8 sm:h-8 mb-2" : "w-6 h-6 sm:w-7 sm:h-7 mb-1.5"} transition-transform duration-300 group-hover:scale-110`} style={{ color: accent }} />
        <h3 className={`font-display font-extrabold text-neutral-900 leading-none ${prominent ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"}`}><CountUp to={value} /></h3>
      </div>
      <p className="font-sans font-bold text-[10px] sm:text-xs text-neutral-500 uppercase tracking-wider mt-4 transition-colors">{label}</p>
    </div>
  );
}
