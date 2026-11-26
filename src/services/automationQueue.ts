import { supabase } from "@/lib/supabase";
import { getApiBaseUrl } from "@/lib/appConfig";
import { isRealSubmitOffLog } from "@/lib/emailTestMode";

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
  payload: { job_id?: string; approval_request_id?: string } | null;
}

/** Entri antrean milik pengguna, dilengkapi judul lowongan bila payload menyebut job_id. */
export interface QueueItem extends QueueEntry {
  job: { title: string; company: string } | null;
  /** Tugas email yang selesai tetapi emailnya tidak dikirim karena mode uji (log skipped). Hanya terisi bila log terbaca. */
  email_test_mode?: boolean;
}

const QUEUE_COLUMNS = "id, job_type, status, error_message, created_at, completed_at, payload";

export const automationQueue = {
  /**
   * Enqueue a background auto-apply job via the authenticated backend API (`POST /api/queue/apply`)
   * so payload validation, approval checks, and platform rate limits always run server-side
   * instead of direct browser INSERT into `automation_queue` (audit 47.6 FE-04, 48.1 BS-U4-02).
   */
  async enqueueAutoApply(jobId: string): Promise<{ id: string }> {
    if (isMockMode()) {
      await new Promise((r) => setTimeout(r, 600));
      return { id: `q-${Date.now()}` };
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Not authenticated");

    const resp = await fetch(`${getApiBaseUrl()}/api/queue/apply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ job_id: jobId }),
    });
    if (!resp.ok) {
      // Backend menjawab {"error": "...", "code": "..."}; tampilkan pesannya saja, bukan JSON mentah, dan bawa status HTTP.
      const text = await resp.text().catch(() => "");
      let message = "";
      try {
        const parsed = JSON.parse(text) as { error?: unknown };
        if (typeof parsed?.error === "string") message = parsed.error;
      } catch {
        // bukan JSON: pakai teks apa adanya
      }
      throw Object.assign(new Error(message || text || `HTTP ${resp.status}`), { status: resp.status });
    }
    const body = (await resp.json()) as { jobId?: string; id?: string };
    const id = body.jobId ?? body.id;
    if (!id) throw new Error("Server tidak mengembalikan id tugas antrean");
    return { id };
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
    // Email yang selesai tanpa terkirim (mode uji) tercatat di log, bukan di status antrean. Hanya pelengkap tampilan:
    // bila log tidak terbaca, tugasnya tetap tampil dengan status antreannya.
    const testMode = new Set<string>();
    const emailApprovalIds = Array.from(new Set(
      rows
        .filter((r) => r.job_type === "email_apply" && r.status === "completed" && typeof r.payload?.approval_request_id === "string")
        .map((r) => r.payload!.approval_request_id as string),
    ));
    if (emailApprovalIds.length > 0) {
      const { data: logs, error: logError } = await supabase
        .from("application_logs")
        .select("status, details")
        .eq("action", "email_apply")
        .eq("status", "skipped")
        .in("details->>approval_request_id", emailApprovalIds);
      if (logError) console.warn("[queue] email log lookup skipped:", logError.message);
      for (const log of (logs ?? []) as Array<{ status?: string; details?: { approval_request_id?: unknown } }>) {
        const id = log.details?.approval_request_id;
        if (typeof id === "string" && isRealSubmitOffLog(log)) testMode.add(id);
      }
    }
    return rows.map((r) => ({
      ...r,
      job: (r.payload?.job_id && titles.get(r.payload.job_id)) || null,
      ...(testMode.has(String(r.payload?.approval_request_id)) ? { email_test_mode: true } : {}),
    }));
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
