/**
 * Helpers for taking a saved draft (`ai_applications` row) to the approval queue, and for showing a draft that
 * already exists. Used by the AI Apply modal and by the draft detail on the Lamaran Saya page.
 *
 * The approval queue (backend POST /api/approvals) does not stop two pending approvals for the same draft, so the
 * client checks the pending list first.
 *
 * Plain TypeScript with relative imports only, so it runs under `node --test` without a bundler.
 */
import { highlightedSkills } from "./matchScore.ts";

/** A draft can go to approval while it has not been sent: "draft" or "ready". */
export function canRequestApproval(status: unknown): boolean {
  return status === "draft" || status === "ready";
}

export interface PendingApproval {
  id: string;
  application_id?: string | null;
  status?: string;
  expires_at?: string;
  answers?: unknown;
}

/**
 * The still-valid pending approval of this draft, from the backend's pending list (GET /api/approvals/pending).
 * Anything else (approved, rejected, expired, another draft, malformed rows) is not a match.
 */
export function findPendingApproval(approvals: unknown, applicationId: string, now: number = Date.now()): PendingApproval | null {
  if (!Array.isArray(approvals) || !applicationId) return null;
  for (const a of approvals) {
    if (!a || typeof a !== "object") continue;
    const row = a as PendingApproval;
    if (typeof row.id !== "string" || !row.id) continue;
    if (row.application_id !== applicationId) continue;
    if (row.status !== undefined && row.status !== "pending") continue;
    if (row.expires_at !== undefined) {
      const t = Date.parse(row.expires_at);
      if (!Number.isFinite(t) || t <= now) continue;
    }
    return row;
  }
  return null;
}

export interface ApprovalPayload {
  job_id: string | null;
  application_id: string;
  job_title: string;
  company: string;
  platform: string | null;
  cover_letter: string;
}

export type PayloadResult = { ok: true; payload: ApprovalPayload } | { ok: false; reason: string };

/**
 * Body for POST /api/approvals from a draft and its job. approval_requests.job_title and company are NOT NULL, so a
 * draft whose job is gone (deleted, or not joined) cannot be sent, and the reason says so.
 */
export function buildApprovalPayload(input: {
  applicationId: string;
  jobId?: string | null;
  jobTitle?: unknown;
  company?: unknown;
  platform?: unknown;
  coverLetter?: unknown;
}): PayloadResult {
  const jobTitle = typeof input.jobTitle === "string" ? input.jobTitle.trim() : "";
  const company = typeof input.company === "string" ? input.company.trim() : "";
  const coverLetter = typeof input.coverLetter === "string" ? input.coverLetter : "";
  if (!input.applicationId) return { ok: false, reason: "Draf ini belum punya id, jadi belum bisa diajukan." };
  if (!jobTitle || !company) return { ok: false, reason: "Lowongan untuk draf ini sudah tidak ada, jadi draf belum bisa diajukan." };
  if (!coverLetter.trim()) return { ok: false, reason: "Surat lamaran draf ini kosong. Isi suratnya dulu sebelum diajukan." };
  return {
    ok: true,
    payload: {
      job_id: input.jobId ?? null,
      application_id: input.applicationId,
      job_title: jobTitle,
      company,
      platform: typeof input.platform === "string" && input.platform ? input.platform : null,
      cover_letter: coverLetter,
    },
  };
}

export interface GeneratedView {
  coverLetter: string;
  optimizedCV: Record<string, any>;
  tailoredSkills: string[];
  aiNotes: string;
}

/** What the draft screen shows for a draft that is already saved. Missing or badly shaped columns become empty, not errors. */
export function draftToGenerated(
  app: { cover_letter?: unknown; optimized_cv?: unknown; tailored_skills?: unknown; ai_notes?: unknown },
  matchedSkills: readonly string[] = [],
): GeneratedView {
  const cv = app.optimized_cv && typeof app.optimized_cv === "object" && !Array.isArray(app.optimized_cv) ? (app.optimized_cv as Record<string, any>) : {};
  return {
    coverLetter: typeof app.cover_letter === "string" ? app.cover_letter : "",
    optimizedCV: cv,
    // Hanya skill profil: kalimat persyaratan lowongan di draf lama disaring (temuan 24, uji klik 21 November 2026).
    tailoredSkills: highlightedSkills(app.tailored_skills, matchedSkills),
    aiNotes: typeof app.ai_notes === "string" ? app.ai_notes : "",
  };
}
