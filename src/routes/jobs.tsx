import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { AIJobScanner } from "@/components/AIJobScanner";
import { AIApplyModal } from "@/components/AIApplyModal";
import { JobCard, type JobData } from "@/components/JobCard";
import { Search, SlidersHorizontal, Zap, Loader2, Brain, Crown, Sparkles, Target } from "lucide-react";
import { mockJobs as mockJobsData, mockSavedJobIds, mockSubscription, MOCK_USER_ID } from "@/mocks/mockData";

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
  const [remainingQuota, setRemainingQuota] = useState(10);

  useEffect(() => {
    if (isMockMode()) {
      setJobs(mockJobsData as JobData[]);
      setSavedJobs(new Set(mockSavedJobIds));
      setUserTier(mockSubscription.ai_model_tier as "free" | "pro");
      setRemainingQuota(mockSubscription.daily_apply_quota);
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
      const { data } = await supabase
        .from("subscriptions")
        .select("ai_model_tier, daily_apply_quota")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setUserTier(data.ai_model_tier as "free" | "pro");
        setRemainingQuota(data.daily_apply_quota);
      } else {
        setUserTier(mockSubscription.ai_model_tier as "free" | "pro");
        setRemainingQuota(mockSubscription.daily_apply_quota);
      }
    } catch (err) {
      console.error("Error loading tier:", err);
      setUserTier(mockSubscription.ai_model_tier as "free" | "pro");
      setRemainingQuota(mockSubscription.daily_apply_quota);
    }
  };

  const fetchJobs = async () => {
    try {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("status", "active")
        .order("match_score", { ascending: false })
        .limit(50);

      if (error) throw error;
      setJobs((data?.length ? data : mockJobsData) as JobData[]);
    } catch (err) {
      console.error("Error fetching jobs:", err);
      setJobs(mockJobsData as JobData[]);
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
      setSavedJobs(new Set(mockSavedJobIds));
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

  // Generate mock jobs if none exist (for non-mock mode)
  const generateMockJobs = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const mockJobs = [
        {
          title: "Senior Backend Engineer",
          company: "Gojek",
          location: "Jakarta",
          type: "full-time",
          workplace_type: "hybrid",
          salary_min: 35000000,
          salary_max: 50000000,
          salary_currency: "IDR",
          salary_period: "monthly",
          description: "We are looking for a Senior Backend Engineer to join our growing team. You will be responsible for designing and implementing scalable backend services.",
          requirements: ["5+ years experience with Go/Node.js", "Experience with microservices architecture", "Strong knowledge of PostgreSQL and Redis", "Experience with AWS/GCP"],
          responsibilities: ["Design and implement backend services", "Optimize database performance", "Mentor junior developers", "Collaborate with product team"],
          benefits: ["Health insurance", "Remote work options", "Learning budget", "Stock options"],
          platform_source: "LinkedIn",
          match_score: 92,
          acceptance_potential: 85,
          company_culture_score: 88,
          growth_potential: 90,
          ai_strategy: "AI akan mengoptimasi CV kamu dengan menekankan pengalaman backend dan leadership. Cover letter akan disesuaikan dengan kultur Gojek yang agile. AI juga akan follow-up 3 hari setelah lamaran untuk memaksimalkan visibility.",
          ai_actions: [
            { step: 1, title: "CV Optimization", description: "Menyesuaikan CV dengan keywords dari job description", status: "pending", estimated_time: "2 menit" },
            { step: 2, title: "Cover Letter AI", description: "Generate cover letter yang personal dan relevan", status: "pending", estimated_time: "3 menit" },
            { step: 3, title: "Auto-Submit", description: "Mengisi form lamaran dan submit otomatis", status: "pending", estimated_time: "1 menit" },
            { step: 4, title: "Follow-up Strategy", description: "Schedule follow-up email 3 hari kemudian", status: "pending", estimated_time: "30 detik" },
          ],
          skill_gaps: [{ skill: "Go Language", required_level: 8, user_level: 6, gap: 2 }],
          skill_matches: [
            { skill: "Backend Tech", level: 90, matched: true },
            { skill: "Experience", level: 85, matched: true },
            { skill: "Education", level: 80, matched: true },
            { skill: "Soft Skills", level: 88, matched: true },
            { skill: "Language", level: 85, matched: true },
            { skill: "Tools", level: 75, matched: true },
          ],
          salary_benchmark: { market_average: 42000000, market_high: 60000000, market_low: 28000000, percentile: 65 },
          status: "active",
          posted_at: new Date().toISOString(),
        },
        {
          title: "Product Manager - Fintech",
          company: "Tokopedia",
          location: "Jakarta",
          type: "full-time",
          workplace_type: "hybrid",
          salary_min: 40000000,
          salary_max: 60000000,
          salary_currency: "IDR",
          salary_period: "monthly",
          description: "Lead product development for our fintech initiatives. You will work cross-functionally to deliver products that impact millions of users.",
          requirements: ["4+ years in product management", "Experience in fintech/payments", "Data-driven decision making", "Strong stakeholder management"],
          responsibilities: ["Define product roadmap", "Analyze user data and metrics", "Coordinate with engineering and design", "Present to leadership"],
          benefits: ["Competitive salary", "Performance bonus", "Health & dental", "Flexible working hours"],
          platform_source: "Jobstreet",
          match_score: 84,
          acceptance_potential: 72,
          company_culture_score: 82,
          growth_potential: 88,
          ai_strategy: "AI akan menyoroti pengalaman product management dan data analysis kamu. Portfolio akan di-highlight dengan case studies yang relevan dengan fintech. AI juga akan research tentang produk Tokopedia Pay untuk personalisasi cover letter.",
          ai_actions: [
            { step: 1, title: "Portfolio Curation", description: "Pilih case studies yang paling relevan dengan fintech", status: "pending", estimated_time: "5 menit" },
            { step: 2, title: "CV Tailoring", description: "Highlight product metrics dan achievements", status: "pending", estimated_time: "3 menit" },
            { step: 3, title: "Research & Personalize", description: "Research produk Tokopedia Pay untuk cover letter", status: "pending", estimated_time: "4 menit" },
            { step: 4, title: "Submit & Track", description: "Submit dan setup tracking untuk response", status: "pending", estimated_time: "2 menit" },
          ],
          skill_gaps: [{ skill: "Fintech Domain", required_level: 7, user_level: 5, gap: 2 }],
          skill_matches: [
            { skill: "Backend Tech", level: 70, matched: true },
            { skill: "Experience", level: 80, matched: true },
            { skill: "Education", level: 85, matched: true },
            { skill: "Soft Skills", level: 90, matched: true },
            { skill: "Language", level: 80, matched: true },
            { skill: "Tools", level: 75, matched: true },
          ],
          salary_benchmark: { market_average: 48000000, market_high: 70000000, market_low: 32000000, percentile: 58 },
          status: "active",
          posted_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          title: "Data Analyst",
          company: "Shopee",
          location: "Jakarta",
          type: "full-time",
          workplace_type: "on-site",
          salary_min: 18000000,
          salary_max: 25000000,
          salary_currency: "IDR",
          salary_period: "monthly",
          description: "Analyze large datasets to provide actionable insights for business decisions. Work with SQL, Python, and visualization tools.",
          requirements: ["2+ years in data analysis", "Proficient in SQL and Python", "Experience with Tableau/PowerBI", "Strong analytical thinking"],
          responsibilities: ["Analyze user behavior data", "Create dashboards and reports", "Support business decisions with data", "Collaborate with cross-functional teams"],
          benefits: ["Competitive package", "Meal allowance", "Transport allowance", "Gym membership"],
          platform_source: "Glints",
          match_score: 76,
          acceptance_potential: 68,
          company_culture_score: 75,
          growth_potential: 82,
          ai_strategy: "AI akan membuat CV yang menonjolkan proyek data analysis dan visualisasi kamu. Sertifikat dan course completion akan di-highlight. AI akan juga menyarankan portfolio project yang bisa ditambahkan.",
          ai_actions: [
            { step: 1, title: "Skills Highlight", description: "Soroti SQL, Python, dan visualization skills", status: "pending", estimated_time: "2 menit" },
            { step: 2, title: "Portfolio Enhancement", description: "Tambahkan link ke project dashboard dan GitHub", status: "pending", estimated_time: "3 menit" },
            { step: 3, title: "CV Submission", description: "Submit dengan format yang ATS-friendly", status: "pending", estimated_time: "1 menit" },
          ],
          skill_gaps: [
            { skill: "Python Advanced", required_level: 7, user_level: 5, gap: 2 },
            { skill: "Tableau", required_level: 6, user_level: 4, gap: 2 },
          ],
          skill_matches: [
            { skill: "Backend Tech", level: 60, matched: false },
            { skill: "Experience", level: 70, matched: true },
            { skill: "Education", level: 80, matched: true },
            { skill: "Soft Skills", level: 75, matched: true },
            { skill: "Language", level: 70, matched: true },
            { skill: "Tools", level: 65, matched: false },
          ],
          salary_benchmark: { market_average: 20000000, market_high: 30000000, market_low: 14000000, percentile: 55 },
          status: "active",
          posted_at: new Date(Date.now() - 18000000).toISOString(),
        },
        {
          title: "UI/UX Designer",
          company: "BCA Digital",
          location: "Jakarta",
          type: "full-time",
          workplace_type: "on-site",
          salary_min: 20000000,
          salary_max: 30000000,
          salary_currency: "IDR",
          salary_period: "monthly",
          description: "Design intuitive and beautiful user interfaces for digital banking products. Collaborate with product and engineering teams.",
          requirements: ["3+ years in UI/UX design", "Proficient in Figma", "Experience with design systems", "Understanding of accessibility"],
          responsibilities: ["Design user interfaces", "Create prototypes and wireframes", "Conduct user research", "Maintain design system"],
          benefits: ["Health insurance", "Annual bonus", "Training budget", "Work-life balance"],
          platform_source: "Kalibrr",
          match_score: 88,
          acceptance_potential: 78,
          company_culture_score: 85,
          growth_potential: 80,
          ai_strategy: "AI akan membuat portfolio showcase yang menonjolkan design thinking process kamu. Case studies akan di-struktur dengan problem-solution-outcome format. AI juga akan menyesuaikan design style dengan brand guidelines BCA Digital.",
          ai_actions: [
            { step: 1, title: "Portfolio Curation", description: "Pilih 3 case studies terbaik yang relevan dengan fintech", status: "pending", estimated_time: "5 menit" },
            { step: 2, title: "Design Case Study", description: "Format case study dengan struktur yang jelas", status: "pending", estimated_time: "4 menit" },
            { step: 3, title: "Brand Alignment", description: "Sesuaikan portfolio dengan estetik BCA Digital", status: "pending", estimated_time: "3 menit" },
            { step: 4, title: "Submit Portfolio", description: "Submit CV dan portfolio link", status: "pending", estimated_time: "2 menit" },
          ],
          skill_gaps: [],
          skill_matches: [
            { skill: "Backend Tech", level: 50, matched: false },
            { skill: "Experience", level: 85, matched: true },
            { skill: "Education", level: 80, matched: true },
            { skill: "Soft Skills", level: 88, matched: true },
            { skill: "Language", level: 75, matched: true },
            { skill: "Tools", level: 90, matched: true },
          ],
          salary_benchmark: { market_average: 24000000, market_high: 35000000, market_low: 16000000, percentile: 52 },
          status: "active",
          posted_at: new Date(Date.now() - 86400000).toISOString(),
        },
      ];

      // Insert mock jobs
      for (const job of mockJobs) {
        await supabase.from("jobs").insert(job);
      }

      await fetchJobs();
    } catch (err) {
      console.error("Error generating mock jobs:", err);
    } finally {
      setLoading(false);
    }
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

  const goldenWindows = jobs.filter((j) => j.match_score >= 85 && j.status === "active").length;

  return (
    <AppShell>
      <header className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">AI Job Discovery</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {jobs.length > 0
                ? `${jobs.length} lowongan dianalisis oleh AI · Diperbarui real-time`
                : "AI akan mencari & menganalisis lowongan untuk kamu"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Tier Badge */}
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
              userTier === "pro" 
                ? "bg-[#D2F801] text-[#161616]" 
                : "bg-[#F5F5F5] text-muted-foreground border border-[#999999]"
            }`}>
              {userTier === "pro" ? <Crown className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
              {userTier === "pro" ? "PRO" : "FREE"}
            </span>
            {/* Quota */}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0367FC]/10 text-[#0367FC] px-3 py-1.5 text-xs font-bold">
              <Target className="h-3.5 w-3.5" />
              {remainingQuota} apply tersisa
            </span>
            {goldenWindows > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D2F801] text-[#161616] px-3 py-1.5 text-xs font-bold">
                <Zap className="h-3.5 w-3.5" /> {goldenWindows} Golden Window
              </span>
            )}
          </div>
        </div>

        {/* AI Scanner Toggle */}
        <div className="mt-5">
          <button
            onClick={() => setShowScanner(!showScanner)}
            className="w-full h-12 rounded-xl border-2 border-[#0367FC] bg-[#0367FC]/5 text-[#0367FC] font-semibold text-sm hover:bg-[#0367FC]/10 transition flex items-center justify-center gap-2"
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
              className="w-full rounded-xl border-2 border-[#999999] pl-11 pr-4 h-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-[#0367FC] bg-white"
            />
          </div>
          <button className="h-12 px-5 rounded-xl border-2 border-[#999999] inline-flex items-center gap-2 text-sm hover:border-[#0367FC] transition bg-white">
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
                  ? "bg-[#0367FC] text-white border-[#0367FC]"
                  : "border-[#999999] text-muted-foreground hover:text-foreground hover:border-[#0367FC]"
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
          <Loader2 className="h-8 w-8 animate-spin text-[#0367FC]" />
          <span className="ml-3 text-muted-foreground">Memuat lowongan...</span>
        </div>
      ) : filteredJobs.length > 0 ? (
        <div className="space-y-4">
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              isSaved={savedJobs.has(job.id)}
              onToggleSave={() => toggleSaveJob(job.id)}
              onApply={() => handleApply(job)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Brain className="h-12 w-12 mx-auto text-[#999999] mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {jobs.length === 0 ? "Belum ada lowongan" : "Tidak ada lowongan yang cocok"}
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            {jobs.length === 0
              ? "AI belum melakukan scan. Klik tombol di atas untuk memulai."
              : "Coba ubah filter atau kata kunci pencarian."}
          </p>
          {jobs.length === 0 && (
            <div className="space-y-3">
              <button
                onClick={generateMockJobs}
                className="h-11 px-6 rounded-xl bg-[#0367FC] text-white font-semibold text-sm hover:opacity-90 transition inline-flex items-center gap-2"
              >
                <Zap className="h-4 w-4" />
                Generate Demo Jobs
              </button>
              <p className="text-xs text-muted-foreground">
                Ini akan membuat 4 lowongan contoh dengan analisis AI lengkap
              </p>
            </div>
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
