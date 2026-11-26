import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MONTHLY_QUOTA,
  FREE_MONTHLY_QUOTA,
  PRO_MONTHLY_QUOTA,
  monthlyQuotaForTier,
} from "../src/lib/quotaStatus.ts";
import { FREE_FEATURES, PRO_FEATURES } from "../src/lib/planInfo.ts";

// Keputusan Hans 26 November 2026: kuota draf AI bulanan Pro 100, Free tetap 10.
// Angka yang menegakkan batas ada di database (subscriptions.monthly_quota, diisi trigger dari draf SQL).
// Tes ini mengunci angka di kode, teks harga, dan draf SQL supaya tidak saling berbeda.

const here = fileURLToPath(new URL(".", import.meta.url));
const frontend = join(here, "..");
const project = join(frontend, "..");
const read = (rel: string) => readFileSync(join(project, rel), "utf8");

const DRAFT_SQL = "database/migrations/DRAFT_2026-11-26_pro_monthly_quota_100.sql";
const sqlAvailable = existsSync(join(project, DRAFT_SQL));
const sqlCode = () =>
  read(DRAFT_SQL)
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

test("kuota draf bulanan: Free 10, Pro 100, paket lain atau kosong dianggap Free", () => {
  assert.equal(FREE_MONTHLY_QUOTA, 10);
  assert.equal(PRO_MONTHLY_QUOTA, 100);
  assert.equal(DEFAULT_MONTHLY_QUOTA, FREE_MONTHLY_QUOTA);
  assert.equal(monthlyQuotaForTier("pro"), 100);
  assert.equal(monthlyQuotaForTier("Pro"), 100);
  assert.equal(monthlyQuotaForTier(" PRO "), 100);
  assert.equal(monthlyQuotaForTier("free"), 10);
  assert.equal(monthlyQuotaForTier("kampus"), 10);
  assert.equal(monthlyQuotaForTier(""), 10);
  assert.equal(monthlyQuotaForTier(null), 10);
  assert.equal(monthlyQuotaForTier(undefined), 10);
  assert.equal(monthlyQuotaForTier(100), 10);
});

test("kartu paket menyebut 100 draf per bulan untuk Pro dan 10 untuk Free", () => {
  assert.ok(PRO_FEATURES.includes("100 draf AI per bulan (kuota bulanan)"));
  assert.ok(FREE_FEATURES.includes("10 draf AI per bulan (kuota bulanan)"));
  assert.equal(PRO_FEATURES.filter((f) => /ditetapkan per akun|bawaan 10/i.test(f)).length, 0);
  // Batas kirim per hari tidak berubah (Free 10, Pro 20) dan tidak tertukar dengan kuota draf.
  assert.ok(PRO_FEATURES.some((f) => /^Hingga 20 lamaran terkirim per hari/.test(f)));
});

test("konstanta kuota di backend sama dengan frontend", () => {
  const be = read("backend/services/quota-status.ts");
  assert.match(be, /DEFAULT_MONTHLY_QUOTA = 10/);
  assert.match(be, /FREE_MONTHLY_QUOTA = 10/);
  assert.match(be, /PRO_MONTHLY_QUOTA = 100/);
});

test("draf SQL kuota Pro 100: trigger mengikuti paket, update Pro aktif, idempoten, tidak ada perintah merusak", { skip: !sqlAvailable }, () => {
  const raw = read(DRAFT_SQL);
  const sql = sqlCode();
  assert.match(raw, /BELUM DITERAPKAN KE PRODUCTION/);
  assert.match(sql, /^\s*BEGIN;/m);
  assert.match(sql, /^\s*COMMIT;/m);

  // Angka di SQL sama dengan angka di kode.
  const caseAll = [...sql.matchAll(/CASE WHEN v_is_pro THEN (\d+) ELSE (\d+) END/g)];
  assert.ok(caseAll.length >= 2, "INSERT dan UPDATE sama-sama memakai angka paket");
  for (const m of caseAll) {
    assert.equal(Number(m[1]), PRO_MONTHLY_QUOTA);
    assert.equal(Number(m[2]), FREE_MONTHLY_QUOTA);
  }
  assert.match(sql, /ALTER COLUMN monthly_quota SET DEFAULT 10/);
  assert.match(sql, /SET monthly_quota = 100/);

  // Trigger: dibuat ulang tanpa gagal, hanya BEFORE INSERT atau perubahan ai_model_tier.
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.subscriptions_apply_plan_monthly_quota\(\)/);
  assert.match(sql, /DROP TRIGGER IF EXISTS trg_subscriptions_monthly_quota ON public\.subscriptions/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF ai_model_tier ON public\.subscriptions/);
  // Pembaruan kuota khusus: perubahan paket tidak menimpa angka yang diisi operator di pernyataan yang sama.
  assert.match(sql, /NEW\.monthly_quota IS NOT DISTINCT FROM OLD\.monthly_quota/);

  // UPDATE satu kali hanya untuk Pro aktif dan hanya menaikkan.
  const update = sql.match(/UPDATE public\.subscriptions[\s\S]*?;/)?.[0] ?? "";
  assert.match(update, /lower\(coalesce\(ai_model_tier, ''\)\) = 'pro'/);
  assert.match(update, /coalesce\(status, 'active'\) = 'active'/);
  assert.match(update, /expires_at IS NULL OR expires_at > now\(\)/);
  assert.match(update, /coalesce\(monthly_quota, 0\) < 100/);
  assert.doesNotMatch(update, /used_quota|quota_period/);

  // Non-destruktif dan tidak menyentuh pemakaian.
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE\s+FROM/i);
  // Ada query cek sebelum dan sesudah migrasi.
  assert.match(raw, /PRE-CHECK/);
  assert.match(raw, /POST-CHECK/);
  assert.match(raw, /Rollback/i);
});

test("tidak ada kode browser yang menulis tabel subscriptions atau mengubah ai_model_tier / monthly_quota", () => {
  for (const file of sourceFiles(join(frontend, "src"))) {
    const code = readFileSync(file, "utf8");
    assert.doesNotMatch(
      code,
      /from\(\s*["'`]subscriptions["'`]\s*\)\s*\.\s*(insert|update|upsert|delete)\b/,
      `${file}: browser tidak boleh menulis subscriptions (hanya service_role)`,
    );
  }
  // Checkout simulasi tidak mengubah paket di database; kuota 100 baru berlaku lewat penulisan service_role.
  const store = readFileSync(join(frontend, "src/lib/subscriptionStore.ts"), "utf8");
  assert.match(store, /TIDAK mengubah paket pengguna di database/);
});
