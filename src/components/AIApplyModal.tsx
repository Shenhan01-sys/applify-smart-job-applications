import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { aiApplicationService, type AIApplicationData } from "@/services/aiApplicationService";
import { automationQueue } from "@/services/automationQueue";
import {
  describeApprovalError,
  getPendingApprovalFor,
  requestApprovalForDraft,
  syncPendingApprovalCoverLetter,
} from "@/services/approvalService";
import { profileService } from "@/services/profileService";
import { parseQuotaStatus } from "@/lib/quotaStatus";
import { aiPlanLabel, formatModelUsed, modelDisplay } from "@/lib/modelLabel";
import { describeError } from "@/lib/authErrors";
import { ACTIVE_APPLICATION_HINT, REUSED_DRAFT_NOTICE, canStartNewDraft } from "@/lib/activeApplication";
import { applyBlockers } from "@/lib/onboarding";
import { displaySkillGaps, highlightedSkills, matchCaption, type JobMatch } from "@/lib/matchScore";
import { classifyJobChannel, needsBrowserExtension } from "@/lib/applyChannel";
import { canRequestApproval, draftToGenerated } from "@/lib/draftApproval";
import { applicationStatusLabel } from "@/lib/statusLabels";
import { draftProgressText, draftWaitHint } from "@/lib/draftProgress";
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
  /**
   * Skill profil pengguna (profileSkillList), dibaca halaman Lowongan dengan pemuat yang sama seperti Lamaran Saya.
   * Dipakai menyaring "Skill yang Disorot" saat ditampilkan: draf lama masih memuat skill lowongan yang bukan skill
   * profil (temuan 30). null = belum dimuat atau gagal dimuat, jadi hanya penyaring frasa yang berlaku.
   */
  profileSkills?: readonly string[] | null;
  onClose: () => void;
  onSuccess: () => void;
  /** Dipanggil setelah draf baru dibuat (satu kuota terpakai), supaya halaman di belakang jendela membaca ulang kuotanya. */
  onDraftCreated?: () => void;
}

interface QuotaState {
  remaining: number;
  quota: number;
  used: number;
}

type ExistingDraft =
  | { state: "checking" }
  | { state: "none" }
  | { state: "found" }
  | { state: "error"; message: string };

type ProfileCheck =
  | { state: "checking" }
  | { state: "ok" }
  | { state: "blocked"; missing: string[] }
  | { state: "error"; message: string };

export function AIApplyModal({ jobId, jobTitle, company, jobData, match = null, profileSkills = null, onClose, onSuccess, onDraftCreated }: AIApplyModalProps) {
  const channelInfo = useMemo(() => classifyJobChannel(jobData ?? { id: jobId }), [jobData, jobId]);
  // Penjaga sinkron: state `generating` baru berlaku sesudah render, jadi klik ganda yang cepat bisa lolos dan memicu
  // dua permintaan sekaligus. Ref berubah seketika.
  const inFlight = useRef({ generate: false, request: false, enqueue: false });
  const needsExtension = needsBrowserExtension(channelInfo);
  const [generating, setGenerating] = useState(false);
  // Detik sejak "Buat draf" ditekan, untuk teks kemajuan selama menunggu Edge Function. 0 saat tidak menunggu.
  const [generatingElapsed, setGeneratingElapsed] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmRewrite, setConfirmRewrite] = useState(false);
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
  // A draft this user already saved for this job is shown, not made again: a new draft uses one monthly quota.
  // "checking" hides the "Buat draf" button until the lookup answers, so nobody clicks before we know.
  const [existing, setExisting] = useState<ExistingDraft>({ state: "checking" });
  const [confirmNewDraft, setConfirmNewDraft] = useState(false);
  // Skill gaps the model reported for the last draft or preview (not stored in the database).
  const [skillGaps, setSkillGaps] = useState<string[] | null>(null);
  // Keluaran model disaring saat ditampilkan: judul jabatan, kalimat persyaratan, dan syarat pendidikan bukan skill (temuan 29).
  const shownSkillGaps = useMemo(() => (skillGaps === null ? null : displaySkillGaps(skillGaps, jobTitle)), [skillGaps, jobTitle]);
  const [aiGenerated, setAiGenerated] = useState<{
    coverLetter: string;
    optimizedCV: Record<string, any>;
    aiNotes: string;
  } | null>(null);
  // Isi mentah tailored_skills dari draf yang sedang tampil (kolom database atau keluaran model, belum disaring).
  // Daftar yang tampil disaring saat render, bukan saat draf dimuat: skill profil bisa baru selesai dimuat sesudah
  // draf terbuka, dan penyaringan sebelum dipotong 8 butir tidak membuang skill profil yang kebetulan di urutan akhir.
  // Jalur yang sama dengan Lamaran Saya (highlightedSkills dengan tailored_skills dan skill profil): draf yang sama
  // menampilkan daftar yang sama di kedua tempat (temuan 34). Kecocokan lowongan (match) tidak ikut menentukan isinya.
  const [rawSkills, setRawSkills] = useState<unknown>([]);
  const shownSkills = useMemo(
    () => highlightedSkills(rawSkills, profileSkills),
    [rawSkills, profileSkills],
  );

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
  // A draft that was already sent (or answered, or closed) is shown but not sent to approval again.
  const editable = application !== null && canRequestApproval(application.status);
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

  // Look for a draft this user already made for the job. Found: show it (and whether it already waits for approval).
  // The lookup failing is an error, not "no draft": drafting stays blocked until it answers.
  const loadExistingDraft = useCallback(async () => {
    setExisting({ state: "checking" });
    try {
      const app = await aiApplicationService.getDraftForJob(jobId);
      if (!app) {
        setExisting({ state: "none" });
        return;
      }
      // Daftar skill yang tampil dihitung saat render dari rawSkills (shownSkills), bukan dari view.tailoredSkills.
      const view = draftToGenerated(app);
      setApplication(app);
      // Draf baru menyimpan modelnya; draf lama (null) tetap memakai label paket.
      if (app.model_used) setModelUsed(app.model_used);
      setAiGenerated(view);
      setRawSkills(app.tailored_skills);
      setEditedCoverLetter(view.coverLetter);
      setExisting({ state: "found" });
      if (canRequestApproval(app.status)) {
        try {
          const pending = await getPendingApprovalFor(app.id);
          if (pending) {
            setApprovalId(pending.id);
            setPreparedAnswers(normalizeAnswers(pending.answers));
          }
        } catch (err) {
          // Not fatal here: "Ajukan ke Persetujuan" checks the pending list again and reports a failure itself.
          console.error("Error checking pending approval:", err);
        }
      }
    } catch (err) {
      console.error("Error loading existing draft:", err);
      setExisting({ state: "error", message: describeError(err, "Draf yang sudah ada belum bisa diperiksa.") });
    }
  }, [jobId]);

  useEffect(() => {
    loadQuota();
    checkProfile();
    loadExistingDraft();
  }, [jobId, checkProfile, loadExistingDraft]);

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

  // Penghitung detik hanya berjalan selama draf dibuat; dibersihkan saat selesai, gagal, atau jendela ditutup.
  useEffect(() => {
    if (!generating) {
      setGeneratingElapsed(0);
      return;
    }
    const startedAt = Date.now();
    setGeneratingElapsed(0);
    const timer = setInterval(() => setGeneratingElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [generating]);

  // Generate the application draft (server-side AI; consumes 1 monthly quota)
  const generate = async () => {
    if (!profileOk) return; // penjaga kedua: tombol sudah terkunci, tetapi kuota tidak boleh terpakai karena celah
    if (inFlight.current.generate) return; // klik ganda: satu permintaan saja, kuota tidak terpotong dua kali
    inFlight.current.generate = true;
    try {
      setGenerating(true);
      setError("");
      const { application: app, analysis, reused } = await aiApplicationService.createDraftWithAnalysis({ jobId, tone: "professional" });
      setApplication(app);
      setSkillGaps(analysis.skillGaps);
      setModelUsed(analysis.modelUsed);
      setAiGenerated({
        coverLetter: app.cover_letter,
        optimizedCV: (app.optimized_cv as Record<string, any>) || {},
        aiNotes: app.ai_notes,
      });
      setRawSkills(app.tailored_skills);
      setEditedCoverLetter(app.cover_letter);
      // A new draft replaces whatever was on screen (an earlier draft stays saved in Lamaran Saya).
      setExisting({ state: "none" });
      setConfirmNewDraft(false);
      setApprovalId(null);
      setPreparedAnswers([]);
      setApprovalError("");
      setIsEditing(false);
      // Draf terbuat berarti kuota terpakai: lencana kuota di halaman Lowongan (di belakang jendela ini) harus
      // dibaca ulang, kalau tidak ia tetap menulis angka lama (temuan 32, uji klik 21 November 2026).
      onDraftCreated?.();
      // Lamaran aktif yang sudah ada dikembalikan server (permintaan ganda): bukan draf baru, kuota tidak terpakai.
      if (reused) toast.info(REUSED_DRAFT_NOTICE);
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
      inFlight.current.generate = false;
      setGenerating(false);
    }
  };

  // Free preview-style regeneration (mode "analyze" — does NOT consume quota)
  const performRegenerate = async () => {
    if (!application) return;
    try {
      setRegenerating(true);
      setConfirmRewrite(false);
      setError("");
      const insights = await aiApplicationService.getJobInsights(jobId);
      setSkillGaps(insights.skillGaps);
      if (insights.modelUsed) setModelUsed(insights.modelUsed);
      setEditedCoverLetter(insights.coverLetter);
      setAiGenerated({
        coverLetter: insights.coverLetter,
        optimizedCV: insights.optimizedCV as Record<string, any>,
        aiNotes: insights.aiNotes,
      });
      setRawSkills(insights.tailoredSkills);
      await aiApplicationService.updateCoverLetter(application.id, insights.coverLetter);
      const synced = await syncPendingApprovalCoverLetter(approvalId, insights.coverLetter);
      setApplication({ ...application, cover_letter: insights.coverLetter });
      setIsEditing(false);
      if (synced) toast.success("Surat baru ikut diperbarui di antrean Persetujuan.");
    } catch (err: any) {
      setError(describeError(err, "Surat belum bisa ditulis ulang. Coba lagi."));
    } finally {
      setRegenerating(false);
    }
  };

  const regenerate = () => {
    if (!application) return;
    if (editedCoverLetter !== (application.cover_letter ?? "")) {
      setConfirmRewrite(true);
      return;
    }
    void performRegenerate();
  };

  const handleSaveEdit = async () => {
    if (!application) return;
    try {
      setError("");
      await aiApplicationService.updateCoverLetter(application.id, editedCoverLetter);
      const synced = await syncPendingApprovalCoverLetter(approvalId, editedCoverLetter);
      setApplication({ ...application, cover_letter: editedCoverLetter });
      setIsEditing(false);
      if (synced) toast.success("Perubahan surat ikut diperbarui di antrean Persetujuan.");
    } catch (err: any) {
      setError(describeError(err, "Perubahan belum tersimpan. Coba lagi."));
    }
  };

  const handleCancelEdit = () => {
    setEditedCoverLetter(application?.cover_letter ?? aiGenerated?.coverLetter ?? "");
    setIsEditing(false);
  };

  const persistPendingEdit = async () => {
    if (application && editedCoverLetter && editedCoverLetter !== application.cover_letter) {
      await aiApplicationService.updateCoverLetter(application.id, editedCoverLetter);
      await syncPendingApprovalCoverLetter(approvalId, editedCoverLetter);
      setApplication({ ...application, cover_letter: editedCoverLetter });
    }
  };

  // Human-in-the-loop gate: the reviewed draft goes to the approval queue. Only an approval
  // (Approvals page -> POST /api/approvals/:id/approve) lets the agent submit it.
  const handleRequestApproval = async () => {
    if (!application) return;
    if (inFlight.current.request) return; // klik ganda: satu persetujuan saja
    inFlight.current.request = true;
    try {
      setRequesting(true);
      setError("");
      setApprovalError("");
      await persistPendingEdit();
      // Same call as the "Ajukan ke Persetujuan" button on Lamaran Saya. A draft that already waits for approval
      // is not queued twice: that approval comes back with created = false.
      const { approval, created } = await requestApprovalForDraft({
        applicationId: application.id,
        jobId,
        jobTitle,
        company,
        platform: jobData?.platform_source ?? null,
        coverLetter: editedCoverLetter || application.cover_letter,
      });
      setApprovalId(approval?.id ?? "pending");
      const answers = normalizeAnswers(approval?.answers);
      setPreparedAnswers(answers);
      const check = countNeedingAttention(answers);
      toast.success(
        !created
          ? "Draf ini sudah ada di antrean persetujuan. Setujui di halaman Persetujuan."
          : check > 0
            ? `Draf masuk antrean persetujuan. ${check} jawaban formulir perlu kamu cek di halaman Persetujuan.`
            : "Draf masuk antrean persetujuan. Setujui di halaman Persetujuan."
      );
      onSuccess();
    } catch (err: any) {
      const message = `${describeApprovalError(err, "Draf belum bisa diajukan.")} Draf tetap tersimpan di menu Lamaran.`;
      setApprovalError(message);
      toast.error(message);
    } finally {
      inFlight.current.request = false;
      setRequesting(false);
    }
  };

  // Fill-only run: the worker fills the external form and stops before Submit (no approval yet).
  const handleAutoApply = async () => {
    if (inFlight.current.enqueue) return; // klik ganda: satu tugas antrean saja
    inFlight.current.enqueue = true;
    try {
      setEnqueuing(true);
      setError("");
      await automationQueue.enqueueAutoApply(jobId);
      toast.success("Tugas masuk antrean. Agen akan mengisi formulir tanpa menekan kirim. Pantau di menu Lamaran, bagian Antrean Agen.");
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(describeError(err, "Tugas belum bisa dimasukkan ke antrean. Coba lagi."));
    } finally {
      inFlight.current.enqueue = false;
      setEnqueuing(false);
    }
  };

  const tabs = [
    { key: "cover", label: "Surat Lamaran", icon: FileText },
    { key: "cv", label: "Saran Skill CV", icon: Eye },
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
            <div className="flex flex-col items-center justify-center py-12 text-center">
              {/* Hanya teks tetap ini yang dibacakan pembaca layar; penghitung detik di bawahnya diam. */}
              <div role="status" aria-live="polite" className="flex flex-col items-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0] mb-3" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  {planLabel} sedang menulis lamaranmu...
                </p>
              </div>
              <p data-testid="draft-progress" className="mt-3 text-sm font-semibold tabular-nums text-[#16150F]">
                {draftProgressText(generatingElapsed)}
              </p>
              {draftWaitHint(generatingElapsed) && (
                <p data-testid="draft-wait-hint" className="mt-1 max-w-sm text-xs text-muted-foreground">
                  {draftWaitHint(generatingElapsed)}
                </p>
              )}
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
          ) : existing.state === "checking" ? (
            <div className="flex flex-col items-center justify-center py-12" role="status" aria-live="polite">
              <Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0] mb-3" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Memeriksa draf yang sudah ada untuk lowongan ini...</p>
            </div>
          ) : existing.state === "error" ? (
            <div className="space-y-3">
              <div role="alert" className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                {existing.message} Draf baru belum dibuat, supaya kuota tidak terpakai untuk draf kedua.
              </div>
              <button type="button" onClick={loadExistingDraft} className="min-h-11 px-4 rounded-lg bg-[#0A5BE0] text-white text-sm font-semibold">
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
              {/* A draft saved earlier for this job: shown here, not made again. A new one needs a confirmation (1 quota). */}
              {existing.state === "found" && (
                <div role="status" className="rounded-xl border-2 border-[#0A5BE0]/30 bg-[#0A5BE0]/5 p-4 text-sm">
                  <p className="font-semibold">Kamu sudah punya draf untuk lowongan ini</p>
                  <p className="mt-1 text-muted-foreground">
                    Dibuat {new Date(application.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })},
                    status {applicationStatusLabel(application.status)}. Draf yang ada ditampilkan di sini dan kuota tidak terpakai.
                  </p>
                  {!canStartNewDraft(application.status) && (
                    <p className="mt-2 text-muted-foreground">{ACTIVE_APPLICATION_HINT}</p>
                  )}
                  {canApply && canStartNewDraft(application.status) && !confirmNewDraft && (
                    <button
                      type="button"
                      onClick={() => setConfirmNewDraft(true)}
                      className="mt-3 min-h-11 rounded-lg border-2 border-[#0A5BE0] px-4 text-sm font-semibold text-[#0A5BE0] hover:bg-[#0A5BE0]/5"
                    >
                      Buat draf baru (pakai 1 kuota)
                    </button>
                  )}
                  {canApply && canStartNewDraft(application.status) && confirmNewDraft && (
                    <div role="alert" className="mt-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-amber-900">
                      <p>
                        Draf baru memakai 1 kuota (sisa {quotaText}). Draf yang lama tetap tersimpan di menu Lamaran. Lanjutkan?
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={generate} className="min-h-11 rounded-lg bg-[#0A5BE0] px-4 text-sm font-semibold text-white">
                          Ya, buat draf baru
                        </button>
                        <button type="button" onClick={() => setConfirmNewDraft(false)} className="min-h-11 rounded-lg border-2 border-amber-400 px-4 text-sm font-semibold">
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Where this letter is in the human-in-the-loop flow */}
              <HitlTrack
                stage="gate"
                caption={
                  !editable
                    ? `Lamaran ini sudah berstatus "${applicationStatusLabel(application.status)}", jadi tidak diajukan ke persetujuan lagi.`
                    : approvalId
                      ? "Menunggu persetujuanmu di halaman Persetujuan (berlaku 24 jam). Tanpa persetujuan, agen tidak akan mengirim."
                      : "Draf siap. Tinjau dan edit bila perlu, lalu ajukan ke persetujuan."
                }
              />

              <div
                className={`rounded-xl border p-3 text-xs ${
                  channelInfo.manualOnly
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-[#0A5BE0]/20 bg-[#0A5BE0]/5 text-[#16150F]"
                }`}
              >
                <span className="font-semibold">Jalur lamaran ({channelInfo.badgeLabel}): </span>
                <span>{channelInfo.reason}</span>
                {needsExtension && (
                  <p className="mt-1.5 font-semibold text-[#0A5BE0]">
                    Portal ini butuh Ekstensi Browser. Bila kamu mencoba tanpa ekstensi, pilih lowongan berlabel [UJI] di halaman Lowongan.
                  </p>
                )}
              </div>

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
                  <div className="text-lg font-bold text-[#0A5BE0]">{shownSkills.length}</div>
                  <div className="text-xs text-muted-foreground">Skill disorot AI</div>
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
                          onClick={isEditing ? handleCancelEdit : () => setIsEditing(true)}
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
                    {confirmRewrite && (
                      <div role="alert" className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 space-y-2">
                        <p className="font-semibold">Kamu punya editan manual pada surat lamaran. Menulis ulang akan mengganti isi yang belum diajukan.</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => { void performRegenerate(); }}
                            disabled={regenerating}
                            className="min-h-10 rounded-lg bg-[#0A5BE0] px-3 font-semibold text-white hover:opacity-90 disabled:opacity-60"
                          >
                            Ya, tulis ulang
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRewrite(false)}
                            className="min-h-10 rounded-lg border border-amber-400 bg-white px-3 font-semibold text-amber-950 hover:bg-amber-100"
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    )}
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
                      {/* optimizedCV.summary diisi Edge Function dengan aiNotes (catatan strategi orang ketiga), jadi tidak
                          ditampilkan di sini sebagai ringkasan profil; teks itu sudah ada di tab Strategi AI. */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Skill yang Disorot</h4>
                        <p className="mb-3 text-xs text-muted-foreground">
                          Ini daftar skill dan kata kunci dari profilmu yang paling cocok dengan lowongan ini, sebagai saran untuk CV. Bukan berkas PDF baru.
                        </p>
                        <ul className="flex flex-wrap gap-2">
                          {shownSkills.map((skill, i) => (
                            <li key={i} className="text-xs bg-[#0A5BE0]/10 text-[#0A5BE0] px-2.5 py-1 rounded-full font-medium">
                              {skill}
                            </li>
                          ))}
                        </ul>
                        {shownSkills.length === 0 && (
                          <p className="text-xs text-muted-foreground">Belum ada skill di profilmu yang cocok dengan lowongan ini.</p>
                        )}
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
                    {shownSkillGaps !== null && (
                      <div className="rounded-xl border-2 border-[#FDE68A] bg-[#FFFBEB] p-4">
                        <p className="text-xs font-semibold text-[#92400E] flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Skill yang diminta lowongan tetapi belum ada di profilmu
                        </p>
                        {shownSkillGaps.length > 0 ? (
                          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Kesenjangan skill">
                            {shownSkillGaps.map((g) => (
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
          {error && application && (
            <div role="alert" className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            </div>
          )}
          {approvalError && (
            <div role="alert" id="apply-approval-error" className="rounded-xl border-2 border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{approvalError}</span>
              </p>
            </div>
          )}
          {editable && !approvalId && application?.status === "ready" && (
            // Status ready ditulis worker sesudah mengisi formulir tanpa menekan tombol kirim.
            <p className="text-sm text-muted-foreground">
              Agen sudah pernah mengisi formulir ini tanpa mengirim. Mengajukan lagi membuat agen mengisi ulang.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 px-5 rounded-xl border-2 border-[#999999] text-sm font-medium hover:border-[#0A5BE0] transition"
            >
              {application ? "Tutup (draf tersimpan)" : "Tutup"}
            </button>
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
            ) : editable && (
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
                {requesting ? "Mengajukan..." : approvalError ? "Coba ajukan lagi" : application?.status === "ready" ? "Ajukan lagi ke Persetujuan" : "Ajukan ke Persetujuan"}
              </button>
            )}
          </div>
          {editable && (
            <p id="apply-fill-hint" className="text-xs text-muted-foreground">
              <strong className="font-semibold text-foreground">Ajukan ke Persetujuan</strong> untuk tinjau &amp; kirim lewat halaman Persetujuan.
              {/* Satu aksi utama di footer (ON-12, catatan 41). Uji isi tanpa kirim tetap ada sebagai tautan kecil. */}
              {jobData?.external_url && !channelInfo.manualOnly && !needsExtension && (
                <> Tombol{" "}
                  <button
                    type="button"
                    onClick={handleAutoApply}
                    disabled={enqueuing}
                    title="Agen membuka formulir lowongan dan mengisinya, lalu berhenti sebelum tombol kirim."
                    className="inline-flex min-h-11 items-center gap-1 font-semibold text-[#0A5BE0] underline underline-offset-2 disabled:opacity-60"
                  >
                    {enqueuing && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                    Isi Formulir Saja
                  </button>{" "}
                  hanya mengisi formulir di server lalu berhenti sebelum mengirim, untuk melihat hasil isiannya (pantau di Antrean Agen).</>
              )}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
