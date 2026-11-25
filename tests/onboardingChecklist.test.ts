import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildChecklist } from "../src/lib/onboardingChecklist.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const fresh = { profileComplete: false, hasResume: false, drafts: 0, approved: 0, sent: 0 };

test("akun baru: 0 dari 5 selesai, langkah berikutnya Lengkapi profil", () => {
  const c = buildChecklist(fresh);
  assert.equal(c.total, 5);
  assert.equal(c.doneCount, 0);
  assert.equal(c.next?.id, "profile");
  assert.equal(c.next?.to, "/profile");
  assert.equal(c.complete, false);
  assert.deepEqual(c.steps.map((s) => s.id), ["profile", "cv", "draft", "approve", "sent"]);
});

test("langkah berikutnya selalu yang pertama belum selesai, berurutan sampai terkirim", () => {
  assert.equal(buildChecklist({ ...fresh, profileComplete: true }).next?.id, "cv");
  assert.equal(buildChecklist({ ...fresh, profileComplete: true, hasResume: true }).next?.id, "draft");
  assert.equal(buildChecklist({ ...fresh, profileComplete: true, hasResume: true, drafts: 2 }).next?.id, "approve");
  assert.equal(buildChecklist({ ...fresh, profileComplete: true, hasResume: true, drafts: 2, approved: 1 }).next?.id, "sent");
  const all = buildChecklist({ profileComplete: true, hasResume: true, drafts: 2, approved: 1, sent: 1 });
  assert.equal(all.complete, true);
  assert.equal(all.next, null);
  assert.equal(all.doneCount, 5);
});

test("data yang gagal dibaca tidak dianggap selesai atau belum, dan tidak dipilih sebagai langkah berikutnya", () => {
  const c = buildChecklist({ profileComplete: null, hasResume: null, drafts: 0, approved: null, sent: 0 });
  assert.equal(c.steps[0].done, null);
  assert.equal(c.steps[1].done, null);
  assert.equal(c.next?.id, "draft");
  assert.equal(c.doneCount, 0);
});

test("lamaran terkirim berarti draf dan persetujuan sudah ada, walau hitungan persetujuan gagal dibaca", () => {
  const c = buildChecklist({ profileComplete: true, hasResume: true, drafts: 0, approved: null, sent: 1 });
  assert.equal(c.steps.find((s) => s.id === "draft")?.done, true);
  assert.equal(c.steps.find((s) => s.id === "approve")?.done, true);
  assert.equal(c.complete, true);
});

test("teks langkah: bahasa Indonesia, tanpa em dash dan tanda seru, menyebut jaminan Setujui", () => {
  const c = buildChecklist(fresh);
  const all = c.steps.map((s) => `${s.title} ${s.detail} ${s.cta}`).join(" ");
  assert.doesNotMatch(all, /—|!/);
  assert.match(c.steps.find((s) => s.id === "approve")!.detail, /Tidak ada lamaran yang dikirim sebelum kamu menekan Setujui/);
});

test("Beranda: checklist dipasang dari data nyata; tiga bulatan 0 tidak tampil untuk akun kosong", () => {
  const page = read("../src/routes/dashboard.tsx");
  assert.match(page, /buildChecklist\(\{/);
  assert.match(page, /!checklist\.complete && <OnboardingChecklist/);
  assert.match(page, /from\("approval_requests"\)\.select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(page, /select\("full_name, resume_url"\)/);
  assert.match(page, /\{\(stats\.total > 0 \|\| loadError\) && \(\s*<MissionControlStage/);
  assert.match(page, /role="progressbar"/);
  assert.match(page, /<Link to=\{step\.to\}/);
});
