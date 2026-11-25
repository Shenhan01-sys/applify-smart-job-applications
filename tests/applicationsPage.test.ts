import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Pemeriksaan kabel statis pada komponen React (suite ini tidak punya DOM): membaca teks sumbernya.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("Lamaran: tidak ada lamaran palsu di luar mode demo; galat jadi state galat dengan Coba lagi", () => {
  const src = read("../src/routes/applications.tsx");
  // data contoh hanya di cabang isMockMode()
  const uses = src.split("mockAIApplications").length - 1;
  assert.equal(uses, 2, "mockAIApplications: satu impor dan satu pemakaian di cabang mode demo");
  const mockBranch = src.slice(src.indexOf("if (isMockMode()) {"), src.indexOf("// Tanpa data contoh"));
  assert.match(mockBranch, /mockAIApplications/);
  assert.match(src, /<ErrorState[^>]*onRetry=\{loadApplications\}/);
  assert.match(src, /Belum ada lamaran/);
  assert.match(src, /to="\/jobs"/);
});

test("Lamaran: status berbahasa Indonesia, rollback seret memunculkan toast, daftar jadi awal di ponsel", () => {
  const src = read("../src/routes/applications.tsx");
  assert.doesNotMatch(src, /label: "(Draft|Ready|Submitted|Follow-up|Responded|Closed)"/);
  assert.match(src, /applicationStatusLabel/);
  // rollback: status dikembalikan DAN pengguna diberi tahu
  const rollback = src.slice(src.indexOf(".catch((err) => {\n      console.error(\"Gagal menyimpan status"));
  assert.match(rollback, /setApplications\(prev => prev\.map\(a => a\.id === appId \? \{ \.\.\.a, status: previousStatus \}/);
  assert.match(rollback.slice(0, 600), /toast\.error/);
  assert.match(src, /window\.innerWidth < 768 \? "list" : "kanban"/);
  // pilihan status lewat klik (alternatif seret)
  assert.match(src, /Ubah status/);
});

test("Lamaran: antrean agen terlihat dan jendela detail memakai Radix Dialog", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /<QueuePanel onApplyFinished=\{reloadAfterApply\} fieldsFilledByQueue=\{fieldsFilledByQueue\} \/>/);
  assert.match(src, /import \{ Dialog,/);
  assert.doesNotMatch(src, /fixed inset-0 z-50/);
  const panel = read("../src/components/QueuePanel.tsx");
  assert.match(panel, /automationQueue\.getQueue/);
  assert.match(panel, /queue(StatusLabel|DisplayLabel)/);
  assert.match(panel, /Coba lagi/);
  const queue = read("../src/services/automationQueue.ts");
  assert.match(queue, /async getQueue\(/);
  assert.match(queue, /async getStatusForJob\(/);
  assert.match(queue, /\.eq\("user_id", user\.id\)/);
  // janji di jendela AI Apply sama dengan tempatnya
  assert.match(read("../src/components/AIApplyModal.tsx"), /Antrean Agen/);
});

test("Persetujuan: label Indonesia dan galat tidak diganti data contoh", () => {
  const src = read("../src/routes/approvals.tsx");
  // label lencana datang dari placement (lib/approvalTabs.ts), bukan kode status mentah
  assert.match(src, /\{placement\.label\}/);
  assert.doesNotMatch(src, /\{request\.status\}/);
  assert.match(src, /<ErrorState/);
  assert.doesNotMatch(src, /toast\.error\('Gagal memuat approvals'\)/);
  const settings = read("../src/routes/automation-settings.tsx");
  assert.doesNotMatch(settings, /catch \(error\) \{[^}]*setSettings\(mockAutomationSettings\)/s);
});

test("temuan 31: panel Antrean Agen ada di bawah papan dan daftar, jadi muncul belakangan tidak menggeser papan", () => {
  const src = read("../src/routes/applications.tsx");
  const page = src.slice(src.indexOf("return (\n    <AppShell>\n      <header"));
  const header = page.indexOf("<header");
  const board = page.indexOf("key={viewKey}");
  const queue = page.indexOf("<QueuePanel");
  assert.ok(header >= 0 && board > header, "papan setelah header");
  assert.ok(queue > board, "panel antrean setelah papan dan daftar");
  assert.equal(src.split("<QueuePanel").length - 1, 1, "satu panel saja");
  // panel ada sesudah blok papan/galat, jadi tetap tampil walau daftar lamaran gagal dimuat
  assert.ok(queue > page.indexOf("{loadError ? ("));
  // jaraknya margin atas (di bawah papan), bukan margin bawah (yang dulu memisahkannya dari papan di bawahnya)
  const panel = read("../src/components/QueuePanel.tsx");
  assert.match(panel, /<section aria-labelledby="queue-heading" className="mt-6 /);
  assert.doesNotMatch(panel, /<section aria-labelledby="queue-heading" className="mb-6/);
});
