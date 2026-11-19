import { supabase } from "@/lib/supabase";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export interface QueueEntry {
  id: string;
  /** pending | processing | completed | failed */
  status: string;
  /** apply | email_apply | search | company_insight */
  job_type?: string;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  payload: { job_id?: string } | null;
}

/** Entri antrean milik pengguna, dilengkapi judul lowongan bila payload menyebut job_id. */
export interface QueueItem extends QueueEntry {
  job: { title: string; company: string } | null;
}

const QUEUE_COLUMNS = "id, job_type, status, error_message, created_at, completed_at, payload";

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

  /**
   * Antrean tugas agen milik pengguna yang sedang masuk (terbaru dulu). Galat dilempar, bukan ditelan,
   * supaya halaman bisa menampilkan "Coba lagi" dan tidak berpura-pura antreannya kosong.
   */
  async getQueue(limit = 20): Promise<QueueItem[]> {
    if (isMockMode()) return [];
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("automation_queue")
      .select(QUEUE_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const rows = (data ?? []) as unknown as QueueEntry[];
    const jobIds = Array.from(new Set(rows.map((r) => r.payload?.job_id).filter((v): v is string => typeof v === "string")));
    const titles = new Map<string, { title: string; company: string }>();
    if (jobIds.length > 0) {
      // Judul hanya pelengkap tampilan: bila gagal, entri tetap tampil tanpa judul.
      const { data: jobs } = await supabase.from("jobs").select("id, title, company").in("id", jobIds);
      for (const j of (jobs ?? []) as Array<{ id: string; title: string; company: string }>) titles.set(j.id, { title: j.title, company: j.company });
    }
    return rows.map((r) => ({ ...r, job: (r.payload?.job_id && titles.get(r.payload.job_id)) || null }));
  },

  /** Latest queue entry for a given job (for showing "queued / processing / done"). */
  async getStatusForJob(jobId: string): Promise<QueueEntry | null> {
    if (isMockMode()) return null;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from("automation_queue")
      .select(QUEUE_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    return ((data || []) as unknown as QueueEntry[]).find((q) => q.payload?.job_id === jobId) ?? null;
  },
};
