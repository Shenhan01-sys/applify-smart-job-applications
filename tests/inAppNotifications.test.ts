import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyReadLocally, formatUnreadBadge, safeNotificationHref, shareInflight } from "../src/lib/inAppNotifications.ts";

test("shareInflight: pemanggil serentak berbagi satu permintaan, setelah selesai permintaan baru dibuat", async () => {
  let calls = 0;
  let release: (v: number) => void = () => {};
  const fetcher = shareInflight(
    () =>
      new Promise<number>((resolve) => {
        calls += 1;
        release = resolve;
      }),
  );
  const a = fetcher();
  const b = fetcher();
  assert.equal(calls, 1);
  release(7);
  assert.deepEqual(await Promise.all([a, b]), [7, 7]);
  const c = fetcher();
  assert.equal(calls, 2);
  release(8);
  assert.equal(await c, 8);
});

test("shareInflight: galat tidak menyangkut, permintaan berikutnya jalan lagi", async () => {
  let calls = 0;
  const fetcher = shareInflight(async () => {
    calls += 1;
    if (calls === 1) throw new Error("gagal");
    return "ok";
  });
  await assert.rejects(fetcher(), /gagal/);
  assert.equal(await fetcher(), "ok");
});

test("formatUnreadBadge: nol null, 1..99 string angka, >99 menjadi 99+", () => {
  assert.equal(formatUnreadBadge(0), null);
  assert.equal(formatUnreadBadge(-3), null);
  assert.equal(formatUnreadBadge(5), "5");
  assert.equal(formatUnreadBadge(99), "99");
  assert.equal(formatUnreadBadge(100), "99+");
});

test("safeNotificationHref: menolak URL eksternal atau protocol-relative", () => {
  assert.equal(safeNotificationHref("/approvals"), "/approvals");
  assert.equal(safeNotificationHref("https://evil.example"), null);
  assert.equal(safeNotificationHref("//evil.example"), null);
  assert.equal(safeNotificationHref("javascript:alert(1)"), null);
});

test("applyReadLocally: menandai sebagian atau semua item dan menghitung ulang unreadCount", () => {
  const initial = {
    items: [
      { id: "n1", event: "ready", title: "Siap", body: "Cek persetujuan", href: "/approvals", read_at: null, created_at: "2026-11-26T09:00:00Z" },
      { id: "n2", event: "submitted", title: "Terkirim", body: "Terkirim", href: "/applications", read_at: null, created_at: "2026-11-26T08:00:00Z" },
    ],
    unreadCount: 2,
  };
  const one = applyReadLocally(initial, { ids: ["n1"] }, "2026-11-26T10:00:00Z");
  assert.equal(one.unreadCount, 1);
  assert.equal(one.items[0].read_at, "2026-11-26T10:00:00Z");
  assert.equal(one.items[1].read_at, null);

  const all = applyReadLocally(one, { all: true }, "2026-11-26T10:05:00Z");
  assert.equal(all.unreadCount, 0);
  assert.equal(all.items[1].read_at, "2026-11-26T10:05:00Z");
});

test("InAppNotificationsBell terpasang di AppShell dan tidak menulis langsung ke Supabase dari browser", () => {
  const shell = readFileSync(new URL("../src/components/app/AppShell.tsx", import.meta.url), "utf8");
  const bell = readFileSync(new URL("../src/components/app/InAppNotificationsBell.tsx", import.meta.url), "utf8");
  assert.match(shell, /InAppNotificationsBell/);
  assert.doesNotMatch(bell, /supabase\s*\.\s*from\s*\(\s*["']user_notifications["']\s*\)\s*\.\s*(insert|update|delete)/);
});
