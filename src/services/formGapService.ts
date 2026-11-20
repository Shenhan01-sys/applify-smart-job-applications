import { supabase } from "@/lib/supabase";
import { isMockMode } from "@/lib/appConfig";
import { gapsByJob, type FormGaps } from "@/lib/formGaps";

/**
 * Isian wajib yang masih kosong saat agen berhenti di formulir, per lowongan (kunci: jobs.id).
 * Dibaca dari log percobaan agen milik pengguna (application_logs; RLS hanya mengizinkan baris sendiri).
 * application_id di baris itu kosong, jadi pencocokan lewat job_id. Melempar bila kueri gagal;
 * pemanggil memutuskan apakah galat itu mengganggu layar.
 */
export async function getFormGaps(jobIds: string[]): Promise<Record<string, FormGaps>> {
  const ids = [...new Set((jobIds ?? []).filter((id) => typeof id === "string" && id.length > 0))];
  if (isMockMode() || ids.length === 0) return {};

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

  return gapsByJob(data, ids);
}
