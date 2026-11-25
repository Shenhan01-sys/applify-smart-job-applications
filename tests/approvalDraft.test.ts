import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { approvalDraftKey, clearApprovalDraft, readApprovalDraft, saveApprovalDraft, type ApprovalDraftStorage } from "../src/lib/approvalDraft.ts";

class MemoryStorage implements ApprovalDraftStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("approval drafts are isolated by approval ID and restored from session storage", () => {
  const storage = new MemoryStorage();
  assert.equal(approvalDraftKey("a-1"), "applify:approval-draft:a-1");
  assert.equal(readApprovalDraft("a-1", "Original", storage), "Original");
  assert.equal(saveApprovalDraft("a-1", "Edited", "Original", storage), true);
  assert.equal(readApprovalDraft("a-1", "Original", storage), "Edited");
  assert.equal(readApprovalDraft("a-2", "Other", storage), "Other");
});

test("saving the original or clearing removes the draft; blocked storage fails safely", () => {
  const storage = new MemoryStorage();
  saveApprovalDraft("a", "Edited", "Original", storage);
  assert.equal(saveApprovalDraft("a", "Original", "Original", storage), true);
  assert.equal(readApprovalDraft("a", "Original", storage), "Original");
  saveApprovalDraft("a", "Edited", "Original", storage);
  assert.equal(clearApprovalDraft("a", storage), true);
  assert.equal(readApprovalDraft("a", "Original", storage), "Original");
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  assert.equal(readApprovalDraft("a", "Original", blocked), "Original");
  assert.equal(saveApprovalDraft("a", "Edited", "Original", blocked), false);
  assert.equal(clearApprovalDraft("a", blocked), false);
});

test("approval modal persists edits, asks before discarding, and uses 44px touch targets", () => {
  const src = readFileSync(new URL("../src/components/ApprovalReviewModal.tsx", import.meta.url), "utf8");
  assert.match(src, /saveApprovalDraft\(request\.id, value, originalCoverLetter\)/);
  assert.match(src, /readApprovalDraft\(request\.id, originalCoverLetter\)/);
  assert.match(src, /clearApprovalDraft\(request\.id\)/);
  assert.match(src, /AlertDialogTitle>Ada editan yang belum disetujui/);
  assert.match(src, /min-h-11 items-center gap-1 rounded-lg border-2/);
  assert.match(src, /min-h-11 rounded-full border/);
  assert.doesNotMatch(src, /(?:h-8|min-h-8)/);
});
