import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAN_READONLY_NOTE, describePlanSummary } from "../src/lib/planSummary.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("E2E 26 Nov: ringkasan paket hanya baca menyebut paket dan draf per bulan, tanpa ajakan bayar", () => {
  const free = describePlanSummary("free", 10);
  assert.equal(free.sentence, "Paket Gratis, 10 draf AI per bulan.");
  assert.equal(free.heading, "Paket Gratis");
  assert.equal(free.allowance, "10 draf AI per bulan");
  assert.equal(free.note, PLAN_READONLY_NOTE);
  assert.doesNotMatch(`${free.sentence} ${free.note}`, /bayar sekarang|upgrade sekarang|berlangganan sekarang|Rp\s?\d/i);
  assert.match(free.note, /Pembayaran belum dibuka/);

  // Angka dari database dipakai apa adanya (akun peneliti memang diatur 30), bukan angka bawaan paket.
  assert.equal(describePlanSummary("free", 30).sentence, "Paket Gratis, 30 draf AI per bulan.");
  assert.equal(describePlanSummary("pro", 100).sentence, "Paket Pro, 100 draf AI per bulan.");
});

test("ringkasan paket: angka belum terbaca memakai angka bawaan Free dan Pro; paket Kampus tidak menebak angka", () => {
  assert.equal(describePlanSummary("free", null).sentence, "Paket Gratis, 10 draf AI per bulan.");
  assert.equal(describePlanSummary("free", undefined).sentence, "Paket Gratis, 10 draf AI per bulan.");
  assert.equal(describePlanSummary("pro", null).sentence, "Paket Pro, 100 draf AI per bulan.");
  const campus = describePlanSummary("kampus", null);
  assert.equal(campus.sentence, "Paket Kampus.");
  assert.equal(campus.allowance, "");
  // angka rusak tidak dipakai
  assert.equal(describePlanSummary("free", Number.NaN).sentence, "Paket Gratis, 10 draf AI per bulan.");
  assert.equal(describePlanSummary("free", -5).sentence, "Paket Gratis, 10 draf AI per bulan.");
});

test("kabel Pengaturan: kartu paket hanya baca tampil saat billing mati, kartu Paket & Tagihan tetap hanya saat billing nyala", () => {
  const src = read("../src/routes/settings.tsx");
  assert.match(src, /import \{ describePlanSummary \} from "@\/lib\/planSummary"/);
  assert.match(src, /\{!billing && \(\s*<Card icon=\{CreditCard\} title="Paket Saya"/);
  assert.match(src, /\{billing && \(\s*<Card icon=\{CreditCard\} title="Paket & Tagihan"/);
  const readonlyBlock = src.slice(src.indexOf('title="Paket Saya"'), src.indexOf("{/* Tagihan hanya tampil"));
  assert.doesNotMatch(readonlyBlock, /<Link|to="\/subscription"|href="\/subscription"|<button/);
});
