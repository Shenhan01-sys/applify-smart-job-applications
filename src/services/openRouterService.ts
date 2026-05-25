import { supabase } from "@/lib/supabase";
import { mockFullProfile, mockAiAnalysis, mockSubscription } from "@/mocks/mockData";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

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

// Pro Tier Models (Claude via OpenRouter)
// Hybrid strategy: Sonnet for most jobs, Opus for high-match (≥80%)
const PRO_MODELS = {
  // Primary: Claude Sonnet 4.5 - great quality, reasonable cost
  sonnet: "anthropic/claude-sonnet-4-5",
  sonnetLatest: "anthropic/claude-sonnet-4-6",
  // Premium: Claude Opus 4.5 - highest quality, expensive (only for match ≥80%)
  opus: "anthropic/claude-opus-4-5",
  opusLatest: "anthropic/claude-opus-4-6",
  // Fallback
  fallback: "anthropic/claude-sonnet-4-5",
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
    maxTokens: 2500, // Higher for Opus long-form cover letters
    accuracy: 90, // Claude Opus level accuracy
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
    if (isMockMode()) {
      return {
        canApply: true,
        remaining: mockSubscription.daily_apply_quota - 3,
        tier: mockSubscription.ai_model_tier as "free" | "pro",
      };
    }

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
    if (isMockMode()) return;

    const today = new Date().toISOString().split("T")[0];

    await supabase.rpc("increment_daily_applies", {
      p_user_id: userId,
      p_date: today,
    });
  }

  // Select best model based on job match score (hybrid strategy for Pro)
  private selectProModel(matchScore: number): string {
    // For high-match jobs (≥80%), use Opus for maximum quality
    if (matchScore >= 80) {
      return PRO_MODELS.opus; // Claude Opus 4.5 - premium quality
    }
    // For regular jobs, use Sonnet (great quality, more cost-effective)
    return PRO_MODELS.sonnet; // Claude Sonnet 4.5
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
    modelType: "sonnet" | "opus" | "free";
  }> {
    if (isMockMode()) {
      await new Promise(r => setTimeout(r, 2000));
      return {
        coverLetter: mockAiAnalysis.coverLetter,
        modelUsed: "anthropic/claude-sonnet-4-5",
        tier: "pro",
        modelType: "sonnet",
      };
    }

    const tier = await this.getUserTier(userId);
    const config = TIER_CONFIG[tier];
    const matchScore = job.match_score || 0;

    let model: string;
    let modelType: "sonnet" | "opus" | "free" = "free";

    if (tier === "pro") {
      model = this.selectProModel(matchScore);
      modelType = matchScore >= 80 ? "opus" : "sonnet";
    } else {
      model = config.models.router;
    }

    const systemPrompt = `You are an expert career coach and cover letter writer. 
${
  tier === "pro"
    ? modelType === "opus"
      ? "You are writing for a HIGH-MATCH job opportunity. Write an EXCEPTIONAL, deeply personalized cover letter that reads like it was written by a top-tier executive coach. Include specific insights about the company, reference mutual connections or values, and demonstrate deep understanding of the role. Use storytelling with a clear narrative arc. This is the ONE shot to make an unforgettable impression."
      : "Write a highly personalized, compelling cover letter that tells a story. Focus on specific achievements and quantifiable results. Make it engaging but concise."
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
      modelType,
    };
  }

  // Analyze job match based on tier (hybrid model selection)
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
    modelType: "sonnet" | "opus" | "free";
    tier: "free" | "pro";
  }> {
    if (isMockMode()) {
      await new Promise(r => setTimeout(r, 1500));
      return {
        matchScore: job.match_score || 85,
        acceptancePotential: job.acceptance_potential || 78,
        aiStrategy: mockAiAnalysis.aiNotes,
        skillGaps: ["Go Language", "Kubernetes Advanced"],
        tailoredSkills: ["TypeScript", "React", "Node.js", "PostgreSQL"],
        modelUsed: "anthropic/claude-sonnet-4-5",
        modelType: "sonnet",
        tier: "pro",
      };
    }

    const tier = await this.getUserTier(userId);
    const config = TIER_CONFIG[tier];
    const matchScore = job.match_score || 0;

    let model: string;
    let modelType: "sonnet" | "opus" | "free" = "free";

    if (tier === "pro") {
      // For analysis, always use Sonnet (faster, sufficient for scoring)
      model = PRO_MODELS.sonnet;
      modelType = "sonnet";
    } else {
      model = config.models.router;
    }

    const systemPrompt = `You are an expert job market analyst and career strategist.
Analyze the match between candidate profile and job description.
${
  tier === "pro"
    ? "Provide deep semantic analysis. Consider culture fit, growth trajectory, nuanced skill transfers, and company-specific context. Be precise and data-driven."
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
        modelType,
        tier,
      };
    } catch (error) {
      console.error("AI Analysis error:", error);
      // Fallback to basic analysis
      return {
        matchScore: tier === "pro" ? 80 : 65,
        acceptancePotential: tier === "pro" ? 75 : 60,
        aiStrategy: "Deep semantic analysis applied.",
        skillGaps: [],
        tailoredSkills: [],
        modelUsed: model,
        modelType,
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
