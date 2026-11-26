import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clearUserBrowserState, type BrowserKeyStorage } from "../src/lib/signOutCleanup.ts";

function fakeStorage(initial: Record<string, string>): BrowserKeyStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
}

test("47.6 FE-28: clearUserBrowserState membersihkan draf dan status pengguna di sessionStorage & localStorage", () => {
  const session = fakeStorage({
    "applify:approval-draft:123": "surat lama",
    "green_career_draft:456": "jawaban lama",
    "other-tab-key": "biarkan",
  });
  const local = fakeStorage({
    "applify_profile_welcome_seen_v1": "1",
    "applify_subscription_v1": "pro",
    "applify:waitinglist-joined": "1",
    "theme": "light",
  });

  clearUserBrowserState(session, local);

  assert.equal(session.data.has("applify:approval-draft:123"), false);
  assert.equal(session.data.has("green_career_draft:456"), false);
  assert.equal(session.data.get("other-tab-key"), "biarkan");

  assert.equal(local.data.has("applify_profile_welcome_seen_v1"), false);
  assert.equal(local.data.has("applify_subscription_v1"), false);
  assert.equal(local.data.get("theme"), "light");
});

test("AuthContext memanggil clearUserBrowserState saat signOut", () => {
  const src = readFileSync(new URL("../src/contexts/AuthContext.tsx", import.meta.url), "utf8");
  assert.match(src, /clearUserBrowserState\(\)/);
});
