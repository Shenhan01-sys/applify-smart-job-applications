import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALL_CHECKED_BODY,
  ALL_CHECKED_TITLE,
  NEVER_HAD_ANY_BODY,
  NEVER_HAD_ANY_TITLE,
  pendingEmptyState,
} from "../src/lib/approvalsEmpty.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("tab Menunggu kosong: tanpa riwayat = belum pernah ada, dengan riwayat = semua sudah diperiksa", () => {
  const never = pendingEmptyState(0);
  assert.equal(never.kind, "never_had_any");
  assert.equal(never.title, "Belum ada lamaran yang menunggu persetujuan");
  assert.match(never.body, /Jalankan pencarian lowongan dulu/);
  assert.doesNotMatch(never.title + never.body, /Semua sudah diperiksa|sudah kamu periksa/i);

  for (const n of [1, 5, 50]) {
    const some = pendingEmptyState(n);
    assert.equal(some.kind, "all_checked", String(n));
    assert.equal(some.title, ALL_CHECKED_TITLE);
    assert.equal(ALL_CHECKED_TITLE, "Semua sudah diperiksa");
  }
  assert.match(ALL_CHECKED_BODY, /Ajukan ke Persetujuan/);
  assert.notEqual(NEVER_HAD_ANY_BODY, ALL_CHECKED_BODY);
  assert.notEqual(NEVER_HAD_ANY_TITLE, ALL_CHECKED_TITLE);
});

test("halaman Persetujuan memakai keadaan kosong dari jumlah riwayat, bukan kalimat tetap", () => {
  const page = read("../src/routes/approvals.tsx");
  assert.match(page, /pendingEmptyState\(tabs\.history\.length\)/);
  assert.doesNotMatch(page, /Tidak ada yang perlu disetujui/);
  assert.doesNotMatch(page, /Semua permintaan sudah kamu periksa/);
});
