import { supabase } from "@/lib/supabase";
import { profileService, type FullProfile } from "./profileService";
import { mockAIApplications, mockFullProfile, MOCK_USER_ID } from "@/mocks/mockData";

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

// Simulasi AI generation (nanti bisa ganti dengan real AI API)
function simulateAIGeneration(profile: FullProfile, job: any, tone: string): {
  coverLetter: string;
  optimizedCV: Record<string, any>;
  tailoredSkills: string[];
  aiNotes: string;
} {
  const userName = profile.profile?.full_name || "Candidate";
  const company = job.company;
  const role = job.title;
  const userSkills = profile.skills.map((s) => s.name);
  const jobSkills = job.requirements || [];
  
  // Find matching skills
  const matchingSkills = userSkills.filter((skill) =>
    jobSkills.some((req: string) => req.toLowerCase().includes(skill.toLowerCase()))
  );
  
  // Find skill gaps
  const skillGaps = jobSkills.filter((req: string) =>
    !userSkills.some((skill) => req.toLowerCase().includes(skill.toLowerCase()))
  );

  // Generate cover letter
  const toneMap: Record<string, string> = {
    professional: "professional and confident",
    casual: "friendly yet professional",
    enthusiastic: "passionate and energetic",
  };

  const coverLetter = `Dear Hiring Manager at ${company},

I am writing to express my strong interest in the ${role} position. With my background in ${profile.profile?.current_title || "software development"} and hands-on experience with ${matchingSkills.slice(0, 3).join(", ") || "modern technologies"}, I am excited about the opportunity to contribute to ${company}'s innovative projects.

${profile.workExperiences?.[0] ? `In my role at ${profile.workExperiences[0].company_name}, I ${profile.workExperiences[0].description || "developed key technical skills and delivered impactful results"}.` : ""}

${matchingSkills.length > 0 ? `My expertise in ${matchingSkills.join(", ")} directly aligns with your requirements, and I am confident in my ability to make an immediate impact.` : "I am eager to bring my unique perspective and dedication to your team."}

${skillGaps.length > 0 ? `I am also actively developing my skills in ${skillGaps.slice(0, 2).join(" and ")} to further enhance my capabilities.` : ""}

I would welcome the opportunity to discuss how my background and skills can contribute to ${company}'s continued success.

Best regards,\n${userName}`;

  // Generate optimized CV summary
  const optimizedCV = {
    summary: `${userName} is a ${profile.profile?.current_title || "dedicated professional"} with ${profile.profile?.experience_years || "several"} years of experience in ${matchingSkills.slice(0, 4).join(", ") || "relevant technologies"}. Proven track record of ${profile.workExperiences?.[0]?.achievements?.[0] || "delivering high-quality results"}.`,
    highlighted_skills: matchingSkills,
    relevant_experiences: profile.workExperiences?.slice(0, 2).map((exp) => ({
      company: exp.company_name,
      role: exp.role_title,
      highlights: exp.achievements?.slice(0, 2) || [],
    })),
    education_summary: profile.education?.[0]
      ? `${profile.education[0].degree} in ${profile.education[0].field_of_study} from ${profile.education[0].institution}`
      : undefined,
    certifications: profile.certifications?.slice(0, 3).map((c) => c.name),
  };

  // AI strategy notes
  const aiNotes = `AI STRATEGY ANALYSIS:

🎯 MATCH SCORE: ${job.match_score}%

STRENGTHS TO HIGHLIGHT:
${matchingSkills.map((s) => `  ✓ ${s}`).join("\n")}

SKILL GAPS TO ADDRESS:
${skillGaps.map((s) => `  ⚠ ${s}`).join("\n")}

RECOMMENDED APPROACH:
1. Emphasize ${matchingSkills[0] || "technical expertise"} in cover letter
2. Reference ${profile.workExperiences?.[0]?.company_name || "previous experience"} as proof of capability
3. Address ${skillGaps[0] || "any gaps"} with learning initiatives
4. Follow up in 3-5 business days if no response

TONE: ${toneMap[tone] || "professional"}
ESTIMATED SUCCESS RATE: ${job.acceptance_potential}%`;

  return {
    coverLetter,
    optimizedCV,
    tailoredSkills: matchingSkills,
    aiNotes,
  };
}

export const aiApplicationService = {
  // Create AI application draft
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const [profile, { data: job }] = await Promise.all([
      profileService.getFullProfile(user.id),
      supabase.from("jobs").select("*").eq("id", input.jobId).single(),
    ]);

    if (!job) throw new Error("Job not found");

    const aiResult = simulateAIGeneration(profile, job, input.tone || "professional");

    const { data, error } = await supabase
      .from("ai_applications")
      .insert({
        user_id: user.id,
        job_id: input.jobId,
        optimized_cv: aiResult.optimizedCV,
        cover_letter: aiResult.coverLetter,
        tailored_skills: aiResult.tailoredSkills,
        ai_notes: aiResult.aiNotes,
        status: "draft",
      })
      .select()
      .single();

    if (error) throw error;
    return data;
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
      return { ...app, job: app.jobs } as any;
    }

    const { data, error } = await supabase
      .from("ai_applications")
      .select("*, jobs(*)")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
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

  // Submit application (mark as ready/submitted)
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

    const app = await this.getApplication(id);
    if (app.job_id) {
      await supabase.from("jobs").update({ status: "applied" }).eq("id", app.job_id);
    }

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
    const { error } = await supabase.from("ai_applications").delete().eq("id", id);
    if (error) throw error;
  },

  // Get AI insights for job
  async getJobInsights(jobId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const [profile, { data: job }] = await Promise.all([
      profileService.getFullProfile(user.id),
      supabase.from("jobs").select("*").eq("id", jobId).single(),
    ]);

    if (!job) throw new Error("Job not found");

    const aiResult = simulateAIGeneration(profile, job, "professional");

    return {
      coverLetter: aiResult.coverLetter,
      optimizedCV: aiResult.optimizedCV,
      tailoredSkills: aiResult.tailoredSkills,
      aiNotes: aiResult.aiNotes,
      matchScore: job.match_score,
      acceptancePotential: job.acceptance_potential,
    };
  },
};
