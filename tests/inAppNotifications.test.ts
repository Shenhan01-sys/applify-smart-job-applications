import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyReadLocally, formatUnreadBadge, safeNotificationHref } from "../src/lib/inAppNotifications.ts";

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
