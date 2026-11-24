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
import { isRealSubmitOffLog } from "@/lib/emailTestMode";
import { jobPostingText, parseSentAttachments, planEmailAttachments, type AttachmentPlan, type SentAttachments } from "@/lib/emailAttachments";
import { DOCUMENT_COLUMN, DOCUMENT_KINDS, isMissingDocumentColumn, parseDocumentPath, type DocumentKind } from "@/lib/profileDocuments";
import { parseResumePath } from "@/lib/resumeUpload";

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
  /** approval ids whose email job finished without sending because real sending is off (test mode, application_logs skipped) */
  testMode: Set<string>;
  /** Lampiran yang akan dikirim, per id persetujuan. Kosong bila profil atau lowongan tidak terbaca (pratinjau saja, bukan syarat kirim). */
  attachmentPlans: Record<string, AttachmentPlan>;
  /** Lampiran yang tercatat pada email yang sudah terkirim (log email_apply success), per id persetujuan. */
  sentAttachments: Record<string, SentAttachments>;
  /** Status agen sudah terbaca dari database. false = belum dimuat atau gagal, jadi "tidak ada tugas" belum berarti apa-apa. */
  agentKnown: boolean;
}

export const emptyEmailApplyData = (): EmailApplyData => ({ gmail: null, used: new Set(), jobs: {}, suggestions: {}, agent: {}, manual: new Set(), jobUrls: {}, testMode: new Set(), attachmentPlans: {}, sentAttachments: {}, agentKnown: false });

/**
 * What the form-filling agent did for each approval: the latest `apply` job (payload.approval_request_id)
 * and, when its attempt log exists, the outcome the worker recorded (log status, submit check, fields
 * filled, screenshots). The Browser Extension writes its own attempt logs (details.channel = "extension",
 * no queue job); when an approval has both a worker log and an extension log, the newest one wins
 * (buildAgentApplyRows). Read with the user's own session (RLS owner policies). Best effort: an unreadable
 * log only leaves the outcome unknown. Read only: nothing here writes to automation_queue or application_logs.
 */
async function loadAgentApplyRows(ids: string[]): Promise<{ rows: Record<string, AgentApplyRow>; complete: boolean }> {
  const [queue, extension] = await Promise.all([
    supabase
      .from("automation_queue")
      .select("id, job_type, status, error_message, created_at, payload")
      .in("job_type", ["apply", "extension_apply"])
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
  // Tugas antrean tidak terbaca: "tidak ada tugas" tidak boleh dianggap benar (blok izin ekstensi tidak boleh ikut menebak).
  return { rows: buildAgentApplyRows(queueRows, workerLogs, extensionLogs), complete: !queue.error };
}

interface AttachmentProfile {
  name: string | null;
  hasCv: boolean;
  /** Ekstensi dokumen opsional yang tersimpan di profil, null bila tidak ada. */
  documents: Record<DocumentKind, string | null>;
}

/**
 * Nama, CV, dan dokumen opsional profil pengguna yang masuk, untuk pratinjau lampiran. Kolom dokumen yang belum ada di
 * database (migrasi belum jalan) berarti tidak ada dokumen. Null bila profil tidak terbaca: pratinjau lampiran dilewati.
 */
async function loadAttachmentProfile(): Promise<AttachmentProfile | null> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return null;
    let res: { data: unknown; error: unknown } = await supabase
      .from("profiles")
      .select("full_name, resume_url, transcript_url, portfolio_file_url")
      .eq("id", userId)
      .maybeSingle();
    if (res.error && isMissingDocumentColumn(res.error)) {
      res = await supabase.from("profiles").select("full_name, resume_url").eq("id", userId).maybeSingle();
    }
    if (res.error) return null;
    const row = (res.data ?? {}) as Record<string, unknown>;
    const documents = { transcript: null, portfolio: null } as Record<DocumentKind, string | null>;
    for (const kind of DOCUMENT_KINDS) {
      const ref = parseDocumentPath(kind, row[DOCUMENT_COLUMN[kind]], userId);
      documents[kind] = ref ? (/\.(pdf|docx?)$/.exec(ref.fileName)?.[1] ?? null) : null;
    }
    return {
      name: typeof row.full_name === "string" ? row.full_name : null,
      hasCv: parseResumePath(row.resume_url, userId) !== null,
      documents,
    };
  } catch (err) {
    console.warn("[emailApply] attachment preview skipped:", err);
    return null;
  }
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
  if (isMockMode()) return { ...data, gmail: true, agentKnown: true };

  const ids = approved.map((a) => a.id);
  const jobIds = [...new Set(approved.map((a) => a.job_id).filter((x): x is string => !!x))];

  let agentKnown = true;
  const [gmail, logs, queue, jobs, agent, claimRes, skippedLogs, profile] = await Promise.all([
    automationApi.getGmailStatus(),
    supabase.from("application_logs").select("action, details, created_at").eq("status", "success").in("details->>approval_request_id", ids),
    supabase
      .from("automation_queue")
      .select("status, error_message, created_at, payload")
      .eq("job_type", "email_apply")
      .in("payload->>approval_request_id", ids)
      .order("created_at", { ascending: false }),
    jobIds.length > 0 ? supabase.from("jobs").select("id, title, description, requirements, responsibilities, external_url").in("id", jobIds) : Promise.resolve({ data: [], error: null } as any),
    loadAgentApplyRows(ids)
      .then((res) => {
        agentKnown = res.complete;
        return res.rows;
      })
      .catch((err) => {
        console.warn("[agentApply] status unavailable:", err);
        agentKnown = false;
        return {} as Record<string, AgentApplyRow>;
      }),
    automationApi.getApprovalClaimStatuses(ids).catch(() => ({ claims: {} })),
    // Email yang tidak dikirim karena mode uji: log email_apply berstatus skipped. Hanya pelengkap tampilan.
    supabase
      .from("application_logs")
      .select("status, details")
      .eq("action", "email_apply")
      .eq("status", "skipped")
      .in("details->>approval_request_id", ids),
    loadAttachmentProfile(),
  ]);

  data.gmail = gmail ? gmail.gmail === true : null;
  for (const [aid, info] of Object.entries(claimRes?.claims ?? {})) {
    if (!info || info.state === "none") continue;
    const base = agent[aid] ?? { status: "completed", fields_filled: null };
    agent[aid] = { ...base, claim_state: info.state, claim_channel: info.channel };
  }
  data.agent = agent;
  data.agentKnown = agentKnown;

  if (logs.error) console.warn("[emailApply] used-check skipped:", logs.error.message);
  for (const row of logs.data ?? []) {
    const id = (row as any)?.details?.approval_request_id;
    if (typeof id !== "string") continue;
    data.used.add(id);
    // Lampiran yang tercatat worker pada email yang terkirim (baris log email_apply; email lama tidak punya daftarnya).
    if ((row as any)?.action === "email_apply" && !data.sentAttachments[id]) {
      const sent = parseSentAttachments((row as any)?.details);
      if (sent) data.sentAttachments[id] = sent;
    }
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

  if (skippedLogs.error) console.warn("[emailApply] test-mode check skipped:", skippedLogs.error.message);
  for (const row of skippedLogs.data ?? []) {
    const id = (row as any)?.details?.approval_request_id;
    // Hanya bila tugas emailnya terakhir selesai dan belum ada kiriman sukses: kiriman nyata sesudahnya menghapus tandanya.
    if (typeof id === "string" && isRealSubmitOffLog(row as any) && !data.used.has(id) && data.jobs[id]?.status === "completed") data.testMode.add(id);
  }

  const descriptionByJob = new Map<string, string>();
  const textByJob = new Map<string, string>();
  const urlByJob = new Map<string, string>();
  for (const j of jobs.data ?? []) {
    descriptionByJob.set((j as any).id, String((j as any).description ?? ""));
    textByJob.set((j as any).id, jobPostingText(j as Record<string, unknown>));
    const url = safeJobUrl((j as any).external_url);
    if (url) urlByJob.set((j as any).id, url);
  }
  for (const a of approved) {
    const found = a.job_id ? extractRecruiterEmails(descriptionByJob.get(a.job_id)) : [];
    if (found.length > 0) data.suggestions[a.id] = found;
    const url = a.job_id ? urlByJob.get(a.job_id) : undefined;
    if (url) data.jobUrls[a.id] = url;
    // Pratinjau lampiran: butuh profil dan teks lowongan; tanpa salah satunya, panel tidak menampilkan daftar.
    if (profile && a.job_id && textByJob.has(a.job_id)) {
      data.attachmentPlans[a.id] = planEmailAttachments({
        resumeUrl: a.resume_url,
        profileHasCv: profile.hasCv,
        coverLetter: a.cover_letter,
        applicantName: profile.name,
        jobText: textByJob.get(a.job_id) ?? "",
        documents: profile.documents,
      });
    }
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
