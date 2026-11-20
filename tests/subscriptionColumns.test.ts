import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Uji E2E klik 20 November 2026: halaman Pengaturan menampilkan "Kuota belum bisa dimuat" karena
// useSubscription meminta subscriptions.current_period_end, kolom yang tidak ada di produksi (HTTP 400).
test("useSubscription hanya meminta kolom subscriptions yang ada di produksi", () => {
  const src = read("../src/hooks/useSubscription.ts");
  const select = /from\("subscriptions"\)\.select\("([^"]+)"\)/.exec(src)?.[1];
  assert.ok(select, "query subscriptions ditemukan");
  const cols = select.split(",").map((c) => c.trim());
  // Kolom produksi dari information_schema.columns, 20 November 2026.
  const live = new Set([
    "id", "user_id", "plan_name", "status", "monthly_quota", "used_quota", "started_at", "expires_at", "created_at",
    "updated_at", "daily_apply_quota", "ai_model_tier", "acceptance_prediction_accuracy", "quota_period",
  ]);
  for (const c of cols) assert.ok(live.has(c), `kolom ${c} ada di produksi`);
  assert.doesNotMatch(src, /\?\.current_period_end/, "hasil query tidak dibaca dari kolom yang tidak ada");
});
