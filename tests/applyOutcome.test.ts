import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REASON_NO_FIELDS_FILLED,
  attemptForApplication,
  attemptsByJob,
  gapsByJob,
  latestApplyAttempt,
  latestFormGaps,
  needsFillYourself,
} from "../src/lib/formGaps.ts";
import {
  FILL_YOURSELF_LABEL,
  NO_FIELDS_FILLED_TEXT,
  QUEUE_NEEDS_MANUAL_LABEL,
  applyJobFinished,
  isQueueNeedsManual,
  queueDisplayLabel,
  queueStatusHint,
} from "../src/lib/statusLabels.ts";

// Worker (apply.ts + lib/applyOutcome.ts): apply yang mengisi 0 isian tidak memindahkan lamaran ke ready. Log
// bersatus "incomplete" dengan details.reason, details.fields_filled, details.application_status, dan
// details.queue_job_id. Layar membaca log itu.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const T1 = "2026-11-20T08:00:00.000Z";
const T2 = "2026-11-20T09:00:00.000Z";
const T3 = "2026-11-20T10:00:00.000Z";

const log = (over: Record<string, unknown> = {}, details: Record<string, unknown> = {}) => ({
  job_id: "job-1",
  status: "incomplete",
  created_at: T2,
  details: { reason: "partly_filled", fields_filled: 6, application_status: "ready", queue_job_id: "q-1", remaining_required: ["Phone", "City"], fields_by_kind: { text: 5, upload: 1 }, ...details },
  ...over,
});

// ---- latestFormGaps membaca baris incomplete ----

test("incomplete partly_filled: 'Perlu dilengkapi' juga muncul, dengan reason dan fields_filled", () => {
  const g = latestFormGaps([log()], "job-1");
  assert.deepEqual(g, { remaining: ["Phone", "City"], at: T2, cvAttached: true, reason: "partly_filled", fieldsFilled: 6 });
});

test("incomplete page_mismatch dan timeout dengan sebagian isian terisi tetap menampilkan kekurangan, reason diteruskan", () => {
  assert.equal(latestFormGaps([log({}, { reason: "page_mismatch", fields_filled: 2 })], "job-1")?.reason, "page_mismatch");
  assert.equal(latestFormGaps([log({}, { reason: "timeout", fields_filled: 3 })], "job-1")?.reason, "timeout");
});

test("incomplete no_fields_filled: tidak ada daftar kekurangan, walau remaining_required memuat semua isian wajib", () => {
  const row = log({}, { reason: REASON_NO_FIELDS_FILLED, fields_filled: 0, application_status: "unchanged", remaining_required: ["Nama", "Email", "Phone"] });
  assert.equal(latestFormGaps([row], "job-1"), null);
  assert.deepEqual(gapsByJob([row], ["job-1"]), {});
});

test("log incomplete lama (tanpa reason) dengan fields_filled 0 tidak memunculkan daftar kekurangan palsu", () => {
  const old = log({}, { reason: undefined, fields_filled: 0, remaining_required: ["Nama", "Email"] });
  assert.equal(latestFormGaps([old], "job-1"), null);
  // tanpa fields_filled sama sekali: tidak diketahui, daftar tetap ditampilkan seperti log ready
  const unknown = log({}, { reason: undefined, fields_filled: undefined });
  assert.deepEqual(latestFormGaps([unknown], "job-1")?.remaining, ["Phone", "City"]);
  assert.equal(latestFormGaps([unknown], "job-1")?.fieldsFilled, null);
});

test("baris ready tetap dibaca seperti dulu: reason null, fields_filled dari log", () => {
  const ready = { job_id: "job-1", status: "ready", created_at: T2, details: { remaining_required: ["Phone"], fields_filled: 15 } };
  assert.deepEqual(latestFormGaps([ready], "job-1"), { remaining: ["Phone"], at: T2, cvAttached: null, reason: null, fieldsFilled: 15 });
});

test("hanya baris terbaru yang dihitung: percobaan no_fields_filled yang lebih baru menutup kekurangan lama, dan sebaliknya", () => {
  const readyOld = { job_id: "job-1", status: "ready", created_at: T1, details: { remaining_required: ["Phone"], fields_filled: 9 } };
  const none = log({ created_at: T3 }, { reason: "no_fields_filled", fields_filled: 0 });
  assert.equal(latestFormGaps([readyOld, none], "job-1"), null);
  const partlyNew = log({ created_at: T3 });
  const noneOld = log({ created_at: T1 }, { reason: "no_fields_filled", fields_filled: 0 });
  assert.deepEqual(latestFormGaps([noneOld, partlyNew], "job-1")?.remaining, ["Phone", "City"]);
});

test("reason dan fields_filled rusak diabaikan, tidak melempar", () => {
  for (const reason of [5, null, "", "   ", {}, []]) assert.equal(latestFormGaps([log({}, { reason })], "job-1")?.reason, null, JSON.stringify(reason));
  for (const f of ["6", -1, NaN, null, {}, []]) assert.equal(latestFormGaps([log({}, { fields_filled: f })], "job-1")?.fieldsFilled, null, JSON.stringify(f));
  assert.equal(latestFormGaps([log({}, { fields_filled: 6.9 })], "job-1")?.fieldsFilled, 6);
  assert.equal(latestFormGaps([log({}, { reason: "x".repeat(100) })], "job-1")?.reason?.length, 40);
});

// ---- latestApplyAttempt dan needsFillYourself ----

test("latestApplyAttempt: percobaan terbaru dengan status, reason, fields_filled, application_status, queue_job_id", () => {
  const rows = [
    log({ created_at: T1 }, { reason: "partly_filled", queue_job_id: "q-old" }),
    log({ created_at: T3 }, { reason: "no_fields_filled", fields_filled: 0, application_status: "unchanged", queue_job_id: "q-9" }),
  ];
  assert.deepEqual(latestApplyAttempt(rows, "job-1"), {
    status: "incomplete", at: T3, reason: "no_fields_filled", fieldsFilled: 0, applicationStatus: "unchanged", queueJobId: "q-9",
  });
  assert.equal(latestApplyAttempt(rows, "job-2"), null);
  assert.equal(latestApplyAttempt(null, "job-1"), null);
  assert.equal(latestApplyAttempt(rows, ""), null);
});

test("latestApplyAttempt: log lama tanpa details tidak melempar dan semua kolom tambahan null", () => {
  const a = latestApplyAttempt([{ job_id: "job-1", status: "ready", created_at: T1, details: null }], "job-1");
  assert.deepEqual(a, { status: "ready", at: T1, reason: null, fieldsFilled: null, applicationStatus: null, queueJobId: null });
  assert.equal(latestApplyAttempt([{ job_id: "job-1", status: 5, created_at: T1 }], "job-1")?.status, "");
});

test("needsFillYourself: hanya status incomplete dengan reason no_fields_filled", () => {
  const rows = (status: string, reason: string | null, f = 0) => [{ job_id: "job-1", status, created_at: T1, details: { reason, fields_filled: f } }];
  assert.equal(needsFillYourself(latestApplyAttempt(rows("incomplete", "no_fields_filled"), "job-1")), true);
  for (const [s, r] of [["incomplete", "partly_filled"], ["incomplete", "page_mismatch"], ["incomplete", "timeout"], ["incomplete", null], ["ready", null], ["success", null], ["ready", "no_fields_filled"]] as const) {
    assert.equal(needsFillYourself(latestApplyAttempt(rows(s, r), "job-1")), false, `${s}/${r}`);
  }
  assert.equal(needsFillYourself(null), false);
  assert.equal(needsFillYourself(undefined), false);
});

test("attemptsByJob: satu entri per lowongan yang punya log; id rusak dan kembar tidak melempar", () => {
  const rows = [log({ job_id: "a" }), log({ job_id: "b", created_at: T3 }, { reason: "no_fields_filled", fields_filled: 0 })];
  const out = attemptsByJob(rows, ["a", "b", "c", "a", "", null, 3]);
  assert.deepEqual(Object.keys(out), ["a", "b"]);
  assert.equal(out.b.reason, "no_fields_filled");
  assert.deepEqual(attemptsByJob(rows, null), {});
});

// ---- statusLabels: petunjuk antrean dan deteksi tugas selesai ----

test("queueStatusHint apply selesai: 0 isian terisi berbeda dari yang berhasil mengisi", () => {
  const none = queueStatusHint("completed", "apply", null, 0);
  assert.equal(none, NO_FIELDS_FILLED_TEXT);
  assert.match(none, /belum berhasil mengisi/);
  assert.match(none, /meminta masuk/);
  assert.match(none, /belum terkirim/);
  assert.match(none, /Isi sendiri di situs lowongan, atau ajukan lagi/);
  assert.doesNotMatch(none, /sebelum tombol kirim/);
  for (const filled of [3, undefined, null]) {
    const hint = queueStatusHint("completed", "apply", null, filled as number | null | undefined);
    assert.match(hint, /sebelum tombol kirim/, String(filled));
    assert.doesNotMatch(hint, /belum berhasil mengisi/);
  }
  // hanya untuk tugas apply yang selesai
  assert.equal(queueStatusHint("completed", "search", null, 0), "Tugas selesai.");
  assert.match(queueStatusHint("failed", "apply", null, 0), /mencoba lagi/);
});

test("teks baru berbahasa Indonesia, tanpa tanda pisah panjang", () => {
  assert.equal(FILL_YOURSELF_LABEL, "Isi sendiri di situs");
  assert.doesNotMatch(FILL_YOURSELF_LABEL + NO_FIELDS_FILLED_TEXT, /[—–]/);
});

test("applyJobFinished: hanya tugas apply yang tadi berjalan dan kini selesai atau gagal", () => {
  const before = new Map([["a", "processing"], ["b", "pending"], ["c", "completed"], ["d", "processing"]]);
  const item = (id: string, status: string, job_type = "apply") => ({ id, status, job_type });
  assert.equal(applyJobFinished(before, [item("a", "completed")]), true);
  assert.equal(applyJobFinished(before, [item("b", "failed")]), true);
  assert.equal(applyJobFinished(before, [item("a", "processing")]), false, "masih berjalan");
  assert.equal(applyJobFinished(before, [item("b", "processing")]), false, "pending ke processing belum selesai");
  assert.equal(applyJobFinished(before, [item("c", "completed")]), false, "sudah selesai sejak tadi");
  assert.equal(applyJobFinished(before, [item("z", "completed")]), false, "belum pernah terlihat");
  assert.equal(applyJobFinished(before, [item("d", "completed", "search")]), false, "bukan tugas apply");
  assert.equal(applyJobFinished(new Map(), [item("a", "completed")]), false, "pemuatan pertama");
  assert.equal(applyJobFinished(before, []), false);
});

// ---- kabel antarmuka ----

test("QueuePanel: memanggil onApplyFinished saat tugas apply selesai, memakai pemuatan berkala yang ada, tanpa polling baru", () => {
  const src = read("../src/components/QueuePanel.tsx");
  assert.match(src, /onApplyFinished\?: \(\) => void/);
  assert.match(src, /const finished = applyJobFinished\(seen\.current, next\)/);
  assert.match(src, /seen\.current = new Map\(next\.map\(\(i\) => \[i\.id, i\.status\]\)\)/);
  assert.match(src, /if \(finished\) finishedRef\.current\?\.\(\)/);
  assert.equal([...src.matchAll(/setInterval\(/g)].length, 1, "satu polling saja, yang lama");
  assert.match(src, /const fieldsFilled = fieldsFilledByQueue\?\.\[q\.id\];/);
  assert.match(src, /queueStatusHint\(q\.status, q\.job_type, q\.error_message, fieldsFilled\)/);
});

test("Lamaran Saya: muat ulang diam-diam setelah tugas apply selesai, daftar lama dipertahankan bila gagal, log dibaca lagi sekali", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /<QueuePanel onApplyFinished=\{reloadAfterApply\}/);
  const fn = src.slice(src.indexOf("const reloadAfterApply"), src.indexOf("}, []);", src.indexOf("const reloadAfterApply")));
  assert.match(fn, /aiApplicationService\.getApplications\(\)/);
  assert.doesNotMatch(fn, /setLoading|setLoadError|setApplications\(\[\]\)/);
  assert.match(fn, /setSelectedApp\(\(prev\) => \(prev \? fresh\.find\(\(a\) => a\.id === prev\.id\) \?\? prev : prev\)\)/);
  assert.match(fn, /setApplyReloads\(\(n\) => n \+ 1\)/);
  assert.match(fn, /console\.warn\(/);
  // naiknya penghitung ada sesudah setApplications, dalam blok yang sama: satu render, satu kueri log
  assert.ok(fn.indexOf("setApplications(fresh)") < fn.indexOf("setApplyReloads"));
  assert.match(src, /\}, \[agentJobKey, applyReloads\]\);/);
});

test("Lamaran Saya: lencana 'Isi sendiri di situs' di kartu Kanban, baris daftar, dan jendela detail", () => {
  const src = read("../src/routes/applications.tsx");
  const badge = src.slice(src.indexOf("function FillYourselfBadge"), src.indexOf("function DraggableKanbanCard"));
  assert.match(badge, /FILL_YOURSELF_LABEL/);
  assert.match(badge, /title=\{NO_FIELDS_FILLED_TEXT\}/);
  assert.match(badge, /sr-only/);
  const card = src.slice(src.indexOf("function DraggableKanbanCard"), src.indexOf("function DroppableColumn"));
  assert.match(card, /\{fillYourself && \(\s*<div className="mt-2">\s*<FillYourselfBadge \/>/);
  const row = src.slice(src.indexOf("function AppListRow"), src.indexOf("export function AppsPage"));
  assert.match(row, /\{fillYourself && \(\s*<span[^>]*>\s*<FillYourselfBadge \/>/);
  assert.equal(src.split("fillYourself={fillYourselfFor(app)}").length - 1, 3, "kartu Kanban, daftar layar sempit, daftar");
  // hanya untuk lamaran yang belum dikirim
  assert.match(src, /const fillYourselfFor = \(app: AIApplicationData\) => canRequestApproval\(app\.status\) && needsFillYourself\(attemptOf\(app\)\)/);
  // detail: lencana di baris status dan penjelasan di kotak Persetujuan
  assert.match(src, /\{selectedFillYourself && <FillYourselfBadge \/>\}/);
  assert.match(src, /\{selectedFillYourself\s*\?[^]*?NO_FIELDS_FILLED_TEXT/);
});

test("Lamaran Saya: teks 'Agen sudah membuka formulir' hanya bila fields_filled > 0", () => {
  const src = read("../src/routes/applications.tsx");
  const text = "Agen sudah membuka formulir lowongan ini dan berhenti sebelum tombol kirim.";
  assert.equal(src.split(text).length - 1, 1, "satu tempat");
  const at = src.indexOf(text);
  const before = src.slice(Math.max(0, at - 700), at);
  assert.match(before, /\(selectedAttempt\?\.fieldsFilled \?\? 0\) > 0/);
  // cabang tanpa catatan tidak menyebut agen sudah membuka formulir
  assert.match(src, /belum ada catatan bahwa agen berhasil mengisi formulirnya/);
  // dan percobaan no_fields_filled didahulukan sebelum cabang ready
  assert.ok(src.indexOf("{selectedFillYourself\n") < at || src.indexOf("selectedFillYourself\n") < at);
});

test("Lamaran Saya: teks tampilan baru tanpa tanda pisah panjang", () => {
  const src = read("../src/routes/applications.tsx");
  const lines = src.split("\n").filter((l) => /FillYourself|belum ada catatan|selectedFillYourself/.test(l));
  for (const l of lines) assert.doesNotMatch(l, /—/);
});

// ---- temuan 33: percobaan agen hanya milik lamaran yang dibuat sebelum percobaan itu ----

const failedAttempt = () => latestApplyAttempt([log({ created_at: T2 }, { reason: "no_fields_filled", fields_filled: 0, application_status: "unchanged" })], "job-1");

test("attemptForApplication: percobaan sebelum lamaran dibuat bukan milik lamaran itu (draf baru tidak mewarisi kegagalan draf lama)", () => {
  const attempt = failedAttempt();
  assert.ok(attempt);
  assert.equal(needsFillYourself(attempt), true);
  // draf lama dibuat sebelum percobaan: percobaan miliknya
  assert.equal(attemptForApplication(attempt, { created_at: T1 }), attempt);
  // draf baru dibuat sesudah percobaan: bukan miliknya, jadi lencana tidak muncul
  assert.equal(attemptForApplication(attempt, { created_at: T3 }), undefined);
  assert.equal(needsFillYourself(attemptForApplication(attempt, { created_at: T3 })), false);
  // tepat pada waktu yang sama dihitung milik lamaran itu
  assert.equal(attemptForApplication(attempt, { created_at: T2 }), attempt);
});

test("attemptForApplication: format waktu Supabase dengan mikrodetik dan zona +00:00 terbaca", () => {
  const attempt = { ...failedAttempt()!, at: "2026-11-21T06:10:30.123456+00:00" };
  assert.equal(attemptForApplication(attempt, { created_at: "2026-11-21T06:10:29.999999+00:00" }), attempt);
  assert.equal(attemptForApplication(attempt, { created_at: "2026-11-21T06:10:30.500000+00:00" }), undefined);
  // zona waktu berbeda, instan yang sama
  assert.equal(attemptForApplication(attempt, { created_at: "2026-11-21T13:10:30.123456+07:00" }), attempt);
});

test("attemptForApplication: masukan kosong atau rusak tidak menghasilkan percobaan dan tidak melempar", () => {
  const attempt = failedAttempt()!;
  assert.equal(attemptForApplication(undefined, { created_at: T1 }), undefined);
  assert.equal(attemptForApplication(null, { created_at: T1 }), undefined);
  assert.equal(attemptForApplication(attempt, undefined), undefined);
  assert.equal(attemptForApplication(attempt, null), undefined);
  assert.equal(attemptForApplication(attempt, {}), undefined);
  assert.equal(attemptForApplication(attempt, { created_at: 5 }), undefined);
  assert.equal(attemptForApplication(attempt, { created_at: "bukan tanggal" }), undefined);
  assert.equal(attemptForApplication({ ...attempt, at: "rusak" }, { created_at: T1 }), undefined);
});

test("Lamaran Saya: lencana dan detail memakai percobaan yang dikaitkan dengan lamaran, bukan hasil per lowongan mentah", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /const attemptOf = \(app: AIApplicationData\) => attemptForApplication\(attempts\[app\.job_id\], app\);/);
  assert.match(src, /const selectedAttempt = selectedApp \? attemptOf\(selectedApp\) : undefined;/);
  // tidak ada pembacaan percobaan per lowongan yang melewati penjaga itu
  assert.equal(src.split("attempts[").length - 1, 1, "hanya di dalam attemptOf");
  // tidak ada petunjuk "belum mendukung situs" tanpa dasar data
  assert.doesNotMatch(src.replace(/^\s*\/\/.*$/gm, ""), /belum mendukung/i);
});

// ---- temuan 25: label tugas apply yang selesai tanpa mengisi apa pun ----

test("isQueueNeedsManual: hanya tugas apply completed dengan fields_filled 0", () => {
  assert.equal(isQueueNeedsManual("completed", "apply", 0), true);
  assert.equal(isQueueNeedsManual("completed", "apply", 3), false);
  assert.equal(isQueueNeedsManual("completed", "apply", null), false, "belum diketahui tetap Selesai");
  assert.equal(isQueueNeedsManual("completed", "apply", undefined), false);
  assert.equal(isQueueNeedsManual("completed", "search", 0), false, "bukan tugas apply");
  assert.equal(isQueueNeedsManual("completed", "email_apply", 0), false);
  assert.equal(isQueueNeedsManual("failed", "apply", 0), false);
  assert.equal(isQueueNeedsManual("processing", "apply", 0), false);
  assert.equal(isQueueNeedsManual(undefined, undefined, undefined), false);
});

test("queueDisplayLabel: 'Selesai' hanya bila agen tidak mengaku gagal mengisi; label sama dengan petunjuknya", () => {
  assert.equal(QUEUE_NEEDS_MANUAL_LABEL, "Perlu diisi sendiri");
  assert.equal(queueDisplayLabel("completed", null, "apply", 0), "Perlu diisi sendiri");
  assert.equal(queueDisplayLabel("completed", null, "apply", 4), "Selesai");
  assert.equal(queueDisplayLabel("completed", null, "apply", null), "Selesai");
  assert.equal(queueDisplayLabel("completed", null, "apply"), "Selesai");
  assert.equal(queueDisplayLabel("completed"), "Selesai", "pemanggilan lama dua argumen tidak berubah");
  assert.equal(queueDisplayLabel("completed", null, "search", 0), "Selesai");
  assert.equal(queueDisplayLabel("failed", "Job tidak punya tautan lowongan", "apply", 0), "Dilewati");
  assert.equal(queueDisplayLabel("failed", "x", "apply", 0), "Gagal");
  assert.equal(queueDisplayLabel("pending", null, "apply", 0), "Menunggu giliran");
  // label dan petunjuk memakai syarat yang sama: bila label bukan "Selesai", petunjuknya juga bukan petunjuk sukses
  for (const filled of [0, 2, null, undefined] as const) {
    const label = queueDisplayLabel("completed", null, "apply", filled);
    const hint = queueStatusHint("completed", "apply", null, filled);
    assert.equal(label === QUEUE_NEEDS_MANUAL_LABEL, hint === NO_FIELDS_FILLED_TEXT, String(filled));
  }
});

test("QueuePanel: tugas apply tanpa isian tampil kuning dengan ikon peringatan, bukan hijau", () => {
  const src = read("../src/components/QueuePanel.tsx");
  assert.match(src, /needs_manual: "bg-amber-100 text-amber-900 border-amber-300"/);
  assert.match(src, /status === "needs_manual"\) return <AlertCircle/);
  assert.match(src, /const shown = isQueueNeedsManual\(q\.status, q\.job_type, fieldsFilled\) \? "needs_manual" : q\.status;/);
  assert.match(src, /TONE\[shown\]/);
  assert.match(src, /<StatusIcon status=\{shown\} \/>/);
  assert.match(src, /queueDisplayLabel\(q\.status, q\.error_message, q\.job_type, fieldsFilled\)/);
  // warna hijau tetap hanya milik "completed" yang sungguh selesai
  assert.match(src, /completed: "bg-green-100 text-green-900 border-green-300"/);
});
