import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  greenCareerService,
  type GreenJob,
  type AssessmentQuestion,
  type AssessmentResult,
} from "@/services/greenCareerService";
import {
  Leaf, Loader2, Sparkles, CheckCircle2, ArrowLeft, Award,
  TrendingUp, AlertCircle, MapPin, Send, GraduationCap,
} from "lucide-react";

export const Route = createFileRoute("/green-career")({ component: GreenCareerPage });

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

  return (
    <div className="min-h-screen px-4 md:px-8 py-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="rounded-2xl bg-[#161616] text-white p-6 md:p-7 relative overflow-hidden mb-7">
        <div className="absolute inset-0 opacity-90" style={{ background: "radial-gradient(520px 200px at 90% -40%, rgba(28,150,86,.35), transparent 60%)" }} />
        <div className="relative">
          <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-[#5CE0A0] mb-3">
            <Leaf className="h-4 w-4" /> Green Career Track
          </div>
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">Jalur tervalidasi ke peluang berdampak</h1>
          <p className="text-sm text-white/70 mt-2 max-w-2xl">
            Peran di ekonomi hijau itu penting &amp; langka. Sebelum di-<i>fast-track</i>, ikuti asesmen kesiapan singkat
            agar kamu benar-benar cocok. <b className="text-white">Bukan vonis</b> — yang belum siap tetap dapat jalur pengembangan.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600 mb-5 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* LIST */}
      {view === "list" && (
        loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[#1C9656]" /></div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Belum ada lowongan Green Career aktif.</div>
        ) : (
          <div className="grid gap-4">
            {jobs.map((j) => (
              <div key={j.id} className="rounded-2xl border-2 border-[#E0E0E0] bg-white p-5 hover:border-[#1C9656] transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-[#1C9656]/10 text-[#127443]">
                        <Leaf className="h-3 w-3" /> Green Career
                      </span>
                      {typeof j.company_insight?.green_score === "number" && (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#D2F801] text-[#161616]">
                          Green Score {j.company_insight.green_score}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-lg truncate">{j.title}</h3>
                    <p className="text-sm text-muted-foreground">{j.company}</p>
                    {j.location && (
                      <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {j.location}
                      </p>
                    )}
                    {j.company_insight?.summary && (
                      <p className="text-xs text-[#127443] mt-2">{j.company_insight.summary}</p>
                    )}
                  </div>
                  <button
                    onClick={() => startAssessment(j)}
                    disabled={busy}
                    className="shrink-0 h-11 px-5 rounded-xl bg-[#1C9656] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 flex items-center gap-2"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Mulai Asesmen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ASSESSMENT */}
      {view === "assessment" && (
        <div>
          <button onClick={reset} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
            <ArrowLeft className="h-4 w-4" /> Kembali
          </button>
          <div className="mb-5">
            <h2 className="font-bold text-xl">Asesmen Kesiapan</h2>
            <p className="text-sm text-muted-foreground">{job?.title} · {job?.company}</p>
          </div>
          <div className="space-y-5">
            {questions.map((q, i) => (
              <div key={q.id} className="rounded-2xl border border-[#E0E0E0] bg-white p-5">
                <p className="font-medium text-sm mb-3"><span className="text-[#1C9656] font-bold mr-1">{i + 1}.</span>{q.question}</p>
                {q.type === "mcq" && q.options ? (
                  <div className="space-y-2">
                    {q.options.map((opt, oi) => (
                      <label key={oi} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer text-sm transition ${
                        answers[q.id] === opt ? "border-[#1C9656] bg-[#1C9656]/5" : "border-[#E0E0E0] hover:border-[#999]"
                      }`}>
                        <input
                          type="radio" name={q.id} value={opt}
                          checked={answers[q.id] === opt}
                          onChange={() => setAnswers((p) => ({ ...p, [q.id]: opt }))}
                          className="accent-[#1C9656]"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    rows={3}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                    placeholder="Jawabanmu..."
                    className="w-full p-3 rounded-xl border border-[#999] text-sm resize-none focus:outline-none focus:border-[#1C9656]"
                  />
                )}
              </div>
            ))}
          </div>
          <button
            onClick={submit}
            disabled={busy || !allAnswered}
            className="mt-6 w-full h-12 rounded-xl bg-[#1C9656] text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {busy ? "Menilai..." : allAnswered ? "Kirim & Nilai Kesiapan" : "Jawab semua dulu"}
          </button>
        </div>
      )}

      {/* RESULT */}
      {view === "result" && result && (
        <div>
          <div className="rounded-2xl border-2 border-[#E0E0E0] bg-white p-6 text-center mb-5">
            <div className={`inline-grid place-items-center h-24 w-24 rounded-full mb-3 ${result.status === "ready" ? "bg-[#1C9656]/10" : "bg-amber-100"}`}>
              <div className={`text-3xl font-bold ${result.status === "ready" ? "text-[#1C9656]" : "text-amber-600"}`}>{result.readinessScore}</div>
            </div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Skor Kesiapan</div>
            {result.status === "ready" ? (
              <div className="inline-flex items-center gap-1.5 text-[#127443] font-bold"><Award className="h-5 w-5" /> Siap di-fast-track! 🌱</div>
            ) : (
              <div className="inline-flex items-center gap-1.5 text-amber-600 font-bold"><GraduationCap className="h-5 w-5" /> Hampir — ini jalur pengembanganmu</div>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-5">
            <FeedbackCard title="Kekuatan" icon={<CheckCircle2 className="h-4 w-4 text-[#1C9656]" />} items={result.feedback?.strengths} color="#1C9656" />
            <FeedbackCard title="Yang perlu diperkuat" icon={<TrendingUp className="h-4 w-4 text-amber-600" />} items={result.feedback?.gaps} color="#D97706" />
            <FeedbackCard title="Langkah pengembangan" icon={<GraduationCap className="h-4 w-4 text-[#0367FC]" />} items={result.feedback?.developmentPath} color="#0367FC" />
          </div>

          <div className="flex gap-3">
            <button onClick={reset} className="h-11 px-5 rounded-xl border-2 border-[#999] text-sm font-medium hover:border-[#1C9656] transition">
              Kembali ke daftar
            </button>
            {result.status === "ready" && job?.external_url && (
              <a href={job.external_url} target="_blank" rel="noreferrer"
                className="flex-1 h-11 rounded-xl bg-[#1C9656] text-white text-sm font-semibold hover:opacity-90 transition flex items-center justify-center gap-2">
                <Send className="h-4 w-4" /> Lamar (fast-track)
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FeedbackCard({ title, icon, items, color }: { title: string; icon: React.ReactNode; items?: string[]; color: string }) {
  return (
    <div className="rounded-2xl border border-[#E0E0E0] bg-white p-4">
      <div className="flex items-center gap-1.5 font-semibold text-sm mb-2">{icon}{title}</div>
      <ul className="space-y-1.5">
        {(items && items.length > 0 ? items : ["—"]).map((it, i) => (
          <li key={i} className="text-xs text-[#26241C] pl-3 relative">
            <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-sm" style={{ background: color }} />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
