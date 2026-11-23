import { supabase } from "@/lib/supabase";
import { automationApi } from "@/services/automationApi";
import {
  buildEmailApplyRequest,
  extractRecruiterEmails,
  type ApprovalLike,
  type EmailQueueRow,
} from "@/lib/emailApply";
import type { AgentApplyRow } from "@/lib/agentApplyStatus";
import { buildAgentApplyRows, latestQueueJobIds } from "@/lib/agentApplyRows";
import { manualSentRow, safeJobUrl } from "@/lib/manualSubmit";

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
  /** latest apply (form-filling agent) queue row per approval id, with fields filled from its attempt log */
  agent: Record<string, AgentApplyRow>;
  /** approval ids the user marked as sent themselves (application_logs success with details.manual) */
  manual: Set<string>;
  /** job posting address (jobs.external_url, http or https only), per approval id: "Buka formulir lowongan" */
  jobUrls: Record<string, string>;
}

export const emptyEmailApplyData = (): EmailApplyData => ({ gmail: null, used: new Set(), jobs: {}, suggestions: {}, agent: {}, manual: new Set(), jobUrls: {} });

/**
 * What the form-filling agent did for each approval: the latest `apply` job (payload.approval_request_id)
 * and, when its attempt log exists, the outcome the worker recorded (log status, submit check, fields
 * filled, screenshots). The Browser Extension writes its own attempt logs (details.channel = "extension",
 * no queue job); when an approval has both a worker log and an extension log, the newest one wins
 * (buildAgentApplyRows). Read with the user's own session (RLS owner policies). Best effort: an unreadable
 * log only leaves the outcome unknown. Read only: nothing here writes to automation_queue or application_logs.
 */
async function loadAgentApplyRows(ids: string[]): Promise<Record<string, AgentApplyRow>> {
  const [queue, extension] = await Promise.all([
    supabase
      .from("automation_queue")
      .select("id, status, error_message, created_at, payload")
      .eq("job_type", "apply")
      .in("payload->>approval_request_id", ids)
      .order("created_at", { ascending: false }),
    supabase
      .from("application_logs")
      .select("status, details, created_at")
      .eq("action", "apply")
      .eq("details->>channel", "extension")
      .in("details->>approval_request_id", ids)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (queue.error) console.warn("[agentApply] queue lookup skipped:", queue.error.message);
  if (extension.error) console.warn("[agentApply] extension log lookup skipped:", extension.error.message);
  const queueRows = queue.error ? [] : (queue.data ?? []);
  const extensionLogs = extension.error ? [] : (extension.data ?? []);

  const queueIds = latestQueueJobIds(queueRows);
  let workerLogs: unknown[] = [];
  if (queueIds.length > 0) {
    const logs = await supabase
      .from("application_logs")
      .select("status, details, created_at")
      .eq("action", "apply")
      .in("details->>queue_job_id", queueIds)
      .order("created_at", { ascending: false });
    if (logs.error) console.warn("[agentApply] attempt log lookup skipped:", logs.error.message);
    else workerLogs = logs.data ?? [];
  }
  return buildAgentApplyRows(queueRows, workerLogs, extensionLogs);
}

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

  const [gmail, logs, queue, jobs, agent, claimRes] = await Promise.all([
    automationApi.getGmailStatus(),
    supabase.from("application_logs").select("details, created_at").eq("status", "success").in("details->>approval_request_id", ids),
    supabase
      .from("automation_queue")
      .select("status, error_message, created_at, payload")
      .eq("job_type", "email_apply")
      .in("payload->>approval_request_id", ids)
      .order("created_at", { ascending: false }),
    jobIds.length > 0 ? supabase.from("jobs").select("id, description, external_url").in("id", jobIds) : Promise.resolve({ data: [], error: null } as any),
    loadAgentApplyRows(ids).catch((err) => {
      console.warn("[agentApply] status unavailable:", err);
      return {} as Record<string, AgentApplyRow>;
    }),
    automationApi.getApprovalClaimStatuses(ids).catch(() => ({ claims: {} })),
  ]);

  data.gmail = gmail ? gmail.gmail === true : null;
  for (const [aid, info] of Object.entries(claimRes?.claims ?? {})) {
    if (!info || info.state === "none") continue;
    const base = agent[aid] ?? { status: "completed", fields_filled: null };
    agent[aid] = { ...base, claim_state: info.state, claim_channel: info.channel };
  }
  data.agent = agent;

  if (logs.error) console.warn("[emailApply] used-check skipped:", logs.error.message);
  for (const row of logs.data ?? []) {
    const id = (row as any)?.details?.approval_request_id;
    if (typeof id !== "string") continue;
    data.used.add(id);
    // Ditandai terkirim oleh pengguna sendiri: kartu menampilkannya sebagai hasil percobaan terbaru, bukan kiriman agen.
    if ((row as any)?.details?.manual === true) {
      data.manual.add(id);
      data.agent[id] = manualSentRow(data.agent[id], (row as any).created_at);
    }
  }

  if (queue.error) console.warn("[emailApply] queue lookup skipped:", queue.error.message);
  for (const row of queue.data ?? []) {
    const id = (row as any)?.payload?.approval_request_id;
    if (typeof id === "string" && !data.jobs[id]) data.jobs[id] = { status: (row as any).status, error_message: (row as any).error_message };
  }

  const descriptionByJob = new Map<string, string>();
  const urlByJob = new Map<string, string>();
  for (const j of jobs.data ?? []) {
    descriptionByJob.set((j as any).id, String((j as any).description ?? ""));
    const url = safeJobUrl((j as any).external_url);
    if (url) urlByJob.set((j as any).id, url);
  }
  for (const a of approved) {
    const found = a.job_id ? extractRecruiterEmails(descriptionByJob.get(a.job_id)) : [];
    if (found.length > 0) data.suggestions[a.id] = found;
    const url = a.job_id ? urlByJob.get(a.job_id) : undefined;
    if (url) data.jobUrls[a.id] = url;
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
