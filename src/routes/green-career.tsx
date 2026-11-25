import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import {
  greenCareerService, type GreenJob, type AssessmentQuestion, type AssessmentResult,
} from "@/services/greenCareerService";
import {
  Leaf, Loader2, ArrowLeft, ArrowRight, AlertCircle, Shield, Building2, Bot,
  CheckCircle2, Send, GraduationCap, TrendingUp, ExternalLink, Briefcase,
} from "lucide-react";
import { describeError } from "@/lib/authErrors";
import { safeJobUrl } from "@/lib/manualSubmit";
import { isMockMode } from "@/lib/appConfig";
import { profileSkillList, sortByMatch } from "@/lib/matchScore";
import { greenMatchView, type GreenMatchView } from "@/lib/greenMatch";
import { greenCareerListNotice } from "@/lib/greenCareerUi";
import { profileService } from "@/services/profileService";
import { ErrorState } from "@/components/ErrorState";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/green-career")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Karier Hijau — Applify" }] }),
  component: GreenCareerPage,
});

type View = "list" | "questions" | "analyzing" | "result";

function GreenCareerPage() {
  const [view, setView] = useState<View>("list");
  const [jobs, setJobs] = useState<GreenJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<GreenJob | null>(null);
  const [assessmentId, setAssessmentId] = useState("");
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [completedResults, setCompletedResults] = useState<Map<string, AssessmentResult>>(() => new Map());
  const [busy, setBusy] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const [error, setError] = useState("");
  // Kegagalan memuat daftar dipisah dari galat asesmen: daftar gagal berarti layar utama menampilkan "Coba lagi".
  const [loadError, setLoadError] = useState("");
  // Skill profil untuk label "Kecocokan dengan profilmu" (per pengguna, bukan jobs.match_score yang global).
  // null = belum dimuat atau gagal (lihat skillsFailed).
  const [profileSkills, setProfileSkills] = useState<string[] | null>(null);
  const [skillsFailed, setSkillsFailed] = useState(false);

  useEffect(() => { load(); }, []);

  // Gagal memuat skill bukan berarti "tanpa skill": kartu menulis bahwa kecocokan belum bisa dihitung.
  const loadProfileSkills = async () => {
    try {
      setSkillsFailed(false);
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
      setSkillsFailed(true);
    }
  };

  const load = async () => {
    try {
      setLoading(true); setLoadError("");
      // Skill dimuat bersama daftar supaya urutan kartu tidak berpindah setelah tampil.
      const [list] = await Promise.all([greenCareerService.listGreenJobs(), loadProfileSkills()]);
      setJobs(list);
    } catch (e) {
      setLoadError(describeError(e, "Daftar lowongan karier hijau belum bisa dimuat."));
    } finally { setLoading(false); }
  };

  const startAssessment = async (j: GreenJob) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setBusy(true); setBusyJobId(j.id); setError(""); setJob(j);
      const res = await greenCareerService.startAssessment(j.id);
      setAssessmentId(res.assessmentId); setQuestions(res.questions); setAnswers({}); setView("questions");
    } catch (e) {
      setError(describeError(e, "Asesmen belum bisa dimulai. Coba lagi sebentar lagi."));
    } finally {
      inFlightRef.current = false;
      setBusy(false);
      setBusyJobId(null);
    }
  };

  const submit = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError(""); setView("analyzing");
    try {
      const payload = questions.map((q) => ({ id: q.id, question: q.question, answer: answers[q.id] ?? "" }));
      const r = await greenCareerService.submitAssessment(assessmentId, payload);
      if (job?.id) setCompletedResults((prev) => new Map(prev).set(job.id, r));
      setResult(r); setView("result");
    } catch (e) {
      // Jawaban tetap tersimpan di layar, jadi pengguna bisa mengirim ulang tanpa mengetik lagi.
      setError(describeError(e, "Jawabanmu belum bisa dinilai. Jawabanmu masih ada di sini, coba kirim lagi."));
      setView("questions");
    } finally {
      inFlightRef.current = false;
    }
  };

  const reset = () => { setView("list"); setJob(null); setResult(null); setQuestions([]); setAnswers({}); setError(""); };
  // Skor kecocokan per pengguna (lib/greenMatch.ts, logika yang sama dengan halaman Lowongan); kartu tanpa skor di akhir.
  const matchViews = useMemo(
    () => new Map(jobs.map((j) => [j.id, greenMatchView(j, profileSkills, skillsFailed)] as const)),
    [jobs, profileSkills, skillsFailed],
  );
  const shownJobs = sortByMatch(jobs, (j) => {
    const v = matchViews.get(j.id);
    return v?.kind === "score" ? v.score : null;
  });
  const allAnswered = questions.length > 0 && questions.every((q) => (answers[q.id] ?? "").trim().length > 0);

  return (
    <AppShell>
      <div className="w-full max-w-6xl mx-auto flex flex-col items-center">
        {error && (
          <div role="alert" className="w-full rounded-2xl bg-[#C0341A]/[6%] border-2 border-[#C0341A]/30 p-3 text-sm text-[#C0341A] mb-5 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {error}
          </div>
        )}

        {view === "list" && (
          <>
            <NeuralEcoHeader />
            {loading ? (
              <div role="status" className="flex justify-center py-16 w-full"><Loader2 className="h-7 w-7 animate-spin text-brand-emerald" aria-label="Memuat" /></div>
            ) : loadError ? (
              <ErrorState className="w-full" title="Lowongan karier hijau belum bisa dimuat" message={loadError} onRetry={load} />
            ) : jobs.length === 0 ? (
              <div className="glass-solid rounded-3xl w-full text-center py-16 px-6 text-muted-foreground text-sm">
                <Leaf className="h-8 w-8 mx-auto text-brand-emerald mb-3" aria-hidden="true" />
                <p className="font-semibold text-neutral-900">{greenCareerListNotice(0).title}</p>
                <p className="mt-1.5 max-w-xl mx-auto">{greenCareerListNotice(0).body}</p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <button type="button" onClick={load} className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50">
                    Muat ulang
                  </button>
                  <Link to="/jobs" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-neutral-900 px-6 text-sm font-semibold text-white hover:bg-neutral-800">
                    Cari lowongan
                  </Link>
                </div>
              </div>
            ) : (
              <div className="w-full flex flex-col gap-5">
                <div role="status" className="w-full rounded-2xl bg-emerald-50/80 border border-emerald-200 px-5 py-3.5 text-sm text-emerald-950 flex items-start gap-3">
                  <Leaf className="w-4 h-4 text-brand-emerald shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">{greenCareerListNotice(shownJobs.length).title}</p>
                    <p className="text-xs text-emerald-900/80 mt-0.5">{greenCareerListNotice(shownJobs.length).body}</p>
                  </div>
                </div>
                <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-0 animate-fade-up">
                  {shownJobs.map((j) => {
                    const savedResult = completedResults.get(j.id);
                    return (
                      <JobCard
                        key={j.id}
                        job={j}
                        view={matchViews.get(j.id)!}
                        onStart={() => startAssessment(j)}
                        savedResult={savedResult}
                        onViewResult={savedResult ? () => { setJob(j); setResult(savedResult); setView("result"); } : undefined}
                        busy={busy}
                        loadingThis={busyJobId === j.id}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {view === "questions" && (
          <QuestionsView job={job} questions={questions} answers={answers} setAnswers={setAnswers} onBack={reset} onSubmit={submit} allAnswered={allAnswered} />
        )}

        {view === "analyzing" && <AnalyzingDiorama />}

        {view === "result" && result && <ResultView result={result} job={job} onBack={reset} />}
      </div>
    </AppShell>
  );
}

/* ── List: job card ── */
function JobCard({
  job,
  view,
  onStart,
  savedResult,
  onViewResult,
  busy,
  loadingThis,
}: {
  job: GreenJob;
  view: GreenMatchView;
  onStart: () => void;
  savedResult?: AssessmentResult;
  onViewResult?: () => void;
  busy: boolean;
  loadingThis: boolean;
}) {
  const esg = job.company_insight?.green_score;
  const tags = job.company_insight?.esg_flags ?? [];
  return (
    <div className="glass-solid rounded-2xl p-6 flex flex-col hover:-translate-y-1 transition-transform duration-300 group">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 bg-neutral-100 border-2 border-neutral-300 rounded-xl flex items-center justify-center text-neutral-500"><Building2 className="w-5 h-5" aria-hidden="true" /></div>
        {typeof esg === "number" && (
          <div className="flex flex-col items-end">
            <span className="font-mono text-xl font-extrabold text-brand-emerald">{esg}</span>
            <span className="text-xs font-semibold text-neutral-500">Skor hijau (perkiraan AI)</span>
          </div>
        )}
      </div>
      <h3 className="font-display text-lg font-bold text-neutral-900 leading-tight group-hover:text-brand-emerald transition-colors">{job.title}</h3>
      <p className="font-sans text-sm text-neutral-500 mt-1">{job.company}</p>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {tags.slice(0, 3).map((tag) => <span key={tag} className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-xs font-bold border-2 border-emerald-300">{tag}</span>)}
        </div>
      )}
      <div className="mt-6 pt-5 border-t border-neutral-100 flex flex-col gap-3 mt-auto">
        <MatchBlock view={view} />
        {savedResult && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <span className="font-semibold">Skor asesmen: {savedResult.readinessScore}%</span>
            {onViewResult && (
              <button type="button" onClick={onViewResult} className="min-h-11 px-2 font-bold underline">
                Lihat hasil
              </button>
            )}
          </div>
        )}
        <button type="button" onClick={onStart} disabled={busy} aria-label={`Ikuti asesmen kesiapan untuk ${job.title} di ${job.company}`} className="w-full mt-2 min-h-11 bg-white border-2 border-brand-emerald text-brand-emerald hover:bg-brand-emerald hover:text-white font-sans font-bold text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
          {loadingThis ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Menyiapkan asesmen...</> : <>{savedResult ? "Ulangi Asesmen" : "Ikuti Asesmen"} <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
        </button>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/jobs"
            search={{ cari: job.title }}
            className="flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-800 hover:border-[#0A5BE0] transition"
          >
            <Briefcase className="h-3.5 w-3.5" aria-hidden="true" /> Buka di Lowongan
          </Link>
          {safeJobUrl(job.external_url) && (
            <a
              href={safeJobUrl(job.external_url) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-11 inline-flex items-center justify-center gap-1 rounded-lg border-2 border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 hover:border-neutral-400 transition"
            >
              Situs asal <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
        <p className="text-xs text-neutral-500 text-center">Opsional dan tanpa biaya. Hasilnya hanya untuk kamu.</p>
      </div>
    </div>
  );
}

/* ── Kecocokan per pengguna: persentase dengan dasarnya, atau tanda strip dengan alasan angka belum ada ── */
function MatchBlock({ view }: { view: GreenMatchView }) {
  const score = view.kind === "score" ? view.score : null;
  return (
    <>
      <div className="flex justify-between items-center text-xs">
        <span className="font-sans font-semibold text-neutral-600">Kecocokan dengan profilmu</span>
        <span className="font-mono font-bold text-neutral-900">{score === null ? <><span aria-hidden="true">-</span><span className="sr-only">Belum ada skor</span></> : `${score}%`}</span>
      </div>
      <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden" aria-hidden="true">
        <div className="h-full bg-neutral-800 rounded-full" style={{ width: `${score ?? 0}%` }} />
      </div>
      {view.kind === "score" ? (
        <p className="text-xs text-neutral-500" title={view.matched.length > 0 ? `Cocok: ${view.matched.join(", ")}` : undefined}>
          {view.caption}. Dihitung dari skill di profilmu dan skill yang disebut lowongan.
        </p>
      ) : view.kind === "no-profile-skills" ? (
        <Link to="/profile" className="inline-flex min-h-11 items-center text-xs font-medium text-[#0A5BE0] underline underline-offset-4">
          {view.text}
        </Link>
      ) : (
        <p className="text-xs text-neutral-500" role={view.kind === "unavailable" ? "alert" : "status"}>{view.text}</p>
      )}
    </>
  );
}

/* ── Neural eco-tree header (reuses global draw-main / popUI / mf-d*) ── */
const ECO_PATHS = [
  "M 120,170 C 105,150 115,120 90,105 C 65,90 40,110 20,80",
  "M 120,170 C 110,145 130,115 100,95 C 70,75 60,65 45,45",
  "M 120,170 C 115,140 105,110 105,90 C 105,70 90,45 75,25",
  "M 120,170 C 130,135 105,100 125,70 C 140,40 115,30 125,15",
  "M 120,170 C 125,145 135,115 135,90 C 135,65 155,50 175,30",
  "M 120,170 C 115,140 150,115 145,95 C 140,75 175,70 200,50",
  "M 120,170 C 125,150 145,120 155,105 C 165,90 195,110 220,90",
];
const ECO_DELAYS = ["mf-d0", "mf-d1", "mf-d2", "mf-d3", "mf-d2", "mf-d1", "mf-d0"];
const ECO_NODES = [
  { pos: "top-[80px] left-[35px] -translate-x-full -translate-y-1/2 pr-2", d: "mf-d1", t: "Net-Zero", lime: false },
  { pos: "top-[45px] left-[65px] -translate-x-full -translate-y-full pr-1 pb-1", d: "mf-d2", t: "Fair Pay", lime: false },
  { pos: "top-[25px] left-[95px] -translate-x-1/2 -translate-y-full pb-1", d: "mf-d3", t: "ESG+", lime: true },
  { pos: "top-[15px] left-[150px] -translate-x-1/2 -translate-y-full pb-1", d: "mf-d4", t: "Clean Tech", lime: false },
  { pos: "top-[30px] left-[200px] -translate-x-1/2 -translate-y-full pb-1", d: "mf-d3", t: "Low Carbon", lime: false },
  { pos: "top-[50px] left-[225px] -translate-y-full pl-1 pb-1", d: "mf-d2", t: "Equity", lime: false },
  { pos: "top-[90px] left-[250px] -translate-y-1/2 pl-2", d: "mf-d1", t: "Transparent", lime: false },
];

function NeuralEcoHeader() {
  return (
    <div className="w-full bg-[#0A0A0A] rounded-[2rem] p-8 lg:p-12 border-4 border-neutral-800 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between min-h-[300px] mb-12">
      <div className="relative z-10 md:w-1/2 flex flex-col items-start gap-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/50 border-2 border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold uppercase tracking-widest"><Leaf className="w-3.5 h-3.5" aria-hidden="true" /> Karier Hijau</div>
        <h1 className="font-display text-3xl md:text-5xl font-extrabold text-white leading-tight">Lowongan <span className="text-brand-emerald">karier hijau.</span></h1>
        <p className="font-sans text-neutral-300 text-sm md:text-base leading-relaxed">Daftar lowongan dari perusahaan yang ditandai AI bergerak di bidang lingkungan atau berdampak sosial positif. Penandaan ini perkiraan AI dari nama perusahaan dan peran, bukan sertifikasi. Kamu bisa mengikuti asesmen singkat untuk melihat kesiapanmu sebelum melamar.</p>
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-neutral-900/80 px-3 py-2 rounded-lg border-2 border-neutral-800 w-fit">
            <Shield className="w-4 h-4 text-brand-emerald" aria-hidden="true" />
            <span className="text-xs text-neutral-300 font-sans">AI menilai isi jawaban tertulismu, bukan latar belakang pribadi.</span>
          </div>
          <p className="text-xs text-neutral-400 ml-1">Asesmen opsional dan tanpa biaya. Jawabanmu disimpan di akunmu.</p>
        </div>
      </div>

      <div aria-hidden="true" className="relative w-[340px] max-w-full h-[240px] mt-10 md:mt-0 opacity-90 md:opacity-100 flex items-center justify-center">
        <svg viewBox="0 0 240 170" aria-hidden="true" className="w-full h-full overflow-visible drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]">
          <g stroke="#10b981" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.2" filter="blur(3px)">{ECO_PATHS.map((d, i) => <path key={i} d={d} />)}</g>
          <g stroke="#10b981" strokeWidth="4" fill="none" strokeLinecap="round">{ECO_PATHS.map((d, i) => <path key={i} d={d} className={`animate-draw-main ${ECO_DELAYS[i]}`} />)}</g>
        </svg>
        {ECO_NODES.map((n) => (
          <div key={n.t} className={`absolute ${n.pos} animate-popUI ${n.d}`}>
            <div className={`shadow-sm flex items-center gap-1.5 px-2 py-0.5 rounded border ${n.lime ? "bg-brand-emerald border-emerald-400 shadow-[0_0_10px_#10b981]" : "bg-neutral-900 border-brand-emerald"}`}>
              <span className={`font-display font-bold text-xs uppercase ${n.lime ? "text-[#0A0A0A]" : "text-white"}`}>{n.t}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Questions (real Q&A) ── */
function QuestionsView({ job, questions, answers, setAnswers, onBack, onSubmit, allAnswered }: {
  job: GreenJob | null; questions: AssessmentQuestion[]; answers: Record<string, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>; onBack: () => void; onSubmit: () => void; allAnswered: boolean;
}) {
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const answered = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
  const requestBack = () => {
    if (answered > 0) setConfirmLeaveOpen(true);
    else onBack();
  };
  return (
    <div className="w-full max-w-2xl opacity-0 animate-fade-up">
      <button type="button" onClick={requestBack} className="min-h-11 text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali</button>
      <Dialog open={confirmLeaveOpen} onOpenChange={setConfirmLeaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Keluar dari asesmen ini?</DialogTitle>
            <DialogDescription>
              {answered} jawaban yang sudah kamu tulis belum dikirim dan akan hilang jika kamu kembali ke daftar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button type="button" onClick={() => setConfirmLeaveOpen(false)} className="min-h-11 rounded-xl border-2 border-neutral-300 px-4 text-sm font-semibold">
              Lanjut jawab
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmLeaveOpen(false);
                onBack();
              }}
              className="min-h-11 rounded-xl bg-neutral-900 px-5 text-sm font-semibold text-white"
            >
              Ya, keluar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="glass-solid rounded-3xl p-5 mb-5 flex items-center gap-4">
        <div className="w-12 h-12 bg-neutral-900 text-brand-emerald rounded-xl flex items-center justify-center shadow-lg border-2 border-neutral-700"><Bot className="w-6 h-6" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-bold text-neutral-900 leading-tight">Asesmen Kesiapan</h3>
          <p className="font-sans text-sm text-neutral-500 truncate">{job?.title} · {job?.company}</p>
        </div>
        <div className="text-right shrink-0"><p className="font-mono text-sm font-bold text-brand-emerald">{answered}/{questions.length}</p><p className="text-xs text-neutral-500">terjawab</p></div>
      </div>
      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={q.id} className="glass-solid rounded-3xl p-5">
            <p id={`pertanyaan-${q.id}`} className="font-medium text-sm mb-3"><span className="text-brand-emerald font-bold mr-1">{i + 1}.</span>{q.question}</p>
            {q.type === "mcq" && q.options ? (
              <div role="radiogroup" aria-labelledby={`pertanyaan-${q.id}`} className="space-y-2">
                {q.options.map((opt, oi) => (
                  <label key={oi} className={`flex min-h-11 items-center gap-3 p-3 rounded-xl border cursor-pointer text-sm transition ${answers[q.id] === opt ? "border-brand-emerald bg-emerald-50" : "border-neutral-200 hover:border-emerald-300"}`}>
                    <input type="radio" name={q.id} value={opt} checked={answers[q.id] === opt} onChange={() => setAnswers((p) => ({ ...p, [q.id]: opt }))} className="accent-[#10B981]" />{opt}
                  </label>
                ))}
              </div>
            ) : (
              <textarea rows={3} aria-labelledby={`pertanyaan-${q.id}`} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))} placeholder="Jawabanmu..." className="w-full p-3 rounded-xl border-2 border-neutral-300 bg-white text-base md:text-sm resize-none focus:outline-none focus:border-brand-emerald" />
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={onSubmit} disabled={!allAnswered} className="mt-6 w-full min-h-12 rounded-xl bg-neutral-900 text-white font-semibold text-sm hover:bg-neutral-800 transition disabled:opacity-50 flex items-center justify-center gap-2">
        <Send className="h-4 w-4" aria-hidden="true" /> {allAnswered ? "Kirim dan nilai kesiapanku" : "Jawab semua pertanyaan dulu"}
      </button>
    </div>
  );
}

/* ── Analyzing (magnifier scan diorama) — shown while edge fn scores ── */
function AnalyzingDiorama() {
  // Bilah ini hanya penanda "sedang bekerja": waktu penilaian sebenarnya tidak diketahui, jadi tidak ada angka persen.
  const [progress, setProgress] = useState(8);
  useEffect(() => {
    const t = setInterval(() => setProgress((p) => (p >= 95 ? 95 : p + 7)), 450);
    return () => clearInterval(t);
  }, []);
  return (
    <div role="status" aria-live="polite" className="w-full flex flex-col items-center opacity-0 animate-fade-up">
      <div className="w-full max-w-2xl glass-solid rounded-[2rem] p-8 overflow-hidden relative">
        <div className="absolute inset-0 bg-cyber-grid opacity-30 z-0" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-neutral-900 text-brand-emerald rounded-xl flex items-center justify-center animate-gcPulseNode shadow-lg border-2 border-neutral-700"><Bot className="w-6 h-6" /></div>
            <div><h3 className="font-display text-xl font-bold text-neutral-900 leading-tight">AI sedang menilai jawabanmu</h3><p className="text-xs text-neutral-600">Mohon tunggu dan jangan tutup halaman ini.</p></div>
          </div>
          <div className="relative w-full max-w-md bg-neutral-50 border-2 border-neutral-300 rounded-xl shadow-inner p-6 text-left overflow-hidden">
            <div className="w-1/3 h-3 bg-neutral-300 rounded mb-4" />
            <div className="space-y-4">
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-neutral-300 shrink-0" /><div className="h-2.5 bg-neutral-200 rounded w-full flex items-center relative"><div className="absolute left-[15%] w-[25%] h-3 bg-neutral-300 rounded animate-gcPopWord1 origin-left" /></div></div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-neutral-300 shrink-0" /><div className="h-2.5 bg-neutral-200 rounded w-[85%] flex items-center relative"><div className="absolute left-[40%] w-[30%] h-3 bg-neutral-300 rounded animate-gcPopWord2 origin-left" /></div></div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-neutral-300 shrink-0" /><div className="h-2.5 bg-neutral-200 rounded w-[95%] flex items-center relative"><div className="absolute left-[20%] w-[20%] h-3 bg-neutral-300 rounded animate-gcPopWord3 origin-left" /></div></div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-neutral-300 shrink-0" /><div className="h-2.5 bg-neutral-200 rounded w-[60%]" /></div>
            </div>
            <div className="absolute top-9 left-4 w-12 h-12 border-2 border-brand-emerald bg-emerald-50/20 backdrop-blur-[2px] rounded-full shadow-[0_0_15px_rgba(16,185,129,0.5)] animate-gcMagnifyMove flex items-center justify-center pointer-events-none z-10">
              <div className="w-1.5 h-1.5 bg-brand-emerald rounded-full shadow-sm" />
              <div className="absolute top-2 bottom-2 w-[1px] bg-brand-emerald/40" />
              <div className="absolute left-2 right-2 h-[1px] bg-brand-emerald/40" />
              <div className="absolute -bottom-2.5 -right-2.5 w-4 h-2 bg-neutral-700 rotate-45 rounded-sm" />
            </div>
          </div>
          <div className="w-full max-w-md mt-8">
            <div className="mb-2 text-xs text-neutral-600">Sedang diproses...</div>
            <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden" aria-hidden="true"><div className="h-full bg-brand-emerald rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Result (ring + verdict + real feedback) ── */
function ResultView({ result, job, onBack }: { result: AssessmentResult; job: GreenJob | null; onBack: () => void }) {
  const score = result.readinessScore;
  const ready = result.status === "ready";
  const R = 45, C = 2 * Math.PI * R;
  const [off, setOff] = useState(C);
  useEffect(() => { const t = setTimeout(() => setOff(C - (Math.min(score / 100, 1)) * C), 200); return () => clearTimeout(t); }, [C, score]);

  return (
    <div className="w-full flex flex-col items-center opacity-0 animate-fade-up">
      <div className="w-full max-w-2xl glass-solid rounded-[2rem] p-8 md:p-10 relative overflow-hidden text-center">
        <h2 className="font-display text-3xl font-extrabold text-neutral-900 mb-2">Asesmen Selesai</h2>
        <p className="font-sans text-neutral-600 mb-10">Penilaian kesiapanmu dari isi jawaban tertulis. Ini perkiraan AI sebagai bahan refleksi, bukan keputusan perusahaan.</p>

        <div className="relative w-48 h-48 mx-auto flex items-center justify-center animate-float">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120" role="img" aria-label={`Skor kesiapan ${score} dari 100`}>
            <circle cx="60" cy="60" r={R} fill="none" stroke="#f5f5f5" strokeWidth="8" />
            <circle cx="60" cy="60" r={R} fill="none" stroke={ready ? "#10b981" : "#D9741A"} strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.16,1,0.3,1)" }} />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="font-display text-4xl font-extrabold text-neutral-900">{score}%</span>
            <span className="text-xs font-bold mt-1" style={{ color: ready ? "#047857" : "#9a3412" }}>Kesiapan</span>
          </div>
        </div>

        <div className="mt-12 rounded-xl p-5 text-left" style={{ background: ready ? "#ecfdf5" : "#fff7ed", border: `1px solid ${ready ? "#a7f3d0" : "#fed7aa"}` }}>
          <h4 className="font-display font-bold mb-2" style={{ color: ready ? "#065f46" : "#9a3412" }}>{ready ? "Kamu sudah cukup siap untuk melamar" : "Masih ada yang bisa diperkuat"}</h4>
          <p className="font-sans text-sm leading-relaxed" style={{ color: ready ? "#047857" : "#9a3412" }}>
            {ready ? "Jawabanmu menunjukkan pemahaman yang baik tentang keberlanjutan. Langkah berikutnya: lihat lowongan yang cocok, lalu siapkan draf lamaranmu. Lamaran baru dikirim setelah kamu menyetujuinya." : "Hampir. Pelajari saran pengembangan di bawah, lalu coba lagi kapan saja. Ini bukan penolakan."}
          </p>
        </div>
      </div>

      <div className="w-full max-w-2xl grid md:grid-cols-3 gap-4 mt-5">
        <FeedbackCard title="Kekuatan" icon={<CheckCircle2 className="h-4 w-4 text-brand-emerald" />} items={result.feedback?.strengths} color="#10b981" />
        <FeedbackCard title="Perlu diperkuat" icon={<TrendingUp className="h-4 w-4 text-[#D9741A]" />} items={result.feedback?.gaps} color="#D9741A" />
        <FeedbackCard title="Pengembangan" icon={<GraduationCap className="h-4 w-4 text-[#0A5BE0]" />} items={result.feedback?.developmentPath} color="#0A5BE0" />
      </div>

      {/* Langkah berikutnya: tanpa ini pengguna selesai asesmen tanpa tahu harus ke mana */}
      <div className="mt-8 flex w-full max-w-2xl flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
        <Link to="/jobs" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-neutral-900 px-8 text-sm font-bold text-white shadow-md transition-colors hover:bg-neutral-800">
          <Briefcase className="h-4 w-4" aria-hidden="true" /> Lihat lowongan yang cocok
        </Link>
        {job && safeJobUrl(job.external_url) && (
          <a href={safeJobUrl(job.external_url) ?? undefined} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-brand-emerald px-6 text-sm font-bold text-brand-emerald transition-colors hover:bg-emerald-50">
            Buka lowongan {job.title} (tab baru) <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
        {!ready && (
          <Link to="/profile" className="inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-neutral-300 px-6 text-sm font-bold text-neutral-800 transition-colors hover:bg-neutral-50">
            Perkuat profilku
          </Link>
        )}
        <button type="button" onClick={onBack} className="inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-neutral-300 px-6 text-sm font-bold text-neutral-800 transition-colors hover:bg-neutral-50">Kembali ke daftar</button>
      </div>
    </div>
  );
}

function FeedbackCard({ title, icon, items, color }: { title: string; icon: React.ReactNode; items?: string[]; color: string }) {
  return (
    <div className="glass-solid rounded-3xl p-4">
      <div className="flex items-center gap-1.5 font-semibold text-sm mb-2">{icon}{title}</div>
      <ul className="space-y-1.5">
        {(items && items.length > 0 ? items : ["—"]).map((it, i) => (
          <li key={i} className="text-sm text-foreground/80 pl-3 relative"><span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-sm" style={{ background: color }} />{it}</li>
        ))}
      </ul>
    </div>
  );
}
