import { supabase } from "@/lib/supabase";
import { mockAIApplications, mockAiAnalysis, MOCK_USER_ID } from "@/mocks/mockData";

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
      return newApp as AIApplicationData;
    }

    const res = await invokeGenerate(input.jobId, "generate", input.tone || "professional");
    if (!res?.application) throw new Error(res?.error || "Gagal membuat draft AI");
    return res.application as AIApplicationData;
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
              follow_up_scheduled: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
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
        follow_up_scheduled: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
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

  // Mark follow-up as sent
  async markFollowUpSent(id: string) {
    const { data, error } = await supabase
      .from("ai_applications")
      .update({ follow_up_sent: true })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
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
      skillGaps: a.skillGaps ?? [],
      quota: res?.quota,
    };
  },
};
