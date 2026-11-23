import { supabase } from "@/lib/supabase";
import { isMockMode } from "@/lib/appConfig";
import { attemptsByJob, gapsByJob, type ApplyAttempt, type FormGaps } from "@/lib/formGaps";
import { agentFactsByJob, type AgentLogFacts } from "@/lib/agentEvidence";

export type ApplyState = {
  gaps: Record<string, FormGaps>;
  attempts: Record<string, ApplyAttempt>;
  agentFacts: Record<string, AgentLogFacts>;
};

/**
 * Hasil percobaan agen per lowongan (kunci: jobs.id): kekurangan isian (`gaps`) dan percobaan terbaru
 * apa pun hasilnya (`attempts`, termasuk "agen tidak mengisi apa pun"), dan fakta percobaan terbaru itu
 * (`agentFacts`: hasil kirim, isian yang diisi, jalur tangkapan layar). Dibaca dari log percobaan agen milik
 * pengguna (application_logs; RLS hanya mengizinkan baris sendiri) dengan satu kueri.
 * application_id di baris itu kosong, jadi pencocokan lewat job_id. Melempar bila kueri gagal;
 * pemanggil memutuskan apakah galat itu mengganggu layar.
 */
export async function getApplyState(jobIds: string[]): Promise<ApplyState> {
  const ids = [...new Set((jobIds ?? []).filter((id) => typeof id === "string" && id.length > 0))];
  if (isMockMode() || ids.length === 0) return { gaps: {}, attempts: {}, agentFacts: {} };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("application_logs")
    .select("job_id,status,created_at,details")
    .eq("user_id", user.id)
    .eq("action", "apply")
    .in("job_id", ids)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  return { gaps: gapsByJob(data, ids), attempts: attemptsByJob(data, ids), agentFacts: agentFactsByJob(data, ids) };
}

/** Hanya kekurangan isian per lowongan (kunci: jobs.id); lihat getApplyState. */
export async function getFormGaps(jobIds: string[]): Promise<Record<string, FormGaps>> {
  return (await getApplyState(jobIds)).gaps;
}
