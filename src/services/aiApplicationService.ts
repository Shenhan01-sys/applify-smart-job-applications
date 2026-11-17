import { supabase } from "@/lib/supabase";
import { mockAIApplications, mockAiAnalysis, MOCK_USER_ID } from "@/mocks/mockData";
import { automationApi } from "@/services/automationApi";
import { followUpDueAt } from "@/lib/followUp";
import { cleanStringList } from "@/lib/jobCardData";

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
}

export interface AIApplicationInput {
  jobId: string;
  tone?: "professional" | "casual" | "enthusiastic";
  highlightStrengths?: string[];
  additionalNotes?: string;
}

/**
 * Calls the server-side `generate-application` Edge Function which enforces the
 * monthly quota, picks the AI model by tier (Free = DeepSeek V4 Flash :free),
 * calls OpenRouter with the key kept server-side, and (for mode "generate")
 * persists the draft. The user's access token is attached automatically.
 */
async function invokeGenerate(
  jobId: string,
  mode: "generate" | "analyze",
  tone = "professional"
) {
  const { data, error } = await supabase.functions.invoke("generate-application", {
    body: { jobId, mode, tone },
  });
  if (error) {
    // supabase-js wraps non-2xx responses; try to surface the real server message
    let msg = error.message;
    try {
      const ctx = await (error as any).context?.json?.();
      if (ctx?.error) msg = ctx.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return data as any;
}

export const aiApplicationService = {
  // Create AI application draft (real AI via Edge Function; consumes 1 monthly quota)
  async createDraft(input: AIApplicationInput): Promise<AIApplicationData> {
    return (await this.createDraftWithAnalysis(input)).application;
  },

  // Same as createDraft, plus the analysis the Edge Function returns next to the draft (skill gaps, warnings).
  async createDraftWithAnalysis(input: AIApplicationInput): Promise<{ application: AIApplicationData; analysis: DraftAnalysis }> {
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
      return { application: newApp as AIApplicationData, analysis: { skillGaps: [], warnings: [] } };
    }

    const res = await invokeGenerate(input.jobId, "generate", input.tone || "professional");
    if (!res?.application) throw new Error(res?.error || "Gagal membuat draft AI");
    return {
      application: res.application as AIApplicationData,
      analysis: { skillGaps: cleanStringList(res.analysis?.skillGaps), warnings: cleanStringList(res.analysis?.warnings) },
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

  // The user says she/he sent the follow-up herself/himself (Applify never sends it). A still-"submitted"
  // application moves to "follow_up"; later stages (responded, closed) are left alone.
  async markFollowUpSent(id: string) {
    const { data, error } = await supabase
      .from("ai_applications")
      .update({ follow_up_sent: true })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    await supabase.from("ai_applications").update({ status: "follow_up" }).eq("id", id).eq("status", "submitted");
    return data;
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
      quota: res?.quota,
    };
  },
};
