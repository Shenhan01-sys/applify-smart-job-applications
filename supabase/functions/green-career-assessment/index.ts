// Applify — green-career-assessment Edge Function
// mode "generate": buat soal asesmen kesiapan yang disesuaikan konteks perusahaan green.
// mode "score":    nilai jawaban -> readiness_score + feedback (strengths/gaps/development path).
// Threshold ready = 70. Tidak ada vonis "ditolak": <70 dapat jalur pengembangan.
//
// Model AI: rantai penyedia yang sama dengan generate-application (../_shared/providers.ts). Secret: setidaknya
// satu dari OPENROUTER_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY; opsional FREE_MODELS (atau FREE_MODEL lama).
// Dulu fungsi ini memanggil satu model OpenRouter gratis tanpa cadangan dan membalas 500 tanpa baris log saat model
// itu berhenti menjawab. Kini tiap kegagalan penyedia dan galat database dicatat lewat console.error (kode alasan
// dan nama model saja, tanpa data pengguna), dan bila semua penyedia gagal balasannya 502 dengan pesan Indonesia.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { DEFAULT_FREE_MODELS, parseModelList, resolveChain } from "../_shared/providers.ts";
import { runChain } from "../_shared/chat-chain.ts";
import {
  MSG_GENERATE_FAILED,
  MSG_SAVE_FAILED,
  MSG_SCORE_FAILED,
  MSG_SERVER_ERROR,
  parseQuestionsReply,
  parseScoreReply,
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
};
const MODELS = resolveChain(
  parseModelList(Deno.env.get("FREE_MODELS") ?? Deno.env.get("FREE_MODEL"), DEFAULT_FREE_MODELS),
  PROVIDER_KEYS,
);
// Satu penyedia yang lambat tidak boleh menghabiskan seluruh permintaan: tiap panggilan punya batas waktu sendiri,
// dan rantai berhenti mencoba model berikutnya bila total waktunya sudah lewat batas Edge Function.
const AI_CALL_TIMEOUT_MS = Number(Deno.env.get("AI_CALL_TIMEOUT_MS") ?? 30000);
const AI_CHAIN_BUDGET_MS = Number(Deno.env.get("AI_CHAIN_BUDGET_MS") ?? 100000);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
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
      const { data: job } = await admin.from("jobs").select("*").eq("id", jobId).maybeSingle();
      if (!job) return json({ error: "Job not found" }, 404);
      if (!job.is_green) return json({ error: "Job bukan Green Career role" }, 400);

      const { data: profile } = await admin.from("profiles")
        .select("full_name, current_title, experience_years, skills").eq("id", userId).maybeSingle();

      const sys = `Kamu perekrut untuk peran "green economy". Buat 5 soal asesmen KESIAPAN (readiness) yang DISESUAIKAN konteks perusahaan & peran. Campur tipe "mcq" (4 opsi) dan "text". Nilai kompetensi inti + kesadaran keberlanjutan yang relevan. Jawab HANYA JSON: {"questions":[{"id":"q1","type":"mcq","question":"..","options":["..","..","..",".."]},{"id":"q2","type":"text","question":".."}]}`;
      const user = `PERAN: ${job.title} @ ${job.company}\nLokasi: ${job.location ?? "-"}\nDeskripsi: ${job.description ?? ""}\nRequirements: ${JSON.stringify(job.requirements ?? [])}\nKonteks perusahaan (green): ${JSON.stringify(job.company_insight ?? {})}\nKandidat: ${profile?.full_name ?? "-"} · ${profile?.current_title ?? "-"} · ${profile?.experience_years ?? 0} th · skills ${JSON.stringify(profile?.skills ?? [])}`;

      const made = await runChain(MODELS, {
        tag: TAG,
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        temperature: 0.4,
        maxTokens: 1400,
        timeoutMs: AI_CALL_TIMEOUT_MS,
        budgetMs: AI_CHAIN_BUDGET_MS,
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
      const answers = body?.answers;
      if (!assessmentId || !Array.isArray(answers)) return json({ error: "assessmentId & answers required" }, 400);
      const { data: asmt } = await admin.from("green_career_assessments")
        .select("*, jobs(*)").eq("id", assessmentId).eq("user_id", userId).maybeSingle();
      if (!asmt) return json({ error: "Assessment not found" }, 404);
      const job = asmt.jobs ?? {};

      const sys = `Kamu penilai asesmen kesiapan untuk peran green economy. Nilai jawaban kandidat secara OBJEKTIF berbasis kompetensi & kesesuaian (BUKAN latar belakang pribadi). Beri skor readiness 0-100. Jika <70, JANGAN menolak — beri jalur pengembangan yang membangun. Jawab HANYA JSON: {"readinessScore":0-100,"verdict":"ready|needs_development","feedback":{"strengths":[".."],"gaps":[".."],"developmentPath":["langkah konkret.."]}}`;
      const user = `PERAN: ${job.title ?? "-"} @ ${job.company ?? "-"}\nKonteks: ${JSON.stringify(job.company_insight ?? {})}\nJAWABAN KANDIDAT:\n${answers.map((a: any, i: number) => `${i + 1}. Q: ${a.question}\n   A: ${a.answer}`).join("\n")}`;

      const scored = await runChain(MODELS, {
        tag: TAG,
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        temperature: 0.4,
        maxTokens: 900,
        timeoutMs: AI_CALL_TIMEOUT_MS,
        budgetMs: AI_CHAIN_BUDGET_MS,
        accept: parseScoreReply,
      });
      if (!scored.ok) {
        console.error(`${TAG} score_failed all_providers_failed tried=${scored.attempts.length}`);
        return json({ error: MSG_SCORE_FAILED }, 502);
      }
      const { score, status, feedback } = scored.value;

      const { error: updErr } = await admin.from("green_career_assessments")
        .update({ status, readiness_score: score, transcript: answers, feedback, updated_at: new Date().toISOString() })
        .eq("id", assessmentId);
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
