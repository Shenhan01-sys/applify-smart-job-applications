import { supabase } from "@/lib/supabase";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export interface QueueEntry {
  id: string;
  status: string; // pending | processing | completed | failed
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  payload: { job_id?: string } | null;
}

export const automationQueue = {
  /**
   * Enqueue a background auto-apply job. The local worker (polling automation_queue)
   * will pick it up and drive agent-browser to fill/submit the application.
   * RLS ("Users can only access own queue items") scopes the row to the caller.
   */
  async enqueueAutoApply(jobId: string): Promise<{ id: string }> {
    if (isMockMode()) {
      await new Promise((r) => setTimeout(r, 600));
      return { id: `q-${Date.now()}` };
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("automation_queue")
      .insert({ user_id: user.id, job_type: "apply", payload: { job_id: jobId } })
      .select("id")
      .single();

    if (error) throw error;
    return data;
  },

  /** Latest queue entry for a given job (for showing "queued / processing / done"). */
  async getStatusForJob(jobId: string): Promise<QueueEntry | null> {
    if (isMockMode()) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from("automation_queue")
      .select("id, status, error_message, created_at, completed_at, payload")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    return (data || []).find((q: any) => q.payload?.job_id === jobId) ?? null;
  },
};
