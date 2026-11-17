import { supabase } from "@/lib/supabase";
import { automationApi } from "@/services/automationApi";
import {
  buildEmailApplyRequest,
  extractRecruiterEmails,
  type ApprovalLike,
  type EmailQueueRow,
} from "@/lib/emailApply";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

export interface EmailApplyData {
  /** null = status could not be checked */
  gmail: boolean | null;
  /** approval ids that a successful submission already consumed */
  used: Set<string>;
  /** latest email_apply queue row per approval id */
  jobs: Record<string, EmailQueueRow>;
  /** recruiter addresses found in the job posting, per approval id (suggestions only) */
  suggestions: Record<string, string[]>;
}

export const emptyEmailApplyData = (): EmailApplyData => ({ gmail: null, used: new Set(), jobs: {}, suggestions: {} });

/**
 * Everything the email action needs for a list of approvals, read with the user's own session (RLS owner
 * policies on application_logs and automation_queue; jobs is readable by any signed-in user):
 * Gmail status, which approvals are already used, the latest email_apply job of each, and addresses
 * written in the posting. The worker stays the authority: a stale answer here only changes what the button
 * says, never what the worker accepts.
 */
export async function loadEmailApplyData(approvals: ApprovalLike[]): Promise<EmailApplyData> {
  const approved = approvals.filter((a) => a.status === "approved");
  const data = emptyEmailApplyData();
  if (approved.length === 0) return data;
  if (isMockMode()) return { ...data, gmail: true };

  const ids = approved.map((a) => a.id);
  const jobIds = [...new Set(approved.map((a) => a.job_id).filter((x): x is string => !!x))];

  const [gmail, logs, queue, jobs] = await Promise.all([
    automationApi.getGmailStatus(),
    supabase.from("application_logs").select("details").eq("status", "success").in("details->>approval_request_id", ids),
    supabase
      .from("automation_queue")
      .select("status, error_message, created_at, payload")
      .eq("job_type", "email_apply")
      .in("payload->>approval_request_id", ids)
      .order("created_at", { ascending: false }),
    jobIds.length > 0 ? supabase.from("jobs").select("id, description").in("id", jobIds) : Promise.resolve({ data: [], error: null } as any),
  ]);

  data.gmail = gmail ? gmail.gmail === true : null;

  if (logs.error) console.warn("[emailApply] used-check skipped:", logs.error.message);
  for (const row of logs.data ?? []) {
    const id = (row as any)?.details?.approval_request_id;
    if (typeof id === "string") data.used.add(id);
  }

  if (queue.error) console.warn("[emailApply] queue lookup skipped:", queue.error.message);
  for (const row of queue.data ?? []) {
    const id = (row as any)?.payload?.approval_request_id;
    if (typeof id === "string" && !data.jobs[id]) data.jobs[id] = { status: (row as any).status, error_message: (row as any).error_message };
  }

  const descriptionByJob = new Map<string, string>();
  for (const j of jobs.data ?? []) descriptionByJob.set((j as any).id, String((j as any).description ?? ""));
  for (const a of approved) {
    const found = a.job_id ? extractRecruiterEmails(descriptionByJob.get(a.job_id)) : [];
    if (found.length > 0) data.suggestions[a.id] = found;
  }
  return data;
}

/**
 * Put an email_apply job on the queue through the backend (POST /api/automation/queue). The backend checks
 * the approval; this function never sends an `approved` flag.
 */
export async function enqueueEmailApply(approval: ApprovalLike, applyEmail: string): Promise<unknown> {
  const req = buildEmailApplyRequest(approval, applyEmail);
  if (!req) throw new Error("Persetujuan atau alamat email belum lengkap.");
  return automationApi.addToQueue(req.job_type, req.payload);
}
