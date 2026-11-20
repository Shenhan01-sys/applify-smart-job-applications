import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
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
import { visibleJobs, jobSearchFilters, matchesJobSearch, freshJobsFilter, JOBS_PAGE_LIMIT } from "@/lib/jobFilters";
import {
  HIGH_MATCH_THRESHOLD,
  NO_PROFILE_SKILLS_TEXT,
  computeMatch,
  hasUsableSkills,
  profileSkillList,
  sortByMatch,
  type JobMatch,
} from "@/lib/matchScore";
import { profileService } from "@/services/profileService";
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
  // Skill profil untuk skor kecocokan per pengguna. null = belum dimuat atau gagal (lihat skillsError).
  const [profileSkills, setProfileSkills] = useState<string[] | null>(null);
  const [skillsError, setSkillsError] = useState("");
  // Id lowongan yang detail lengkapnya sudah diminta ke server (satu kali per lowongan), dan skor lama yang menahan urutan.
  const detailAttempts = useRef(new Set<string>());
  const [heldScores, setHeldScores] = useState<Map<string, number | null>>(new Map());
  // Kuota draf AI bulan ini dibaca dari database (get_quota_status). null = belum diketahui, jadi tidak ditampilkan.
  const { quota: draftQuota, reload: reloadQuota } = useSubscription();

  useEffect(() => {
    loadProfileSkills();
    if (isMockMode()) {
      setJobs(mockJobsData as JobData[]);
      setSavedJobs(new Set(mockSavedJobIds));
      setLoading(false);
      return;
    }
    fetchSavedJobs();
  }, []);

  // Pencarian dijalankan di server (judul, perusahaan, lokasi), bukan hanya pada lowongan yang sudah termuat.
  // Tanpa ini, mencari "frontend" kosong bila 100 lowongan terbaru kebetulan bidang lain (uji klik 2026-11-19).
  useEffect(() => {
    if (isMockMode()) return;
    const t = setTimeout(() => fetchJobs(searchQuery), searchQuery ? 350 : 0);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Skill dari user_skills dan skills_used di pengalaman. Gagal memuat bukan berarti "tanpa skill": galatnya
  // ditampilkan dan skor tidak dihitung.
  const loadProfileSkills = async () => {
    try {
      setSkillsError("");
      let userId = "mock-user";
      if (!isMockMode()) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        userId = user.id;
      }
      setProfileSkills(profileSkillList(await profileService.getSkillSource(userId)));
    } catch (err) {
      console.error("Error loading profile skills:", err);
      setProfileSkills(null);
      setSkillsError(`Kecocokan belum bisa dihitung. ${describeError(err, "Skill di profilmu belum bisa dimuat.")}`);
    }
  };

  const fetchJobs = async (search = "") => {
    try {
      setLoadError("");
      let query = supabase
        .from("jobs")
        .select("*")
        .eq("status", "active")
        // Lowongan tanpa alamat tidak bisa dilamar; saringan di bawah membuang sisanya (host uji, sumber uji).
        .not("external_url", "is", null)
        // Lowongan yang tayang lebih dari JOB_MAX_AGE_DAYS hari lalu kemungkinan besar sudah ditutup di situs asal.
        .or(freshJobsFilter());
      for (const filter of jobSearchFilters(search)) query = query.or(filter);
      // Urutan akhir ditentukan skor per pengguna di klien (jobs.match_score hanya satu angka global untuk semua orang).
      const { data, error } = await query.order("created_at", { ascending: false }).limit(JOBS_PAGE_LIMIT);

      if (error) throw error;
      // Akun asli tidak pernah diisi data contoh: tabel kosong berarti daftar kosong. Baris uji (localhost,
      // 127.0.0.1, httpbin, sumber e2e-mock) disaring di sini; datanya di database tidak diubah.
      setJobs(visibleJobs((data ?? []) as JobData[]));
      setHeldScores(new Map());
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

  // Detail lengkap dari server (deskripsi, requirements, gaji) menggantikan baris lowongan di daftar, jadi skor
  // kecocokan dihitung ulang dari teks yang lengkap. Urutan kartu ditahan: kartu yang sedang dibuka tidak
  // berpindah tempat saat skornya berubah; urutan baru berlaku saat daftar dimuat ulang.
  const handleJobUpdated = (updated: JobData) => {
    const before = matches?.get(updated.id)?.score ?? null;
    setHeldScores((prev) => (prev.has(updated.id) ? prev : new Map(prev).set(updated.id, before)));
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
    setSelectedJob((prev) => (prev && prev.id === updated.id ? updated : prev));
  };

  // Skor kecocokan per pengguna: irisan skill profil dengan skill yang disebut lowongan (lib/matchScore.ts).
  const matches = useMemo(
    () => (profileSkills === null ? null : new Map(jobs.map((job) => [job.id, computeMatch(job, profileSkills)] as const))),
    [jobs, profileSkills],
  );
  const matchOf = (job: JobData): JobMatch | null => matches?.get(job.id) ?? null;
  const scoreOf = (job: JobData): number | null => matchOf(job)?.score ?? null;
  const skillsReady = profileSkills !== null;
  const profileHasSkills = skillsReady ? hasUsableSkills(profileSkills) : null;

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch = matchesJobSearch(job, searchQuery);

    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "remote" && job.workplace_type === "remote") ||
      (activeFilter === "hybrid" && job.workplace_type === "hybrid") ||
      (activeFilter === "onsite" && job.workplace_type === "on-site") ||
      (activeFilter === "high-match" && (scoreOf(job) ?? -1) >= HIGH_MATCH_THRESHOLD) ||
      (activeFilter === "saved" && savedJobs.has(job.id));

    return matchesSearch && matchesFilter;
  });
  // Skor tertinggi lebih dulu; yang tanpa skor di akhir, urutan sisanya tetap (terbaru lebih dulu).
  const orderScoreOf = (job: JobData): number | null =>
    heldScores.has(job.id) ? (heldScores.get(job.id) as number | null) : scoreOf(job);
  const shownJobs = sortByMatch(filteredJobs, orderScoreOf);

  // Lowongan dengan kecocokan tinggi untuk profilmu. Ini hanya hitungan, bukan fitur Golden Window.
  // Kosong karena belum ada lowongan sama sekali, bukan karena pencarian tidak menemukan hasil.
  const noJobsAtAll = jobs.length === 0 && !searchQuery.trim();
  const strongMatches = jobs.filter((j) => (scoreOf(j) ?? -1) >= HIGH_MATCH_THRESHOLD).length;

  return (
    <AppShell>
      <header className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Cari Lowongan</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {loading
                ? "Memuat lowongan..."
                : jobs.length >= JOBS_PAGE_LIMIT
                  ? `Menampilkan ${JOBS_PAGE_LIMIT} lowongan terbaru. Pakai kotak cari untuk menemukan yang lain.`
                  : jobs.length > 0
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
            <AIJobScanner onComplete={() => fetchJobs(searchQuery)} />
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
          onRetry={() => { setLoading(true); fetchJobs(searchQuery); }}
        />
      ) : shownJobs.length > 0 ? (
        <>
          {skillsError && (
            <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <span className="min-w-0 flex-1">{skillsError}</span>
              <button type="button" onClick={loadProfileSkills} className="min-h-11 rounded-lg bg-red-600 px-4 font-semibold text-white">
                Coba lagi
              </button>
            </div>
          )}
        <ul className="space-y-4" aria-label="Daftar lowongan">
          {shownJobs.map((job, i) => (
            <li key={job.id} style={{ animation: `fadeInUp 0.35s ease-out ${i * 0.05}s both` }}>
              <JobCard
                job={job}
                match={matchOf(job)}
                matchUnavailable={skillsError ? "Kecocokan belum bisa dihitung. Skill profilmu belum termuat." : undefined}
                isSaved={savedJobs.has(job.id)}
                onToggleSave={() => toggleSaveJob(job.id)}
                onApply={() => handleApply(job)}
                onJobUpdated={handleJobUpdated}
                detailAttempts={detailAttempts.current}
              />
            </li>
          ))}
        </ul>
        </>
      ) : (
        <div className="text-center py-16">
          <Brain className="h-12 w-12 mx-auto text-[#999999] mb-4" aria-hidden="true" />
          <h2 className="text-lg font-semibold mb-2">
            {noJobsAtAll ? "Belum ada lowongan" : "Tidak ada lowongan yang cocok"}
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground mb-6">
            {noJobsAtAll
              ? "Tekan tombol biru di atas untuk mencari lowongan dari JobStreet, Glints, Kalibrr, dan papan karier perusahaan."
              : activeFilter === "high-match" && profileHasSkills === false
                ? NO_PROFILE_SKILLS_TEXT + "."
                : activeFilter === "high-match" && skillsError
                  ? skillsError
                  : "Coba ubah penyaring atau kata kunci pencarian."}
          </p>
          {jobs.length > 0 && activeFilter === "high-match" && profileHasSkills === false && (
            <Link to="/profile" className="inline-flex min-h-11 items-center rounded-xl bg-[#0A5BE0] px-6 text-sm font-semibold text-white hover:opacity-90 transition">
              Buka Profil
            </Link>
          )}
          {noJobsAtAll && !showScanner && (
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
          match={matchOf(selectedJob)}
          onClose={() => { setShowApplyModal(false); setSelectedJob(null); }}
          onSuccess={() => { fetchJobs(searchQuery); reloadQuota(); }}
        />
      )}
    </AppShell>
  );
}
