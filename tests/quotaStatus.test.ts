import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseQuotaStatus, DEFAULT_MONTHLY_QUOTA } from "../src/lib/quotaStatus.ts";

// ---- kuota draf AI bulanan: cara membaca hasil get_quota_status / consume_monthly_apply -----------------

test("kuota: hasil RPC berupa array satu baris dibaca dengan benar (limit_qty, used, remaining)", () => {
  const q = parseQuotaStatus([{ allowed: true, used: 3, limit_qty: 10, remaining: 7, period: "monthly" }]);
  assert.deepEqual(q, { quota: 10, used: 3, remaining: 7, allowed: true });
});

test("kuota: sudah habis -> remaining 0 dan allowed false", () => {
  const q = parseQuotaStatus([{ allowed: false, used: 10, limit_qty: 10, remaining: 0 }]);
  assert.equal(q.remaining, 0);
  assert.equal(q.allowed, false);
});

test("kuota: objek tunggal (bukan array) juga diterima; remaining dihitung bila tidak ada", () => {
  assert.deepEqual(parseQuotaStatus({ used: 4, limit_qty: 20 }), { quota: 20, used: 4, remaining: 16, allowed: true });
  assert.deepEqual(parseQuotaStatus({ used: 25, limit_qty: 20 }), { quota: 20, used: 25, remaining: 0, allowed: false });
});

test("kuota: data kosong/null/salah bentuk memakai bawaan 10 dan tidak melempar", () => {
  const fresh = { quota: DEFAULT_MONTHLY_QUOTA, used: 0, remaining: DEFAULT_MONTHLY_QUOTA, allowed: true };
  for (const raw of [null, undefined, [], "x", 42]) assert.deepEqual(parseQuotaStatus(raw), fresh);
  assert.equal(DEFAULT_MONTHLY_QUOTA, 10);
});

test("kuota: angka tidak valid (negatif, NaN, teks) diabaikan; angka berupa teks diterima", () => {
  const q = parseQuotaStatus([{ used: -5, limit_qty: "20", remaining: "abc" }]);
  assert.deepEqual(q, { quota: 20, used: 0, remaining: 20, allowed: true });
});

test("kuota: membaca remaining langsung dari array (cara lama) memang undefined, parser tidak bergantung padanya", () => {
  const rows: any = [{ used: 10, limit_qty: 10, remaining: 0, allowed: false }];
  assert.equal(rows.remaining, undefined);
  assert.equal(parseQuotaStatus(rows).remaining, 0);
});

// ---- AIApplyModal hanya boleh membaca kolom/fungsi yang ada di schema.sql dan rpc.sql ---------------------

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("AIApplyModal: kolom subscriptions yang dipilih ada di schema.sql dan memakai RPC get_quota_status", () => {
  const modal = read("../src/components/AIApplyModal.tsx");
  const schema = read("../../database/schema.sql");
  const rpc = read("../../database/rpc.sql");

  const table = schema.match(/create table if not exists public\.subscriptions \(([\s\S]*?)\n\);/);
  assert.ok(table, "tabel subscriptions ada di schema.sql");
  const columns = new Set([...table![1].matchAll(/^\s{2}(\w+)\s/gm)].map((m) => m[1]));
  assert.ok(columns.has("ai_model_tier"));

  const selected = [...modal.matchAll(/\.from\("subscriptions"\)\s*\.select\("([^"]+)"\)/g)].flatMap((m) =>
    m[1].split(",").map((c) => c.trim()),
  );
  assert.ok(selected.length > 0, "modal membaca subscriptions");
  for (const col of selected) assert.ok(columns.has(col), `kolom ${col} tidak ada di schema.sql`);

  assert.doesNotMatch(modal, /monthly_quota|used_quota/);
  assert.match(modal, /rpc\("get_quota_status", \{ p_user_id: user\.id \}\)/);
  assert.match(rpc, /function public\.get_quota_status\(p_user_id uuid\)/);
});

test("Edge Function generate-application membaca hasil RPC lewat parseQuotaStatus, bukan properti array", () => {
  const fn = read("../supabase/functions/generate-application/index.ts");
  assert.match(fn, /parseQuotaStatus\(quotaStatus\)/);
  assert.doesNotMatch(fn, /quotaStatus\.remaining/);
});
