import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import {
  Rocket, Target, CalendarCheck, Zap, TrendingUp, ArrowUpRight, Bell, Award, Loader2,
  Search, Send, Brain, Check, Leaf, ArrowRight, Sparkles,
} from "lucide-react";
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

/* ─────────────────────────  Helpers  ───────────────────────── */

function CountUp({ to, suffix = "", duration = 1200 }: { to: number; suffix?: string; duration?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{Math.round(val).toLocaleString("id-ID")}{suffix}</>;
}

function Mascot({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true">
      <line x1="48" y1="15" x2="48" y2="7" stroke="#16150F" strokeWidth="3" strokeLinecap="round" />
      <circle cx="48" cy="5" r="4" fill="#D2F801" stroke="#16150F" strokeWidth="2" />
      <rect x="20" y="16" width="56" height="50" rx="15" fill="#D2F801" stroke="#16150F" strokeWidth="3" />
      <rect x="14" y="34" width="6" height="15" rx="3" fill="#16150F" />
      <rect x="76" y="34" width="6" height="15" rx="3" fill="#16150F" />
      <rect x="31" y="33" width="13" height="10" rx="3.5" fill="#16150F" />
      <rect x="52" y="33" width="13" height="10" rx="3.5" fill="#16150F" />
      <circle cx="35" cy="36.5" r="1.6" fill="#D2F801" />
      <circle cx="56" cy="36.5" r="1.6" fill="#D2F801" />
      <path d="M35 51 Q48 61 61 51" stroke="#16150F" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="41" y="66" width="14" height="8" rx="3" fill="#16150F" />
      <rect x="30" y="74" width="36" height="6" rx="3" fill="#4A4840" />
    </svg>
  );
}

const TIER_LABEL: Record<string, string> = { free: "Free", pro: "Pro", ultimate: "Ultimate", kampus: "Kampus" };

/* ─────────────────────────  Page  ───────────────────────── */

function DashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [agentJobs, setAgentJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!user?.id) return;

      if (isMockMode()) {
        setProfile(mockProfileData);
        setApplications(mockAppData as any[]);
        setSubscription(mockSubscription);
        setAgentJobs([]);
        setLoading(false);
        return;
      }

      const [{ data: profileData }, { data: appData }, { data: subData }, { data: queueData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("applications").select("*").eq("user_id", user.id).order("applied_at", { ascending: false }).limit(8),
        supabase.from("subscriptions").select("*").eq("user_id", user.id).single(),
        supabase.from("automation_queue").select("id, job_type, status, created_at, completed_at, payload").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
      ]);

      setProfile(profileData || mockProfileData);
      setApplications((appData?.length ? appData : mockAppData) as any[]);
      setSubscription(subData || mockSubscription);
      setAgentJobs(queueData || []);
      setLoading(false);
    }
    loadData();
  }, [user]);

  const totalApplications = applications.length;
  const atsPassed = applications.filter(a => ["ATS Lolos", "Callback", "Interview", "Offer"].includes(a.status)).length;
  const callbacks = applications.filter(a => ["Callback", "Interview", "Offer"].includes(a.status)).length;
  const goldenHits = applications.filter(a => a.is_golden).length;
  const atsRate = totalApplications > 0 ? Math.round((atsPassed / totalApplications) * 100) : 0;
  const quota = subscription?.monthly_quota || 10;
  const used = subscription?.used_quota || 0;
  const tier = TIER_LABEL[(subscription?.plan_name || "free").toLowerCase()] || "Free";

  const orbs = [
    { label: "Lamaran Bulan Ini", value: totalApplications, suffix: "", icon: Rocket, color: "#0A5BE0" },
    { label: "ATS Pass Rate", value: atsRate, suffix: "%", icon: Target, color: "#1C9656" },
    { label: "Interview Callbacks", value: callbacks, suffix: "", icon: CalendarCheck, color: "#D9741A" },
    { label: "Golden Window", value: goldenHits, suffix: "", icon: Zap, color: "#0A5BE0" },
  ];

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0]" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell rightPanel={<RightPanel quota={quota} used={used} tier={tier} />}>
      <header className="mb-6">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight">Halo, {displayName} 👋</h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#16150F] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#D2F801]">
            <Sparkles className="h-3 w-3" /> {tier}
          </span>
        </div>
        <p className="text-muted-foreground mt-1">Agen kamu sudah mengirim <span className="text-foreground font-semibold">{totalApplications} lamaran</span> bulan ini.</p>
      </header>

      {/* ── Mission Control: Agent Live (2col) + Quota Ring (1col) ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <AgentLivePanel className="lg:col-span-2" agentJobs={agentJobs} sent={totalApplications} atsRate={atsRate} callbacks={callbacks} />
        <QuotaRing quota={quota} used={used} tier={tier} />
      </div>

      {/* ── Stat orbs ── */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {orbs.map((o) => <StatOrb key={o.label} {...o} />)}
      </div>

      {/* ── Recent activity ── */}
      <section className="mt-6 glass rounded-3xl p-5 md:p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Aktivitas Terkini</h2>
            <p className="text-xs text-muted-foreground">Lamaran terbaru dari agenmu</p>
          </div>
          <Link to="/applications" className="text-xs font-semibold text-[#0A5BE0] inline-flex items-center gap-1">Lihat semua <ArrowRight className="h-3 w-3" /></Link>
        </div>
        {applications.length > 0 ? (
          <ul className="mt-5 divide-y divide-black/[5%]">
            {applications.map((a, i) => (
              <li key={a.id || i} className="py-3 flex items-center gap-3 hover:bg-black/[2%] -mx-2 px-2 rounded-lg transition">
                <div className="h-10 w-10 rounded-xl bg-[#0A5BE0] grid place-items-center text-white text-sm font-bold shrink-0">{(a.company_name || "?")[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate">{a.company_name}</p>
                    {a.is_golden && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#D2F801] text-[#16150F]">⚡ Golden</span>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{a.role_title}</p>
                </div>
                <span className={`hidden md:inline-flex text-[10px] uppercase tracking-wider px-2 py-1 rounded-full font-semibold ${platformColors[a.platform] || "bg-neutral-200 text-neutral-700"}`}>{a.platform}</span>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full font-semibold whitespace-nowrap ${statusColors[a.status] || "bg-neutral-200 text-neutral-700"}`}>{a.status}</span>
                <span className="hidden md:block text-xs text-muted-foreground w-20 text-right shrink-0">{a.applied_at ? new Date(a.applied_at).toLocaleDateString("id-ID") : ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5 text-center py-10">
            <Mascot className="h-14 w-14 mx-auto animate-botIdle" />
            <p className="mt-3 text-muted-foreground">Belum ada lamaran. Mulai dari <Link to="/jobs" className="text-[#0A5BE0] font-semibold">Job Feed</Link>!</p>
          </div>
        )}
      </section>

      {/* ── ATS Intelligence ── */}
      <section className="mt-6 glass rounded-3xl p-5 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">ATS Intelligence</h2>
            <p className="text-xs text-muted-foreground">Agregasi data ATS komunitas</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-[#16150F] text-[#D2F801] font-bold">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1C9656] animate-pulse-glow" /> Live
          </span>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Perusahaan</th><th className="py-2 pr-4">ATS System</th><th className="py-2 pr-4">Match Rate</th><th className="py-2">Tips</th>
              </tr>
            </thead>
            <tbody>
              {([
                ["Gojek", "Workday", 87, "+ Golang, gRPC"],
                ["Tokopedia", "Lever", 74, "+ kubernetes, GCP"],
                ["Shopee", "Greenhouse", 92, "+ A/B testing"],
                ["BCA Digital", "SAP SuccessFactors", 68, "+ regulatori OJK"],
                ["Traveloka", "Workday", 81, "+ system design"],
              ] as [string, string, number, string][]).map(([c, ats, m, t]) => (
                <tr key={c} className="border-t border-black/[5%]">
                  <td className="py-3 pr-4 font-medium">{c}</td>
                  <td className="py-3 pr-4 text-muted-foreground font-mono text-xs">{ats}</td>
                  <td className="py-3 pr-4 w-[40%]">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 bg-black/[6%] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${m}%`, background: m >= 80 ? "#1C9656" : m >= 60 ? "#0A5BE0" : "#C0341A" }} />
                      </div>
                      <span className="font-mono text-xs font-bold w-10 text-right">{m}%</span>
                    </div>
                  </td>
                  <td className="py-3 text-xs text-muted-foreground">{t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Quick actions ── */}
      <section className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-3">
        <QuickAction to="/jobs" icon={Search} title="Cari Lowongan" desc="Job feed multi-platform" tone="#0A5BE0" />
        <QuickAction to="/green-career" icon={Leaf} title="Green Career" desc="Lowongan berdampak + asesmen" tone="#1C9656" />
        <QuickAction to="/automation-settings" icon={Brain} title="Atur Otomasi" desc="Konfigurasi agen otonom" tone="#D9741A" />
      </section>
    </AppShell>
  );
}

/* ─────────────────────────  Components  ───────────────────────── */

const JOB_LABEL: Record<string, { t: string; icon: any }> = {
  apply: { t: "Melamar otomatis", icon: Send },
  search: { t: "Memindai lowongan", icon: Search },
  company_insight: { t: "Meneliti perusahaan", icon: Brain },
};
const QSTATUS: Record<string, { c: string; label: string }> = {
  pending: { c: "#D9741A", label: "Antri" },
  processing: { c: "#0A5BE0", label: "Proses" },
  completed: { c: "#1C9656", label: "Selesai" },
  failed: { c: "#C0341A", label: "Gagal" },
};

function AgentLivePanel({ className = "", agentJobs, sent, atsRate, callbacks }: { className?: string; agentJobs: any[]; sent: number; atsRate: number; callbacks: number }) {
  const hasJobs = agentJobs.length > 0;
  return (
    <div className={`relative glass rounded-3xl p-6 overflow-hidden ${className}`}>
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-[#D2F801]/20 blur-3xl animate-blob" aria-hidden="true" />
      <div className="relative flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Mascot className="h-11 w-11 animate-botIdle" />
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Agen Applify</p>
            <p className="font-display text-sm font-bold">Bekerja untukmu</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#1C9656] animate-pulse-glow" />
          <span className="text-xs text-[#1C9656] font-mono font-semibold">LIVE</span>
        </div>
      </div>

      <div className="relative grid grid-cols-3 gap-3 mb-4">
        {[{ l: "Terkirim", v: sent, c: "#0A5BE0" }, { l: "ATS Lolos", v: `${atsRate}%`, c: "#1C9656" }, { l: "Callback", v: callbacks, c: "#D9741A" }].map((s) => (
          <div key={s.l} className="rounded-2xl border border-[color:var(--border)] bg-[#FBF9F2] p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.l}</p>
            <p className="font-mono text-xl font-bold mt-0.5" style={{ color: s.c }}>{s.v}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        {hasJobs ? (
          <ul className="space-y-2">
            {agentJobs.map((j) => {
              const meta = JOB_LABEL[j.job_type] || { t: j.job_type, icon: Brain };
              const st = QSTATUS[j.status] || { c: "#6B6658", label: j.status };
              const Icon = meta.icon;
              return (
                <li key={j.id} className="flex items-center gap-3 rounded-xl border border-[color:var(--border)] bg-white p-3">
                  <div className="h-8 w-8 rounded-lg grid place-items-center text-white shrink-0" style={{ background: st.c }}><Icon className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{meta.t}</p>
                    <p className="text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString("id-ID")}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full" style={{ background: `${st.c}1A`, color: st.c }}>{st.label}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[#FBF9F2] p-5 text-center">
            <p className="text-sm font-medium">Agen siaga 🟢</p>
            <p className="text-xs text-muted-foreground mt-1">Belum ada tugas. Aktifkan Auto-Apply dari <Link to="/jobs" className="text-[#0A5BE0] font-semibold">Job Feed</Link> dan agen mulai bekerja.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function QuotaRing({ quota, used, tier }: { quota: number; used: number; tier: string }) {
  const pct = Math.min(used / Math.max(quota, 1), 1);
  const R = 52;
  const C = 2 * Math.PI * R;
  const [off, setOff] = useState(C);
  useEffect(() => {
    const t = setTimeout(() => setOff(C - C * pct), 120);
    return () => clearTimeout(t);
  }, [C, pct]);
  return (
    <div className="glass rounded-3xl p-6 flex flex-col items-center justify-center text-center">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Kuota Bulan Ini · {tier}</p>
      <div className="relative mt-3">
        <svg viewBox="0 0 120 120" className="w-36 h-36 -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(22,21,15,0.08)" strokeWidth="11" />
          <circle cx="60" cy="60" r={R} fill="none" stroke="#0A5BE0" strokeWidth="11" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)" }} />
        </svg>
        <div className="absolute inset-0 grid place-items-center rotate-0">
          <div>
            <p className="font-display text-3xl font-extrabold leading-none"><CountUp to={Math.max(quota - used, 0)} /></p>
            <p className="text-[11px] text-muted-foreground mt-1">sisa dari {quota}</p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground"><span className="font-mono font-bold text-foreground">{used}</span> lamaran terpakai</p>
      {tier === "Free" && <Link to="/login" className="mt-3 inline-flex h-9 items-center rounded-xl bg-[#16150F] px-4 text-xs font-semibold text-[#F4F1E8] hover:bg-black transition">Upgrade ke Pro</Link>}
    </div>
  );
}

function StatOrb({ label, value, suffix, icon: Icon, color }: { label: string; value: number; suffix: string; icon: any; color: string }) {
  return (
    <div className="glass rounded-3xl p-4 md:p-5 hover:-translate-y-1 transition-transform duration-300 relative overflow-hidden">
      <div className="absolute -bottom-6 -right-6 h-20 w-20 rounded-full blur-2xl opacity-20" style={{ background: color }} aria-hidden="true" />
      <div className="relative flex items-start justify-between">
        <div className="h-9 w-9 rounded-xl grid place-items-center text-white" style={{ background: color }}><Icon className="h-4 w-4" /></div>
        <TrendingUp className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <p className="relative mt-4 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="relative font-mono text-2xl md:text-3xl font-bold mt-1" style={{ color }}><CountUp to={value} suffix={suffix} /></p>
    </div>
  );
}

function QuickAction({ to, icon: Icon, title, desc, tone }: { to: string; icon: any; title: string; desc: string; tone: string }) {
  return (
    <Link to={to as any} className="glass rounded-2xl p-4 flex items-center gap-3 hover:-translate-y-1 transition-transform duration-300">
      <div className="h-11 w-11 rounded-xl grid place-items-center text-white shrink-0" style={{ background: tone }}><Icon className="h-5 w-5" /></div>
      <div className="min-w-0">
        <p className="font-display font-bold text-sm truncate">{title}</p>
        <p className="text-xs text-muted-foreground truncate">{desc}</p>
      </div>
      <ArrowUpRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
    </Link>
  );
}

const platformColors: Record<string, string> = {
  LinkedIn: "bg-[#0A66C2] text-white",
  Jobstreet: "bg-[#E8192C] text-white",
  Glints: "bg-[#0BD461] text-[#16150F]",
  KitaLulus: "bg-[#FF6B00] text-white",
  Kalibrr: "bg-[#2563EB] text-white",
  Dealls: "bg-[#6366F1] text-white",
  "Facebook Groups": "bg-[#1877F2] text-white",
};

const statusColors: Record<string, string> = {
  Terkirim: "bg-[#0A5BE0] text-white",
  "ATS Lolos": "bg-[#D2F801] text-[#16150F]",
  Callback: "bg-[#16150F] text-white",
  Interview: "bg-[#16150F] text-white",
  Offer: "bg-[#D2F801] text-[#16150F]",
  Manual: "bg-neutral-200 text-[#16150F]",
  Ditolak: "bg-[#C0341A] text-white",
};

function RightPanel({ quota, used, tier }: { quota: number; used: number; tier: string }) {
  return (
    <div className="space-y-5 sticky top-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-bold flex items-center gap-2"><Bell className="h-4 w-4 text-[#0A5BE0]" /> Notifikasi</h3>
          <span className="text-xs text-[#0A5BE0]">Lihat semua</span>
        </div>
        <div className="space-y-2">
          {[
            { i: "🎯", t: "Callback dari Tokopedia", s: "5 menit lalu" },
            { i: "✅", t: "Lamaran Gojek lolos ATS", s: "12 menit lalu" },
            { i: "⚡", t: "Golden Window: Shopee Data", s: "18 menit lalu" },
          ].map((n, i) => (
            <div key={i} className="glass rounded-2xl p-3 flex items-start gap-3">
              <span className="text-lg">{n.i}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{n.t}</p>
                <p className="text-[11px] text-muted-foreground">{n.s}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-3xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-8 w-8 rounded-xl bg-[#16150F] grid place-items-center"><Award className="h-4 w-4 text-[#D2F801]" /></div>
          <p className="text-xs uppercase tracking-wider text-[#0A5BE0] font-semibold">Skill Gap Alert</p>
        </div>
        <p className="text-sm font-semibold leading-snug"><span className="font-mono text-[#0A5BE0]">FastAPI</span> trending <span className="text-[#1C9656] font-bold">+171%</span> minggu ini di posisi Backend.</p>
        <Link to="/skill-radar" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#0A5BE0]">Lihat Skill Radar <ArrowUpRight className="h-3 w-3" /></Link>
      </div>

      <div className="glass rounded-3xl p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Kuota · {tier}</span>
          <span className="font-mono"><span className="text-foreground font-bold">{used}</span> / {quota}</span>
        </div>
        <div className="mt-2 h-2 bg-black/[6%] rounded-full overflow-hidden">
          <div className="h-full bg-[#0A5BE0] rounded-full transition-all duration-1000" style={{ width: `${Math.min((used / Math.max(quota, 1)) * 100, 100)}%` }} />
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#1C9656]"><Check className="h-3.5 w-3.5" /> Agen aktif &amp; siap bekerja</div>
      </div>
    </div>
  );
}
