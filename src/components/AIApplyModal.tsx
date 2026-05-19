import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { aiApplicationService, type AIApplicationData } from "@/services/aiApplicationService";
import { profileService, type FullProfile } from "@/services/profileService";
import {
  X,
  Bot,
  Send,
  Save,
  Loader2,
  Sparkles,
  CheckCircle2,
  Clock,
  FileText,
  ChevronDown,
  ChevronUp,
  Edit3,
  Eye,
  Target,
  Zap,
} from "lucide-react";

interface AIApplyModalProps {
  jobId: string;
  jobTitle: string;
  company: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AIApplyModal({ jobId, jobTitle, company, onClose, onSuccess }: AIApplyModalProps) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [application, setApplication] = useState<AIApplicationData | null>(null);
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [activeTab, setActiveTab] = useState<"cover" | "cv" | "strategy">("cover");
  const [isEditing, setIsEditing] = useState(false);
  const [editedCoverLetter, setEditedCoverLetter] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    generateApplication();
    loadProfile();
  }, [jobId]);

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

  const generateApplication = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await aiApplicationService.createDraft({
        jobId,
        tone: "professional",
      });
      setApplication(data);
      setEditedCoverLetter(data.cover_letter || "");
    } catch (err: any) {
      setError(err.message || "Gagal generate aplikasi AI");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!application) return;
    try {
      setSubmitting(true);
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
      const data = await aiApplicationService.createDraft({
        jobId,
        tone: "enthusiastic",
      });
      setApplication(data);
      setEditedCoverLetter(data.cover_letter || "");
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
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-lg border border-[#999999] grid place-items-center hover:border-[#0367FC] transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#0367FC] mb-3" />
              <p className="text-sm text-muted-foreground">AI sedang menganalisis profil & job...</p>
            </div>
          ) : error ? (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-600">
              {error}
            </div>
          ) : application ? (
            <div className="space-y-5">
              {/* AI Score Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#0367FC]/5 border border-[#0367FC]/20 p-3 text-center">
                  <Target className="h-5 w-5 mx-auto text-[#0367FC] mb-1" />
                  <div className="text-lg font-bold text-[#0367FC]">{application.tailored_skills?.length || 0}</div>
                  <div className="text-xs text-muted-foreground">Skill Match</div>
                </div>
                <div className="rounded-xl bg-[#D2F801]/10 border border-[#D2F801]/30 p-3 text-center">
                  <Sparkles className="h-5 w-5 mx-auto text-[#161616] mb-1" />
                  <div className="text-lg font-bold">{(application.optimized_cv as any)?.highlighted_skills?.length || 0}</div>
                  <div className="text-xs text-muted-foreground">Skills Highlighted</div>
                </div>
                <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center">
                  <CheckCircle2 className="h-5 w-5 mx-auto text-green-600 mb-1" />
                  <div className="text-lg font-bold text-green-600">AI Ready</div>
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
                        {application.cover_letter}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "cv" && (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-[#F5F5F5] p-5 space-y-4">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Professional Summary</h4>
                        <p className="text-sm">{(application.optimized_cv as any)?.summary}</p>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Highlighted Skills</h4>
                        <div className="flex flex-wrap gap-2">
                          {(application.optimized_cv as any)?.highlighted_skills?.map((skill: string, i: number) => (
                            <span key={i} className="text-xs bg-[#0367FC]/10 text-[#0367FC] px-2.5 py-1 rounded-full font-medium">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Relevant Experience</h4>
                        <div className="space-y-2">
                          {(application.optimized_cv as any)?.relevant_experiences?.map((exp: any, i: number) => (
                            <div key={i} className="text-sm">
                              <div className="font-medium">{exp.role} at {exp.company}</div>
                              <ul className="mt-1 space-y-1">
                                {exp.highlights?.map((h: string, j: number) => (
                                  <li key={j} className="text-muted-foreground text-xs flex items-start gap-1.5">
                                    <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                                    {h}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                      {(application.optimized_cv as any)?.education_summary && (
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Education</h4>
                          <p className="text-sm">{(application.optimized_cv as any)?.education_summary}</p>
                        </div>
                      )}
                      {(application.optimized_cv as any)?.certifications?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Certifications</h4>
                          <div className="flex flex-wrap gap-2">
                            {(application.optimized_cv as any)?.certifications?.map((cert: string, i: number) => (
                              <span key={i} className="text-xs bg-[#D2F801]/20 text-[#161616] px-2.5 py-1 rounded-full font-medium">
                                {cert}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "strategy" && (
                  <div className="rounded-xl bg-[#F5F5F5] p-5">
                    <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">{application.ai_notes}</pre>
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
            disabled={submitting || !application}
            className="flex-1 h-11 rounded-xl bg-[#0367FC] text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {submitting ? "Mengirim..." : "AI Apply Sekarang"}
          </button>
        </div>
      </div>
    </div>
  );
}
