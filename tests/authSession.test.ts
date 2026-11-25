import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { waitForSession, type AuthClientLike } from "../src/lib/authSession.ts";

type S = { user: { id: string } };
const session: S = { user: { id: "u1" } };

/** Klien tiruan: `getSession` memberi null sebanyak `nullReads` kali, lalu sesi; peristiwa bisa dipicu lewat `emit`. */
function fakeClient(opts: { nullReads?: number; getError?: unknown } = {}) {
  let reads = 0;
  let listener: ((event: string, s: S | null) => void) | null = null;
  const state = { unsubscribed: 0, subscribed: 0 };
  const client: AuthClientLike<S> = {
    auth: {
      async getSession() {
        reads++;
        if (opts.getError) return { data: { session: null }, error: opts.getError };
        return { data: { session: reads > (opts.nullReads ?? 0) ? session : null }, error: null };
      },
      onAuthStateChange(cb) {
        state.subscribed++;
        listener = cb;
        return { data: { subscription: { unsubscribe: () => { state.unsubscribed++; } } } };
      },
    },
  };
  return { client, state, emit: (event: string, s: S | null) => listener?.(event, s), reads: () => reads };
}

test("sesi sudah ada: selesai segera dan langganan dilepas", async () => {
  const f = fakeClient();
  const res = await waitForSession(f.client, { pollMs: 10, timeoutMs: 500 });
  assert.equal(res.session, session);
  assert.equal(res.error, null);
  assert.equal(f.state.subscribed, 1);
  assert.equal(f.state.unsubscribed, 1);
});

test("koneksi lambat: getSession kosong beberapa kali lalu terisi, tidak gagal 'sesi tidak ditemukan'", async () => {
  const f = fakeClient({ nullReads: 4 });
  const res = await waitForSession(f.client, { pollMs: 10, timeoutMs: 2000 });
  assert.equal(res.session, session);
  assert.ok(f.reads() >= 5);
});

test("peristiwa SIGNED_IN menyelesaikan penantian tanpa menunggu pembacaan berikutnya", async () => {
  const f = fakeClient({ nullReads: 1000 });
  const p = waitForSession(f.client, { pollMs: 5000, timeoutMs: 5000 });
  await new Promise((r) => setTimeout(r, 20));
  f.emit("SIGNED_OUT", null);
  f.emit("SIGNED_IN", session);
  const res = await p;
  assert.equal(res.session, session);
  assert.equal(f.state.unsubscribed, 1);
});

test("tanpa sesi sampai batas waktu: session null tanpa galat, langganan dilepas", async () => {
  const f = fakeClient({ nullReads: 1000 });
  const res = await waitForSession(f.client, { pollMs: 10, timeoutMs: 80 });
  assert.equal(res.session, null);
  assert.equal(res.error, null);
  assert.equal(res.cancelled, false);
  assert.equal(f.state.unsubscribed, 1);
});

test("galat getSession diteruskan, dan pembatalan melepas langganan", async () => {
  const bad = fakeClient({ getError: new Error("boom") });
  const r1 = await waitForSession(bad.client, { pollMs: 10, timeoutMs: 500 });
  assert.equal(r1.session, null);
  assert.ok(r1.error instanceof Error);
  assert.equal(bad.state.unsubscribed, 1);

  const f = fakeClient({ nullReads: 1000 });
  const ctrl = new AbortController();
  const p = waitForSession(f.client, { pollMs: 10, timeoutMs: 5000, signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 30);
  const r2 = await p;
  assert.equal(r2.cancelled, true);
  assert.equal(f.state.unsubscribed, 1);
});

test("auth.callback memakai waitForSession, bukan setTimeout 1 detik dengan satu getSession", () => {
  const src = readFileSync(new URL("../src/routes/auth.callback.tsx", import.meta.url), "utf8");
  assert.match(src, /waitForSession\(supabase/);
  assert.doesNotMatch(src, /setTimeout/);
  assert.match(src, /controller\.abort\(\)/);
});
