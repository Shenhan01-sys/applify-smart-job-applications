import { supabase } from "@/lib/supabase";
import { mockAIApplications, mockAiAnalysis, MOCK_USER_ID } from "@/mocks/mockData";
import { automationApi } from "@/services/automationApi";
import { followUpDueAt } from "@/lib/followUp";
import { cleanStringList } from "@/lib/jobCardData";
import { rawModelUsed } from "@/lib/modelLabel";
import { quotaFromEdgeResponse, type QuotaSummary } from "@/lib/quotaStatus";
import { invokeWithDraftTimeout } from "@/lib/draftProgress";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

// In-memory mock store for mock mode
let mockAppStore = [...mockAIApplications];

export interface AIApplicationData {
  id: string;
  user_id: string;
  job_id: string;
  optimized_cv: Record<string, any>;
  cover_letter: string;
  tailored_skills: string[];
  ai_notes: string;
  status: "draft" | "ready" | "submitted" | "follow_up" | "responded" | "closed";
  submitted_at?: string;
  follow_up_scheduled?: string;
  follow_up_sent: boolean;
  company_response?: string;
  response_received_at?: string;
  /** Model yang menulis draf (penyedia:model). Null untuk draf sebelum kolom ini ada. */
  model_used?: string | null;
  created_at: string;
  updated_at: string;
}

export const APPLICATION_STATUSES = ["draft", "ready", "submitted", "follow_up", "responded", "closed"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Tell the backend to announce the saved status on Telegram. Never throws: notification is best effort. */
function announceStatus(id: string) {
  if (isMockMode()) return;
  automationApi.notifyApplicationStatus(id).catch((err) => {
    console.warn("[aiApplicationService] status notification skipped:", err?.message ?? err);
  });
}

/** What the Edge Function returns next to the saved draft (it is not stored; only the screen shows it). */
export interface DraftAnalysis {
  /** Skills the posting asks for that the profile does not list. An empty list means the model reported none. */
  skillGaps: string[];
  /** Warnings from the quality guard (wrong language, numbers the profile does not support). */
  warnings: string[];
  /** `analysis.modelUsed` as sent ("<provider>:<model>"); null when the response named none. Shown via lib/modelLabel.ts. */
  modelUsed: string | null;
  /** Monthly quota after this draft, as the Edge Function reports it; null when the response had none. */
  quota: QuotaSummary | null;
}

export interface AIApplicationInput {
  jobId: string;
  tone?: "professional" | "casual" | "enthusiastic";
  highlightStrengths?: string[];
  additionalNotes?: string;
}

/**
 * Calls the server-side `generate-application` Edge Function which enforces the
 * monthly quota, picks the model chain by tier (see lib/planInfo.ts PLAN_MODELS),
 * calls the providers with the keys kept server-side, and (for mode "generate")
 * persists the draft. The user's access token is attached automatically.
 */
async function invokeGenerate(
  jobId: string,
  mode: "generate" | "analyze",
  tone = "professional"
) {
  // The Edge Function stops its model chain after its own time budget; the browser gives up a little later
  // (lib/draftProgress.ts), so a stuck request ends with the retry message instead of waiting on every model.
  // A timeout, a server error and a network error all end as an Error with a message the modal can show
  // (invokeWithDraftTimeout in lib/draftProgress.ts, covered by tests/draftProgress.test.ts).
  const data = await invokeWithDraftTimeout((timeout) =>
    supabase.functions.invoke("generate-application", { body: { jobId, mode, tone }, timeout }),
  );
  return data as any;
}

export const aiApplicationService = {
  // Create AI application draft (real AI via Edge Function; consumes 1 monthly quota)
  async createDraft(input: AIApplicationInput): Promise<AIApplicationData> {
    return (await this.createDraftWithAnalysis(input)).application;
  },

  // Same as createDraft, plus the analysis the Edge Function returns next to the draft (skill gaps, warnings).
  // `reused` = true: pengguna sudah punya lamaran aktif untuk lowongan ini, server mengembalikannya dan tidak membuat
  // draf baru (tanpa panggilan model, tanpa kuota). Lihat lib/activeApplication.ts.
  async createDraftWithAnalysis(input: AIApplicationInput): Promise<{ application: AIApplicationData; analysis: DraftAnalysis; reused: boolean }> {
    if (isMockMode()) {
      await new Promise(r => setTimeout(r, 1500));
      const newApp = {
        id: `app-${Date.now()}`,
        user_id: MOCK_USER_ID,
        job_id: input.jobId,
        optimized_cv: mockAiAnalysis.optimizedCV,
        cover_letter: mockAiAnalysis.coverLetter,
        tailored_skills: mockAiAnalysis.tailoredSkills,
        ai_notes: mockAiAnalysis.aiNotes,
        status: "draft" as const,
        submitted_at: undefined,
        follow_up_scheduled: undefined,
        follow_up_sent: false,
        company_response: undefined,
        response_received_at: undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        jobs: { title: "New Job", company: "Company" },
      };
      mockAppStore = [newApp as any, ...mockAppStore];
      return { application: newApp as AIApplicationData, analysis: { skillGaps: [], warnings: [], modelUsed: null, quota: null }, reused: false };
    }

    const res = await invokeGenerate(input.jobId, "generate", input.tone || "professional");
    if (!res?.application) throw new Error(res?.error || "Draf AI belum bisa dibuat. Cek sisa kuota draf dan kelengkapan profilmu, lalu coba lagi.");
    return {
      application: res.application as AIApplicationData,
      analysis: {
        skillGaps: cleanStringList(res.analysis?.skillGaps),
        warnings: cleanStringList(res.analysis?.warnings),
        modelUsed: rawModelUsed(res.analysis?.modelUsed),
        quota: quotaFromEdgeResponse(res.quota),
      },
      reused: res.reused === true,
    };
  },

  // Get all AI applications for user
  async getApplications(): Promise<AIApplicationData[]> {
    if (isMockMode()) {
      return mockAppStore as unknown as AIApplicationData[];
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("ai_applications")
      .select("*, jobs(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // The newest saved draft of this user for a job, or null. The AI Apply modal shows it instead of making a new one
  // (a new draft uses one monthly quota). Throws when the lookup fails: "no draft" must never be a guess.
  async getDraftForJob(jobId: string): Promise<AIApplicationData | null> {
    if (isMockMode()) {
      return (mockAppStore.find(a => (a as any).job_id === jobId) as unknown as AIApplicationData) ?? null;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("ai_applications")
      .select("*")
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    return (data?.[0] as AIApplicationData | undefined) ?? null;
  },

  // Get single application
  async getApplication(id: string): Promise<AIApplicationData & { job: any }> {
    if (isMockMode()) {
      const app = mockAppStore.find(a => a.id === id) || mockAppStore[0];
      return { ...app, job: (app as any).jobs } as any;
    }

    const { data, error } = await supabase
      .from("ai_applications")
      .select("*, jobs(*)")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as any;
  },

  // Update cover letter
  async updateCoverLetter(id: string, coverLetter: string) {
    if (isMockMode()) {
      mockAppStore = mockAppStore.map(a =>
        a.id === id ? { ...a, cover_letter: coverLetter, updated_at: new Date().toISOString() } : a
      );
      return mockAppStore.find(a => a.id === id);
    }

    const { data, error } = await supabase
      .from("ai_applications")
      .update({ cover_letter: coverLetter, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Submit application (mark as submitted + schedule follow-up + mark job applied)
  async submitApplication(id: string) {
    if (isMockMode()) {
      mockAppStore = mockAppStore.map(a =>
        a.id === id
          ? {
              ...a,
              status: "submitted",
              submitted_at: new Date().toISOString(),
              follow_up_scheduled: followUpDueAt(),
            }
          : a
      );
      return mockAppStore.find(a => a.id === id);
    }

    const { data, error } = await supabase
      .from("ai_applications")
      .update({
        status: "submitted",
        submitted_at: new Date().toISOString(),
        follow_up_scheduled: followUpDueAt(),
        follow_up_sent: false,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    announceStatus(id);
    return data;
  },

  // Move an application to another status (board drag, manual updates) and announce it on Telegram.
  async updateStatus(id: string, status: ApplicationStatus) {
    if (!APPLICATION_STATUSES.includes(status)) throw new Error(`Status tidak dikenal: ${status}`);
    if (isMockMode()) {
      mockAppStore = mockAppStore.map(a => (a.id === id ? ({ ...a, status, updated_at: new Date().toISOString() } as any) : a));
      return mockAppStore.find(a => a.id === id);
    }

    const patch: Record<string, any> = { status, updated_at: new Date().toISOString() };
    if (status === "submitted") {
      // First time submitted: record when, and when the follow-up reminder is due (FOLLOW_UP_DAYS).
      const { data: current } = await supabase
        .from("ai_applications")
        .select("submitted_at, follow_up_scheduled")
        .eq("id", id)
        .single();
      if (!current?.submitted_at) patch.submitted_at = new Date().toISOString();
      if (!current?.follow_up_scheduled) patch.follow_up_scheduled = followUpDueAt();
    }

    const { data, error } = await supabase
      .from("ai_applications")
      .update(patch)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    announceStatus(id);
    return data;
  },

  // Simpan hasil akhir (Wawancara/Tawaran/Ditolak) dan catatan bebas pengguna di kolom company_response (UX-P7-04, UX-P7-06).
  async updateCompanyResponse(id: string, companyResponse: string | null) {
    const clean = companyResponse?.trim() ? companyResponse.trim() : null;
    const now = new Date().toISOString();
    if (isMockMode()) {
      mockAppStore = mockAppStore.map((a) =>
        a.id === id
          ? ({ ...a, company_response: clean ?? undefined, response_received_at: clean ? now : undefined, updated_at: now } as any)
          : a
      );
      return mockAppStore.find((a) => a.id === id);
    }
    const { data, error } = await supabase
      .from("ai_applications")
      .update({
        company_response: clean,
        response_received_at: clean ? now : null,
        updated_at: now,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Schedule follow-up
  async scheduleFollowUp(id: string, date: string) {
    const { data, error } = await supabase
      .from("ai_applications")
      .update({ follow_up_scheduled: date })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Pengguna menandai bahwa ia sendiri sudah menindaklanjuti (Applify tidak mengirim email follow-up).
  // Kolom `follow_up` berarti "Perlu tindak lanjut" (UX-P7-02), sehingga status `submitted` dibiarkan tetap
  // `submitted`, sedangkan kartu yang sebelumnya berada di `follow_up` dikembalikan ke `submitted` agar keluar
  // dari hitungan perlu tindak lanjut. Tahap lanjut (`responded`, `closed`) tidak diubah.
  async markFollowUpSent(id: string) {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("ai_applications")
      .update({ follow_up_sent: true, updated_at: now })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    const { data: moved } = await supabase
      .from("ai_applications")
      .update({ status: "submitted", updated_at: now })
      .eq("id", id)
      .eq("status", "follow_up")
      .select()
      .maybeSingle();
    return moved ?? data;
  },

  // Delete application
  async deleteApplication(id: string) {
    if (isMockMode()) {
      mockAppStore = mockAppStore.filter(a => a.id !== id);
      return;
    }
    const { error } = await supabase.from("ai_applications").delete().eq("id", id);
    if (error) throw error;
  },

  // Get AI insights for a job (preview — does NOT consume monthly quota)
  async getJobInsights(jobId: string) {
    if (isMockMode()) {
      return {
        coverLetter: mockAiAnalysis.coverLetter,
        optimizedCV: mockAiAnalysis.optimizedCV,
        tailoredSkills: mockAiAnalysis.tailoredSkills,
        aiNotes: mockAiAnalysis.aiNotes,
        matchScore: 85,
        acceptancePotential: 78,
        skillGaps: [] as string[],
        modelUsed: null as string | null,
        quota: null as QuotaSummary | null,
      };
    }

    const res = await invokeGenerate(jobId, "analyze");
    const a = res?.analysis ?? {};
    return {
      coverLetter: a.coverLetter ?? "",
      optimizedCV: a.optimizedCV ?? {},
      tailoredSkills: a.tailoredSkills ?? [],
      aiNotes: a.aiNotes ?? "",
      matchScore: a.matchScore ?? 0,
      acceptancePotential: a.acceptancePotential ?? 0,
      skillGaps: cleanStringList(a.skillGaps),
      modelUsed: rawModelUsed(a.modelUsed),
      quota: quotaFromEdgeResponse(res?.quota),
    };
  },
};
