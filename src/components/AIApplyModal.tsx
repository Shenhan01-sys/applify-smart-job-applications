import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { aiApplicationService, type AIApplicationData } from "@/services/aiApplicationService";
import { automationQueue } from "@/services/automationQueue";
import { toast } from "sonner";
import {
  X,
  Bot,
  Send,
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
  const [application, setApplication] = useState<AIApplicationData | null>(null);
  const [activeTab, setActiveTab] = useState<"cover" | "cv" | "strategy">("cover");
  const [isEditing, setIsEditing] = useState(false);
  const [editedCoverLetter, setEditedCoverLetter] = useState("");
  const [error, setError] = useState("");
  const [tier, setTier] = useState<"free" | "pro">("free");
  const [quota, setQuota] = useState<QuotaState>({ remaining: 10, quota: 10, used: 0 });
  const [aiGenerated, setAiGenerated] = useState<{
    coverLetter: string;
    optimizedCV: Record<string, any>;
    tailoredSkills: string[];
    aiNotes: string;
  } | null>(null);

  const matchScore: number = jobData?.match_score ?? 0;
  const canApply = quota.remaining > 0;

  useEffect(() => {
    loadQuota();
  }, [jobId]);

  const loadQuota = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("monthly_quota, used_quota, ai_model_tier")
        .eq("user_id", user.id)
        .maybeSingle();
      const q = sub?.monthly_quota ?? 10;
      const used = sub?.used_quota ?? 0;
      setQuota({ quota: q, used, remaining: Math.max(0, q - used) });
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
      const app = await aiApplicationService.createDraft({ jobId, tone: "professional" });
      setApplication(app);
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

  const handleSubmit = async () => {
    if (!application) return;
    try {
      setSubmitting(true);
      // Persist any pending edit first
      if (editedCoverLetter && editedCoverLetter !== application.cover_letter) {
        await aiApplicationService.updateCoverLetter(application.id, editedCoverLetter);
      }
      await aiApplicationService.submitApplication(application.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal submit aplikasi");
    } finally {
      setSubmitting(false);
    }
  };

  // Hand the job to the background agent (worker) to fill & submit on the external site.
  const handleAutoApply = async () => {
    try {
      setEnqueuing(true);
      setError("");
      await automationQueue.enqueueAutoApply(jobId);
      toast.success("Agen Applify akan melamar di latar belakang. Pantau di Applications.");
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
            <div className="h-10 w-10 rounded-xl bg-[#0367FC]/10 grid place-items-center">
              <Bot className="h-5 w-5 text-[#0367FC]" />
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
              tier === "pro" ? "bg-[#D2F801] text-[#161616]" : "bg-[#F5F5F5] text-muted-foreground"
            }`}>
              {tier === "pro" ? <Crown className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              {tier === "pro" ? "PRO" : "FREE"}
            </span>
            <button
              onClick={onClose}
              className="h-9 w-9 rounded-lg border border-[#999999] grid place-items-center hover:border-[#0367FC] transition"
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
              <Loader2 className="h-8 w-8 animate-spin text-[#0367FC] mb-3" />
              <p className="text-sm text-muted-foreground">
                {tier === "pro" ? "DeepSeek V4 Pro" : "DeepSeek V4 Flash"} sedang menulis lamaranmu...
              </p>
            </div>
          ) : error ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">{error}</div>
              {!application && (
                <button
                  onClick={generate}
                  disabled={!canApply}
                  className="h-10 px-4 rounded-lg bg-[#0367FC] text-white text-sm font-semibold disabled:opacity-60"
                >
                  Coba lagi
                </button>
              )}
            </div>
          ) : !application || !aiGenerated ? (
            /* Pre-generate preview screen */
            <div className="flex flex-col items-center justify-center py-10 text-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-[#0367FC]/10 grid place-items-center">
                <Sparkles className="h-7 w-7 text-[#0367FC]" />
              </div>
              <div className="max-w-md">
                <h3 className="font-bold text-lg">Generate lamaran dengan AI</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI ({tier === "pro" ? "DeepSeek V4 Pro" : "DeepSeek V4 Flash"}) akan menulis cover letter
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
                className="h-11 px-6 rounded-xl bg-[#0367FC] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                {canApply ? "Generate dengan AI (1 kuota)" : "Kuota Habis"}
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* AI Info */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Bot className="h-3 w-3" />
                  Model: {tier === "pro" ? "DeepSeek V4 Pro" : "DeepSeek V4 Flash (free)"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Sisa kuota: {quota.remaining} / {quota.quota} lamaran
                </span>
              </div>

              {/* AI Scores */}
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-xl bg-[#0367FC]/5 border border-[#0367FC]/20 p-3 text-center">
                  <Target className="h-5 w-5 mx-auto text-[#0367FC] mb-1" />
                  <div className="text-lg font-bold text-[#0367FC]">{aiGenerated.tailoredSkills?.length || 0}</div>
                  <div className="text-xs text-muted-foreground">Skill Match</div>
                </div>
                <div className="rounded-xl bg-[#D2F801]/10 border border-[#D2F801]/30 p-3 text-center">
                  <Sparkles className="h-5 w-5 mx-auto text-[#161616] mb-1" />
                  <div className="text-lg font-bold">{matchScore || (tier === "pro" ? 90 : 75)}%</div>
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
                        ? "border-[#0367FC] text-[#0367FC]"
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
                        <Bot className="h-4 w-4 text-[#0367FC]" />
                        AI-Generated Cover Letter
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsEditing(!isEditing)}
                          className="h-8 px-3 rounded-lg border border-[#999999] text-xs font-medium hover:border-[#0367FC] transition flex items-center gap-1"
                        >
                          <Edit3 className="h-3 w-3" />
                          {isEditing ? "Batal" : "Edit"}
                        </button>
                        <button
                          onClick={regenerate}
                          disabled={regenerating}
                          className="h-8 px-3 rounded-lg bg-[#0367FC]/10 text-[#0367FC] text-xs font-medium hover:bg-[#0367FC]/20 transition flex items-center gap-1"
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
                          className="w-full h-64 p-4 rounded-xl border-2 border-[#999999] text-sm resize-none focus:outline-none focus:border-[#0367FC]"
                        />
                        <button
                          onClick={handleSaveEdit}
                          className="h-9 px-4 rounded-lg bg-[#0367FC] text-white text-xs font-semibold hover:opacity-90 transition"
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
                            <span key={i} className="text-xs bg-[#0367FC]/10 text-[#0367FC] px-2.5 py-1 rounded-full font-medium">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "strategy" && (
                  <div className="rounded-xl bg-[#F5F5F5] p-5">
                    <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">{aiGenerated.aiNotes || "—"}</pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-[#E0E0E0] flex items-center gap-3">
          <button
            onClick={onClose}
            className="h-11 px-5 rounded-xl border-2 border-[#999999] text-sm font-medium hover:border-[#0367FC] transition"
          >
            {application ? "Simpan Draft" : "Tutup"}
          </button>
          {application && jobData?.external_url && (
            <button
              onClick={handleAutoApply}
              disabled={enqueuing}
              className="h-11 px-4 rounded-xl border-2 border-[#0367FC] text-[#0367FC] text-sm font-semibold hover:bg-[#0367FC]/5 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {enqueuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              Auto-Apply
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting || !application}
            className="flex-1 h-11 rounded-xl bg-[#0367FC] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {submitting ? "Mengirim..." : "Kirim Lamaran"}
          </button>
        </div>
      </div>
    </div>
  );
}
