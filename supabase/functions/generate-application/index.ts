// Applify — generate-application Edge Function
// Server-side AI: enforce monthly quota -> pick model by tier -> call OpenRouter -> persist draft.
// Secrets needed: OPENROUTER_API_KEY (required). Optional: FREE_MODEL, PRO_MODEL.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically by Supabase.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const FREE_MODEL = Deno.env.get("FREE_MODEL") ?? "deepseek/deepseek-v4-flash:free";
const PRO_MODEL = Deno.env.get("PRO_MODEL") ?? "deepseek/deepseek-v4-pro";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function extractJson(s: string): any {
  const cleaned = s.replace(/```(?:json)?/gi, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(cleaned.slice(a, b + 1)); } catch { /* fallthrough */ }
  }
  return null;
}

function clamp(n: unknown): number {
  const v = Math.round(Number(n) || 0);
  return Math.max(0, Math.min(100, v));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "Missing auth token" }, 401);
    if (!OPENROUTER_API_KEY) return json({ error: "AI not configured (OPENROUTER_API_KEY missing)" }, 503);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // 1) Verify caller
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const jobId: string | undefined = body?.jobId;
    const tone: string = body?.tone ?? "professional";
    const mode: string = body?.mode ?? "generate"; // "generate" (consumes quota + persists) | "analyze" (preview only)
    if (!jobId) return json({ error: "jobId is required" }, 400);

    // 2) Tier -> model
    const { data: sub } = await admin
      .from("subscriptions").select("ai_model_tier, plan_name").eq("user_id", userId).maybeSingle();
    const tier = sub?.ai_model_tier === "pro" ? "pro" : "free";
    const model = tier === "pro" ? PRO_MODEL : FREE_MODEL;

    // 3) Quota (consume only when actually generating an application)
    let quota: any = null;
    if (mode === "analyze") {
      const { data: q } = await admin.rpc("get_quota_status", { p_user_id: userId });
      quota = q;
    } else {
      const { data: q, error: qErr } = await admin.rpc("consume_monthly_apply", { p_user_id: userId });
      if (qErr) return json({ error: "Quota check failed", detail: qErr.message }, 500);
      quota = q;
      if (q && q.allowed === false) {
        return json({ error: "Kuota bulanan habis. Upgrade ke Pro untuk lebih banyak lamaran.", quota: q }, 429);
      }
    }

    // 4) Context
    const [{ data: job }, { data: profile }, { data: skills }, { data: work }] = await Promise.all([
      admin.from("jobs").select("*").eq("id", jobId).maybeSingle(),
      admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
      admin.from("user_skills").select("name, proficiency_level").eq("user_id", userId),
      admin.from("work_experiences")
        .select("role_title, company_name, description, start_date, end_date")
        .eq("user_id", userId).order("start_date", { ascending: false }).limit(3),
    ]);
    if (!job) return json({ error: "Job not found" }, 404);

    const skillList = (skills ?? []).map((s: any) => s.name).join(", ")
      || (Array.isArray(profile?.skills) ? profile!.skills.join(", ") : "");
    const workList = (work ?? [])
      .map((w: any) => `- ${w.role_title} @ ${w.company_name}: ${w.description ?? ""}`).join("\n");

    // 5) Prompt
    const sys = `You are an expert Indonesian career assistant for "Applify". Analyze the candidate-job match and write a tailored, ATS-friendly cover letter. Respond with ONLY a valid JSON object (no markdown, no code fences).`;
    const userPrompt = `JOB
Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? "-"}
Description: ${job.description ?? ""}
Requirements: ${JSON.stringify(job.requirements ?? [])}

CANDIDATE
Name: ${profile?.full_name ?? "Kandidat"}
Current title: ${profile?.current_title ?? "-"}
Experience years: ${profile?.experience_years ?? 0}
Skills: ${skillList || "-"}
Recent experience:
${workList || "-"}

TONE: ${tone}

Return JSON exactly in this shape:
{
  "coverLetter": "250-400 word ${tone} cover letter, ready to send, no placeholders/brackets",
  "matchScore": 0-100,
  "acceptancePotential": 0-100,
  "tailoredSkills": ["skills from the candidate that match this job"],
  "skillGaps": ["required skills the candidate is missing"],
  "aiNotes": "1-3 sentence strategy in Bahasa Indonesia"
}`;

    // 6) Call OpenRouter
    const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://applify.id",
        "X-Title": "Applify",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 1600,
      }),
    });

    if (!aiResp.ok) {
      const detail = await aiResp.text();
      return json({ error: "AI generation failed", detail, model, quota }, 502);
    }

    const aiJson = await aiResp.json();
    const content: string = aiJson.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(content) ?? {
      coverLetter: content,
      matchScore: job.match_score ?? 70,
      acceptancePotential: job.acceptance_potential ?? 60,
      tailoredSkills: [],
      skillGaps: [],
      aiNotes: "",
    };

    const result = {
      coverLetter: parsed.coverLetter ?? "",
      optimizedCV: { summary: parsed.aiNotes ?? "", highlighted_skills: parsed.tailoredSkills ?? [] },
      tailoredSkills: parsed.tailoredSkills ?? [],
      aiNotes: parsed.aiNotes ?? "",
      matchScore: clamp(parsed.matchScore ?? job.match_score),
      acceptancePotential: clamp(parsed.acceptancePotential ?? job.acceptance_potential),
      skillGaps: parsed.skillGaps ?? [],
      modelUsed: aiJson.model ?? model,
      tier,
    };

    if (mode === "analyze") return json({ analysis: result, quota });

    // 7) Persist draft (server-authoritative)
    const { data: app, error: insErr } = await admin
      .from("ai_applications")
      .insert({
        user_id: userId,
        job_id: jobId,
        optimized_cv: result.optimizedCV,
        cover_letter: result.coverLetter,
        tailored_skills: result.tailoredSkills,
        ai_notes: result.aiNotes,
        status: "draft",
      })
      .select("*, jobs(*)")
      .single();

    if (insErr) return json({ error: "Failed to save draft", detail: insErr.message, analysis: result, quota }, 500);
    return json({ application: app, analysis: result, quota });
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
