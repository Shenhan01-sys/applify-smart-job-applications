import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Perbaikan hasil review Gelombang 8 untuk banner Tindakan mendesak. Membaca kode sumber karena halaman bergantung pada
 * supabase-js dan alias "@/"; perilakunya sendiri dijaga tes Playwright (tests/e2e/dashboard-urgent.spec.ts).
 */
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("E2E-06: banner Tindakan mendesak dimuat di efek sendiri, tanpa polling, hanya membaca", () => {
  const dash = read("../src/routes/dashboard.tsx");

  // Tidak lagi ikut Promise.all utama: Beranda tidak menunggu backend persetujuan.
  const mainStart = dash.indexOf("const [p, apps, q, summary, approvedRes] = await Promise.all([");
  assert.ok(mainStart > 0, "Promise.all utama harus berisi lima kueri data Beranda");
  const mainEnd = dash.indexOf("]);", mainStart);
  assert.doesNotMatch(dash.slice(mainStart, mainEnd), /getPendingApprovals|loadEmailApplyData|automation_queue|application_logs/);

  assert.equal((dash.match(/getPendingApprovals\(\)/g) ?? []).length, 1);
  const urgentEffect = dash.slice(dash.indexOf("const userId = user?.id;"));
  // Data kartu dibaca oleh pemuat yang sama dengan halaman Persetujuan (RLS ke baris milik sendiri), bukan kueri sendiri.
  assert.match(urgentEffect, /loadEmailApplyData\(history as unknown as ApprovalLike\[\], \{ placementOnly: true \}\)/);
  assert.doesNotMatch(urgentEffect, /from\("automation_queue"\)|from\("application_logs"\)/);
  assert.match(urgentEffect, /summarizeUrgentActions\(\{ pendingApprovals, history, data \}\)/);
  assert.match(urgentEffect, /let cancelled = false/);
  assert.match(urgentEffect, /\[userId, reloadKey\]/);
  // Hanya membaca dan tidak berulang.
  assert.doesNotMatch(dash, /setInterval|visibilitychange/);
  assert.doesNotMatch(urgentEffect, /\.(insert|update|upsert|delete)\(/);
});
