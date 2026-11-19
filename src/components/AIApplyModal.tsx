import { useState, useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { aiApplicationService, type AIApplicationData } from "@/services/aiApplicationService";
import { automationQueue } from "@/services/automationQueue";
import { automationApi } from "@/services/automationApi";
import { profileService } from "@/services/profileService";
import { parseQuotaStatus } from "@/lib/quotaStatus";
import { aiPlanLabel, formatModelUsed, modelDisplay } from "@/lib/modelLabel";
import { describeApiError } from "@/lib/apiErrors";
import { describeError } from "@/lib/authErrors";
import { applyBlockers } from "@/lib/onboarding";
import { matchCaption, type JobMatch } from "@/lib/matchScore";
import { HitlTrack } from "@/components/HitlTrack";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  LEVEL_LABEL,
  SOURCE_LABEL,
  confidenceLevel,
  countNeedingAttention,
  needsAttention,
  normalizeAnswers,
  type ApprovalAnswer,
} from "@/lib/answerReview";
import { toast } from "sonner";
import {
  Bot,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Sparkles,
  CheckCircle2,
  Clock,
  FileText,
  Edit3,
  Target,
  Zap,
  Eye,
  AlertTriangle,
  UserCog,
} from "lucide-react";

interface AIApplyModalProps {
  jobId: string;
  jobTitle: string;
  company: string;
  jobData: any;
  /** Per-user match for this job (lib/matchScore.ts); null when it could not be worked out. */
  match?: JobMatch | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface QuotaState {
  remaining: number;
  quota: number;
  used: number;
}

type ProfileCheck =
  | { state: "checking" }
  | { state: "ok" }
  | { state: "blocked"; missing: string[] }
  | { state: "error"; message: string };

export function AIApplyModal({ jobId, jobTitle, company, jobData, match = null, onClose, onSuccess }: AIApplyModalProps) {
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [enqueuing, setEnqueuing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  // Standard form answers the backend prepared for this approval, each with a confidence score.
  const [preparedAnswers, setPreparedAnswers] = useState<ApprovalAnswer[]>([]);
  const [application, setApplication] = useState<AIApplicationData | null>(null);
  const [activeTab, setActiveTab] = useState<"cover" | "cv" | "strategy">("cover");
  const [isEditing, setIsEditing] = useState(false);
  const [editedCoverLetter, setEditedCoverLetter] = useState("");
  const [error, setError] = useState("");
  // Galat pengajuan persetujuan tampil di footer, tepat di atas tombolnya: area isi bisa tergulir dan galatnya tidak terlihat.
  const [approvalError, setApprovalError] = useState("");
  const [tier, setTier] = useState<"free" | "pro">("free");
  // null = belum diketahui (belum dimuat atau gagal dimuat): tidak pernah diisi angka bawaan 10 / 10.
  const [quota, setQuota] = useState<QuotaState | null>(null);
  const [quotaError, setQuotaError] = useState("");
  // Model yang benar-benar menulis draf terakhir (`analysis.modelUsed`); null sebelum ada draf.
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  // Profil harus punya nama, jabatan, dan skill sebelum kuota dipakai: draf dari profil kosong sia-sia.
  const [profileCheck, setProfileCheck] = useState<ProfileCheck>({ state: "checking" });
  // Skill gaps the model reported for the last draft or preview (not stored in the database).
  const [skillGaps, setSkillGaps] = useState<string[] | null>(null);
  const [aiGenerated, setAiGenerated] = useState<{
    coverLetter: string;
    optimizedCV: Record<string, any>;
    tailoredSkills: string[];
    aiNotes: string;
  } | null>(null);

  // The chain of models rotates (see PLAN_MODELS), so before a draft exists the UI names the plan, not a model.
  // After a draft it names the model the Edge Function reports in analysis.modelUsed.
  const planLabel = aiPlanLabel(tier);
  const modelName = modelDisplay(modelUsed, tier);
  // The per-user score from the job list (profile skills against skills the posting names), never jobs.match_score,
  // which is one global number. null = no basis for a score (shown as a dash, never as 0% or a default).
  const matchScore: number | null = match?.score ?? null;
  const profileOk = profileCheck.state === "ok";
  // An unknown quota does not block: the Edge Function enforces the limit and answers 429 when it is used up.
  const quotaExhausted = quota !== null && quota.remaining <= 0;
  const canApply = !quotaExhausted && profileOk;
  const quotaText = quota
    ? `${quota.remaining} / ${quota.quota} draf`
    : "belum bisa dimuat";

  const checkProfile = useCallback(async () => {
    setProfileCheck({ state: "checking" });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setProfileCheck({ state: "error", message: "Sesi masuk berakhir. Masuk lagi untuk melanjutkan." });
        return;
      }
      const missing = applyBlockers(await profileService.getSummary(user.id));
      setProfileCheck(missing.length > 0 ? { state: "blocked", missing } : { state: "ok" });
    } catch (err) {
      // Gagal memeriksa profil = tombol tetap terkunci: lebih baik menunggu daripada membuang kuota.
      setProfileCheck({ state: "error", message: describeError(err, "Profilmu belum bisa diperiksa.") });
    }
  }, []);

  useEffect(() => {
    loadQuota();
    checkProfile();
  }, [jobId, checkProfile]);

  const loadQuota = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Quota comes from the database function the Edge Function also uses (it counts this month's drafts);
      // the plan tier comes from subscriptions. The old code read columns that do not exist in schema.sql.
      const [statusRes, subRes] = await Promise.all([
        supabase.rpc("get_quota_status", { p_user_id: user.id }),
        supabase.from("subscriptions").select("ai_model_tier").eq("user_id", user.id).maybeSingle(),
      ]);
      if (statusRes.error) {
        // A failed RPC must not look like a full quota: keep it unknown and say so.
        console.error("Error loading quota:", statusRes.error);
        setQuota(null);
        setQuotaError(describeError(statusRes.error, "Sisa kuota belum bisa dimuat."));
      } else {
        const q = parseQuotaStatus(statusRes.data);
        setQuota({ quota: q.quota, used: q.used, remaining: q.remaining });
        setQuotaError("");
      }
      if (!subRes.error) setTier(subRes.data?.ai_model_tier === "pro" ? "pro" : "free");
    } catch (err) {
      console.error("Error loading quota:", err);
      setQuota(null);
      setQuotaError(describeError(err, "Sisa kuota belum bisa dimuat."));
    }
  };

  // Generate the application draft (server-side AI; consumes 1 monthly quota)
  const generate = async () => {
    if (!profileOk) return; // penjaga kedua: tombol sudah terkunci, tetapi kuota tidak boleh terpakai karena celah
    try {
      setGenerating(true);
      setError("");
      const { application: app, analysis } = await aiApplicationService.createDraftWithAnalysis({ jobId, tone: "professional" });
      setApplication(app);
      setSkillGaps(analysis.skillGaps);
      setModelUsed(analysis.modelUsed);
      setAiGenerated({
        coverLetter: app.cover_letter,
        optimizedCV: (app.optimized_cv as Record<string, any>) || {},
        tailoredSkills: (app.tailored_skills as string[]) || [],
        aiNotes: app.ai_notes,
      });
      setEditedCoverLetter(app.cover_letter);
      // The Edge Function reports the quota after this draft; use it so the screen is right at once.
      // Without it (older response), ask the database again.
      if (analysis.quota) {
        setQuota({ quota: analysis.quota.quota, used: analysis.quota.used, remaining: analysis.quota.remaining });
        setQuotaError("");
      } else {
        await loadQuota();
      }
    } catch (err: any) {
      setError(describeError(err, "Draf belum bisa dibuat. Coba lagi."));
    } finally {
      setGenerating(false);
    }
  };

  // Free preview-style regeneration (mode "analyze" — does NOT consume quota)
  const regenerate = async () => {
    if (!application) return;
    try {
      setRegenerating(true);
      setError("");
      const insights = await aiApplicationService.getJobInsights(jobId);
      setSkillGaps(insights.skillGaps);
      if (insights.modelUsed) setModelUsed(insights.modelUsed);
      setEditedCoverLetter(insights.coverLetter);
      setAiGenerated({
        coverLetter: insights.coverLetter,
        optimizedCV: insights.optimizedCV as Record<string, any>,
        tailoredSkills: insights.tailoredSkills,
        aiNotes: insights.aiNotes,
      });
      await aiApplicationService.updateCoverLetter(application.id, insights.coverLetter);
      setApplication({ ...application, cover_letter: insights.coverLetter });
    } catch (err: any) {
      setError(describeError(err, "Surat belum bisa ditulis ulang. Coba lagi."));
    } finally {
      setRegenerating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!application) return;
    try {
      await aiApplicationService.updateCoverLetter(application.id, editedCoverLetter);
      setApplication({ ...application, cover_letter: editedCoverLetter });
      setIsEditing(false);
    } catch (err: any) {
      setError(describeError(err, "Perubahan belum tersimpan. Coba lagi."));
    }
  };

  const persistPendingEdit = async () => {
    if (application && editedCoverLetter && editedCoverLetter !== application.cover_letter) {
      await aiApplicationService.updateCoverLetter(application.id, editedCoverLetter);
      setApplication({ ...application, cover_letter: editedCoverLetter });
    }
  };

  // Human-in-the-loop gate: the reviewed draft goes to the approval queue. Only an approval
  // (Approvals page -> POST /api/approvals/:id/approve) lets the agent submit it.
  const handleRequestApproval = async () => {
    if (!application) return;
    try {
      setRequesting(true);
      setError("");
      setApprovalError("");
      await persistPendingEdit();
      const created: any = await automationApi.createApproval({
        job_id: jobId,
        application_id: application.id,
        job_title: jobTitle,
        company,
        platform: jobData?.platform_source ?? null,
        cover_letter: editedCoverLetter || application.cover_letter,
      });
      setApprovalId(created?.id ?? "pending");
      const answers = normalizeAnswers(created?.answers);
      setPreparedAnswers(answers);
      const check = countNeedingAttention(answers);
      toast.success(
        check > 0
          ? `Draf masuk antrean persetujuan. ${check} jawaban formulir perlu kamu cek di halaman Persetujuan.`
          : "Draf masuk antrean persetujuan. Setujui di halaman Persetujuan."
      );
      onSuccess();
    } catch (err: any) {
      const message = `${describeApiError(err, "Draf belum bisa diajukan.")} Draf tetap tersimpan di Lamaran Saya.`;
      setApprovalError(message);
      toast.error(message);
    } finally {
      setRequesting(false);
    }
  };

  // The user sent this application outside Applify; record it without any automated sending.
  const handleMarkSentManually = async () => {
    if (!application) return;
    try {
      setSubmitting(true);
      await persistPendingEdit();
      await aiApplicationService.submitApplication(application.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(describeError(err, "Lamaran belum bisa ditandai terkirim. Coba lagi."));
    } finally {
      setSubmitting(false);
    }
  };

  // Fill-only run: the worker fills the external form and stops before Submit (no approval yet).
  const handleAutoApply = async () => {
    try {
      setEnqueuing(true);
      setError("");
      await automationQueue.enqueueAutoApply(jobId);
      toast.success("Tugas masuk antrean. Agen akan mengisi formulir tanpa menekan kirim. Pantau di Lamaran Saya, bagian Antrean Agen.");
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(describeError(err, "Tugas belum bisa dimasukkan ke antrean. Coba lagi."));
    } finally {
      setEnqueuing(false);
    }
  };

  const tabs = [
    { key: "cover", label: "Surat Lamaran", icon: FileText },
    { key: "cv", label: "CV Hasil AI", icon: Eye },
    { key: "strategy", label: "Strategi AI", icon: Zap },
  ] as const;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex w-full max-w-3xl max-h-[90vh] flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="border-b border-[#E0E0E0] p-5 pr-14">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-left">
              <div className="h-10 w-10 shrink-0 rounded-xl bg-[#0A5BE0]/10 grid place-items-center" aria-hidden="true">
                <Bot className="h-5 w-5 text-[#0A5BE0]" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold">Lamar dengan AI</DialogTitle>
                <DialogDescription className="truncate">{company} · {jobTitle}</DialogDescription>
              </div>
            </div>
            <span className="hidden shrink-0 items-center gap-1 rounded-full bg-[#F5F5F5] px-2.5 py-1 text-xs font-semibold text-muted-foreground sm:inline-flex">
              <Sparkles className="h-3 w-3" aria-hidden="true" /> {modelName}
            </span>
          </div>
        </DialogHeader>

        {/* Kuota habis: jelaskan kapan pulih dan apa yang masih bisa dilakukan */}
        {quota && quotaExhausted && (
          <div role="alert" className="mx-5 mt-4 rounded-xl border border-[#FDE68A] bg-[#FEF3C7] p-3">
            <p className="flex items-start gap-2 text-sm text-[#92400E]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Kuota draf bulan ini sudah habis ({quota.used} dari {quota.quota} terpakai). Kuota dihitung per bulan dan akan
                direset bulan depan. Sementara itu kamu masih bisa melihat lowongan dan memeriksa lamaran yang sudah ada.
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2 pl-6">
              <Link to="/applications" onClick={onClose} className="inline-flex min-h-11 items-center rounded-lg border-2 border-[#92400E]/40 px-4 text-sm font-semibold text-[#92400E] hover:bg-[#92400E]/10">Lihat lamaranku</Link>
              <Link to="/approvals" onClick={onClose} className="inline-flex min-h-11 items-center rounded-lg border-2 border-[#92400E]/40 px-4 text-sm font-semibold text-[#92400E] hover:bg-[#92400E]/10">Buka Persetujuan</Link>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {generating ? (
            <div className="flex flex-col items-center justify-center py-12" role="status" aria-live="polite">
              <Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0] mb-3" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {planLabel} sedang menulis lamaranmu...
              </p>
            </div>
          ) : error && !application ? (
            <div className="space-y-3">
              <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">{error}</div>
              <button
                type="button"
                onClick={generate}
                disabled={!canApply}
                className="min-h-11 px-4 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold disabled:opacity-60"
              >
                Coba lagi
              </button>
            </div>
          ) : !application || !aiGenerated ? (
            /* Layar sebelum draf dibuat */
            <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-[#0A5BE0]/10 grid place-items-center" aria-hidden="true">
                <Sparkles className="h-7 w-7 text-[#0A5BE0]" />
              </div>
              <div className="max-w-md">
                <h3 className="font-bold text-lg">Buat draf lamaran dengan AI</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {planLabel} akan menulis surat lamaran yang dioptimalkan untuk sistem seleksi (ATS)
                  dan menganalisis kecocokanmu untuk <b>{jobTitle}</b> di <b>{company}</b>.
                </p>
              </div>

              {/* Profil harus lengkap dulu: kuota tidak dipakai untuk profil kosong */}
              {profileCheck.state === "checking" && (
                <p role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Memeriksa profilmu...
                </p>
              )}
              {profileCheck.state === "blocked" && (
                <div role="alert" className="w-full max-w-md rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-left">
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <UserCog className="h-4 w-4" aria-hidden="true" /> Lengkapi profil dulu
                  </p>
                  <p className="mt-1 text-sm text-amber-900">
                    AI memakai profilmu untuk menulis lamaran. Dengan profil yang masih kosong, drafnya akan sia-sia dan kuotamu terbuang. Kuotamu belum dipakai.
                  </p>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-amber-900">
                    {profileCheck.missing.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link to="/profile" onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A5BE0] px-5 text-sm font-semibold text-white hover:bg-[#0256d3]">
                      Lengkapi profil <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <button type="button" onClick={checkProfile} className="min-h-11 rounded-xl border-2 border-amber-400 px-4 text-sm font-semibold text-amber-900 hover:bg-amber-100">
                      Sudah kulengkapi, periksa lagi
                    </button>
                  </div>
                </div>
              )}
              {profileCheck.state === "error" && (
                <div role="alert" className="w-full max-w-md rounded-xl border-2 border-red-200 bg-red-50 p-4 text-left text-sm text-red-700">
                  <p>{profileCheck.message} Draf belum bisa dibuat sebelum profilmu terperiksa, supaya kuota tidak terbuang.</p>
                  <button type="button" onClick={checkProfile} className="mt-2 min-h-11 rounded-lg bg-red-600 px-4 font-semibold text-white">Coba lagi</button>
                </div>
              )}

              <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" aria-hidden="true" />
                {quota ? (
                  <>Sisa kuota bulan ini: <b>{quota.remaining}</b> / {quota.quota} draf</>
                ) : (
                  <span role="status">Sisa kuota belum bisa dimuat. Server tetap membatasi kuota saat draf dibuat.</span>
                )}
              </div>
              {quotaError && !quota && (
                <button type="button" onClick={loadQuota} className="min-h-11 rounded-lg border-2 border-[#999999] px-4 text-sm font-medium hover:border-[#0A5BE0]">
                  Muat kuota lagi
                </button>
              )}
              <button
                type="button"
                onClick={generate}
                disabled={!canApply}
                className="min-h-12 px-6 rounded-xl bg-[#0A5BE0] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {quotaExhausted ? "Kuota bulan ini habis" : !profileOk ? "Lengkapi profil dulu" : "Buat draf dengan AI (pakai 1 kuota)"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Where this letter is in the human-in-the-loop flow */}
              <HitlTrack
                stage="gate"
                caption={
                  approvalId
                    ? "Menunggu persetujuanmu di halaman Persetujuan (berlaku 1 jam). Tanpa persetujuan, agen tidak akan mengirim."
                    : "Draf siap. Tinjau dan edit bila perlu, lalu ajukan ke persetujuan."
                }
              />

              {error && (
                <div role="alert" className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}

              {/* Form answers prepared for the approval, low-confidence ones highlighted */}
              {approvalId && preparedAnswers.length > 0 && (
                <div className="rounded-xl border-2 border-[#16150F]/10 p-4">
                  <h4 className="text-sm font-semibold">Jawaban formulir yang disiapkan agen</h4>
                  <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
                    {countNeedingAttention(preparedAnswers) > 0
                      ? `${countNeedingAttention(preparedAnswers)} dari ${preparedAnswers.length} perlu dicek. `
                      : "Semua berkeyakinan tinggi. "}
                    Tinjau lengkapnya di halaman Persetujuan sebelum menyetujui.
                  </p>
                  <ul className="space-y-1.5">
                    {preparedAnswers.map((a, i) => {
                      const attention = needsAttention(a);
                      return (
                        <li
                          key={i}
                          data-confidence={confidenceLevel(a.confidence)}
                          className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-xs ${
                            attention ? "bg-[#D9741A]/10 border border-[#D9741A]/40" : "bg-[#F5F5F5]"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="font-medium">{a.question}</span>
                            <span className="block truncate text-muted-foreground">
                              {a.answer.trim() || "(kosong)"}
                              {a.source ? ` · ${SOURCE_LABEL[a.source]}` : ""}
                            </span>
                          </span>
                          <span className={`shrink-0 font-mono ${attention ? "font-semibold text-[#B45309]" : "text-muted-foreground"}`}>
                            {attention && <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden="true" />}
                            {Math.round(a.confidence * 100)}% {LEVEL_LABEL[confidenceLevel(a.confidence)]}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* AI Info */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Bot className="h-3 w-3" aria-hidden="true" />
                  Model: {modelName}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  Sisa kuota: {quotaText}
                </span>
              </div>

              {/* AI Scores */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-[#0A5BE0]/5 border border-[#0A5BE0]/20 p-3 text-center">
                  <Target className="h-5 w-5 mx-auto text-[#0A5BE0] mb-1" aria-hidden="true" />
                  <div className="text-lg font-bold text-[#0A5BE0]">{aiGenerated.tailoredSkills?.length || 0}</div>
                  <div className="text-xs text-muted-foreground">Skill Cocok</div>
                </div>
                <div className="rounded-xl bg-[#D2F801]/10 border border-[#D2F801]/30 p-3 text-center">
                  <Sparkles className="h-5 w-5 mx-auto text-[#16150F] mb-1" aria-hidden="true" />
                  <div className="text-lg font-bold">{matchScore !== null ? `${matchScore}%` : "—"}</div>
                  <div className="text-xs text-muted-foreground">Skor Kecocokan</div>
                  {match && <div className="text-xs text-muted-foreground">{matchCaption(match)}</div>}
                </div>
                <div className="rounded-xl bg-purple-50 border border-purple-200 p-3 text-center">
                  <Bot className="h-5 w-5 mx-auto text-purple-700 mb-1" aria-hidden="true" />
                  <div className="text-sm font-bold text-purple-700">{modelName}</div>
                  <div className="text-xs text-muted-foreground">{tier === "pro" ? "Paket Pro" : "Paket Free"}</div>
                </div>
                <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center">
                  <CheckCircle2 className="h-5 w-5 mx-auto text-green-700 mb-1" aria-hidden="true" />
                  <div className="text-lg font-bold text-green-700">Siap</div>
                  <div className="text-xs text-muted-foreground">Surat &amp; CV</div>
                </div>
              </div>

              {/* Tabs */}
              <div role="tablist" aria-label="Isi draf" className="flex gap-2 overflow-x-auto border-b border-[#E0E0E0]">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    id={`apply-tab-${tab.key}`}
                    aria-selected={activeTab === tab.key}
                    aria-controls={`apply-panel-${tab.key}`}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                      activeTab === tab.key
                        ? "border-[#0A5BE0] text-[#0A5BE0]"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <tab.icon className="h-4 w-4" aria-hidden="true" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="min-h-[200px]">
                {activeTab === "cover" && (
                  <div role="tabpanel" id="apply-panel-cover" aria-labelledby="apply-tab-cover" className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Bot className="h-4 w-4 text-[#0A5BE0]" aria-hidden="true" />
                        Surat lamaran dari AI
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setIsEditing(!isEditing)}
                          className="min-h-11 px-3 rounded-lg border border-[#999999] text-sm font-medium hover:border-[#0A5BE0] transition flex items-center gap-1"
                        >
                          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                          {isEditing ? "Batal" : "Sunting"}
                        </button>
                        <button
                          type="button"
                          onClick={regenerate}
                          disabled={regenerating}
                          className="min-h-11 px-3 rounded-lg bg-[#0A5BE0]/10 text-[#0A5BE0] text-sm font-medium hover:bg-[#0A5BE0]/20 transition flex items-center gap-1 disabled:opacity-60"
                        >
                          {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                          Tulis ulang (gratis)
                        </button>
                      </div>
                    </div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <label htmlFor="apply-cover-edit" className="sr-only">Isi surat lamaran</label>
                        <textarea
                          id="apply-cover-edit"
                          value={editedCoverLetter}
                          onChange={(e) => setEditedCoverLetter(e.target.value)}
                          className="w-full h-64 p-4 rounded-xl border-2 border-[#999999] text-base md:text-sm resize-none focus:outline-none focus:border-[#0A5BE0]"
                        />
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          className="min-h-11 px-4 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold hover:opacity-90 transition"
                        >
                          Simpan Perubahan
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-[#F5F5F5] p-5 text-sm whitespace-pre-wrap leading-relaxed">
                        {editedCoverLetter || application.cover_letter}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "cv" && (
                  <div role="tabpanel" id="apply-panel-cv" aria-labelledby="apply-tab-cv" className="space-y-4">
                    <div className="rounded-xl bg-[#F5F5F5] p-5 space-y-4">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Ringkasan Profesional</h4>
                        <p className="text-sm">{aiGenerated.optimizedCV?.summary || "—"}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Skill yang Disorot</h4>
                        <ul className="flex flex-wrap gap-2">
                          {aiGenerated.tailoredSkills?.map((skill: string, i: number) => (
                            <li key={i} className="text-xs bg-[#0A5BE0]/10 text-[#0A5BE0] px-2.5 py-1 rounded-full font-medium">
                              {skill}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "strategy" && (
                  <div role="tabpanel" id="apply-panel-strategy" aria-labelledby="apply-tab-strategy" className="space-y-3">
                    {formatModelUsed(modelUsed) && (
                      <p className="text-xs text-muted-foreground">
                        Model yang menulis draf: <b>{formatModelUsed(modelUsed)}</b> ({planLabel})
                      </p>
                    )}
                    <div className="rounded-xl bg-[#F5F5F5] p-5">
                      <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">{aiGenerated.aiNotes || "—"}</pre>
                    </div>
                    {skillGaps !== null && (
                      <div className="rounded-xl border-2 border-[#FDE68A] bg-[#FFFBEB] p-4">
                        <p className="text-xs font-semibold text-[#92400E] flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Skill yang diminta lowongan tetapi belum ada di profilmu
                        </p>
                        {skillGaps.length > 0 ? (
                          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Kesenjangan skill">
                            {skillGaps.map((g) => (
                              <li key={g} className="text-xs bg-white border border-[#FCD34D] text-[#92400E] px-2 py-0.5 rounded-full">{g}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-xs text-[#92400E]">Model tidak melaporkan kesenjangan skill.</p>
                        )}
                        <p className="mt-2 text-xs text-[#92400E]/90">Perkiraan model bahasa, bukan hasil pengukuran. Tambahkan skill yang benar-benar kamu kuasai di halaman Profil.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-[#E0E0E0] space-y-3">
          {approvalError && (
            <div role="alert" id="apply-approval-error" className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{approvalError}</span>
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 px-5 rounded-xl border-2 border-[#999999] text-sm font-medium hover:border-[#0A5BE0] transition"
            >
              {application ? "Tutup (draf tersimpan)" : "Tutup"}
            </button>
            {application && jobData?.external_url && (
              <button
                type="button"
                onClick={handleAutoApply}
                disabled={enqueuing}
                aria-describedby="apply-fill-hint"
                title="Agen membuka formulir lowongan dan mengisinya, lalu berhenti sebelum tombol kirim."
                className="min-h-11 px-4 rounded-xl border-2 border-[#0A5BE0] text-[#0A5BE0] text-sm font-semibold hover:bg-[#0A5BE0]/5 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {enqueuing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Bot className="h-4 w-4" aria-hidden="true" />}
                Isi Formulir Saja
              </button>
            )}
            {approvalId ? (
              <Link
                to="/approvals"
                onClick={onClose}
                className="flex-1 min-h-11 rounded-xl bg-[#16150F] text-white text-sm font-semibold hover:-translate-y-0.5 hover:shadow-lg transition flex items-center justify-center gap-2"
              >
                <ShieldCheck className="h-4 w-4 text-[#D2F801]" aria-hidden="true" />
                Buka Persetujuan
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : application && (
              <button
                type="button"
                onClick={handleRequestApproval}
                disabled={requesting}
                aria-describedby={approvalError ? "apply-approval-error" : undefined}
                className="flex-1 min-h-11 rounded-xl bg-[#16150F] text-white text-sm font-semibold hover:-translate-y-0.5 hover:shadow-lg transition disabled:opacity-60 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
              >
                {requesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-[#D2F801]" aria-hidden="true" />
                )}
                {requesting ? "Mengajukan..." : approvalError ? "Coba ajukan lagi" : "Ajukan ke Persetujuan"}
              </button>
            )}
          </div>
          {application && jobData?.external_url && (
            <p id="apply-fill-hint" className="text-xs text-muted-foreground">
              "Isi Formulir Saja": agen membuka formulir lowongan dan mengisinya, lalu berhenti sebelum tombol kirim. Pantau di Lamaran Saya, bagian Antrean Agen.
            </p>
          )}
          {application && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleMarkSentManually}
                disabled={submitting}
                className="min-h-11 px-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-[#16150F] hover:underline disabled:opacity-60"
              >
                {submitting ? "Menyimpan..." : "Sudah kukirim sendiri di luar Applify: tandai terkirim"}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
