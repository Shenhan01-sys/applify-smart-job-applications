import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gapsByJob, latestFormGaps, MAX_GAP_ITEMS, MAX_GAP_LABEL_LENGTH } from "../src/lib/formGaps.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const T1 = "2026-11-19T08:00:00.000Z";
const T2 = "2026-11-19T09:00:00.000Z";
const T3 = "2026-11-19T10:00:00.000Z";

const row = (over: Record<string, unknown> = {}) => ({
  job_id: "job-1",
  status: "ready",
  created_at: T2,
  details: { remaining_required: ["Phone"], fields_by_kind: { text: 5, upload: 1 } },
  ...over,
});

test("baris terbaru untuk lowongan itu yang dipakai, tidak peduli urutan di daftar", () => {
  const older = row({ created_at: T1, details: { remaining_required: ["Lama"] } });
  const newer = row({ created_at: T3, details: { remaining_required: ["Baru"] } });
  assert.deepEqual(latestFormGaps([older, newer], "job-1")?.remaining, ["Baru"]);
  assert.deepEqual(latestFormGaps([newer, older], "job-1")?.remaining, ["Baru"]);
  assert.equal(latestFormGaps([older, newer], "job-1")?.at, T3);
});

test("percobaan terbaru yang sudah terkirim atau gagal membuat kekurangan lama tidak ditampilkan lagi", () => {
  const oldReady = row({ created_at: T1, details: { remaining_required: ["Phone"] } });
  for (const status of ["submitted", "success", "failed", "error", "", null, undefined]) {
    assert.equal(latestFormGaps([oldReady, row({ created_at: T3, status, details: { remaining_required: ["Phone"] } })], "job-1"), null, String(status));
  }
  // percobaan ready yang lebih baru dari yang gagal tetap tampil
  const failedBefore = row({ created_at: T1, status: "failed" });
  assert.deepEqual(latestFormGaps([failedBefore, row({ created_at: T3 })], "job-1")?.remaining, ["Phone"]);
});

test("baris lowongan lain diabaikan, juga bila lebih baru", () => {
  const other = row({ job_id: "job-2", created_at: T3, status: "submitted" });
  assert.deepEqual(latestFormGaps([other, row({ created_at: T1 })], "job-1")?.remaining, ["Phone"]);
  assert.equal(latestFormGaps([other], "job-1"), null);
  assert.equal(latestFormGaps([row()], "job-3"), null);
});

test("masukan rusak tidak melempar: bukan array, baris bukan objek, tanggal rusak, details rusak", () => {
  for (const v of [null, undefined, {}, "x", 5, true]) assert.equal(latestFormGaps(v, "job-1"), null);
  for (const id of ["", null, undefined, 5] as unknown[]) assert.equal(latestFormGaps([row()], id as string), null);
  assert.equal(latestFormGaps([null, 3, "x", [], {}, { job_id: "job-1" }], "job-1"), null);
  // tanggal rusak atau bukan teks: baris diabaikan, jadi baris ready yang sah di bawahnya yang dipakai
  const good = row({ created_at: T1 });
  for (const bad of ["bukan tanggal", "", null, undefined, 12345, {}]) {
    assert.equal(latestFormGaps([row({ created_at: bad, status: "submitted" }), good], "job-1")?.at, T1, String(bad));
  }
  // details rusak
  for (const details of [null, undefined, "teks", 5, [], [1, 2], {}, { remaining_required: "Phone" }, { remaining_required: {} }, { remaining_required: [] }, { remaining_required: [1, null, {}, ""] }]) {
    assert.equal(latestFormGaps([row({ details })], "job-1"), null, JSON.stringify(details));
  }
});

test("label dirapikan: dipangkas, yang kosong atau bukan teks dibuang, kembar dibuang, urutan asli dijaga", () => {
  const r = latestFormGaps([row({ details: { remaining_required: ["  Phone  ", "", "   ", 7, null, "City", "Phone", "City ", "Email"] } })], "job-1");
  assert.deepEqual(r?.remaining, ["Phone", "City", "Email"]);
});

test("label dipotong 200 karakter dan daftar dibatasi 20 butir", () => {
  const long = "A".repeat(MAX_GAP_LABEL_LENGTH + 50);
  const r = latestFormGaps([row({ details: { remaining_required: [long] } })], "job-1");
  assert.equal(r?.remaining[0].length, MAX_GAP_LABEL_LENGTH);
  const many = Array.from({ length: 35 }, (_, i) => `Isian ${i + 1}`);
  const capped = latestFormGaps([row({ details: { remaining_required: many } })], "job-1");
  assert.equal(capped?.remaining.length, MAX_GAP_ITEMS);
  assert.equal(MAX_GAP_ITEMS, 20);
  assert.deepEqual(capped?.remaining.slice(0, 3), ["Isian 1", "Isian 2", "Isian 3"]);
  // butir kembar tidak memakan jatah 20
  const dup = [...many.slice(0, 5), ...many.slice(0, 5), ...many.slice(5)];
  assert.equal(latestFormGaps([row({ details: { remaining_required: dup } })], "job-1")?.remaining.length, 20);
});

test("cvAttached: upload > 0 true, 0 false, tidak tercatat atau rusak null", () => {
  const withKinds = (fields_by_kind: unknown) => latestFormGaps([row({ details: { remaining_required: ["Phone"], fields_by_kind } })], "job-1");
  assert.equal(withKinds({ upload: 1 })?.cvAttached, true);
  assert.equal(withKinds({ upload: 3 })?.cvAttached, true);
  assert.equal(withKinds({ upload: 0 })?.cvAttached, false);
  assert.equal(withKinds({ text: 5 })?.cvAttached, null, "log lama tanpa kunci upload");
  assert.equal(withKinds(undefined)?.cvAttached, null, "log lama tanpa fields_by_kind");
  for (const bad of [null, "x", 5, [], { upload: "1" }, { upload: null }, { upload: NaN }, { upload: -1 }]) {
    assert.equal(withKinds(bad)?.cvAttached, null, JSON.stringify(bad));
  }
});

test("contoh log nyata: 4 isian kosong, 1 berkas diunggah", () => {
  const real = row({
    details: {
      note: "form terisi; tombol kirim tidak ditekan (ALLOW_REAL_SUBMIT=false)",
      fields_filled: 15,
      fields_by_kind: { text: 5, check: 1, select: 8, upload: 1 },
      remaining_required: [
        "Phone",
        "Are you currently authorized to work in the U.S.?",
        "Are you a person of transgender experience?",
        "What sexual orientation do you most closely identify with?",
      ],
      resume: "CV diunduh (pdf, 630 byte)",
    },
  });
  const r = latestFormGaps([real], "job-1");
  assert.equal(r?.remaining.length, 4);
  assert.equal(r?.cvAttached, true);
  assert.equal(r?.at, T2);
});

test("gapsByJob: hanya lowongan dengan kekurangan yang masuk; id rusak dan kembar tidak melempar", () => {
  const rows = [
    row({ job_id: "a", created_at: T1 }),
    row({ job_id: "a", created_at: T3, status: "submitted" }),
    row({ job_id: "b", created_at: T2, details: { remaining_required: ["City"], fields_by_kind: { upload: 0 } } }),
    row({ job_id: "c", created_at: T2, details: { remaining_required: [] } }),
  ];
  const out = gapsByJob(rows, ["a", "b", "c", "d", "b", "", null, 7]);
  assert.deepEqual(Object.keys(out), ["b"]);
  assert.deepEqual(out.b, { remaining: ["City"], at: T2, cvAttached: false, reason: null, fieldsFilled: null });
  assert.deepEqual(gapsByJob(rows, null), {});
  assert.deepEqual(gapsByJob(null, ["a"]), {});
  assert.deepEqual(gapsByJob([], []), {});
});

// ---- kabel antarmuka -------------------------------------------------------------------------------

test("formGaps.ts murni: tanpa impor, supaya jalan di node --test", () => {
  assert.doesNotMatch(read("../src/lib/formGaps.ts"), /^\s*import\s/m);
});

test("service getApplyState/getFormGaps: membaca application_logs milik pengguna, action apply, per job_id, terbaru dulu, galat dilempar, mode demo kosong", () => {
  const svc = read("../src/services/formGapService.ts");
  assert.match(svc, /export async function getFormGaps\(jobIds: string\[\]\)/);
  assert.match(svc, /export async function getApplyState\(jobIds: string\[\]\)/);
  assert.match(svc, /\.from\("application_logs"\)/);
  assert.match(svc, /\.select\("job_id,status,created_at,details"\)/);
  assert.match(svc, /\.eq\("user_id", user\.id\)/);
  assert.match(svc, /\.eq\("action", "apply"\)/);
  assert.match(svc, /\.in\("job_id", ids\)/);
  assert.match(svc, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(svc, /\.limit\(500\)/);
  assert.match(svc, /if \(error\) throw error/);
  assert.match(svc, /import \{ isMockMode \} from "@\/lib\/appConfig"/);
  assert.match(svc, /if \(isMockMode\(\) \|\| ids\.length === 0\) return \{ gaps: \{\}, attempts: \{\} \}/);
  // satu kueri untuk kekurangan dan percobaan terbaru
  assert.equal([...svc.matchAll(/\.from\("application_logs"\)/g)].length, 1);
  // pencocokan lewat job_id (application_id di baris log kosong), bukan application_id
  assert.doesNotMatch(svc, /\.eq\("application_id"/);
});

test("Lamaran Saya: hasil percobaan dimuat tanpa memblokir, untuk lamaran draf dan ready, gagal hanya console.warn", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /import \{ getApplyState \} from "@\/services\/formGapService"/);
  assert.match(src, /canRequestApproval\(a\.status\) && a\.job_id/);
  const effect = src.slice(src.indexOf("getApplyState(agentJobKey"), src.indexOf("}, [agentJobKey, applyReloads]);"));
  assert.match(effect, /\.catch\(\(err\) => \{\s*console\.warn\(/);
  assert.doesNotMatch(effect, /toast|setLoadError/);
  // pemuatan lamaran sendiri tidak menunggu kekurangan
  const load = src.slice(src.indexOf("const loadApplications"), src.indexOf("}, [loadApplications]);"));
  assert.doesNotMatch(load, /getApplyState|getFormGaps/);
});

test("Lamaran Saya: lencana 'Perlu dilengkapi' ada di kartu Kanban dan baris daftar, hanya untuk ready dengan kekurangan", () => {
  const src = read("../src/routes/applications.tsx");
  const badge = src.slice(src.indexOf("function FormGapBadge"), src.indexOf("function DraggableKanbanCard"));
  assert.match(badge, /Perlu dilengkapi/);
  assert.match(badge, /isian wajib masih kosong/);
  assert.match(badge, /title=\{detail\}/);
  const card = src.slice(src.indexOf("function DraggableKanbanCard"), src.indexOf("function DroppableColumn"));
  assert.match(card, /gaps\?: FormGaps/);
  assert.match(card, /app\.status === "ready" && gaps && \(\s*<div className="mt-2">\s*<FormGapBadge gaps=\{gaps\} \/>/);
  const row = src.slice(src.indexOf("function AppListRow"), src.indexOf("export function AppsPage"));
  assert.match(row, /gaps\?: FormGaps/);
  assert.match(row, /app\.status === "ready" && gaps && \(\s*<span[^>]*>\s*<FormGapBadge gaps=\{gaps\} \/>/);
  // semua tempat yang menampilkan kartu atau baris meneruskan kekurangan per job_id
  assert.equal(src.split("gaps={formGaps[app.job_id]}").length - 1, 3, "kartu Kanban, daftar layar sempit, daftar");
});

test("Lamaran Saya: jendela detail ready memuat daftar bernomor <ol> isian kosong, tautan ke Profil Saya dan Pengaturan Agen, dan CV belum terlampir", () => {
  const src = read("../src/routes/applications.tsx");
  const box = src.slice(src.indexOf("Draf ini sudah menunggu persetujuanmu"), src.indexOf('approvalUi.state === "unknown"'));
  // teks lama dan tombol lama tetap
  assert.match(box, /Agen sudah membuka formulir lowongan ini dan berhenti sebelum tombol kirim\. Kirim sendiri di situs lowongan, atau lengkapi dulu data yang kurang lalu ajukan lagi supaya agen mengisi ulang\./);
  assert.match(src, /"Ajukan lagi ke Persetujuan"/);
  // kekurangan: judul, <ol> (bukan <ul>), label sebagai teks biasa, tautan
  assert.match(src, /const selectedGaps = selectedApp && selectedApp\.status === "ready" \? formGaps\[selectedApp\.job_id\] : undefined/);
  assert.match(box, /\{selectedGaps && \(/);
  assert.match(box, /Isian wajib yang masih kosong saat agen berhenti:/);
  assert.match(box, /<ol [^>]*list-decimal[^>]*>\s*\{selectedGaps\.remaining\.map\(\(label, i\) => <li key=\{i\}>\{label\}<\/li>\)\}\s*<\/ol>/);
  assert.doesNotMatch(box, /<ul/);
  assert.doesNotMatch(box, /dangerouslySetInnerHTML/);
  assert.match(box, /<Link to="\/profile"[^>]*>Profil Saya<\/Link>/);
  assert.match(box, /<Link to="\/automation-settings"[^>]*>Pengaturan Agen<\/Link>, lalu ajukan lagi\./);
  assert.match(box, /Lengkapi datanya di /);
  assert.match(box, /selectedGaps\.cvAttached === false && \(\s*<p>\s*CV belum terlampir\. Unggah CV di <Link to="\/profile"/);
  // kekurangan hanya terlihat di dalam jendela Persetujuan (cabang selain pending)
  assert.ok(src.indexOf("{selectedGaps && (") > src.indexOf("canRequestApproval(selectedApp.status) && ("));
});

test("modal AI Apply: draf yang sudah ready memakai label 'Ajukan lagi ke Persetujuan' dan satu baris penjelasan di atas tombol", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  assert.match(src, /application\?\.status === "ready" \? "Ajukan lagi ke Persetujuan" : "Ajukan ke Persetujuan"/);
  const footer = src.slice(src.indexOf("{/* Footer Actions */}"));
  const hintAt = footer.indexOf("Agen sudah pernah mengisi formulir ini tanpa mengirim. Mengajukan lagi membuat agen mengisi ulang.");
  assert.ok(hintAt > 0, "baris penjelasan ada di footer");
  assert.match(footer.slice(Math.max(0, hintAt - 300), hintAt), /editable && !approvalId && application\?\.status === "ready"/);
  assert.ok(hintAt < footer.indexOf("onClick={handleRequestApproval}"), "baris penjelasan di atas tombol ajukan");
});
