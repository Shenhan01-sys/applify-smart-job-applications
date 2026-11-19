import { automationApi } from "@/services/automationApi";
import { describeApiError } from "@/lib/apiErrors";
import { buildApprovalPayload, findPendingApproval, type PendingApproval } from "@/lib/draftApproval";

export interface DraftApprovalInput {
  applicationId: string;
  jobId?: string | null;
  jobTitle?: unknown;
  company?: unknown;
  platform?: unknown;
  coverLetter?: unknown;
}

/** The draft itself cannot be sent (job gone, empty letter). The message is written for the user. */
export class DraftNotSendableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftNotSendableError";
  }
}

/** Message for a failed approval request: the draft's own reason, else what the server answered. */
export function describeApprovalError(err: unknown, fallback = "Draf belum bisa diajukan."): string {
  return err instanceof DraftNotSendableError ? err.message : describeApiError(err, fallback);
}

/** The approval this draft is already waiting on, or null. Throws when the pending list cannot be read. */
export async function getPendingApprovalFor(applicationId: string): Promise<PendingApproval | null> {
  return findPendingApproval(await automationApi.getPendingApprovals(), applicationId);
}

/**
 * Send a saved draft to the approval queue (the same call as the "Ajukan ke Persetujuan" button of the AI Apply
 * modal). If the draft already has a pending approval nothing is created: that one is returned with
 * `created: false`, so a second click or a second screen does not queue the same draft twice.
 * Throws DraftNotSendableError when the draft cannot be sent, and the API error when a call fails.
 */
export async function requestApprovalForDraft(input: DraftApprovalInput): Promise<{ approval: PendingApproval; created: boolean }> {
  const built = buildApprovalPayload(input);
  if (!built.ok) throw new DraftNotSendableError(built.reason);
  const existing = await getPendingApprovalFor(input.applicationId);
  if (existing) return { approval: existing, created: false };
  const approval = (await automationApi.createApproval(built.payload)) as PendingApproval;
  return { approval, created: true };
}
