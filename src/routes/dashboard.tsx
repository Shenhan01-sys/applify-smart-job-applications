import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { Rocket, Target, CalendarCheck, Zap, TrendingUp, ArrowUpRight, Bell, Award, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { mockProfile as mockProfileData, mockSubscription, mockApplications as mockAppData, MOCK_USER_ID } from "@/mocks/mockData";

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

function DashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!user?.id) return;

      if (isMockMode()) {
        setProfile(mockProfileData);
        setApplications(mockAppData as any[]);
        setSubscription(mockSubscription);
        setLoading(false);
        return;
      }

      // Load profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      setProfile(profileData || mockProfileData);

      // Load applications
      const { data: appData } = await supabase
        .from("applications")
        .select("*")
        .eq("user_id", user.id)
        .order("applied_at", { ascending: false })
        .limit(10);
      setApplications((appData?.length ? appData : mockAppData) as any[]);

      // Load subscription
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .single();
      setSubscription(subData || mockSubscription);

      setLoading(false);
    }
    loadData();
  }, [user]);

  // Calculate stats
  const totalApplications = applications.length;
  const atsPassed = applications.filter(a => a.status === "ATS Lolos" || a.status === "Callback" || a.status === "Interview" || a.status === "Offer").length;
  const callbacks = applications.filter(a => a.status === "Callback" || a.status === "Interview" || a.status === "Offer").length;
  const goldenHits = applications.filter(a => a.is_golden).length;
  const atsRate = totalApplications > 0 ? Math.round((atsPassed / totalApplications) * 100) : 0;
  const quota = subscription?.monthly_quota || 10;
  const used = subscription?.used_quota || 0;

  const stats = [
    { label: "Lamaran Bulan Ini", value: totalApplications, suffix: "", target: quota, icon: Rocket, tone: "primary", delta: "+" + totalApplications },
    { label: "ATS Pass Rate", value: atsRate, suffix: "%", icon: Target, tone: "teal", delta: atsRate + "%" },
    { label: "Interview Callbacks", value: callbacks, suffix: "", icon: CalendarCheck, tone: "gold", delta: "+" + callbacks },
    { label: "Golden Window Hits", value: goldenHits, suffix: "", icon: Zap, tone: "warm", delta: "+" + goldenHits },
  ];

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell rightPanel={<RightPanel notifications={[]} quota={quota} used={used} />}>
      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Selamat datang, {displayName} 👋</h1>
        <p className="text-muted-foreground mt-1">Agen kamu sudah mengirim <span className="text-foreground font-semibold">{totalApplications} lamaran</span>.</p>
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
        </div>
        {applications.length > 0 ? (
          <ul className="mt-5 divide-y divide-black/[5%]">
            {applications.map((a, i) => (
              <li key={a.id || i} className="py-3 flex items-center gap-3 hover:bg-black/[2%] -mx-2 px-2 rounded-lg transition">
                <div className="h-10 w-10 rounded-lg gradient-primary grid place-items-center text-white text-sm font-bold shrink-0">{a.company_name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate">{a.company_name}</p>
                    {a.is_golden && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#D2F801] text-[#161616] border-[#D2F801]">⚡ Golden</span>}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{a.role_title}</p>
                </div>
                <div className="hidden md:flex items-center gap-2">
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border font-semibold ${platformColors[a.platform] || 'bg-gray-200 text-gray-700'}`}>{a.platform}</span>
                </div>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border font-semibold whitespace-nowrap ${statusColors[a.status] || 'bg-gray-200 text-gray-700'}`}>{a.status}</span>
                <span className="hidden md:block text-xs text-muted-foreground w-20 text-right shrink-0">{new Date(a.applied_at).toLocaleDateString('id-ID')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-5 text-center py-8">
            <p className="text-muted-foreground">Belum ada lamaran. Mulai cari pekerjaan di <a href="/jobs" className="text-primary font-semibold">Job Feed</a>!</p>
          </div>
        )}
      </section>

      {/* ATS Heatmap */}
      <section className="mt-6 glass rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">ATS Intelligence</h2>
            <p className="text-xs text-muted-foreground">Berdasarkan 12.400+ data lamaran komunitas</p>
          </div>
          <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-[#D2F801] text-[#161616] border-[#D2F801]">Live</span>
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
                <tr key={c as string} className="border-t border-black/[5%]">
                  <td className="py-3 pr-4 font-medium">{c}</td>
                  <td className="py-3 pr-4 text-muted-foreground font-mono text-xs">{a}</td>
                  <td className="py-3 pr-4 w-[40%]">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 bg-black/[5%] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${(m as number)>=80?'bg-[#D2F801]':(m as number)>=60?'bg-[#0367FC]':'bg-[#DC2626]'}`} style={{width:`${m}%`}}/>
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

const platformColors: Record<string, string> = {
  LinkedIn: "bg-[#0A66C2] text-white border-[#0A66C2]",
  Jobstreet: "bg-[#E8192C] text-white border-[#E8192C]",
  Glints: "bg-[#0BD461] text-[#161616] border-[#0BD461]",
  KitaLulus: "bg-[#FF6B00] text-white border-[#FF6B00]",
  Kalibrr: "bg-[#2563EB] text-white border-[#2563EB]",
  Dealls: "bg-[#6366F1] text-white border-[#6366F1]",
  "Facebook Groups": "bg-[#1877F2] text-white border-[#1877F2]",
};

const statusColors: Record<string, string> = {
  Terkirim: "bg-[#0367FC] text-white border-[#0367FC]",
  "ATS Lolos": "bg-[#D2F801] text-[#161616] border-[#D2F801]",
  Callback: "bg-[#161616] text-white border-[#161616]",
  Interview: "bg-[#161616] text-white border-[#161616]",
  Offer: "bg-[#D2F801] text-[#161616] border-[#D2F801]",
  Manual: "bg-[#F0F0F0] text-[#161616] border-[#E0E0E0]",
  Ditolak: "bg-[#DC2626] text-white border-[#DC2626]",
};

function StatCard({ label, value, suffix, target, icon: Icon, tone, delta, delay }: any) {
  const [n, setN] = useState(0);
  useEffect(() => { const t = setTimeout(() => setN(value), 80 + delay); return () => clearTimeout(t); }, [value, delay]);
  const color = tone==='teal'?'text-[#0367FC]':tone==='gold'?'text-[#D2F801]':tone==='warm'?'text-[#D2F801]':'text-[#0367FC]';
  return (
    <div className="glass rounded-2xl p-4 md:p-5 hover:scale-[1.02] transition group" style={{animation:`fade-up .5s both ${delay}ms`}}>
      <div className="flex items-start justify-between">
        <div className={`h-9 w-9 rounded-lg grid place-items-center bg-black/[4%] border border-black/[8%] ${color}`}><Icon className="h-4 w-4" /></div>
        <span className="text-[10px] uppercase tracking-wider text-[#0367FC] font-mono flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />{delta}</span>
      </div>
      <p className="mt-4 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={`font-mono text-2xl md:text-3xl font-bold mt-1 ${color} transition-all`}>{Math.round(n)}{suffix}</p>
      {target && (
        <div className="mt-3 h-1 bg-black/[5%] rounded-full overflow-hidden">
          <div className="h-full bg-[#0367FC] rounded-full transition-all duration-1000" style={{width:`${Math.min((value/target)*100, 100)}%`}}/>
        </div>
      )}
    </div>
  );
}

function RightPanel({ notifications, quota, used }: { notifications: any[], quota: number, used: number }) {
  return (
    <div className="space-y-5 sticky top-6">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /> Notifikasi Live</h3>
          <span className="text-xs text-primary">Lihat semua</span>
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
          <div className="h-8 w-8 rounded-lg bg-[#0367FC] grid place-items-center"><Award className="h-4 w-4 text-white" /></div>
          <p className="text-xs uppercase tracking-wider text-[#0367FC] font-semibold">Skill Gap Alert</p>
        </div>
        <p className="text-sm font-semibold leading-snug"><span className="font-mono text-[#0367FC]">FastAPI</span> trending <span className="text-[#D2F801]">+171%</span> minggu ini di posisi Backend.</p>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">Pelajari di Dicoding <ArrowUpRight className="h-3 w-3"/></span>
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Kuota Bulan Ini</span>
          <span className="font-mono"><span className="text-foreground font-bold">{used}</span> / {quota}</span>
        </div>
        <div className="mt-2 h-2 bg-black/[5%] rounded-full overflow-hidden">
          <div className="h-full bg-[#0367FC] rounded-full" style={{width:`${Math.min((used/quota)*100, 100)}%`}}/>
        </div>
        <button className="mt-3 w-full h-9 rounded-lg bg-[#0367FC] text-white text-xs font-semibold hover:opacity-90 transition">Upgrade ke Pro</button>
      </div>
    </div>
  );
}
