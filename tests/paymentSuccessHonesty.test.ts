import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePlanSearch } from "../src/lib/subscriptionStore.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const success = read("../src/routes/payment.success.tsx");

test("halaman sukses pembayaran tidak lagi mengklaim bukti dikirim ke email", () => {
  assert.doesNotMatch(success, /Bukti pembayaran ini dikirim ke/);
  assert.doesNotMatch(success, /demo@applify\.id/);
});

test("halaman sukses pembayaran jujur bahwa ini mode simulasi", () => {
  assert.match(success, /Mode simulasi: tidak ada transaksi atau email bukti pembayaran yang dikirim\./);
});

test("47.6 FE-25: ?plan di /payment divalidasi hanya ke free, pro, atau kampus", () => {
  assert.equal(parsePlanSearch("pro"), "pro");
  assert.equal(parsePlanSearch("kampus"), "kampus");
  assert.equal(parsePlanSearch("free"), "free");
  for (const bad of [undefined, null, "", "enterprise", "PRO", 123, "<script>"]) {
    assert.equal(parsePlanSearch(bad), undefined, String(bad));
  }
  assert.match(read("../src/routes/payment.tsx"), /plan:\s*parsePlanSearch\(input\.plan\)/);
});
