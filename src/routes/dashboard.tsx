import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { Bot, Zap, Send, Search, Leaf, Settings, ChevronRight, CheckCircle2, FileText, AlertCircle, ShieldCheck, Circle, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
// Sample data is only for the explicit demo mode (VITE_MOCK_MODE=true). A real account sees its own rows
// or an honest empty state, never sample numbers.
import { mockProfile as mockProfileData, mockSubscription, mockAIApplications } from "@/mocks/mockData";
import { profileService } from "@/services/profileService";
import { needsOnboarding } from "@/lib/onboarding";
import { buildChecklist, type Checklist } from "@/lib/onboardingChecklist";
import { describeError } from "@/lib/authErrors";
import { parseQuotaStatus, type QuotaSummary } from "@/lib/quotaStatus";
import { recentActivity, relativeTime, summarizeApplications, type DashApplication, type DashStatus } from "@/lib/dashboardStats";
import { automationApi } from "@/services/automationApi";
import { EMPTY_URGENT_SUMMARY as EMPTY_URGENT, summarizeUrgentActions, type UrgentActionsSummary } from "@/lib/dashboardUrgent";
import { APPROVAL_HISTORY_LIMIT } from "@/lib/approvalTabs";
import type { ApprovalLike } from "@/lib/emailApply";
import { loadEmailApplyData } from "@/services/emailApplyService";
import { loginSearchWithRedirect } from "@/lib/authRedirect";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async ({ location }) => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login", search: loginSearchWithRedirect(location) });
  },
  head: () => ({ meta: [{ title: "Beranda — Applify" }] }),
  component: DashboardPage,
});

function CountUp({ to, duration = 1500 }: { to: number; duration?: number }) {
  // Angka langsung tampil tanpa hitung naik bila pengguna meminta gerak dikurangi (prefers-reduced-motion).
  const reduceMotion = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const remotion = (typeof window !== "undefined" && (window as any).__REMOTION_STATIC__) || reduceMotion;
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

function statusStyle(status: DashStatus): { dot: string; bg: string } {
  switch (status) {
    case "submitted": return { dot: "bg-[#0A5BE0]", bg: "bg-blue-50 border-blue-200 text-blue-700" };
    case "follow_up": return { dot: "bg-[#F59E0B]", bg: "bg-amber-50 border-amber-200 text-amber-800" };
    case "responded": return { dot: "bg-[#14B8A6]", bg: "bg-teal-50 border-teal-200 text-teal-700" };
    default: return { dot: "bg-neutral-400", bg: "bg-neutral-100 border-neutral-200 text-neutral-700" };
  }
}

export function DashboardPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [applications, setApplications] = useState<DashApplication[]>([]);
  // true bila profil belum lengkap; null = belum diketahui (jangan tampilkan ajakan yang bisa salah)
  const [profileIncomplete, setProfileIncomplete] = useState<boolean | null>(null);
  // Fakta checklist pengguna baru: CV terunggah dan jumlah persetujuan yang disetujui. null = belum diketahui.
  const [hasResume, setHasResume] = useState<boolean | null>(null);
  const [approvedCount, setApprovedCount] = useState<number | null>(null);
  // null = unknown (the call failed or there is no data), so the ring shows a dash instead of a made-up number
  const [quota, setQuota] = useState<QuotaSummary | null>(null);
  const [urgent, setUrgent] = useState<UrgentActionsSummary>(EMPTY_URGENT);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    async function loadData() {
      if (!user?.id) {
        // BS-07: bersihkan state akun lama saat logout di tab lain agar tidak tertinggal di layar.
        setProfile(null);
        setApplications([]);
        setProfileIncomplete(null);
        setHasResume(null);
        setApprovedCount(null);
        setQuota(null);
        setUrgent(EMPTY_URGENT);
        setLoadError("");
        setLoading(false);
        return;
      }
      setLoadError("");
      if (isMockMode()) {
        setProfile(mockProfileData);
        setApplications(mockAIApplications as unknown as DashApplication[]);
        setProfileIncomplete(false);
        setHasResume(true);
        setApprovedCount(1);
        setUrgent(EMPTY_URGENT);
        setQuota({ quota: mockSubscription.monthly_quota, used: mockSubscription.used_quota, remaining: mockSubscription.monthly_quota - mockSubscription.used_quota, allowed: true });
        setLoading(false);
        return;
      }
      try {
        // Same sources as the rest of the app: drafts and their status live in ai_applications (joined to
        // jobs), the monthly draft quota comes from the get_quota_status function the Edge Function uses.
        const [p, apps, q, summary, approvedRes] = await Promise.all([
          supabase.from("profiles").select("full_name, resume_url").eq("id", user.id).maybeSingle(),
          supabase
            .from("ai_applications")
            .select("id, status, submitted_at, created_at, jobs(title, company)")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(500),
          supabase.rpc("get_quota_status", { p_user_id: user.id }),
          // Gagal membaca ringkasan profil tidak boleh memblokir dashboard: cukup tidak menampilkan ajakan.
          profileService.getSummary(user.id).then((x) => needsOnboarding(x), () => null),
          // Langkah "Periksa dan setujui" di checklist: cukup jumlahnya. Galat = belum diketahui, bukan 0.
          supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "approved"),
        ]);
        if (apps.error) throw new Error(apps.error.message);
        setProfile(p.data ?? null);
        setApplications((apps.data ?? []) as unknown as DashApplication[]);
        setProfileIncomplete(summary);
        setHasResume(p.error ? null : !!(p.data as { resume_url?: string | null } | null)?.resume_url);
        setApprovedCount(approvedRes.error ? null : approvedRes.count ?? 0);
        setQuota(q.error ? null : parseQuotaStatus(q.data));
      } catch (err) {
        console.error("Dashboard load failed:", err);
        setLoadError(describeError(err, "Data belum bisa dimuat."));
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user, reloadKey]);

  // E2E-06: banner Tindakan mendesak dimuat terpisah dari data utama. Persetujuan pending datang dari backend
  // (Railway) yang bisa lambat atau tertidur, jadi Beranda tidak boleh menunggunya. Dimuat sekali per login dan per
  // "Coba lagi", tanpa polling. Hanya membaca.
  // Angkanya harus sama dengan kartu di tab Menunggu halaman Persetujuan (audit 26 November 2026: kartu Binance
  // "Perlu dicek" ada di Menunggu, tetapi banner tidak menyebutnya). Karena itu datanya dibaca oleh pemuat yang sama
  // (loadEmailApplyData: log agen, klaim, tugas email, lowongan, dengan RLS ke baris milik sendiri), dengan batas Riwayat
  // yang sama, dan kartunya ditempatkan oleh fungsi yang sama (splitApprovalTabs lewat summarizeUrgentActions).
  const userId = user?.id;
  useEffect(() => {
    if (!userId || isMockMode()) return;
    let cancelled = false;
    (async () => {
      try {
        const [pendingApprovals, history] = await Promise.all([
          automationApi.getPendingApprovals().catch(() => []),
          // Gagal = tanpa persetujuan yang sudah disetujui: banner hanya menghitung draf pending.
          automationApi.getApprovalHistory({ limit: APPROVAL_HISTORY_LIMIT }).catch(() => undefined),
        ]);
        // Gagal = status agen belum terbaca, sama seperti halaman Persetujuan: tidak ada kartu disetujui yang dihitung.
        const data = Array.isArray(history)
          ? await loadEmailApplyData(history as unknown as ApprovalLike[], { placementOnly: true }).catch(() => undefined)
          : undefined;
        if (cancelled) return;
        setUrgent(summarizeUrgentActions({ pendingApprovals, history, data }));
      } catch (err) {
        // Banner hanya pelengkap: gagal dimuat berarti tidak tampil, bukan galat di Beranda.
        console.warn("Urgent actions load skipped:", err);
        if (!cancelled) setUrgent(EMPTY_URGENT);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reloadKey]);

  if (loading) {
    return (
      <AppShell>
        <div role="status" className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
          <div className="relative w-12 h-12 flex items-center justify-center" aria-hidden="true">
            <div className="absolute inset-0 border-2 border-neutral-200 rounded-full" />
            <div className="absolute inset-0 border-2 border-[#A3E635] rounded-full border-t-transparent animate-spin" />
            <Bot className="w-5 h-5 text-neutral-400" />
          </div>
          <p className="text-sm text-neutral-600">Memuat ringkasanmu...</p>
        </div>
      </AppShell>
    );
  }

  const name = profile?.full_name || user?.email?.split("@")[0] || "Pengguna";
  const stats = summarizeApplications(applications);
  const checklist = buildChecklist({
    profileComplete: profileIncomplete === null ? null : !profileIncomplete,
    hasResume,
    drafts: stats.total,
    approved: approvedCount,
    sent: stats.sent,
  });
  const activity = recentActivity(applications, 6);

  const C = 2 * Math.PI * 18;
  const ringOffset = quota ? C - Math.min(quota.used / Math.max(quota.quota, 1), 1) * C : C;

  return (
    <AppShell>
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-10">
        {/* Top row: greeting + quota */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 opacity-0 animate-dbFadeUp">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-neutral-900 text-white text-xs font-bold shadow-sm">
              <Zap className="text-[#A3E635] w-3.5 h-3.5" aria-hidden="true" /> Tahap uji coba
            </div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold text-neutral-900 mt-4 tracking-tight">Halo, {name}.</h1>
            <p className="font-sans text-neutral-500 mt-1.5 text-sm sm:text-base">Berikut ringkasan lamaran di akunmu.</p>
            {isMockMode() && <p className="mt-2 inline-block text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">Mode demo: data contoh</p>}
          </div>
          <div className="glass-solid rounded-2xl p-3 flex items-center gap-4 min-w-[200px] hover:shadow-md transition-shadow">
            <div className="relative w-12 h-12 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48" aria-hidden="true">
                <circle cx="24" cy="24" r="18" fill="none" stroke="#f5f5f5" strokeWidth="4" />
                <circle cx="24" cy="24" r="18" fill="none" stroke="#A3E635" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={ringOffset} className="transition-all duration-1000 ease-out" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-xs text-neutral-900">{quota ? quota.remaining : "-"}</div>
            </div>
            <div>
              <p className="font-display text-sm font-bold text-neutral-900">Sisa draf AI bulan ini</p>
              <p className="font-sans text-xs text-neutral-600 mt-0.5">{quota ? `Bulan ini, terpakai ${quota.used} dari ${quota.quota}` : "Tidak diketahui"}</p>
            </div>
          </div>
        </div>

        {loadError && (
          <div role="alert" className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-sm text-red-700 flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" /> Data lamaran belum bisa dimuat. {loadError} Angka di bawah belum tentu benar.</span>
            <button type="button" onClick={() => { setLoading(true); setReloadKey((k) => k + 1); }} className="min-h-11 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold shrink-0">Coba lagi</button>
          </div>
        )}

        {/* E2E-06: Tampilkan tindakan mendesak yang perlu segera diperiksa pengguna */}
        {!loadError && urgent.total > 0 && (
          <section
            data-testid="dashboard-urgent-actions"
            aria-label="Tindakan mendesak"
            className="rounded-2xl border-2 border-amber-300 bg-amber-50/90 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <p className="font-display text-base font-bold text-amber-950 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                Ada {urgent.total} tindakan yang perlu segera dicek
              </p>
              <ul className="text-sm text-amber-900 space-y-0.5">
                {urgent.awaitingCodeCount > 0 && (
                  <li>{urgent.awaitingCodeCount} lamaran menunggu kode keamanan dari emailmu.</li>
                )}
                {urgent.pendingQuestionsCount > 0 && (
                  <li>{urgent.pendingQuestionsCount} lamaran menunggu jawaban pertanyaan formulir untuk agen.</li>
                )}
                {urgent.unverifiedCount > 0 && (
                  <li>{urgent.unverifiedCount} lamaran perlu dicek: kirim belum terkonfirmasi.</li>
                )}
                {urgent.pendingApprovalsCount > 0 && (
                  <li>{urgent.pendingApprovalsCount} draf menunggu persetujuanmu.</li>
                )}
              </ul>
            </div>
            <Link
              to="/approvals"
              className="min-h-11 shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-[#16150F] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition"
            >
              Tinjau di Persetujuan
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </section>
        )}

        {/* Pengguna baru: satu daftar langkah berurutan dengan satu ajakan utama (catatan 41, ON-01). Hilang bila semua selesai. */}
        {!loadError && !checklist.complete && <OnboardingChecklist checklist={checklist} />}

        {/* Mission Control diorama. Akun tanpa lamaran tidak diberi tiga bulatan 0 (ON-18): checklist di atas yang menunjuk langkahnya. */}
        {(stats.total > 0 || loadError) && (
          <MissionControlStage drafts={stats.drafts} ready={stats.ready} sent={stats.sent} responded={stats.responded} followUp={stats.followUp} empty={false} />
        )}
        {applications.length >= 500 && (
          <p role="status" className="text-xs text-neutral-600 text-right">
            Ringkasan menghitung hingga 500 lamaran terbaru. Buka menu Lamaran untuk melihat riwayat lengkap.
          </p>
        )}

        {/* Bottom: activity log + quick actions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 opacity-0 animate-dbFadeUp" style={{ animationDelay: "300ms" }}>
          <div className="lg:col-span-8 glass-solid rounded-3xl p-6 sm:p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-display text-lg font-bold text-neutral-900">Aktivitas terbaru</h2>
              <Link to="/applications" className="min-h-11 text-sm font-bold text-[#0A5BE0] inline-flex items-center gap-1 hover:underline">Lihat semua <ChevronRight className="w-4 h-4" aria-hidden="true" /></Link>
            </div>
            {activity.length > 0 ? (
              <div className="space-y-3">
                {activity.map((a) => {
                  const st = statusStyle(a.status);
                  return (
                    <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border-2 border-neutral-200 bg-neutral-50/50 hover:bg-white hover:shadow-md hover:scale-[1.01] transition-all duration-300 gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white border-2 border-neutral-300 rounded-xl flex items-center justify-center shrink-0 shadow-sm" aria-hidden="true"><Bot className="w-5 h-5 text-neutral-600" /></div>
                        <div>
                          <p className="font-display font-bold text-neutral-900 text-sm">{a.title}</p>
                          <p className="font-sans text-xs text-neutral-500 mt-0.5">{a.company}{a.company && a.at ? <span className="mx-1">•</span> : null}{relativeTime(a.at)}</p>
                        </div>
                      </div>
                      <div className={`px-3 py-1.5 rounded-lg border shadow-sm flex items-center gap-2 w-fit ${st.bg}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${st.dot}`} aria-hidden="true" />
                        <span className="text-xs font-bold">{a.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 text-sm text-muted-foreground">
                {loadError ? "Aktivitas belum bisa dimuat." : (
                  <>
                    <p>Belum ada lamaran di akunmu. Lamaran pertamamu akan muncul di sini setelah kamu membuat draf dengan AI.</p>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 flex flex-col gap-3">
            <h2 className="font-display text-lg font-bold text-neutral-900 mb-1">Pintasan</h2>
            <Link to="/jobs" className="w-full min-h-11 flex items-center gap-4 p-5 bg-[#16150F] text-white rounded-2xl transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl group">
              <div className="w-10 h-10 bg-[#A3E635] text-[#16150F] rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 shadow-sm" aria-hidden="true"><Search className="w-5 h-5" /></div>
              <div className="text-left">
                <p className="font-display font-bold text-base leading-tight group-hover:text-[#A3E635] transition-colors">Cari lowongan</p>
                <p className="font-sans text-xs text-neutral-300 mt-1">Telusuri dan pilih lowongan sendiri</p>
              </div>
            </Link>
            <Link to="/approvals" className="w-full min-h-11 flex items-center gap-4 p-4 glass-solid rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-blue-300 group">
              <div className="w-10 h-10 bg-blue-50 border-2 border-blue-200 text-[#0A5BE0] rounded-xl flex items-center justify-center shrink-0" aria-hidden="true"><ShieldCheck className="w-5 h-5" /></div>
              <div className="text-left">
                <p className="font-display font-bold text-neutral-900 text-sm">Persetujuan</p>
                <p className="font-sans text-xs text-neutral-600 mt-0.5">Periksa dan setujui draf sebelum dikirim</p>
              </div>
            </Link>
            <Link to="/green-career" className="w-full min-h-11 flex items-center gap-4 p-4 glass-solid rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-emerald-300 group">
              <div className="w-10 h-10 bg-emerald-50 border-2 border-emerald-200 text-emerald-700 rounded-xl flex items-center justify-center shrink-0" aria-hidden="true"><Leaf className="w-5 h-5" /></div>
              <div className="text-left">
                <p className="font-display font-bold text-neutral-900 text-sm">Karier Hijau</p>
                <p className="font-sans text-xs text-neutral-600 mt-0.5">Lowongan di bidang lingkungan dan dampak sosial</p>
              </div>
            </Link>
            <Link to="/automation-settings" className="w-full min-h-11 flex items-center gap-4 p-4 glass-solid rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-neutral-400 group">
              <div className="w-10 h-10 bg-neutral-50 border-2 border-neutral-300 text-neutral-600 rounded-xl flex items-center justify-center shrink-0" aria-hidden="true"><Settings className="w-5 h-5" /></div>
              <div className="text-left">
                <p className="font-display font-bold text-neutral-900 text-sm">Pengaturan Agen</p>
                <p className="font-sans text-xs text-neutral-600 mt-0.5">Ubah data dan preferensi pencarian</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function OnboardingChecklist({ checklist }: { checklist: Checklist }) {
  const { steps, doneCount, total, next } = checklist;
  return (
    <section aria-labelledby="checklist-title" className="rounded-3xl border-2 border-[#0A5BE0]/30 bg-white p-5 sm:p-7 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="checklist-title" className="font-display text-xl font-bold text-neutral-900">Mulai melamar dengan Applify</h2>
        <p className="text-sm font-semibold text-neutral-600">{doneCount} dari {total} langkah selesai</p>
      </div>
      <p className="mt-1 text-sm text-neutral-600">Ikuti langkah ini berurutan. Tidak ada lamaran yang dikirim sebelum kamu menekan Setujui.</p>
      <div className="mt-3 h-2 w-full rounded-full bg-neutral-100" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount} aria-label="Kemajuan langkah awal">
        <div className="h-2 rounded-full bg-[#0A5BE0] transition-all" style={{ width: `${(doneCount / total) * 100}%` }} />
      </div>
      <ol className="mt-5 space-y-3">
        {steps.map((step, i) => {
          const isNext = next?.id === step.id;
          return (
            <li key={step.id} className={`flex items-start gap-3 rounded-2xl border-2 p-3 sm:p-4 ${isNext ? "border-[#0A5BE0] bg-[#0A5BE0]/[5%]" : "border-neutral-200"}`}>
              {step.done === true ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" aria-hidden="true" />
              ) : (
                <Circle className={`mt-0.5 h-5 w-5 shrink-0 ${isNext ? "text-[#0A5BE0]" : "text-neutral-400"}`} aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold ${step.done === true ? "text-neutral-500 line-through decoration-neutral-400" : "text-neutral-900"}`}>
                  {i + 1}. {step.title}
                  <span className="sr-only">{step.done === true ? " (selesai)" : step.done === null ? " (status belum terbaca)" : " (belum)"}</span>
                </p>
                {step.done !== true && <p className="mt-0.5 text-sm text-neutral-600">{step.detail}</p>}
                {isNext && (
                  <Link to={step.to} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A5BE0] px-5 text-sm font-semibold text-white hover:opacity-90">
                    {step.cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function MissionControlStage({ drafts, ready, sent, responded, followUp, empty }: { drafts: number; ready: number; sent: number; responded: number; followUp: number; empty: boolean }) {
  return (
    <section aria-label="Ringkasan lamaran" className="relative w-full flex flex-col items-center pt-8 pb-12 opacity-0 animate-dbFadeUp" style={{ animationDelay: "100ms" }}>
      <div aria-hidden="true" className="absolute inset-0 bg-tech-grid z-0 pointer-events-none" />
      <div aria-hidden="true" className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[250px] h-[250px] bg-[#A3E635]/10 rounded-full blur-[60px] z-0" />

      {/* Ilustrasi agen: dekoratif, tidak menunjukkan status agen yang sebenarnya */}
      <div aria-hidden="true" className="relative z-20 flex flex-col items-center group">
        <div className="relative animate-dbBotIdle transition-transform duration-500 group-hover:-translate-y-2">
          <div className="absolute -inset-4 border border-[#A3E635]/30 rounded-full animate-dbSpinSlow" />
          <div className="absolute -inset-8 border-2 border-neutral-300/80 rounded-full animate-dbSpinSlowRev" />
          <div className="w-20 h-20 bg-[#16150F] rounded-2xl border-2 border-neutral-800 shadow-[0_10px_30px_rgba(0,0,0,0.15)] flex items-center justify-center text-[#A3E635] relative z-10 transition-shadow duration-300 group-hover:shadow-[0_15px_40px_rgba(163,230,53,0.3)]">
            <Bot className="w-8 h-8 transition-transform duration-300 group-hover:scale-110" />
          </div>
        </div>
        <div className="mt-8 px-4 py-1.5 bg-neutral-900 text-white rounded-full text-xs font-semibold shadow-md transition-colors duration-300 group-hover:bg-[#A3E635] group-hover:text-[#16150F]">Agen Applify</div>
      </div>

      {/* umbilical cords */}
      <div aria-hidden="true" className="w-full max-w-2xl h-24 relative z-10 -mt-2 opacity-70">
        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 50">
          <path d="M 50,0 C 50,30 20,20 20,50" fill="none" stroke="#0A5BE0" strokeWidth="1.5" className="path-flow animate-dbDataFlow" />
          <path d="M 50,0 L 50,50" fill="none" stroke="#A3E635" strokeWidth="2" className="path-flow animate-dbDataFlow" strokeDasharray="8 6" />
          <path d="M 50,0 C 50,30 80,20 80,50" fill="none" stroke="#14B8A6" strokeWidth="1.5" className="path-flow animate-dbDataFlow" />
        </svg>
      </div>

      {/* stat orbs */}
      <div className="relative z-30 w-full max-w-3xl px-4 flex justify-between sm:justify-center sm:gap-12 lg:gap-24 -mt-4">
        <Orb icon={FileText} value={drafts} label="Draf" accent="#999999" delay={100} />
        <Orb icon={Send} value={sent} label="Terkirim" accent="#0A5BE0" delay={200} prominent />
        <Orb icon={CheckCircle2} value={responded} label="Dibalas" accent="#14B8A6" delay={300} />
      </div>
      {empty ? (
        <p className="relative z-30 mt-6 text-sm text-neutral-600 text-center max-w-md px-4">
          Belum ada lamaran, jadi semua angka masih 0. Angka dihitung dari draf dan lamaran nyata di akunmu.
        </p>
      ) : (
        <div className="relative z-30 mt-6 flex flex-wrap items-center justify-center gap-2 px-4">
          {/* Draf dan Siap dikirim dihitung terpisah, sama seperti dua kolom di papan Lamaran Saya */}
          {ready > 0 && (
            <Link to="/applications" className="text-xs font-bold text-neutral-700 bg-neutral-100 border border-neutral-300 rounded-full px-3 py-1 hover:underline">
              {ready} lamaran siap dikirim
            </Link>
          )}
          {followUp > 0 && (
            <Link to="/applications" className="text-xs font-bold text-[#B45309] bg-amber-50 border border-amber-200 rounded-full px-3 py-1 hover:underline">
              {followUp} lamaran perlu ditindaklanjuti
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function Orb({ icon: Icon, value, label, accent, delay, prominent = false }: { icon: any; value: number; label: string; accent: string; delay: number; prominent?: boolean }) {
  return (
    <div className={`flex flex-col items-center opacity-0 animate-dbPopIn group ${prominent ? "-mt-6" : ""}`} style={{ animationDelay: `${delay}ms` }}>
      <div
        className={`bg-white rounded-full glass-solid flex flex-col items-center justify-center relative transition-all duration-300 ease-out group-hover:-translate-y-3 ${prominent ? "w-28 h-28 sm:w-32 sm:h-32" : "w-24 h-24 sm:w-28 sm:h-28"}`}
        style={{ borderBottom: `4px solid ${accent}`, boxShadow: prominent ? `0 10px 25px ${accent}26` : undefined }}
      >
        <Icon aria-hidden="true" className={`${prominent ? "w-7 h-7 sm:w-8 sm:h-8 mb-2" : "w-6 h-6 sm:w-7 sm:h-7 mb-1.5"} transition-transform duration-300 group-hover:scale-110`} style={{ color: accent }} />
        <h3 className={`font-display font-extrabold text-neutral-900 leading-none ${prominent ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl"}`}><CountUp to={value} /></h3>
      </div>
      <p className="font-sans font-bold text-xs sm:text-sm text-neutral-600 mt-4 transition-colors">{label}</p>
    </div>
  );
}
