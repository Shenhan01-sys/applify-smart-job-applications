// Applify — green-career-assessment Edge Function
// mode "generate": buat soal asesmen kesiapan yang disesuaikan konteks perusahaan green.
// mode "score":    nilai jawaban -> readiness_score + feedback (strengths/gaps/development path).
// Threshold ready = 70. Tidak ada vonis "ditolak": <70 dapat jalur pengembangan.
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
const READY_THRESHOLD = 70;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function extractJson(s: string): any {
  const c = s.replace(/```(?:json)?/gi, "").trim();
  try { return JSON.parse(c); } catch { /* */ }
  const a = c.indexOf("{"), b = c.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(c.slice(a, b + 1)); } catch { /* */ } }
  return null;
}
async function openrouter(messages: any[], maxTokens = 1400): Promise<string> {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": "https://applify.id", "X-Title": "Applify Green Career" },
    body: JSON.stringify({ model: FREE_MODEL, messages, temperature: 0.4, max_tokens: maxTokens }),
  });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "Missing auth token" }, 401);
    if (!OPENROUTER_API_KEY) return json({ error: "AI not configured (OPENROUTER_API_KEY missing)" }, 503);

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

      const parsed = extractJson(await openrouter([{ role: "system", content: sys }, { role: "user", content: user }]));
      const questions = Array.isArray(parsed?.questions) ? parsed.questions.slice(0, 6) : [];
      if (questions.length === 0) return json({ error: "Gagal membuat soal" }, 502);

      const { data: row, error: insErr } = await admin.from("green_career_assessments")
        .insert({ user_id: userId, job_id: jobId, status: "interviewing", assessment: { questions } })
        .select("id").single();
      if (insErr) return json({ error: insErr.message }, 500);

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

      const parsed = extractJson(await openrouter([{ role: "system", content: sys }, { role: "user", content: user }], 900)) ?? {};
      const score = Math.max(0, Math.min(100, Math.round(Number(parsed.readinessScore) || 0)));
      const status = score >= READY_THRESHOLD ? "ready" : "needs_development";
      const feedback = parsed.feedback ?? { strengths: [], gaps: [], developmentPath: [] };

      await admin.from("green_career_assessments")
        .update({ status, readiness_score: score, transcript: answers, feedback })
        .eq("id", assessmentId);

      return json({ readinessScore: score, status, feedback });
    }

    return json({ error: "Unknown mode" }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
