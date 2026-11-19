import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { AIJobScanner } from "@/components/AIJobScanner";
import { AIApplyModal } from "@/components/AIApplyModal";
import { JobCard, type JobData } from "@/components/JobCard";
import { ErrorState } from "@/components/ErrorState";
import { Search, Zap, Loader2, Brain, Target } from "lucide-react";
import { describeError } from "@/lib/authErrors";
import { isMockMode } from "@/lib/appConfig";
import { visibleJobs } from "@/lib/jobFilters";
import { useSubscription } from "@/hooks/useSubscription";
// Lowongan contoh dan id tersimpan hanya untuk mode demo eksplisit (VITE_MOCK_MODE=true).
import { mockJobs as mockJobsData, mockSavedJobIds } from "@/mocks/mockData";

export const Route = createFileRoute("/jobs")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Lowongan — Applify" }] }),
  component: JobsPage,
});

const FILTERS = [
  { key: "all", label: "Semua" },
  { key: "remote", label: "Remote" },
  { key: "hybrid", label: "Hybrid" },
  { key: "onsite", label: "Di kantor" },
  { key: "high-match", label: "Kecocokan 80% ke atas" },
  { key: "saved", label: "Tersimpan" },
] as const;

function JobsPage() {
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [showScanner, setShowScanner] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobData | null>(null);
  const [loadError, setLoadError] = useState("");
  // Kuota draf AI bulan ini dibaca dari database (get_quota_status). null = belum diketahui, jadi tidak ditampilkan.
  const { quota: draftQuota, reload: reloadQuota } = useSubscription();

  useEffect(() => {
    if (isMockMode()) {
      setJobs(mockJobsData as JobData[]);
      setSavedJobs(new Set(mockSavedJobIds));
      setLoading(false);
      return;
    }
    fetchJobs();
    fetchSavedJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      setLoadError("");
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("status", "active")
        // Lowongan tanpa alamat tidak bisa dilamar; saringan di bawah membuang sisanya (host uji, sumber uji).
        .not("external_url", "is", null)
        // Postgres mengurutkan NULL lebih dulu pada DESC; lowongan tanpa skor tidak boleh mengalahkan yang berskor.
        .order("match_score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      // Akun asli tidak pernah diisi data contoh: tabel kosong berarti daftar kosong. Baris uji (localhost,
      // 127.0.0.1, httpbin, sumber e2e-mock) disaring di sini; datanya di database tidak diubah.
      setJobs(visibleJobs((data ?? []) as JobData[]));
    } catch (err) {
      console.error("Error fetching jobs:", err);
      setJobs([]);
      setLoadError(describeError(err, "Lowongan belum bisa dimuat."));
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
      toast.error(describeError(err, "Daftar lowongan tersimpan belum bisa dimuat."));
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
    const wasSaved = savedJobs.has(jobId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sesimu sudah berakhir. Masuk lagi untuk menyimpan lowongan.");
        return;
      }

      if (wasSaved) {
        const { error } = await supabase.from("saved_jobs").delete().eq("user_id", user.id).eq("job_id", jobId);
        if (error) throw error;
        setSavedJobs((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
        toast.success("Lowongan dihapus dari daftar tersimpan.");
      } else {
        const { error } = await supabase.from("saved_jobs").insert({ user_id: user.id, job_id: jobId });
        if (error) throw error;
        setSavedJobs((prev) => new Set(prev).add(jobId));
        toast.success("Lowongan disimpan.");
      }
    } catch (err) {
      console.error("Error toggling save:", err);
      // Status tersimpan tidak diubah di layar, jadi tampilan tetap sama dengan yang ada di database.
      toast.error(describeError(err, wasSaved ? "Lowongan belum bisa dihapus dari daftar tersimpan." : "Lowongan belum bisa disimpan."));
    }
  };

  const handleApply = (job: JobData) => {
    setSelectedJob(job);
    setShowApplyModal(true);
  };

  const filteredJobs = jobs.filter((job) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      job.title.toLowerCase().includes(q) ||
      job.company.toLowerCase().includes(q) ||
      job.location.toLowerCase().includes(q);

    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "remote" && job.workplace_type === "remote") ||
      (activeFilter === "hybrid" && job.workplace_type === "hybrid") ||
      (activeFilter === "onsite" && job.workplace_type === "on-site") ||
      (activeFilter === "high-match" && job.match_score >= 80) ||
      (activeFilter === "saved" && savedJobs.has(job.id));

    return matchesSearch && matchesFilter;
  });

  // Lowongan aktif dengan skor kecocokan 85 ke atas. Ini hanya hitungan kecocokan tinggi, bukan fitur Golden Window.
  const strongMatches = jobs.filter((j) => j.match_score >= 85 && j.status === "active").length;

  return (
    <AppShell>
      <header className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Cari Lowongan</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {jobs.length > 0
                ? `${jobs.length} lowongan tersimpan dari sumber yang didukung`
                : "Mulai dengan menekan tombol cari lowongan di bawah"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {draftQuota && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0A5BE0]/10 text-[#0A5BE0] px-3 py-1.5 text-xs font-bold">
                <Target className="h-3.5 w-3.5" aria-hidden="true" />
                {draftQuota.remaining > 0
                  ? `${draftQuota.remaining} draf AI tersisa bulan ini`
                  : "Draf AI bulan ini habis, kuota direset bulan depan"}
              </span>
            )}
            {strongMatches > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#D2F801] text-[#16150F] px-3 py-1.5 text-xs font-bold">
                <Zap className="h-3.5 w-3.5" aria-hidden="true" /> {strongMatches} kecocokan tinggi
              </span>
            )}
          </div>
        </div>

        {/* Pemindai lowongan */}
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setShowScanner(!showScanner)}
            aria-expanded={showScanner}
            aria-controls="panel-pemindai"
            className="w-full min-h-12 rounded-xl border-2 border-[#0A5BE0] bg-[#0A5BE0]/5 text-[#0A5BE0] font-semibold text-sm hover:bg-[#0A5BE0]/10 transition flex items-center justify-center gap-2"
          >
            <Brain className="h-4 w-4" aria-hidden="true" />
            {showScanner ? "Tutup pencarian lowongan" : "Cari lowongan baru dari banyak situs"}
          </button>
        </div>

        {showScanner && (
          <div id="panel-pemindai" className="mt-4">
            <AIJobScanner onComplete={() => { fetchJobs(); setShowScanner(false); }} />
          </div>
        )}

        {/* Pencarian dan penyaring */}
        <div className="mt-5">
          <label htmlFor="cari-lowongan" className="sr-only">Cari posisi, perusahaan, atau lokasi</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              id="cari-lowongan"
              type="search"
              placeholder="Cari posisi, perusahaan, atau lokasi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border-2 border-[#999999] pl-11 pr-4 h-12 text-base md:text-sm placeholder:text-muted-foreground focus:outline-none focus:border-[#0A5BE0] bg-white"
            />
          </div>
        </div>
        <div role="group" aria-label="Saring lowongan" className="mt-4 flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setActiveFilter(filter.key)}
              aria-pressed={activeFilter === filter.key}
              className={`min-h-11 text-sm px-4 py-2 rounded-full border-2 transition ${
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

      {/* Daftar lowongan */}
      {loading ? (
        <div role="status" className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0]" aria-hidden="true" />
          <span className="ml-3 text-muted-foreground">Memuat lowongan...</span>
        </div>
      ) : loadError ? (
        <ErrorState
          title="Lowongan belum bisa dimuat"
          message={loadError}
          onRetry={() => { setLoading(true); fetchJobs(); }}
        />
      ) : filteredJobs.length > 0 ? (
        <ul className="space-y-4" aria-label="Daftar lowongan">
          {filteredJobs.map((job, i) => (
            <li key={job.id} style={{ animation: `fadeInUp 0.35s ease-out ${i * 0.05}s both` }}>
              <JobCard
                job={job}
                isSaved={savedJobs.has(job.id)}
                onToggleSave={() => toggleSaveJob(job.id)}
                onApply={() => handleApply(job)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center py-16">
          <Brain className="h-12 w-12 mx-auto text-[#999999] mb-4" aria-hidden="true" />
          <h2 className="text-lg font-semibold mb-2">
            {jobs.length === 0 ? "Belum ada lowongan" : "Tidak ada lowongan yang cocok"}
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground mb-6">
            {jobs.length === 0
              ? "Tekan tombol biru di atas untuk mencari lowongan dari JobStreet, Glints, Kalibrr, dan papan karier perusahaan."
              : "Coba ubah penyaring atau kata kunci pencarian."}
          </p>
          {jobs.length === 0 && !showScanner && (
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="min-h-11 px-6 rounded-xl bg-[#0A5BE0] text-white font-semibold text-sm hover:opacity-90 transition"
            >
              Cari lowongan sekarang
            </button>
          )}
        </div>
      )}

      {/* Modal AI Apply */}
      {showApplyModal && selectedJob && (
        <AIApplyModal
          jobId={selectedJob.id}
          jobTitle={selectedJob.title}
          company={selectedJob.company}
          jobData={selectedJob}
          onClose={() => { setShowApplyModal(false); setSelectedJob(null); }}
          onSuccess={() => { fetchJobs(); reloadQuota(); }}
        />
      )}
    </AppShell>
  );
}
