// Applify — green-career-assessment Edge Function
// mode "generate": buat soal asesmen kesiapan yang disesuaikan konteks perusahaan green.
// mode "score":    nilai jawaban -> readiness_score + feedback (strengths/gaps/development path).
// Threshold ready = 70. Tidak ada vonis "ditolak": <70 dapat jalur pengembangan.
//
// Model AI: rantai penyedia yang sama dengan generate-application (../_shared/providers.ts). Secret: setidaknya
// satu dari OPENROUTER_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, NUMES_API_KEY (atau NUMES_API_KEY_2, NUMES_API_KEY_3,
// NUMES_API_KEYS untuk kolam kunci Numes); opsional FREE_MODELS (atau FREE_MODEL lama). Urutan bawaan: Numes, Gemini, OpenRouter,
// Anthropic paling akhir.
// Dulu fungsi ini memanggil satu model OpenRouter gratis tanpa cadangan dan membalas 500 tanpa baris log saat model
// itu berhenti menjawab. Kini tiap kegagalan penyedia dan galat database dicatat lewat console.error (kode alasan
// dan nama model saja, tanpa data pengguna), dan bila semua penyedia gagal balasannya 502 dengan pesan Indonesia.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { DEFAULT_FREE_MODELS, numesKeysFromEnv, parseModelList, platformChain } from "../_shared/providers.ts";
import { runChain } from "../_shared/chat-chain.ts";
import { DEFAULT_NUMES_CALL_TIMEOUT_MS } from "../_shared/numes-keys.ts";
import {
  MSG_ALREADY_SCORED,
  MSG_GENERATE_FAILED,
  MSG_SAVE_FAILED,
  MSG_SCORE_FAILED,
  MSG_SERVER_ERROR,
  buildGeneratePrompts,
  buildScorePrompts,
  calibrateScoreWithEvidence,
  checkAssessmentRateLimit,
  parseQuestionsReply,
  parseScoreReply,
  validateAndBindAnswers,
} from "../_shared/green-assessment.ts";

const TAG = "[green-career-assessment]";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROVIDER_KEYS = {
  openrouter: Deno.env.get("OPENROUTER_API_KEY") ?? "",
  gemini: Deno.env.get("GEMINI_API_KEY") ?? "",
  anthropic: Deno.env.get("ANTHROPIC_API_KEY") ?? "",
  numes: numesKeysFromEnv((name) => Deno.env.get(name)),
};
const MODELS = platformChain(
  parseModelList(Deno.env.get("FREE_MODELS") ?? Deno.env.get("FREE_MODEL"), DEFAULT_FREE_MODELS),
  PROVIDER_KEYS,
);
// Satu penyedia yang lambat tidak boleh menghabiskan seluruh permintaan: tiap panggilan punya batas waktu sendiri,
// dan rantai berhenti mencoba model berikutnya bila total waktunya sudah lewat batas Edge Function.
const AI_CALL_TIMEOUT_MS = Number(Deno.env.get("AI_CALL_TIMEOUT_MS") ?? 30000);
const AI_CHAIN_BUDGET_MS = Number(Deno.env.get("AI_CHAIN_BUDGET_MS") ?? 100000);
// Numes (model gratis) sering lambat: satu percobaan paling lama NUMES_TIMEOUT_MS (12 detik), dan semua entri Numes
// dalam satu permintaan berbagi jatah paling banyak 40% AI_CHAIN_BUDGET_MS atau 15 detik (NumesBudget di runChain).
const NUMES_TIMEOUT_MS = Number(Deno.env.get("NUMES_TIMEOUT_MS")) > 0 ? Number(Deno.env.get("NUMES_TIMEOUT_MS")) : DEFAULT_NUMES_CALL_TIMEOUT_MS;

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", ...(extraHeaders ?? {}) },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "Missing auth token" }, 401);
    if (MODELS.length === 0) {
      console.error(`${TAG} not_configured no provider key set`);
      return json({ error: "AI not configured (no provider key set)" }, 503);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: userData, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !userData?.user) return json({ error: "Invalid token" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode ?? "generate";

    if (mode === "generate") {
      const jobId = body?.jobId;
      if (!jobId) return json({ error: "jobId required" }, 400);

      // Batas laju per pengguna pada tabel green_career_assessments (UX-P7-03): mencegah pemanggilan tanpa batas.
      const nowMs = Date.now();
      const hourAgo = new Date(nowMs - 3_600_000).toISOString();
      const dayAgo = new Date(nowMs - 86_400_000).toISOString();
      const [hourRes, dayRes] = await Promise.all([
        admin.from("green_career_assessments").select("id", { count: "exact", head: true })
          .eq("user_id", userId).gte("created_at", hourAgo),
        admin.from("green_career_assessments").select("id", { count: "exact", head: true })
          .eq("user_id", userId).gte("created_at", dayAgo),
      ]);
      if (hourRes.error || dayRes.error) {
        console.error(`${TAG} rate_limit_failed code=${hourRes.error?.code ?? dayRes.error?.code ?? "none"}`);
        return json({ error: MSG_SERVER_ERROR }, 503);
      }
      const limitCheck = checkAssessmentRateLimit(hourRes.count ?? 0, dayRes.count ?? 0);
      if (!limitCheck.allowed) {
        return json(
          { error: limitCheck.message, code: "rate_limited", retryAfterSec: limitCheck.retryAfterSec },
          429,
          { "Retry-After": String(limitCheck.retryAfterSec) },
        );
      }

      const { data: job } = await admin.from("jobs").select("*").eq("id", jobId).maybeSingle();
      if (!job) return json({ error: "Job not found" }, 404);
      // Lowongan privat hanya untuk pemiliknya: klien admin melewati RLS. Sebelum migrasi kolomnya belum ada (publik).
      if (job.visibility === "private" && job.created_by !== userId) return json({ error: "Job not found" }, 404);
      if (!job.is_green) return json({ error: "Job bukan Green Career role" }, 400);

      // UX-P7-11: tabel `profiles` tidak memiliki kolom `skills`; skill kandidat disimpan di tabel `user_skills`.
      const [profileRes, skillsRes] = await Promise.all([
        admin.from("profiles").select("full_name, current_title, experience_years").eq("id", userId).maybeSingle(),
        admin.from("user_skills").select("name").eq("user_id", userId).limit(50),
      ]);
      if (profileRes.error) {
        console.error(`${TAG} profile_read_failed code=${profileRes.error.code ?? "none"}`);
      }
      if (skillsRes.error) {
        console.error(`${TAG} user_skills_read_failed code=${skillsRes.error.code ?? "none"}`);
      }
      const skillNames = (skillsRes.data ?? [])
        .map((r: { name?: unknown }) => (typeof r?.name === "string" ? r.name.trim() : ""))
        .filter(Boolean);
      const profileWithSkills = profileRes.data
        ? { ...profileRes.data, skills: skillNames }
        : skillNames.length > 0
          ? { full_name: null, current_title: null, experience_years: 0, skills: skillNames }
          : null;

      const { sys, user } = buildGeneratePrompts(job, profileWithSkills);

      const made = await runChain(MODELS, {
        tag: TAG,
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        temperature: 0.4,
        maxTokens: 1400,
        timeoutMs: AI_CALL_TIMEOUT_MS,
        budgetMs: AI_CHAIN_BUDGET_MS,
        numesTimeoutMs: NUMES_TIMEOUT_MS,
        accept: parseQuestionsReply,
      });
      if (!made.ok) {
        console.error(`${TAG} generate_failed all_providers_failed tried=${made.attempts.length}`);
        return json({ error: MSG_GENERATE_FAILED }, 502);
      }
      const questions = made.value;

      const { data: row, error: insErr } = await admin.from("green_career_assessments")
        .insert({ user_id: userId, job_id: jobId, status: "interviewing", assessment: { questions } })
        .select("id").single();
      if (insErr || !row) {
        console.error(`${TAG} insert_failed table=green_career_assessments code=${insErr?.code ?? "none"}`);
        return json({ error: MSG_SAVE_FAILED }, 500);
      }

      return json({ assessmentId: row.id, job: { id: job.id, title: job.title, company: job.company }, questions });
    }

    if (mode === "score") {
      const assessmentId = body?.assessmentId;
      const rawAnswers = body?.answers;
      if (!assessmentId || !Array.isArray(rawAnswers)) return json({ error: "assessmentId & answers required" }, 400);
      const { data: asmt } = await admin.from("green_career_assessments")
        .select("*, jobs(*)").eq("id", assessmentId).eq("user_id", userId).maybeSingle();
      if (!asmt) return json({ error: "Assessment not found" }, 404);
      if (asmt.status !== "interviewing") {
        return json({ error: MSG_ALREADY_SCORED, code: "already_scored" }, 409);
      }
      const bound = validateAndBindAnswers(rawAnswers, asmt.assessment?.questions);
      if (!bound.ok) {
        return json({ error: bound.error, code: bound.code }, 400);
      }
      const answers = bound.answers;
      const job = asmt.jobs ?? {};

      const { sys, user } = buildScorePrompts(job, answers);

      const scored = await runChain(MODELS, {
        tag: TAG,
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        temperature: 0.4,
        maxTokens: 900,
        timeoutMs: AI_CALL_TIMEOUT_MS,
        budgetMs: AI_CHAIN_BUDGET_MS,
        numesTimeoutMs: NUMES_TIMEOUT_MS,
        accept: parseScoreReply,
      });
      if (!scored.ok) {
        console.error(`${TAG} score_failed all_providers_failed tried=${scored.attempts.length}`);
        return json({ error: MSG_SCORE_FAILED }, 502);
      }
      const { score, status, feedback } = calibrateScoreWithEvidence(scored.value, answers);

      const { error: updErr } = await admin.from("green_career_assessments")
        .update({ status, readiness_score: score, transcript: answers, feedback, updated_at: new Date().toISOString() })
        .eq("id", assessmentId)
        .eq("user_id", userId)
        .eq("status", "interviewing");
      // Skor sudah dihitung, jadi pengguna tetap menerimanya; hanya penyimpanannya yang dicatat gagal.
      if (updErr) console.error(`${TAG} update_failed table=green_career_assessments code=${updErr.code ?? "none"}`);

      return json({ readinessScore: score, status, feedback });
    }

    return json({ error: "Unknown mode" }, 400);
  } catch (e: any) {
    console.error(`${TAG} unhandled ${String(e?.name ?? "Error")}: ${String(e?.message ?? e).slice(0, 160)}`);
    return json({ error: MSG_SERVER_ERROR }, 500);
  }
});
