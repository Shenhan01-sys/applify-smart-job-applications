import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { aiApplicationService, type AIApplicationData } from "@/services/aiApplicationService";
import { automationQueue } from "@/services/automationQueue";
import { automationApi } from "@/services/automationApi";
import { parseQuotaStatus } from "@/lib/quotaStatus";
import { describeApiError } from "@/lib/apiErrors";
import { scoreOrNull } from "@/lib/jobCardData";
import { HitlTrack } from "@/components/HitlTrack";
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
  X,
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
  Crown,
} from "lucide-react";

interface AIApplyModalProps {
  jobId: string;
  jobTitle: string;
  company: string;
  jobData: any;
  onClose: () => void;
  onSuccess: () => void;
}

interface QuotaState {
  remaining: number;
  quota: number;
  used: number;
}

export function AIApplyModal({ jobId, jobTitle, company, jobData, onClose, onSuccess }: AIApplyModalProps) {
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
  const [tier, setTier] = useState<"free" | "pro">("free");
  const [quota, setQuota] = useState<QuotaState>({ remaining: 10, quota: 10, used: 0 });
  // Skill gaps the model reported for the last draft or preview (not stored in the database).
  const [skillGaps, setSkillGaps] = useState<string[] | null>(null);
  const [aiGenerated, setAiGenerated] = useState<{
    coverLetter: string;
    optimizedCV: Record<string, any>;
    tailoredSkills: string[];
    aiNotes: string;
  } | null>(null);

  // Free-tier models rotate (see edge function FREE_MODELS), so the UI names the tier, not a slug.
  const modelLabel = tier === "pro" ? "model Pro" : "model gratis OpenRouter";
  // null = no score stored for this job (shown as a dash, never as 0% or a default)
  const matchScore: number | null = scoreOrNull(jobData?.match_score);
  const canApply = quota.remaining > 0;

  useEffect(() => {
    loadQuota();
  }, [jobId]);

  const loadQuota = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Quota comes from the database function the Edge Function also uses (it counts this month's drafts);
      // the plan tier comes from subscriptions. The old code read columns that do not exist in schema.sql.
      const [{ data: status }, { data: sub }] = await Promise.all([
        supabase.rpc("get_quota_status", { p_user_id: user.id }),
        supabase.from("subscriptions").select("ai_model_tier").eq("user_id", user.id).maybeSingle(),
      ]);
      const q = parseQuotaStatus(status);
      setQuota({ quota: q.quota, used: q.used, remaining: q.remaining });
      setTier(sub?.ai_model_tier === "pro" ? "pro" : "free");
    } catch (err) {
      console.error("Error loading quota:", err);
    }
  };

  // Generate the application draft (server-side AI; consumes 1 monthly quota)
  const generate = async () => {
    try {
      setGenerating(true);
      setError("");
      const { application: app, analysis } = await aiApplicationService.createDraftWithAnalysis({ jobId, tone: "professional" });
      setApplication(app);
      setSkillGaps(analysis.skillGaps);
      setAiGenerated({
        coverLetter: app.cover_letter,
        optimizedCV: (app.optimized_cv as Record<string, any>) || {},
        tailoredSkills: (app.tailored_skills as string[]) || [],
        aiNotes: app.ai_notes,
      });
      setEditedCoverLetter(app.cover_letter);
      await loadQuota();
    } catch (err: any) {
      setError(err.message || "Gagal generate aplikasi AI");
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
      setError(err.message || "Gagal regenerate");
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
      setError(err.message || "Gagal menyimpan perubahan");
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
          ? `Draf masuk antrean persetujuan. ${check} jawaban formulir perlu kamu cek di halaman Approvals.`
          : "Draf masuk antrean persetujuan. Setujui di halaman Approvals."
      );
      onSuccess();
    } catch (err: any) {
      setError(`${describeApiError(err, "Gagal mengajukan persetujuan")}. Draf tetap tersimpan di Applications.`);
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
      setError(err.message || "Gagal menandai lamaran");
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
      toast.success("Agen akan mengisi formulir tanpa menekan kirim. Pantau di Applications.");
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal menjadwalkan auto-apply");
    } finally {
      setEnqueuing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl max-h-[90vh] bg-white rounded-2xl border-2 border-[#999999] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-[#E0E0E0] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#0A5BE0]/10 grid place-items-center">
              <Bot className="h-5 w-5 text-[#0A5BE0]" />
            </div>
            <div>
              <h2 className="font-bold text-lg">AI Auto-Apply</h2>
              <p className="text-sm text-muted-foreground">
                {company} · {jobTitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold ${
              tier === "pro" ? "bg-[#D2F801] text-[#16150F]" : "bg-[#F5F5F5] text-muted-foreground"
            }`}>
              {tier === "pro" ? <Crown className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              {tier === "pro" ? "PRO" : "FREE"}
            </span>
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-lg border border-[#999999] grid place-items-center hover:border-[#0A5BE0] transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Quota Warning */}
        {!canApply && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#92400E] shrink-0" />
            <p className="text-sm text-[#92400E]">
              Kuota bulanan ({quota.quota} lamaran) sudah habis.
              {tier === "free" && " Upgrade ke Pro untuk lebih banyak lamaran."}
            </p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {generating ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0] mb-3" />
              <p className="text-sm text-muted-foreground">
                AI ({modelLabel}) sedang menulis lamaranmu...
              </p>
            </div>
          ) : error && !application ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>
              {!application && (
                <button
                  onClick={generate}
                  disabled={!canApply}
                  className="h-10 px-4 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold disabled:opacity-60"
                >
                  Coba lagi
                </button>
              )}
            </div>
          ) : !application || !aiGenerated ? (
            /* Pre-generate preview screen */
            <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-[#0A5BE0]/10 grid place-items-center">
                <Sparkles className="h-7 w-7 text-[#0A5BE0]" />
              </div>
              <div className="max-w-md">
                <h3 className="font-bold text-lg">Generate lamaran dengan AI</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI ({modelLabel}) akan menulis cover letter
                  yang dioptimalkan ATS & menganalisis kecocokanmu untuk <b>{jobTitle}</b> di <b>{company}</b>.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Sisa kuota bulan ini: <b>{quota.remaining}</b> / {quota.quota} lamaran
              </div>
              <button
                onClick={generate}
                disabled={!canApply}
                className="h-11 px-6 rounded-xl bg-[#0A5BE0] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                {canApply ? "Generate dengan AI (1 kuota)" : "Kuota Habis"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Where this letter is in the human-in-the-loop flow */}
              <HitlTrack
                stage="gate"
                caption={
                  approvalId
                    ? "Menunggu persetujuanmu di halaman Approvals (berlaku 1 jam). Tanpa persetujuan, agen tidak akan mengirim."
                    : "Draf siap. Tinjau dan edit bila perlu, lalu ajukan ke persetujuan."
                }
              />

              {error && (
                <div className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
              )}

              {/* Form answers prepared for the approval, low-confidence ones highlighted */}
              {approvalId && preparedAnswers.length > 0 && (
                <div className="rounded-xl border-2 border-[#16150F]/10 p-4">
                  <h4 className="text-sm font-semibold">Jawaban formulir yang disiapkan agen</h4>
                  <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
                    {countNeedingAttention(preparedAnswers) > 0
                      ? `${countNeedingAttention(preparedAnswers)} dari ${preparedAnswers.length} perlu dicek. `
                      : "Semua berkeyakinan tinggi. "}
                    Tinjau lengkapnya di halaman Approvals sebelum menyetujui.
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
                          <span className={`shrink-0 font-mono ${attention ? "font-semibold text-[#D9741A]" : "text-muted-foreground"}`}>
                            {attention && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                            {Math.round(a.confidence * 100)}% {LEVEL_LABEL[confidenceLevel(a.confidence)]}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* AI Info */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Bot className="h-3 w-3" />
                  Model: {modelLabel}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Sisa kuota: {quota.remaining} / {quota.quota} lamaran
                </span>
              </div>

              {/* AI Scores */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-xl bg-[#0A5BE0]/5 border border-[#0A5BE0]/20 p-3 text-center">
                  <Target className="h-5 w-5 mx-auto text-[#0A5BE0] mb-1" />
                  <div className="text-lg font-bold text-[#0A5BE0]">{aiGenerated.tailoredSkills?.length || 0}</div>
                  <div className="text-xs text-muted-foreground">Skill Match</div>
                </div>
                <div className="rounded-xl bg-[#D2F801]/10 border border-[#D2F801]/30 p-3 text-center">
                  <Sparkles className="h-5 w-5 mx-auto text-[#16150F] mb-1" />
                  <div className="text-lg font-bold">{matchScore !== null ? `${matchScore}%` : "—"}</div>
                  <div className="text-xs text-muted-foreground">Match Score</div>
                </div>
                <div className="rounded-xl bg-purple-50 border border-purple-200 p-3 text-center">
                  <Bot className="h-5 w-5 mx-auto text-purple-600 mb-1" />
                  <div className="text-sm font-bold text-purple-600">{tier === "pro" ? "Pro" : "Flash"}</div>
                  <div className="text-xs text-muted-foreground">{tier === "pro" ? "Premium" : "Free"}</div>
                </div>
                <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center">
                  <CheckCircle2 className="h-5 w-5 mx-auto text-green-600 mb-1" />
                  <div className="text-lg font-bold text-green-600">Ready</div>
                  <div className="text-xs text-muted-foreground">Cover & CV</div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-2 border-b border-[#E0E0E0]">
                {[
                  { key: "cover", label: "Cover Letter", icon: FileText },
                  { key: "cv", label: "Optimized CV", icon: Eye },
                  { key: "strategy", label: "AI Strategy", icon: Zap },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as any)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
                      activeTab === tab.key
                        ? "border-[#0A5BE0] text-[#0A5BE0]"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="min-h-[200px]">
                {activeTab === "cover" && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Bot className="h-4 w-4 text-[#0A5BE0]" />
                        AI-Generated Cover Letter
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsEditing(!isEditing)}
                          className="h-8 px-3 rounded-lg border border-[#999999] text-xs font-medium hover:border-[#0A5BE0] transition flex items-center gap-1"
                        >
                          <Edit3 className="h-3 w-3" />
                          {isEditing ? "Batal" : "Edit"}
                        </button>
                        <button
                          onClick={regenerate}
                          disabled={regenerating}
                          className="h-8 px-3 rounded-lg bg-[#0A5BE0]/10 text-[#0A5BE0] text-xs font-medium hover:bg-[#0A5BE0]/20 transition flex items-center gap-1"
                        >
                          {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          Regenerate (gratis)
                        </button>
                      </div>
                    </div>
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editedCoverLetter}
                          onChange={(e) => setEditedCoverLetter(e.target.value)}
                          className="w-full h-64 p-4 rounded-xl border-2 border-[#999999] text-sm resize-none focus:outline-none focus:border-[#0A5BE0]"
                        />
                        <button
                          onClick={handleSaveEdit}
                          className="h-9 px-4 rounded-lg bg-[#0A5BE0] text-white text-xs font-semibold hover:opacity-90 transition"
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
                  <div className="space-y-4">
                    <div className="rounded-xl bg-[#F5F5F5] p-5 space-y-4">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Professional Summary</h4>
                        <p className="text-sm">{aiGenerated.optimizedCV?.summary || "—"}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Highlighted Skills</h4>
                        <div className="flex flex-wrap gap-2">
                          {aiGenerated.tailoredSkills?.map((skill: string, i: number) => (
                            <span key={i} className="text-xs bg-[#0A5BE0]/10 text-[#0A5BE0] px-2.5 py-1 rounded-full font-medium">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "strategy" && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-[#F5F5F5] p-5">
                      <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">{aiGenerated.aiNotes || "—"}</pre>
                    </div>
                    {skillGaps !== null && (
                      <div className="rounded-xl border-2 border-[#FDE68A] bg-[#FFFBEB] p-4">
                        <p className="text-xs font-semibold text-[#92400E] flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" /> Skill yang diminta lowongan tetapi belum ada di profilmu
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
                        <p className="mt-2 text-[10px] text-[#92400E]/80">Perkiraan model bahasa, bukan hasil pengukuran. Tambahkan skill yang benar-benar kamu kuasai di halaman Profil.</p>
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
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="h-11 px-5 rounded-xl border-2 border-[#999999] text-sm font-medium hover:border-[#0A5BE0] transition"
            >
              {application ? "Simpan Draft" : "Tutup"}
            </button>
            {application && jobData?.external_url && (
              <button
                onClick={handleAutoApply}
                disabled={enqueuing}
                title="Agen membuka formulir lowongan dan mengisinya, lalu berhenti sebelum tombol kirim."
                className="h-11 px-4 rounded-xl border-2 border-[#0A5BE0] text-[#0A5BE0] text-sm font-semibold hover:bg-[#0A5BE0]/5 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {enqueuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                Isi Formulir Saja
              </button>
            )}
            {approvalId ? (
              <Link
                to="/approvals"
                className="flex-1 h-11 rounded-xl bg-[#16150F] text-white text-sm font-semibold hover:-translate-y-0.5 hover:shadow-lg transition flex items-center justify-center gap-2"
              >
                <ShieldCheck className="h-4 w-4 text-[#D2F801]" />
                Buka Approvals
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : application && (
              <button
                onClick={handleRequestApproval}
                disabled={requesting}
                className="flex-1 h-11 rounded-xl bg-[#16150F] text-white text-sm font-semibold hover:-translate-y-0.5 hover:shadow-lg transition disabled:opacity-60 disabled:hover:translate-y-0 flex items-center justify-center gap-2"
              >
                {requesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-[#D2F801]" />
                )}
                {requesting ? "Mengajukan..." : "Ajukan ke Persetujuan"}
              </button>
            )}
          </div>
          {application && (
            <div className="flex justify-end">
              <button
                onClick={handleMarkSentManually}
                disabled={submitting}
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-[#16150F] hover:underline disabled:opacity-60"
              >
                {submitting ? "Menyimpan..." : "Sudah kukirim sendiri di luar Applify — tandai terkirim"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
