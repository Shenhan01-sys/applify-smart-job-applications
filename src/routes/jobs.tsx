import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { AIJobScanner } from "@/components/AIJobScanner";
import { AIApplyModal } from "@/components/AIApplyModal";
import { JobCard, type JobData } from "@/components/JobCard";
import { Search, SlidersHorizontal, Zap, Loader2, Brain, Crown, Sparkles, Target } from "lucide-react";
import { parseQuotaStatus } from "@/lib/quotaStatus";
// Sample jobs, saved ids and quota exist only for the explicit demo mode (VITE_MOCK_MODE=true).
import { mockJobs as mockJobsData, mockSavedJobIds, mockSubscription } from "@/mocks/mockData";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/jobs")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Job Feed — Applify" }] }),
  component: JobsPage,
});

function JobsPage() {
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [showScanner, setShowScanner] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);
  const [userTier, setUserTier] = useState<"free" | "pro">("free");
  // Monthly AI-draft quota (get_quota_status). null = not known, so nothing is shown instead of a guess.
  const [draftQuota, setDraftQuota] = useState<{ remaining: number; quota: number } | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (isMockMode()) {
      setJobs(mockJobsData as JobData[]);
      setSavedJobs(new Set(mockSavedJobIds));
      setUserTier(mockSubscription.ai_model_tier as "free" | "pro");
      setDraftQuota({ quota: mockSubscription.monthly_quota, remaining: mockSubscription.monthly_quota - mockSubscription.used_quota });
      setLoading(false);
      return;
    }
    fetchJobs();
    fetchSavedJobs();
    loadUserTier();
  }, []);

  const loadUserTier = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Same source as the draft modal and the Edge Function: the plan is subscriptions.ai_model_tier, the
      // monthly draft quota comes from get_quota_status (daily_apply_quota is only its limit column).
      const [{ data: sub }, { data: status, error }] = await Promise.all([
        supabase.from("subscriptions").select("ai_model_tier").eq("user_id", user.id).maybeSingle(),
        supabase.rpc("get_quota_status", { p_user_id: user.id }),
      ]);
      setUserTier(sub?.ai_model_tier === "pro" ? "pro" : "free");
      if (error) {
        setDraftQuota(null);
      } else {
        const q = parseQuotaStatus(status);
        setDraftQuota({ remaining: q.remaining, quota: q.quota });
      }
    } catch (err) {
      console.error("Error loading tier:", err);
      setDraftQuota(null);
    }
  };

  const fetchJobs = async () => {
    try {
      setLoadError("");
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("status", "active")
        .order("match_score", { ascending: false })
        .limit(50);

      if (error) throw error;
      // No sample fallback for a real account: an empty table is an empty feed.
      setJobs((data ?? []) as JobData[]);
    } catch (err: any) {
      console.error("Error fetching jobs:", err);
      setJobs([]);
      setLoadError(err?.message || "Tidak dapat memuat lowongan.");
    } finally {
      setLoading(false);
    }
  };

  const fetchSavedJobs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("saved_jobs")
        .select("job_id")
        .eq("user_id", user.id);

      if (error) throw error;
      setSavedJobs(new Set(data?.map((j) => j.job_id) || []));
    } catch (err) {
      console.error("Error fetching saved jobs:", err);
      setSavedJobs(new Set());
    }
  };

  const toggleSaveJob = async (jobId: string) => {
    if (isMockMode()) {
      setSavedJobs((prev) => {
        const next = new Set(prev);
        next.has(jobId) ? next.delete(jobId) : next.add(jobId);
        return next;
      });
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (savedJobs.has(jobId)) {
        await supabase
          .from("saved_jobs")
          .delete()
          .eq("user_id", user.id)
          .eq("job_id", jobId);
        setSavedJobs((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      } else {
        await supabase.from("saved_jobs").insert({
          user_id: user.id,
          job_id: jobId,
        });
        setSavedJobs((prev) => new Set(prev).add(jobId));
      }
    } catch (err) {
      console.error("Error toggling save:", err);
    }
  };

  const handleApply = (job: JobData) => {
    setSelectedJob(job);
    setShowApplyModal(true);
  };

  // Filter jobs
  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      !searchQuery ||
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.location.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "remote" && job.workplace_type === "remote") ||
      (activeFilter === "hybrid" && job.workplace_type === "hybrid") ||
      (activeFilter === "onsite" && job.workplace_type === "on-site") ||
      (activeFilter === "high-match" && job.match_score >= 80) ||
      (activeFilter === "saved" && savedJobs.has(job.id));

    return matchesSearch && matchesFilter;
  });

  // Active jobs with match score >= 85. This is only a count of strong matches, not the planned "Golden Window Sniper".
  const goldenWindows = jobs.filter((j) => j.match_score >= 85 && j.status === "active").length;

  return (
    <AppShell>
      <header className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">AI Job Discovery</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {jobs.length > 0
                ? `${jobs.length} lowongan tersimpan dari sumber yang didukung`
                : "Cari lowongan dengan AI Job Scanner"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Tier Badge */}
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
              userTier === "pro" 
                ? "bg-[#D2F801] text-[#16150F]" 
                : "bg-[#F5F5F5] text-muted-foreground border-2 border-[#999999]"
            }`}>
              {userTier === "pro" ? <Crown className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {userTier === "pro" ? "PRO" : "FREE"}
            </span>
            {/* Quota */}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0A5BE0]/10 text-[#0A5BE0] px-3 py-1.5 text-xs font-bold">
              <Target className="h-3.5 w-3.5" />
              {draftQuota ? `${draftQuota.remaining} draf tersisa bulan ini` : "Kuota draf tidak diketahui"}
            </span>
            {goldenWindows > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D2F801] text-[#16150F] px-3 py-1.5 text-xs font-bold">
                <Zap className="h-3.5 w-3.5" /> {goldenWindows} kecocokan tinggi
              </span>
            )}
          </div>
        </div>

        {/* AI Scanner Toggle */}
        <div className="mt-5">
          <button
            onClick={() => setShowScanner(!showScanner)}
            className="w-full h-12 rounded-xl border-2 border-[#0A5BE0] bg-[#0A5BE0]/5 text-[#0A5BE0] font-semibold text-sm hover:bg-[#0A5BE0]/10 transition flex items-center justify-center gap-2"
          >
            <Brain className="h-4 w-4" />
            {showScanner ? "Sembunyikan AI Scanner" : "Buka AI Job Scanner"}
          </button>
        </div>

        {showScanner && (
          <div className="mt-4">
            <AIJobScanner onComplete={() => { fetchJobs(); setShowScanner(false); }} />
          </div>
        )}

        {/* Search & Filters */}
        <div className="mt-5 flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Cari posisi, perusahaan, atau skill..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border-2 border-[#999999] pl-11 pr-4 h-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-[#0A5BE0] bg-white"
            />
          </div>
          <button className="h-12 px-5 rounded-xl border-2 border-[#999999] inline-flex items-center gap-2 text-sm hover:border-[#0A5BE0] transition bg-white">
            <SlidersHorizontal className="h-4 w-4" /> Filter
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { key: "all", label: "Semua" },
            { key: "remote", label: "Remote" },
            { key: "hybrid", label: "Hybrid" },
            { key: "onsite", label: "On-site" },
            { key: "high-match", label: "Match ≥ 80%" },
            { key: "saved", label: "Tersimpan" },
          ].map((filter) => (
            <button
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              className={`text-xs px-3 py-1.5 rounded-full border-2 transition ${
                activeFilter === filter.key
                  ? "bg-[#0A5BE0] text-white border-[#0A5BE0]"
                  : "border-[#999999] text-muted-foreground hover:text-foreground hover:border-[#0A5BE0]"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </header>

      {/* Jobs List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0]" />
          <span className="ml-3 text-muted-foreground">Memuat lowongan...</span>
        </div>
      ) : filteredJobs.length > 0 ? (
        <div className="space-y-4">
          {filteredJobs.map((job, i) => (
            <div key={job.id} style={{ animation: `fadeInUp 0.35s ease-out ${i * 0.05}s both` }}>
              <JobCard
                job={job}
                isSaved={savedJobs.has(job.id)}
                onToggleSave={() => toggleSaveJob(job.id)}
                onApply={() => handleApply(job)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Brain className="h-12 w-12 mx-auto text-[#999999] mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {jobs.length === 0 ? "Belum ada lowongan" : "Tidak ada lowongan yang cocok"}
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            {loadError
              ? `Lowongan tidak dapat dimuat (${loadError}).`
              : jobs.length === 0
                ? "Belum ada lowongan tersimpan. Buka AI Job Scanner di atas untuk mencari lowongan dari sumber yang didukung."
                : "Coba ubah filter atau kata kunci pencarian."}
          </p>
          {loadError && (
            <button
              onClick={() => { setLoading(true); fetchJobs(); }}
              className="h-11 px-6 rounded-xl bg-[#0A5BE0] text-white font-semibold text-sm hover:opacity-90 transition"
            >
              Coba lagi
            </button>
          )}
        </div>
      )}

      {/* AI Apply Modal */}
      {showApplyModal && selectedJob && (
        <AIApplyModal
          jobId={selectedJob.id}
          jobTitle={selectedJob.title}
          company={selectedJob.company}
          jobData={selectedJob}
          onClose={() => { setShowApplyModal(false); setSelectedJob(null); }}
          onSuccess={() => { fetchJobs(); loadUserTier(); }}
        />
      )}
    </AppShell>
  );
}
