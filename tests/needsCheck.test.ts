import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NEEDS_CHECK_BOARD_COLUMN,
  NEEDS_CHECK_HEADING,
  NEEDS_CHECK_INTRO,
  NEEDS_CHECK_LABEL,
  NEEDS_CHECK_STEPS,
  boardColumnOf,
  groupForBoard,
  isNeedsCheckApplication,
  isNeedsCheckLog,
} from "../src/lib/needsCheck.ts";
import { groupByStatus, isApplicationSent, summarizeApplications } from "../src/lib/dashboardStats.ts";
import { AGENT_CODE_REJECTED_HINT, AGENT_CODE_TIMEOUT_HINT, describeLogOutcome } from "../src/lib/agentApplyStatus.ts";
import { dropIntoSubmittedBlocked } from "../src/lib/boardDnd.ts";

// Keputusan Hans 26 November 2026: verdict needs_code (situs meminta kode keamanan lewat email) berarti "Perlu dicek",
// bukan "belum terkirim". Kartunya tampil di kolom "Perlu tindak lanjut", tanpa mengubah status di database.

const here = fileURLToPath(new URL(".", import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");

const timeoutLog = { log_status: "ready", reason: "code_timeout" };
const rejectedLog = { log_status: "ready", reason: "code_rejected" };

test("log tunggu kode yang berakhir (code_timeout, code_rejected) = Perlu dicek; log lain bukan", () => {
  assert.equal(isNeedsCheckLog(timeoutLog), true);
  assert.equal(isNeedsCheckLog(rejectedLog), true);
  assert.equal(isNeedsCheckLog({ log_status: "awaiting_code" }), false, "agen masih menunggu: bukan perlu dicek");
  assert.equal(isNeedsCheckLog({ log_status: "success", reason: "code_timeout" }), false);
  assert.equal(isNeedsCheckLog({ log_status: "ready", reason: "timeout" }), false);
  assert.equal(isNeedsCheckLog({ ...timeoutLog, manual: true }), false);
  assert.equal(isNeedsCheckLog(null), false);
  assert.equal(isNeedsCheckLog(undefined), false);
});

test("Perlu dicek hanya untuk lamaran ready dengan percobaan agen miliknya", () => {
  assert.equal(isNeedsCheckApplication({ status: "ready" }, timeoutLog, true), true);
  assert.equal(isNeedsCheckApplication({ status: "ready" }, timeoutLog, false), false, "log milik draf lama");
  for (const status of ["draft", "submitted", "follow_up", "responded", "closed"]) {
    assert.equal(isNeedsCheckApplication({ status }, timeoutLog, true), false, status);
  }
  assert.equal(isNeedsCheckApplication(null, timeoutLog, true), false);
});

test("papan: kartu Perlu dicek ikut kolom follow_up, kartu lain tetap di kolom statusnya", () => {
  const rows = [
    { id: "a", status: "ready", check: true },
    { id: "b", status: "ready", check: false },
    { id: "c", status: "follow_up", check: false },
    { id: "d", status: "submitted", check: false },
    { id: "e", status: "draft", check: false },
  ];
  const board = groupForBoard(rows, (r) => r.check);
  assert.deepEqual(board.ready.map((r) => r.id), ["b"]);
  assert.deepEqual(board.follow_up.map((r) => r.id), ["c", "a"]);
  assert.deepEqual(board.submitted.map((r) => r.id), ["d"]);
  assert.deepEqual(board.draft.map((r) => r.id), ["e"]);
  assert.equal(NEEDS_CHECK_BOARD_COLUMN, "follow_up");
  // Tanpa kartu Perlu dicek, papan sama persis dengan groupByStatus yang dipakai Beranda.
  assert.deepEqual(groupForBoard(rows, () => false), groupByStatus(rows));
  assert.deepEqual(groupForBoard(null, () => true), groupByStatus(null));
  assert.equal(boardColumnOf("ready", true), "follow_up");
  assert.equal(boardColumnOf("ready", false), "ready");
  assert.equal(boardColumnOf("submitted", true), "submitted");
});

test("Perlu dicek tidak dihitung terkirim: status di database tetap ready, hitungan Beranda tidak berubah", () => {
  const apps = [{ status: "ready", submitted_at: null }];
  assert.equal(isApplicationSent(apps[0]), false);
  const stats = summarizeApplications(apps as any);
  assert.equal(stats.sent, 0);
  assert.equal(stats.followUp, 0);
  // Pengguna juga tidak bisa memindahkannya ke Terkirim (keputusan 25 November 2026 tidak diubah).
  assert.equal(dropIntoSubmittedBlocked("ready", "submitted"), true);
});

test("teks: langkah berikutnya jelas (email, kode di halaman situs, kirim sendiri) dan tidak menulis belum terkirim", () => {
  assert.equal(NEEDS_CHECK_LABEL, "Perlu dicek");
  assert.equal(NEEDS_CHECK_STEPS.length, 3);
  assert.match(NEEDS_CHECK_STEPS[0], /email/i);
  assert.match(NEEDS_CHECK_STEPS[0], /kode keamanan/);
  assert.match(NEEDS_CHECK_STEPS[1], /formulir lowongan/);
  assert.match(NEEDS_CHECK_STEPS[1], /halaman situs/);
  assert.match(NEEDS_CHECK_STEPS[1], /kirim lamarannya sendiri/);
  assert.match(NEEDS_CHECK_STEPS[1], /Jalankan agen lagi/);
  // Tidak menjanjikan tombol "Sudah terkirim": tombol itu dihapus (25 November 2026) dan Terkirim hanya diisi agen atau email.
  assert.match(NEEDS_CHECK_STEPS[2], /Terkirim di Applify hanya diisi oleh agen atau email/);
  for (const text of [NEEDS_CHECK_HEADING, NEEDS_CHECK_INTRO, ...NEEDS_CHECK_STEPS, AGENT_CODE_TIMEOUT_HINT, AGENT_CODE_REJECTED_HINT]) {
    assert.doesNotMatch(text, /belum terkirim/i, text);
  }
  const timeout = describeLogOutcome({ ...timeoutLog, approval_request_id: "a" } as any);
  const rejected = describeLogOutcome({ ...rejectedLog, approval_request_id: "a" } as any);
  assert.match(timeout?.label ?? "", /^Perlu dicek/);
  assert.match(rejected?.label ?? "", /^Perlu dicek/);
});

test("papan Lamaran Saya memakai groupForBoard dan tidak menulis status follow_up untuk kartu Perlu dicek", () => {
  const page = read("../src/routes/applications.tsx");
  assert.match(page, /groupForBoard\(/);
  assert.match(page, /data-testid="needs-check-badge"/);
  assert.match(page, /data-testid="needs-check-panel"/);
  // Dijatuhkan di kolom Perlu tindak lanjut dan dipilih di Ubah status: dua jalan yang mengubah status asli dijaga.
  assert.match(page, /move\.status === NEEDS_CHECK_BOARD_COLUMN && needsCheckFor\(dragged\)\) return/);
  assert.match(page, /selectedNeedsCheck && s === NEEDS_CHECK_BOARD_COLUMN/);
  // Hitungan terkirim memakai status asli (groupedApps), bukan kolom papan.
  assert.match(page, /const groupedApps: Record<ApplicationStatus, AIApplicationData\[\]> = groupByStatus\(applications\)/);
});

test("worker: tunggu kode yang berakhir tidak memindahkan lamaran ke follow_up (rank maju saja dan dihitung terkirim)", (t) => {
  const worker = join(here, "..", "..", "worker", "src", "lib", "applyOutcome.ts");
  if (!existsSync(worker)) return t.skip("repo worker tidak ada di samping frontend");
  const src = readFileSync(worker, "utf8");
  assert.match(src, /if \(outcome === "ready" \|\| outcome === "submit_unverified"\) return "ready"/);
  assert.match(src, /perlu dicek\. \$\{CODE_NEEDS_CHECK_STEP\}/);
  assert.doesNotMatch(src, /belum terkirim\. Jalankan agen lagi untuk meminta kode baru/);
});
