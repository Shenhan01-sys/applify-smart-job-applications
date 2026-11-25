export interface ApprovalDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const approvalDraftKey = (approvalId: string): string => `applify:approval-draft:${approvalId}`;

function browserSessionStorage(): ApprovalDraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Read one approval's draft; blocked storage falls back to the saved letter. */
export function readApprovalDraft(
  approvalId: string,
  original: string,
  storage: ApprovalDraftStorage | null = browserSessionStorage(),
): string {
  try {
    return storage?.getItem(approvalDraftKey(approvalId)) ?? original;
  } catch {
    return original;
  }
}

/** Save only edits; matching the original removes a stale draft. Returns whether storage succeeded. */
export function saveApprovalDraft(
  approvalId: string,
  draft: string,
  original: string,
  storage: ApprovalDraftStorage | null = browserSessionStorage(),
): boolean {
  try {
    if (!storage) return false;
    if (draft === original) storage.removeItem(approvalDraftKey(approvalId));
    else storage.setItem(approvalDraftKey(approvalId), draft);
    return true;
  } catch {
    return false;
  }
}

/** Remove a draft after approve/reject or when the user explicitly discards it. */
export function clearApprovalDraft(
  approvalId: string,
  storage: ApprovalDraftStorage | null = browserSessionStorage(),
): boolean {
  try {
    if (!storage) return false;
    storage.removeItem(approvalDraftKey(approvalId));
    return true;
  } catch {
    return false;
  }
}
