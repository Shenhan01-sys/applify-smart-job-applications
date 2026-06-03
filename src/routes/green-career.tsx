import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import {
  greenCareerService,
  type GreenJob,
  type AssessmentQuestion,
  type AssessmentResult,
} from "@/services/greenCareerService";
import {
  Leaf, Loader2, Sparkles, CheckCircle2, ArrowLeft, Award,
  TrendingUp, AlertCircle, MapPin, Send, GraduationCap, Brain,
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

type View = "list" | "assessment" | "result";

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
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const startAssessment = async (j: GreenJob) => {
    try {
      setBusy(true); setError(""); setJob(j);
      const res = await greenCareerService.startAssessment(j.id);
      setAssessmentId(res.assessmentId); setQuestions(res.questions); setAnswers({}); setView("assessment");
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const submit = async () => {
    try {
      setBusy(true); setError("");
      const payload = questions.map((q) => ({ id: q.id, question: q.question, answer: answers[q.id] ?? "" }));
      setResult(await greenCareerService.submitAssessment(assessmentId, payload));
      setView("result");
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const reset = () => { setView("list"); setJob(null); setResult(null); setQuestions([]); setAnswers({}); setError(""); };
  const allAnswered = questions.length > 0 && questions.every((q) => (answers[q.id] ?? "").trim().length > 0);
  const answered = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* ── Header diorama (neural eco) — list view only ── */}
        {view === "list" && (
          <div className="rounded-3xl bg-[#16150F] text-[#F4F1E8] p-6 md:p-8 relative overflow-hidden mb-7">
            <div className="absolute -top-12 -right-10 h-48 w-48 rounded-full bg-[#1C9656]/30 blur-3xl animate-blob" aria-hidden="true" />
            <div className="absolute right-3 bottom-1 w-[200px] h-[110px] opacity-90 hidden sm:block" aria-hidden="true"><NeuralEco /></div>
            <div className="relative max-w-xl">
              <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-[#D2F801] mb-3">
                <Leaf className="h-4 w-4" /> Green Career Track
              </div>
              <h1 className="font-display text-2xl md:text-3xl font-extrabold leading-tight">Jalur tervalidasi ke peluang berdampak</h1>
              <p className="text-sm text-[#C9C4B2] mt-2">
                Peran di ekonomi hijau itu penting &amp; langka. Sebelum di-<i>fast-track</i>, ikuti asesmen kesiapan singkat agar kamu benar-benar cocok. <b className="text-white">Bukan vonis</b> — yang belum siap tetap dapat jalur pengembangan.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-[#C0341A]/[6%] border border-[#C0341A]/30 p-3 text-sm text-[#C0341A] mb-5 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* ── LIST ── */}
        {view === "list" && (
          loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[#1C9656]" /></div>
          ) : jobs.length === 0 ? (
            <div className="glass rounded-3xl text-center py-16 text-muted-foreground text-sm">
              <Leaf className="h-8 w-8 mx-auto text-[#1C9656] mb-3" />
              Belum ada lowongan Green Career aktif. Cek lagi nanti — agen kami terus meneliti perusahaan berdampak.
            </div>
          ) : (
            <div className="grid gap-4">
              {jobs.map((j) => {
                const score = j.company_insight?.green_score;
                return (
                  <div key={j.id} className="glass rounded-3xl p-5 hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-[#1C9656]/12 text-[#127443]"><Leaf className="h-3 w-3" /> Green Career</span>
                          {typeof score === "number" && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#D2F801] text-[#16150F]">Green {score}</span>}
                          {typeof j.match_score === "number" && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#0A5BE0]/10 text-[#0A5BE0]">Match {j.match_score}%</span>}
                        </div>
                        <h3 className="font-display font-bold text-lg truncate">{j.title}</h3>
                        <p className="text-sm text-muted-foreground">{j.company}</p>
                        {j.location && <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {j.location}</p>}
                        {j.company_insight?.summary && <p className="text-xs text-[#127443] mt-2">{j.company_insight.summary}</p>}
                        {typeof score === "number" && (
                          <div className="mt-3 h-1.5 max-w-[220px] rounded-full bg-black/[6%] overflow-hidden">
                            <div className="h-full bg-[#1C9656] rounded-full" style={{ width: `${score}%` }} />
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <button onClick={() => startAssessment(j)} disabled={busy} className="h-11 px-5 rounded-xl bg-[#1C9656] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 flex items-center gap-2">
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Mulai Asesmen
                        </button>
                        <p className="text-[10px] text-muted-foreground mt-1.5 max-w-[140px]">Rp15.000/sesi · bisa batal gratis · refund 50% bila tak lolos</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ── ASSESSMENT ── */}
        {view === "assessment" && (
          <div>
            <button onClick={reset} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"><ArrowLeft className="h-4 w-4" /> Kembali</button>

            {/* mini "AI menilai" diorama */}
            <div className="relative glass rounded-3xl p-5 mb-5 overflow-hidden flex items-center gap-4">
              <div className="relative h-14 w-14 shrink-0 rounded-2xl bg-[#16150F] grid place-items-center text-[#D2F801]">
                <Brain className="h-6 w-6" />
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[#1C9656] animate-pulse-glow" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display font-bold text-lg">Asesmen Kesiapan</h2>
                <p className="text-sm text-muted-foreground truncate">{job?.title} · {job?.company}</p>
              </div>
              <div className="ml-auto text-right shrink-0">
                <p className="font-mono text-sm font-bold text-[#1C9656]">{answered}/{questions.length}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">terjawab</p>
              </div>
            </div>

            <div className="space-y-4">
              {questions.map((q, i) => (
                <div key={q.id} className="glass rounded-3xl p-5">
                  <p className="font-medium text-sm mb-3"><span className="text-[#1C9656] font-bold mr-1">{i + 1}.</span>{q.question}</p>
                  {q.type === "mcq" && q.options ? (
                    <div className="space-y-2">
                      {q.options.map((opt, oi) => (
                        <label key={oi} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer text-sm transition ${answers[q.id] === opt ? "border-[#1C9656] bg-[#1C9656]/[6%]" : "border-[color:var(--border)] hover:border-[#1C9656]/50"}`}>
                          <input type="radio" name={q.id} value={opt} checked={answers[q.id] === opt} onChange={() => setAnswers((p) => ({ ...p, [q.id]: opt }))} className="accent-[#1C9656]" />
                          {opt}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea rows={3} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))} placeholder="Jawabanmu..." className="w-full p-3 rounded-xl border border-[color:var(--border)] bg-white text-sm resize-none focus:outline-none focus:border-[#1C9656]" />
                  )}
                </div>
              ))}
            </div>
            <button onClick={submit} disabled={busy || !allAnswered} className="mt-6 w-full h-12 rounded-xl bg-[#16150F] text-[#F4F1E8] font-semibold text-sm hover:bg-black transition disabled:opacity-50 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy ? "AI menilai..." : allAnswered ? "Kirim & Nilai Kesiapan" : "Jawab semua dulu"}
            </button>
          </div>
        )}

        {/* ── RESULT ── */}
        {view === "result" && result && (
          <div>
            <button onClick={reset} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"><ArrowLeft className="h-4 w-4" /> Kembali ke daftar</button>
            <div className="glass rounded-3xl p-6 md:p-8 text-center mb-5">
              <ReadinessRing score={result.readinessScore} ready={result.status === "ready"} />
              <div className="text-xs uppercase tracking-wider text-muted-foreground mt-3 mb-1">Skor Kesiapan</div>
              {result.status === "ready" ? (
                <div className="inline-flex items-center gap-1.5 text-[#127443] font-bold"><Award className="h-5 w-5" /> Siap di-fast-track! 🌱</div>
              ) : (
                <div className="inline-flex items-center gap-1.5 text-[#D9741A] font-bold"><GraduationCap className="h-5 w-5" /> Hampir — ini jalur pengembanganmu</div>
              )}
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-5">
              <FeedbackCard title="Kekuatan" icon={<CheckCircle2 className="h-4 w-4 text-[#1C9656]" />} items={result.feedback?.strengths} color="#1C9656" />
              <FeedbackCard title="Yang perlu diperkuat" icon={<TrendingUp className="h-4 w-4 text-[#D9741A]" />} items={result.feedback?.gaps} color="#D9741A" />
              <FeedbackCard title="Langkah pengembangan" icon={<GraduationCap className="h-4 w-4 text-[#0A5BE0]" />} items={result.feedback?.developmentPath} color="#0A5BE0" />
            </div>

            <div className="flex gap-3">
              <button onClick={reset} className="h-11 px-5 rounded-xl border border-[color:var(--border)] bg-white text-sm font-medium hover:border-[#1C9656] transition">Kembali ke daftar</button>
              {result.status === "ready" && job?.external_url && (
                <a href={job.external_url} target="_blank" rel="noreferrer" className="flex-1 h-11 rounded-xl bg-[#1C9656] text-white text-sm font-semibold hover:opacity-90 transition flex items-center justify-center gap-2"><Send className="h-4 w-4" /> Lamar (fast-track)</a>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/* Compact neural eco-network (reuses global .animate-draw-main + delay classes) */
function NeuralEco() {
  const paths = [
    "M 8,95 C 45,85 55,55 85,48 C 115,41 135,58 165,32",
    "M 8,95 C 38,78 75,72 100,55 C 125,38 150,48 180,22",
    "M 8,95 C 48,88 62,62 92,72 C 122,82 148,62 185,52",
    "M 8,95 C 30,70 60,80 80,40 C 100,12 140,30 150,8",
  ];
  const delays = ["mf-d0", "mf-d1", "mf-d2", "mf-d1"];
  return (
    <svg viewBox="0 0 190 100" className="w-full h-full overflow-visible drop-shadow-[0_0_8px_rgba(210,248,1,0.6)]">
      <g stroke="#D2F801" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.16" filter="blur(2px)">
        {paths.map((d, i) => <path key={i} d={d} />)}
      </g>
      <g stroke="#D2F801" strokeWidth="2.5" fill="none" strokeLinecap="round">
        {paths.map((d, i) => <path key={i} d={d} className={`animate-draw-main ${delays[i]}`} />)}
      </g>
    </svg>
  );
}

function ReadinessRing({ score, ready }: { score: number; ready: boolean }) {
  const R = 50, C = 2 * Math.PI * R;
  const [off, setOff] = useState(C);
  useEffect(() => { const t = setTimeout(() => setOff(C - C * Math.min(score / 100, 1)), 150); return () => clearTimeout(t); }, [C, score]);
  const color = ready ? "#1C9656" : "#D9741A";
  return (
    <div className="relative w-32 h-32 mx-auto">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(22,21,15,0.08)" strokeWidth="11" />
        <circle cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="11" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display text-3xl font-extrabold" style={{ color }}>{score}</span>
      </div>
    </div>
  );
}

function FeedbackCard({ title, icon, items, color }: { title: string; icon: React.ReactNode; items?: string[]; color: string }) {
  return (
    <div className="glass rounded-3xl p-4">
      <div className="flex items-center gap-1.5 font-semibold text-sm mb-2">{icon}{title}</div>
      <ul className="space-y-1.5">
        {(items && items.length > 0 ? items : ["—"]).map((it, i) => (
          <li key={i} className="text-xs text-foreground/80 pl-3 relative">
            <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-sm" style={{ background: color }} />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
