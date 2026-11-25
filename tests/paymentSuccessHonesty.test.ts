import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const success = read("../src/routes/payment.success.tsx");

test("halaman sukses pembayaran tidak lagi mengklaim bukti dikirim ke email", () => {
  assert.doesNotMatch(success, /Bukti pembayaran ini dikirim ke/);
  assert.doesNotMatch(success, /demo@applify\.id/);
});

test("halaman sukses pembayaran jujur bahwa ini mode simulasi", () => {
  assert.match(success, /Mode simulasi: tidak ada transaksi atau email bukti pembayaran yang dikirim\./);
});
