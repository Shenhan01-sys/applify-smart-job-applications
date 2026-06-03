import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import {
  greenCareerService, type GreenJob, type AssessmentQuestion, type AssessmentResult,
} from "@/services/greenCareerService";
import {
  Leaf, Loader2, ArrowLeft, ArrowRight, AlertCircle, Shield, Building2, Bot,
  CheckCircle2, Send, GraduationCap, TrendingUp,
} from "lucide-react";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export const Route = createFileRoute("/green-career")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Green Career — Applify" }] }),
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);
  const load = async () => {
    try { setLoading(true); setJobs(await greenCareerService.listGreenJobs()); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  const startAssessment = async (j: GreenJob) => {
    try {
      setBusy(true); setError(""); setJob(j);
      const res = await greenCareerService.startAssessment(j.id);
      setAssessmentId(res.assessmentId); setQuestions(res.questions); setAnswers({}); setView("questions");
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const submit = async () => {
    setError(""); setView("analyzing");
    try {
      const payload = questions.map((q) => ({ id: q.id, question: q.question, answer: answers[q.id] ?? "" }));
      const r = await greenCareerService.submitAssessment(assessmentId, payload);
      setResult(r); setView("result");
    } catch (e: any) { setError(e.message); setView("questions"); }
  };

  const reset = () => { setView("list"); setJob(null); setResult(null); setQuestions([]); setAnswers({}); setError(""); };
  const allAnswered = questions.length > 0 && questions.every((q) => (answers[q.id] ?? "").trim().length > 0);

  return (
    <AppShell>
      <div className="w-full max-w-6xl mx-auto flex flex-col items-center">
        {error && (
          <div className="w-full rounded-2xl bg-[#C0341A]/[6%] border border-[#C0341A]/30 p-3 text-sm text-[#C0341A] mb-5 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {view === "list" && (
          <>
            <NeuralEcoHeader />
            {loading ? (
              <div className="flex justify-center py-16 w-full"><Loader2 className="h-7 w-7 animate-spin text-brand-emerald" /></div>
            ) : jobs.length === 0 ? (
              <div className="glass-solid rounded-3xl w-full text-center py-16 text-muted-foreground text-sm">
                <Leaf className="h-8 w-8 mx-auto text-brand-emerald mb-3" />
                Belum ada lowongan Green Career aktif. Agen kami terus meneliti perusahaan berdampak.
              </div>
            ) : (
              <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-0 animate-fade-up">
                {jobs.map((j) => <JobCard key={j.id} job={j} onStart={() => startAssessment(j)} busy={busy} />)}
              </div>
            )}
          </>
        )}

        {view === "questions" && (
          <QuestionsView job={job} questions={questions} answers={answers} setAnswers={setAnswers} onBack={reset} onSubmit={submit} allAnswered={allAnswered} />
        )}

        {view === "analyzing" && <AnalyzingDiorama />}

        {view === "result" && result && <ResultView result={result} onBack={reset} />}
      </div>
    </AppShell>
  );
}

/* ── List: job card ── */
function JobCard({ job, onStart, busy }: { job: GreenJob; onStart: () => void; busy: boolean }) {
  const esg = job.company_insight?.green_score;
  const match = job.match_score;
  const tags = job.company_insight?.esg_flags ?? [];
  return (
    <div className="glass-solid rounded-2xl p-6 flex flex-col hover:-translate-y-1 transition-transform duration-300 group">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 bg-neutral-100 border-2 border-neutral-300 rounded-xl flex items-center justify-center text-neutral-500"><Building2 className="w-5 h-5" /></div>
        {typeof esg === "number" && (
          <div className="flex flex-col items-end">
            <span className="font-mono text-xl font-extrabold text-brand-emerald">{esg}</span>
            <span className="text-[8px] font-bold text-neutral-400 uppercase tracking-widest">ESG Score</span>
          </div>
        )}
      </div>
      <h3 className="font-display text-lg font-bold text-neutral-900 leading-tight group-hover:text-brand-emerald transition-colors">{job.title}</h3>
      <p className="font-sans text-sm text-neutral-500 mt-1">{job.company}</p>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {tags.slice(0, 3).map((tag) => <span key={tag} className="px-2 py-1 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold uppercase border-2 border-emerald-300">{tag}</span>)}
        </div>
      )}
      <div className="mt-6 pt-5 border-t border-neutral-100 flex flex-col gap-3 mt-auto">
        {typeof match === "number" && (
          <>
            <div className="flex justify-between items-center text-xs">
              <span className="font-sans font-semibold text-neutral-600">AI Match Rate</span>
              <span className="font-mono font-bold text-neutral-900">{match}%</span>
            </div>
            <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden"><div className="h-full bg-neutral-800 rounded-full" style={{ width: `${match}%` }} /></div>
          </>
        )}
        <button onClick={onStart} disabled={busy} className="w-full mt-2 bg-white border border-brand-emerald text-brand-emerald hover:bg-brand-emerald hover:text-white font-sans font-bold text-xs py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <>Ikuti Asesmen <ArrowRight className="w-3.5 h-3.5" /></>}
        </button>
        <p className="text-[9px] text-neutral-400 text-center">Rp15.000/sesi · opsional · refund 50% bila tak lolos</p>
      </div>
    </div>
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
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold uppercase tracking-widest"><Leaf className="w-3.5 h-3.5" /> Eksklusif</div>
        <h1 className="font-display text-3xl md:text-5xl font-extrabold text-white leading-tight">Ekosistem <span className="text-brand-emerald">Green Career.</span></h1>
        <p className="font-sans text-neutral-400 text-sm md:text-base leading-relaxed">Applify memprioritaskan perusahaan ber-ESG tinggi. Lakukan asesmen AI otonom untuk memvalidasi kesiapan kompetensimu sebelum melamar.</p>
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-neutral-900/80 px-3 py-2 rounded-lg border border-neutral-800 w-fit">
            <Shield className="w-4 h-4 text-brand-emerald" />
            <span className="text-[10px] text-neutral-300 font-sans">AI menilai substansi murni, bukan wajah/emosi.</span>
          </div>
          <p className="text-[10px] font-mono text-neutral-500 ml-1">*Commitment fee Rp15.000/sesi asesmen (opsional, menutupi biaya inferensi AI).</p>
        </div>
      </div>

      <div className="relative w-[340px] h-[240px] mt-10 md:mt-0 opacity-90 md:opacity-100 flex items-center justify-center">
        <svg viewBox="0 0 240 170" className="w-full h-full overflow-visible drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]">
          <g stroke="#10b981" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.2" filter="blur(3px)">{ECO_PATHS.map((d, i) => <path key={i} d={d} />)}</g>
          <g stroke="#10b981" strokeWidth="4" fill="none" strokeLinecap="round">{ECO_PATHS.map((d, i) => <path key={i} d={d} className={`animate-draw-main ${ECO_DELAYS[i]}`} />)}</g>
        </svg>
        {ECO_NODES.map((n) => (
          <div key={n.t} className={`absolute ${n.pos} animate-popUI ${n.d}`}>
            <div className={`shadow-sm flex items-center gap-1.5 px-2 py-0.5 rounded border ${n.lime ? "bg-brand-emerald border-emerald-400 shadow-[0_0_10px_#10b981]" : "bg-neutral-900 border-brand-emerald"}`}>
              <span className={`font-display font-bold text-[8px] uppercase ${n.lime ? "text-[#0A0A0A]" : "text-white"}`}>{n.t}</span>
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
  const answered = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
  return (
    <div className="w-full max-w-2xl opacity-0 animate-fade-up">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"><ArrowLeft className="h-4 w-4" /> Kembali</button>
      <div className="glass-solid rounded-3xl p-5 mb-5 flex items-center gap-4">
        <div className="w-12 h-12 bg-neutral-900 text-brand-emerald rounded-xl flex items-center justify-center shadow-lg border border-neutral-700"><Bot className="w-6 h-6" /></div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-bold text-neutral-900 leading-tight">Asesmen Kesiapan</h3>
          <p className="font-sans text-sm text-neutral-500 truncate">{job?.title} · {job?.company}</p>
        </div>
        <div className="text-right shrink-0"><p className="font-mono text-sm font-bold text-brand-emerald">{answered}/{questions.length}</p><p className="text-[10px] uppercase tracking-wider text-neutral-400">terjawab</p></div>
      </div>
      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={q.id} className="glass-solid rounded-3xl p-5">
            <p className="font-medium text-sm mb-3"><span className="text-brand-emerald font-bold mr-1">{i + 1}.</span>{q.question}</p>
            {q.type === "mcq" && q.options ? (
              <div className="space-y-2">
                {q.options.map((opt, oi) => (
                  <label key={oi} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer text-sm transition ${answers[q.id] === opt ? "border-brand-emerald bg-emerald-50" : "border-neutral-200 hover:border-emerald-300"}`}>
                    <input type="radio" name={q.id} value={opt} checked={answers[q.id] === opt} onChange={() => setAnswers((p) => ({ ...p, [q.id]: opt }))} className="accent-[#10B981]" />{opt}
                  </label>
                ))}
              </div>
            ) : (
              <textarea rows={3} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))} placeholder="Jawabanmu..." className="w-full p-3 rounded-xl border-2 border-neutral-300 bg-white text-sm resize-none focus:outline-none focus:border-brand-emerald" />
            )}
          </div>
        ))}
      </div>
      <button onClick={onSubmit} disabled={!allAnswered} className="mt-6 w-full h-12 rounded-xl bg-neutral-900 text-white font-semibold text-sm hover:bg-neutral-800 transition disabled:opacity-50 flex items-center justify-center gap-2">
        <Send className="h-4 w-4" /> {allAnswered ? "Kirim & Nilai Kesiapan" : "Jawab semua dulu"}
      </button>
    </div>
  );
}

/* ── Analyzing (magnifier scan diorama) — shown while edge fn scores ── */
function AnalyzingDiorama() {
  const [progress, setProgress] = useState(8);
  useEffect(() => {
    const t = setInterval(() => setProgress((p) => (p >= 95 ? 95 : p + 7)), 450);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="w-full flex flex-col items-center opacity-0 animate-fade-up">
      <div className="w-full max-w-2xl glass-solid rounded-[2rem] p-8 overflow-hidden relative">
        <div className="absolute inset-0 bg-cyber-grid opacity-30 z-0" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-neutral-900 text-brand-emerald rounded-xl flex items-center justify-center animate-gcPulseNode shadow-lg border border-neutral-700"><Bot className="w-6 h-6" /></div>
            <div><h3 className="font-display text-xl font-bold text-neutral-900 leading-tight">AI Assessment Engine</h3><p className="font-mono text-[10px] text-neutral-500 uppercase tracking-widest">Mengekstrak substansi jawaban...</p></div>
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
            <div className="flex justify-between text-xs font-mono text-neutral-500 mb-2"><span>ANALYZING SUBSTANCE</span><span>{progress}%</span></div>
            <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden"><div className="h-full bg-brand-emerald rounded-full transition-all duration-500 ease-out" style={{ width: `${progress}%` }} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Result (ring + verdict + real feedback) ── */
function ResultView({ result, onBack }: { result: AssessmentResult; onBack: () => void }) {
  const score = result.readinessScore;
  const ready = result.status === "ready";
  const R = 45, C = 2 * Math.PI * R;
  const [off, setOff] = useState(C);
  useEffect(() => { const t = setTimeout(() => setOff(C - (Math.min(score / 100, 1)) * C), 200); return () => clearTimeout(t); }, [C, score]);

  return (
    <div className="w-full flex flex-col items-center opacity-0 animate-fade-up">
      <div className="w-full max-w-2xl glass-solid rounded-[2rem] p-8 md:p-10 relative overflow-hidden text-center">
        <h2 className="font-display text-3xl font-extrabold text-neutral-900 mb-2">Asesmen Selesai</h2>
        <p className="font-sans text-neutral-500 mb-10">Analisis kesiapanmu berdasarkan substansi jawaban.</p>

        <div className="relative w-48 h-48 mx-auto flex items-center justify-center animate-float">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={R} fill="none" stroke="#f5f5f5" strokeWidth="8" />
            <circle cx="60" cy="60" r={R} fill="none" stroke={ready ? "#10b981" : "#D9741A"} strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.16,1,0.3,1)" }} />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="font-display text-4xl font-extrabold text-neutral-900">{score}%</span>
            <span className="font-mono text-[9px] font-bold uppercase tracking-widest mt-1" style={{ color: ready ? "#10b981" : "#D9741A" }}>Readiness</span>
          </div>
          <div className="absolute -top-2 -right-6 bg-white border-2 border-neutral-300 shadow-lg px-3 py-1.5 rounded-full flex items-center gap-1.5 animate-popUI mf-d1"><CheckCircle2 className="w-3.5 h-3.5 text-brand-emerald" /><span className="text-[10px] font-bold text-neutral-800">Kekuatan</span></div>
          <div className="absolute bottom-4 -left-8 bg-white border-2 border-neutral-300 shadow-lg px-3 py-1.5 rounded-full flex items-center gap-1.5 animate-popUI mf-d3"><AlertCircle className="w-3.5 h-3.5 text-[#D9741A]" /><span className="text-[10px] font-bold text-neutral-800">Area Gap</span></div>
        </div>

        <div className="mt-12 rounded-xl p-5 text-left" style={{ background: ready ? "#ecfdf5" : "#fff7ed", border: `1px solid ${ready ? "#a7f3d0" : "#fed7aa"}` }}>
          <h4 className="font-display font-bold mb-2" style={{ color: ready ? "#065f46" : "#9a3412" }}>{ready ? "Verdict: Siap Melamar 🌱" : "Verdict: Jalur Pengembangan"}</h4>
          <p className="font-sans text-sm leading-relaxed" style={{ color: ready ? "#047857" : "#9a3412" }}>
            {ready ? "Kamu menunjukkan pemahaman kuat pada metrik keberlanjutan. Agen AI siap menyesuaikan profilmu & mengirim lamaran." : "Hampir! Ikuti jalur pengembangan di bawah lalu coba lagi — ini bukan vonis penolakan."}
          </p>
        </div>
      </div>

      <div className="w-full max-w-2xl grid md:grid-cols-3 gap-4 mt-5">
        <FeedbackCard title="Kekuatan" icon={<CheckCircle2 className="h-4 w-4 text-brand-emerald" />} items={result.feedback?.strengths} color="#10b981" />
        <FeedbackCard title="Perlu diperkuat" icon={<TrendingUp className="h-4 w-4 text-[#D9741A]" />} items={result.feedback?.gaps} color="#D9741A" />
        <FeedbackCard title="Pengembangan" icon={<GraduationCap className="h-4 w-4 text-[#0A5BE0]" />} items={result.feedback?.developmentPath} color="#0A5BE0" />
      </div>

      <button onClick={onBack} className="mt-8 bg-neutral-900 text-white font-sans font-bold text-sm px-8 py-3 rounded-xl hover:bg-neutral-800 transition-colors shadow-md">Kembali ke daftar</button>
    </div>
  );
}

function FeedbackCard({ title, icon, items, color }: { title: string; icon: React.ReactNode; items?: string[]; color: string }) {
  return (
    <div className="glass-solid rounded-3xl p-4">
      <div className="flex items-center gap-1.5 font-semibold text-sm mb-2">{icon}{title}</div>
      <ul className="space-y-1.5">
        {(items && items.length > 0 ? items : ["—"]).map((it, i) => (
          <li key={i} className="text-xs text-foreground/80 pl-3 relative"><span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-sm" style={{ background: color }} />{it}</li>
        ))}
      </ul>
    </div>
  );
}
