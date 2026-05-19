import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { openRouterService } from "@/services/openRouterService";
import { aiApplicationService, type AIApplicationData } from "@/services/aiApplicationService";
import { profileService, type FullProfile } from "@/services/profileService";
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

export function AIApplyModal({ jobId, jobTitle, company, jobData, onClose, onSuccess }: AIApplyModalProps) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [application, setApplication] = useState<AIApplicationData | null>(null);
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [activeTab, setActiveTab] = useState<"cover" | "cv" | "strategy">("cover");
  const [isEditing, setIsEditing] = useState(false);
  const [editedCoverLetter, setEditedCoverLetter] = useState("");
  const [error, setError] = useState("");
  const [tier, setTier] = useState<"free" | "pro">("free");
  const [quota, setQuota] = useState({ canApply: true, remaining: 10 });
  const [modelUsed, setModelUsed] = useState("");
  const [aiGenerated, setAiGenerated] = useState<{
    coverLetter: string;
    optimizedCV: Record<string, any>;
    tailoredSkills: string[];
    aiNotes: string;
  } | null>(null);

  useEffect(() => {
    init();
  }, [jobId]);

  const init = async () => {
    await Promise.all([
      loadProfile(),
      checkQuota(),
      generateApplication(),
    ]);
  };

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const profileData = await profileService.getFullProfile(user.id);
      setProfile(profileData);
    } catch (err) {
      console.error("Error loading profile:", err);
    }
  };

  const checkQuota = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const quotaData = await openRouterService.checkQuota(user.id);
      setQuota(quotaData);
      setTier(quotaData.tier);
    } catch (err) {
      console.error("Error checking quota:", err);
    }
  };

  const generateApplication = async () => {
    try {
      setLoading(true);
      setError("");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Load profile if not already loaded
      let userProfile = profile;
      if (!userProfile) {
        userProfile = await profileService.getFullProfile(user.id);
        setProfile(userProfile);
      }

      // Use OpenRouter for AI generation
      const [coverLetterResult, analysisResult] = await Promise.all([
        openRouterService.generateCoverLetter(user.id, userProfile, jobData, "professional"),
        openRouterService.analyzeJobMatch(user.id, userProfile, jobData),
      ]);

      setModelUsed(coverLetterResult.modelUsed);
      setTier(coverLetterResult.tier);

      const aiResult = {
        coverLetter: coverLetterResult.coverLetter,
        optimizedCV: {
          summary: `Experienced ${userProfile.profile?.current_title || "professional"} with skills in ${analysisResult.tailoredSkills.join(", ")}.`,
          highlighted_skills: analysisResult.tailoredSkills,
          relevant_experiences: userProfile.workExperiences?.slice(0, 2).map((exp) => ({
            company: exp.company_name,
            role: exp.role_title,
            highlights: exp.achievements?.slice(0, 2) || [],
          })),
        },
        tailoredSkills: analysisResult.tailoredSkills,
        aiNotes: analysisResult.aiStrategy,
      };

      setAiGenerated(aiResult);
      setEditedCoverLetter(aiResult.coverLetter);

      // Create application record
      const app = await aiApplicationService.createDraft({
        jobId,
        tone: "professional",
      });

      // Update with OpenRouter generated content
      await aiApplicationService.updateCoverLetter(app.id, aiResult.coverLetter);

      setApplication({ ...app, cover_letter: aiResult.coverLetter });
    } catch (err: any) {
      setError(err.message || "Gagal generate aplikasi AI");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!application || !quota.canApply) return;
    try {
      setSubmitting(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Increment usage
      await openRouterService.incrementUsage(user.id);

      // Submit application
      await aiApplicationService.submitApplication(application.id);

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Gagal submit aplikasi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!application) return;
    try {
      setGenerating(true);
      await aiApplicationService.updateCoverLetter(application.id, editedCoverLetter);
      setApplication({ ...application, cover_letter: editedCoverLetter });
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || "Gagal menyimpan perubahan");
    } finally {
      setGenerating(false);
    }
  };

  const regenerate = async () => {
    try {
      setGenerating(true);
      setError("");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !profile) return;

      const result = await openRouterService.generateCoverLetter(
        user.id,
        profile,
        jobData,
        "enthusiastic"
      );

      setModelUsed(result.modelUsed);
      setEditedCoverLetter(result.coverLetter);
      if (application) {
        await aiApplicationService.updateCoverLetter(application.id, result.coverLetter);
        setApplication({ ...application, cover_letter: result.coverLetter });
      }
    } catch (err: any) {
      setError(err.message || "Gagal regenerate");
    } finally {
      setGenerating(false);
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
            {/* Tier Badge */}
            <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold ${
              tier === "pro" 
                ? "bg-[#D2F801] text-[#161616]" 
                : "bg-[#F5F5F5] text-muted-foreground"
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
        {!quota.canApply && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#92400E] shrink-0" />
            <p className="text-sm text-[#92400E]">
              Kuota harian ({tier === "pro" ? 50 : 10} apply) sudah habis. 
              {tier === "free" && " Upgrade ke Pro untuk 50 apply/hari."}
            </p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#0367FC] mb-3" />
              <p className="text-sm text-muted-foreground">
                {tier === "pro" ? "Claude 3.5" : "AI Free Model"} sedang menganalisis...
              </p>
            </div>
          ) : error ? (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
              {error}
            </div>
          ) : application && aiGenerated ? (
            <div className="space-y-5">
              {/* AI Info */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Bot className="h-3 w-3" />
                  Model: {modelUsed || "AI Model"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Sisa kuota: {quota.remaining} apply
                </span>
              </div>

              {/* AI Scores */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#0367FC]/5 border border-[#0367FC]/20 p-3 text-center">
                  <Target className="h-5 w-5 mx-auto text-[#0367FC] mb-1" />
                  <div className="text-lg font-bold text-[#0367FC]">{aiGenerated.tailoredSkills?.length || 0}</div>
                  <div className="text-xs text-muted-foreground">Skill Match</div>
                </div>
                <div className="rounded-xl bg-[#D2F801]/10 border border-[#D2F801]/30 p-3 text-center">
                  <Sparkles className="h-5 w-5 mx-auto text-[#161616] mb-1" />
                  <div className="text-lg font-bold">{tier === "pro" ? "85%" : "70%"}</div>
                  <div className="text-xs text-muted-foreground">AI Accuracy</div>
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
                        {tier === "free" && (
                          <span className="text-xs text-muted-foreground bg-[#F5F5F5] px-2 py-0.5 rounded-full">
                            Basic
                          </span>
                        )}
                        {tier === "pro" && (
                          <span className="text-xs text-[#D2F801] bg-[#161616] px-2 py-0.5 rounded-full">
                            Premium
                          </span>
                        )}
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
                          disabled={generating}
                          className="h-8 px-3 rounded-lg bg-[#0367FC]/10 text-[#0367FC] text-xs font-medium hover:bg-[#0367FC]/20 transition flex items-center gap-1"
                        >
                          {generating ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          Regenerate
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
                          disabled={generating}
                          className="h-9 px-4 rounded-lg bg-[#0367FC] text-white text-xs font-semibold hover:opacity-90 transition"
                        >
                          {generating ? "Menyimpan..." : "Simpan Perubahan"}
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
                        <p className="text-sm">{aiGenerated.optimizedCV?.summary}</p>
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
                    <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">{aiGenerated.aiNotes}</pre>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-[#E0E0E0] flex items-center gap-3">
          <button
            onClick={onClose}
            className="h-11 px-5 rounded-xl border-2 border-[#999999] text-sm font-medium hover:border-[#0367FC] transition"
          >
            Simpan Draft
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !application || !quota.canApply}
            className="flex-1 h-11 rounded-xl bg-[#0367FC] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {submitting 
              ? "Mengirim..." 
              : !quota.canApply 
                ? "Kuota Habis" 
                : tier === "pro"
                  ? "AI Apply Sekarang (Pro)"
                  : "AI Apply Sekarang"
            }
          </button>
        </div>
      </div>
    </div>
  );
}
