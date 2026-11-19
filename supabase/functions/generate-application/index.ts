// Applify — generate-application Edge Function
// Server-side AI: enforce monthly quota -> pick model by tier -> call OpenRouter -> persist draft.
// Secrets: at least one of OPENROUTER_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY. Optional: FREE_MODELS /
// PRO_MODELS (comma-separated, tried in order; "gemini:<model>" and "anthropic:<model>" go to those providers,
// anything else to OpenRouter) or the older single-model FREE_MODEL / PRO_MODEL. See ../_shared/providers.ts.
// Free OpenRouter slugs are retired regularly (deepseek-v4-flash:free became paid-only in 2026), so a
// single hardcoded model breaks generation for every user. Keep a chain and update it via secrets.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically by Supabase.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { parseQuotaStatus } from "../_shared/quota.ts";
import { chatBody, DEFAULT_FREE_MODELS, DEFAULT_PRO_MODELS, parseModelList, resolveChain } from "../_shared/providers.ts";
import {
  GROUNDING_RULES,
  acceptCoverLetter,
  buildGroundingSource,
  checkGrounding,
  formatWarningsText,
  languageInstruction,
  selectLanguage,
  stripReasoning,
  validateCoverLetter,
} from "../_shared/output-guard.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
const PROVIDER_KEYS = {
  openrouter: OPENROUTER_API_KEY,
  gemini: Deno.env.get("GEMINI_API_KEY") ?? "",
  anthropic: Deno.env.get("ANTHROPIC_API_KEY") ?? "",
};
const FREE_MODELS = resolveChain(
  parseModelList(Deno.env.get("FREE_MODELS") ?? Deno.env.get("FREE_MODEL"), DEFAULT_FREE_MODELS),
  PROVIDER_KEYS,
);
const PRO_MODELS = resolveChain(
  parseModelList(Deno.env.get("PRO_MODELS") ?? Deno.env.get("PRO_MODEL"), DEFAULT_PRO_MODELS),
  PROVIDER_KEYS,
);
// One slow provider must not use up the whole request: each call gets its own time limit.
const AI_CALL_TIMEOUT_MS = Number(Deno.env.get("AI_CALL_TIMEOUT_MS") ?? 40000);

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
    if (FREE_MODELS.length === 0 && PRO_MODELS.length === 0) {
      return json({ error: "AI not configured (no provider key set)" }, 503);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // 1) Verify caller
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const jobId: string | undefined = body?.jobId;
    const tone: string = body?.tone ?? "professional";
    const mode: string = body?.mode ?? "generate"; // "generate" (consumes quota + persists) | "analyze" (preview only)
    const requestedLanguage: string | undefined = body?.language; // "id" | "en" | "auto" (default: Bahasa Indonesia)
    if (!jobId) return json({ error: "jobId is required" }, 400);

    // 2) Tier -> model
    const { data: sub } = await admin
      .from("subscriptions").select("ai_model_tier, plan_name").eq("user_id", userId).maybeSingle();
    const tier = sub?.ai_model_tier === "pro" ? "pro" : "free";
    const models = tier === "pro" ? PRO_MODELS : FREE_MODELS;

    // 3) Quota check. The quota is consumed only after the AI call succeeds (step 6b), so a failed
    //    generation no longer costs the user one of their monthly applications.
    const { data: quotaStatus, error: qsErr } = await admin.rpc("get_quota_status", { p_user_id: userId });
    if (qsErr) return json({ error: "Quota check failed", detail: qsErr.message }, 500);
    // The RPC returns an array of one row; parseQuotaStatus reads it (reading .remaining off the array
    // was always undefined, so this check never blocked anyone).
    let quota: any = parseQuotaStatus(quotaStatus);
    if (mode !== "analyze" && quota.remaining <= 0) {
      return json({ error: "Kuota bulanan habis. Upgrade ke Pro untuk lebih banyak lamaran.", quota }, 429);
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

    // Language: Bahasa Indonesia by default; English only when the posting is clearly English (or asked for).
    const language = selectLanguage({ requested: requestedLanguage, jobText: `${job.title ?? ""}\n${job.description ?? ""}` });
    // Facts the cover letter may rely on (everything else it states is flagged as a warning).
    const profileFacts = {
      firstName: profile?.full_name ?? "",
      currentTitle: profile?.current_title ?? "",
      location: profile?.location ?? "",
      yearsOfExperience: profile?.experience_years ?? 0,
      skills: skillList ? skillList.split(",").map((x: string) => x.trim()).filter(Boolean) : [],
      summary: profile?.summary ?? profile?.bio ?? "",
      workExperiences: (work ?? []).map((w: any) => ({
        role_title: w.role_title, company_name: w.company_name, start_date: w.start_date, end_date: w.end_date, description: w.description,
      })),
    };
    const allowedContext = `${profile?.full_name ?? ""} ${job.company ?? ""} ${job.title ?? ""} ${job.description ?? ""} ${workList}`;

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
LANGUAGE: ${languageInstruction(language)}

GROUNDING RULES (strict):
${GROUNDING_RULES.map((r) => `- ${r}`).join("\n")}

Return JSON exactly in this shape:
{
  "coverLetter": "250-400 word ${tone} cover letter, ready to send, no placeholders/brackets, only facts from the candidate data above",
  "matchScore": 0-100,
  "acceptancePotential": 0-100,
  "tailoredSkills": ["skills from the candidate that match this job"],
  "skillGaps": ["required skills the candidate is missing"],
  "aiNotes": "1-3 sentence strategy in Bahasa Indonesia"
}`;

    // 6) Call OpenRouter, trying each model of the tier's chain in order. A reply only counts when it passes the
    //    quality gate (no chain-of-thought, no stray foreign script, a plausible letter body). Otherwise the next
    //    model is tried, and if none passes the request fails explicitly: nothing is saved and no quota is used.
    let parsed: any = null;
    if (models.length === 0) return json({ error: "AI not configured for this plan" }, 503);
    let model = models[0].entry;
    let modelUsed = model;
    let soft: { parsed: any; modelUsed: string } | null = null;
    let lastDetail = "";
    const rejectedReasons: string[] = [];
    // Satu baris per kandidat di log Edge Function, supaya alasan model gagal atau ditolak terlihat.
    // Isi surat dan prompt tidak dicatat, hanya nama model, hasil, dan lama panggilan.
    const attempts: { model: string; outcome: string; ms: number }[] = [];
    const note = (outcome: string, started: number) => {
      const entry = { model, outcome: outcome.slice(0, 200), ms: Date.now() - started };
      attempts.push(entry);
      console.warn(`[generate-application] ${entry.model} ${entry.outcome} ${entry.ms}ms`);
    };
    for (const candidate of models) {
      model = candidate.entry;
      const started = Date.now();
      let aiResp: Response;
      try {
        aiResp = await fetch(candidate.url, {
          method: "POST",
          headers: candidate.headers,
          signal: AbortSignal.timeout(AI_CALL_TIMEOUT_MS),
          body: JSON.stringify(chatBody(candidate, [
            { role: "system", content: sys },
            { role: "user", content: userPrompt },
          ], { temperature: 0.6, maxTokens: 1600 })),
        });
      } catch (e) {
        lastDetail = `${model}: ${String((e as Error)?.name ?? e)}`;
        rejectedReasons.push("timeout_or_network");
        note(`error ${lastDetail}`, started);
        continue;
      }
      if (!aiResp.ok) {
        lastDetail = `${model}: ${(await aiResp.text()).slice(0, 300)}`;
        note(`http_${aiResp.status}`, started);
        continue;
      }
      let aiJson: any;
      try {
        aiJson = await aiResp.json();
      } catch {
        lastDetail = `${model}: response is not JSON`;
        rejectedReasons.push("bad_json");
        note("bad_json", started);
        continue;
      }
      const raw: string = aiJson?.choices?.[0]?.message?.content ?? "";
      const cleaned = stripReasoning(raw).text;
      if (!cleaned) {
        lastDetail = `empty completion from ${model}`;
        rejectedReasons.push("empty");
        note("empty", started);
        continue;
      }
      const attempt = extractJson(cleaned) ?? {
        coverLetter: cleaned,
        matchScore: job.match_score ?? 70,
        acceptancePotential: job.acceptance_potential ?? 60,
        tailoredSkills: [],
        skillGaps: [],
        aiNotes: "",
      };
      const verdict = acceptCoverLetter(String(attempt.coverLetter ?? ""), { language, allowedContext });
      if (verdict.ok === true) {
        parsed = { ...attempt, coverLetter: verdict.text };
        modelUsed = aiJson.model ? `${candidate.provider}:${aiJson.model}` : model;
        note("accepted", started);
        break;
      }
      const why = (verdict as { reasons: string[] }).reasons;
      rejectedReasons.push(...why);
      lastDetail = `${model}: output rejected (${why.join(", ")})`;
      note(`rejected ${why.join(",")}`, started);
      const fallback = (verdict as { fallbackText?: string }).fallbackText;
      if (fallback && !soft) soft = { parsed: { ...attempt, coverLetter: fallback }, modelUsed: aiJson.model ? `${candidate.provider}:${aiJson.model}` : model };
    }
    if (!parsed && soft) {
      parsed = soft.parsed;
      modelUsed = soft.modelUsed;
    }
    if (!parsed) {
      return json({ error: "AI generation failed", detail: lastDetail, rejected: [...new Set(rejectedReasons)], attempts, models: models.map((m) => m.entry), quota }, 502);
    }

    // 6b) Consume one monthly application only now that a draft exists
    if (mode !== "analyze") {
      const { data: q, error: qErr } = await admin.rpc("consume_monthly_apply", { p_user_id: userId });
      if (qErr) return json({ error: "Quota update failed", detail: qErr.message }, 500);
      quota = parseQuotaStatus(q);
      if (!quota.allowed) {
        return json({ error: "Kuota bulanan habis. Upgrade ke Pro untuk lebih banyak lamaran.", quota }, 429);
      }
    }
    // Soft checks on the accepted letter: wrong language, and numbers/percentages the profile does not support.
    // They are returned in analysis.warnings AND written into ai_notes, so the draft screen shows them.
    const warnings = [
      ...validateCoverLetter(parsed.coverLetter ?? "", { language, allowedContext }).warnings,
      ...checkGrounding(parsed.coverLetter ?? "", buildGroundingSource(profileFacts), { sections: false }),
    ];
    const warningText = formatWarningsText(warnings);
    const aiNotes = [parsed.aiNotes ?? "", warningText].filter(Boolean).join("\n\n");

    const result = {
      coverLetter: parsed.coverLetter ?? "",
      optimizedCV: { summary: parsed.aiNotes ?? "", highlighted_skills: parsed.tailoredSkills ?? [] },
      tailoredSkills: parsed.tailoredSkills ?? [],
      aiNotes,
      matchScore: clamp(parsed.matchScore ?? job.match_score),
      acceptancePotential: clamp(parsed.acceptancePotential ?? job.acceptance_potential),
      skillGaps: parsed.skillGaps ?? [],
      warnings,
      language,
      modelUsed,
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
