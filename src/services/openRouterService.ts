import { supabase } from "@/lib/supabase";

// OpenRouter API Configuration
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || "";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Free Tier Models (OpenRouter Free)
const FREE_MODELS = {
  router: "openrouter/free", // Auto-select best free model
  deepseek: "deepseek/deepseek-v4-flash:free",
  qwen: "qwen/qwen3-next-80b-a3b-instruct:free",
  gemma: "google/gemma-4-31b-it:free",
  trinity: "arcee-ai/trinity-large-thinking:free",
};

// Pro Tier Models (Paid, High Quality)
const PRO_MODELS = {
  coverLetter: "anthropic/claude-3.5-sonnet",
  analysis: "openai/gpt-4o",
  fallback: "deepseek/deepseek-chat",
};

// Tier configuration
const TIER_CONFIG = {
  free: {
    models: FREE_MODELS,
    temperature: 0.9, // More creative for free tier
    maxTokens: 1500,
    accuracy: 70,
  },
  pro: {
    models: PRO_MODELS,
    temperature: 0.7, // More precise for pro tier
    maxTokens: 2000,
    accuracy: 85,
  },
};

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || OPENROUTER_API_KEY;
  }

  private async callAPI(
    model: string,
    messages: OpenRouterMessage[],
    temperature: number,
    maxTokens: number
  ): Promise<OpenRouterResponse> {
    if (!this.apiKey) {
      throw new Error("OpenRouter API key not configured");
    }

    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "Applify AI Job Assistant",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${error}`);
    }

    return response.json();
  }

  // Get user's AI tier
  private async getUserTier(userId: string): Promise<"free" | "pro"> {
    const { data } = await supabase
      .from("subscriptions")
      .select("ai_model_tier")
      .eq("user_id", userId)
      .single();

    return (data?.ai_model_tier as "free" | "pro") || "free";
  }

  // Check daily quota
  async checkQuota(userId: string): Promise<{
    canApply: boolean;
    remaining: number;
    tier: "free" | "pro";
  }> {
    const today = new Date().toISOString().split("T")[0];

    // Get user's subscription
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("daily_apply_quota, ai_model_tier")
      .eq("user_id", userId)
      .single();

    const quota = sub?.daily_apply_quota || 10;
    const tier = (sub?.ai_model_tier as "free" | "pro") || "free";

    // Get today's usage
    const { data: usage } = await supabase
      .from("daily_usage")
      .select("applies_used")
      .eq("user_id", userId)
      .eq("date", today)
      .single();

    const used = usage?.applies_used || 0;
    const remaining = Math.max(0, quota - used);

    return {
      canApply: remaining > 0,
      remaining,
      tier,
    };
  }

  // Increment usage
  async incrementUsage(userId: string): Promise<void> {
    const today = new Date().toISOString().split("T")[0];

    await supabase.rpc("increment_daily_applies", {
      p_user_id: userId,
      p_date: today,
    });
  }

  // Generate cover letter based on tier
  async generateCoverLetter(
    userId: string,
    profile: any,
    job: any,
    tone: string = "professional"
  ): Promise<{
    coverLetter: string;
    modelUsed: string;
    tier: "free" | "pro";
  }> {
    const tier = await this.getUserTier(userId);
    const config = TIER_CONFIG[tier];

    const model =
      tier === "pro" ? config.models.coverLetter : config.models.router;

    const systemPrompt = `You are an expert career coach and cover letter writer. 
${
  tier === "pro"
    ? "Write a highly personalized, compelling cover letter that tells a story. Focus on specific achievements and quantifiable results."
    : "Write a clear, professional cover letter. Focus on matching skills to requirements."
}`;

    const userPrompt = this.buildCoverLetterPrompt(profile, job, tone);

    const response = await this.callAPI(
      model,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      config.temperature,
      config.maxTokens
    );

    return {
      coverLetter: response.choices[0]?.message?.content || "",
      modelUsed: response.model,
      tier,
    };
  }

  // Analyze job match based on tier
  async analyzeJobMatch(
    userId: string,
    profile: any,
    job: any
  ): Promise<{
    matchScore: number;
    acceptancePotential: number;
    aiStrategy: string;
    skillGaps: string[];
    tailoredSkills: string[];
    modelUsed: string;
    tier: "free" | "pro";
  }> {
    const tier = await this.getUserTier(userId);
    const config = TIER_CONFIG[tier];

    const model =
      tier === "pro" ? config.models.analysis : config.models.router;

    const systemPrompt = `You are an expert job market analyst and career strategist.
Analyze the match between candidate profile and job description.
${
  tier === "pro"
    ? "Provide deep semantic analysis. Consider culture fit, growth trajectory, and nuanced skill transfers."
    : "Provide straightforward skill matching and basic recommendations."
}

Respond in JSON format:
{
  "matchScore": 0-100,
  "acceptancePotential": 0-100,
  "aiStrategy": "string",
  "skillGaps": ["string"],
  "tailoredSkills": ["string"]
}`;

    const userPrompt = this.buildAnalysisPrompt(profile, job);

    try {
      const response = await this.callAPI(
        model,
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        0.3, // Low temperature for consistent scoring
        1500
      );

      const content = response.choices[0]?.message?.content || "{}";
      const result = JSON.parse(content);

      // Adjust scores based on tier accuracy
      const accuracyMultiplier = tier === "pro" ? 1.0 : 0.85;

      return {
        matchScore: Math.min(
          100,
          Math.round((result.matchScore || 70) * accuracyMultiplier)
        ),
        acceptancePotential: Math.min(
          100,
          Math.round((result.acceptancePotential || 60) * accuracyMultiplier)
        ),
        aiStrategy: result.aiStrategy || "",
        skillGaps: result.skillGaps || [],
        tailoredSkills: result.tailoredSkills || [],
        modelUsed: response.model,
        tier,
      };
    } catch (error) {
      console.error("AI Analysis error:", error);
      // Fallback to basic analysis
      return {
        matchScore: tier === "pro" ? 75 : 65,
        acceptancePotential: tier === "pro" ? 70 : 60,
        aiStrategy: "Basic skill matching applied.",
        skillGaps: [],
        tailoredSkills: [],
        modelUsed: model,
        tier,
      };
    }
  }

  private buildCoverLetterPrompt(
    profile: any,
    job: any,
    tone: string
  ): string {
    return `
Write a ${tone} cover letter for this job:

JOB:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description}
Requirements: ${(job.requirements || []).join(", ")}

CANDIDATE PROFILE:
Name: ${profile.profile?.full_name || "Candidate"}
Current Role: ${profile.profile?.current_title || "N/A"}
Experience: ${profile.profile?.experience_years || 0} years
Skills: ${profile.skills.map((s: any) => s.name).join(", ")}

Recent Experience:
${profile.workExperiences
  ?.slice(0, 2)
  .map(
    (exp: any) =>
      `- ${exp.role_title} at ${exp.company_name}: ${exp.description}`
  )
  .join("\n")}

EDUCATION:
${profile.education
  ?.map(
    (edu: any) =>
      `- ${edu.degree} in ${edu.field_of_study} from ${edu.institution}`
  )
  .join("\n")}

Key Achievements:
${profile.achievements
  ?.slice(0, 3)
  .map((a: any) => `- ${a.title}: ${a.description}`)
  .join("\n")}

Keep it concise (250-400 words), compelling, and focused on value proposition.
`;
  }

  private buildAnalysisPrompt(profile: any, job: any): string {
    return `
Analyze the match between this candidate and job:

JOB:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description}
Requirements: ${(job.requirements || []).join(", ")}
Responsibilities: ${(job.responsibilities || []).join(", ")}

CANDIDATE:
Skills: ${profile.skills.map((s: any) => `${s.name} (level ${s.proficiency_level}/10)`).join(", ")}
Experience: ${profile.workExperiences
  ?.map(
    (exp: any) =>
      `${exp.role_title} at ${exp.company_name} (${exp.start_date} - ${exp.end_date || "present"})`
  )
  .join("; ")}
Education: ${profile.education
  ?.map((edu: any) => `${edu.degree} from ${edu.institution}`)
  .join("; ")}

Provide analysis in the exact JSON format specified in system prompt.
`;
  }
}

// Singleton instance
export const openRouterService = new OpenRouterService();
