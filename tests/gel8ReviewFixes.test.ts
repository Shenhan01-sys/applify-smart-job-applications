import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Perbaikan hasil review Gelombang 8 untuk sinkron surat ke persetujuan. Seperti tes Gelombang 8 lain, tes ini membaca
 * kode sumber karena modal dan service bergantung pada supabase-js dan alias "@/".
 */
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("E2E-04: gagal menyinkronkan surat ke persetujuan tidak membuat penyimpanan draf tampak gagal", () => {
  const service = read("../src/services/approvalService.ts");
  const modal = read("../src/components/AIApplyModal.tsx");

  assert.match(service, /export type CoverLetterSyncResult = "synced" \| "skipped" \| "failed"/);
  const fn = service.slice(service.indexOf("export async function syncPendingApprovalCoverLetter"));
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  // Galat API ditangkap dan menjadi "failed"; surat kosong dilewati, tidak dilempar.
  assert.match(body, /catch \(err\)[\s\S]*return "failed"/);
  assert.doesNotMatch(body, /throw /);
  assert.match(body, /if \(!trimmed\) return "skipped"/);

  // Kedua jalur (sunting dan tulis ulang) memberi peringatan, dan state surat tetap diperbarui sebelum peringatan.
  assert.equal((modal.match(/else if \(synced === "failed"\) toast\.warning\(APPROVAL_COVER_SYNC_FAILED\)/g) ?? []).length, 2);
  assert.equal((modal.match(/if \(synced === "synced"\) toast\.success/g) ?? []).length, 2);
});
