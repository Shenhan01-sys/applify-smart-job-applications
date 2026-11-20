import { supabase } from "@/lib/supabase";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export interface GreenJob {
  id: string;
  title: string;
  company: string;
  location?: string;
  description?: string;
  requirements?: any;
  company_insight?: { green_score?: number; summary?: string; esg_flags?: string[] } | null;
  external_url?: string | null;
  /** Kolom global untuk semua pengguna; tidak ditampilkan sebagai kecocokan (lihat lib/greenMatch.ts). */
  match_score?: number | null;
}
export interface AssessmentQuestion {
  id: string;
  type: "mcq" | "text";
  question: string;
  options?: string[];
}
export interface AssessmentResult {
  readinessScore: number;
  status: "ready" | "needs_development";
  feedback: { strengths: string[]; gaps: string[]; developmentPath: string[] };
}

async function invoke(mode: string, payload: Record<string, any>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("green-career-assessment", { body: { mode, ...payload } });
  if (error) {
    let msg = error.message;
    try {
      const ctx = await (error as any).context?.json?.();
      if (ctx?.error) msg = ctx.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data;
}

const MOCK_QUESTIONS: AssessmentQuestion[] = [
  { id: "q1", type: "mcq", question: "Apa prinsip utama pelaporan ESG?", options: ["Transparansi & materialitas", "Maksimasi profit", "Rahasia dagang", "Tidak relevan"] },
  { id: "q2", type: "text", question: "Ceritakan pengalaman/ketertarikanmu pada keberlanjutan & bagaimana kamu menerapkannya." },
  { id: "q3", type: "mcq", question: "PLTS singkatan dari?", options: ["Pembangkit Listrik Tenaga Surya", "Pusat Logistik Terpadu", "Program Lingkungan", "Tidak tahu"] },
];

export const greenCareerService = {
  async listGreenJobs(): Promise<GreenJob[]> {
    if (isMockMode()) {
      return [
        { id: "g1", title: "Sustainability Analyst", company: "Xurya Daya Indonesia", location: "Jakarta", company_insight: { green_score: 92, summary: "Energi terbarukan (solar)." }, match_score: 82 },
        { id: "g2", title: "Renewable Energy Engineer", company: "PLN Icon Plus", location: "Bandung", company_insight: { green_score: 88, summary: "Transisi energi (EBT)." }, match_score: 79 },
      ];
    }
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("is_green", true)
      .eq("status", "active")
      .order("match_score", { ascending: false });
    if (error) throw error;
    return (data ?? []) as GreenJob[];
  },

  async startAssessment(jobId: string): Promise<{ assessmentId: string; job: any; questions: AssessmentQuestion[] }> {
    if (isMockMode()) {
      await new Promise((r) => setTimeout(r, 1200));
      return { assessmentId: `asmt-${Date.now()}`, job: { id: jobId }, questions: MOCK_QUESTIONS };
    }
    return invoke("generate", { jobId });
  },

  async submitAssessment(
    assessmentId: string,
    answers: { id: string; question: string; answer: string }[]
  ): Promise<AssessmentResult> {
    if (isMockMode()) {
      await new Promise((r) => setTimeout(r, 1500));
      return {
        readinessScore: 78,
        status: "ready",
        feedback: {
          strengths: ["Pemahaman ESG dasar baik", "Motivasi keberlanjutan jelas"],
          gaps: ["Pengalaman proyek EBT langsung masih terbatas"],
          developmentPath: ["Ikuti kursus dasar energi terbarukan", "Bangun 1 proyek portofolio terkait"],
        },
      };
    }
    return invoke("score", { assessmentId, answers });
  },
};
