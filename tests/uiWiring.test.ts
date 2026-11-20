import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Static wiring checks for fixes that live in React components (the suite has no DOM). They read the
// source text, as the other tests in this folder do.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("Toaster dipasang di rute akar: tanpa itu semua toast.success/toast.error tidak terlihat", () => {
  const root = read("../src/routes/__root.tsx");
  assert.match(root, /import \{ Toaster \} from "@\/components\/ui\/sonner"/);
  assert.match(root, /<Toaster\b/);
  // sanity: komponen memang memanggil toast (kalau ini berubah, tes ini perlu ditinjau)
  assert.match(read("../src/components/ApprovalReviewModal.tsx"), /toast\.(success|error)/);
});

test("Gerbang Persetujuan dapat digulir sampai jawaban formulir (bukan ScrollArea tanpa tinggi pasti)", () => {
  const src = readFileSync(new URL("../src/components/ApprovalReviewModal.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /<ScrollArea/);
  assert.match(src, /flex-1 min-h-0 overflow-y-auto/);
});

test("Lowongan: pemuatan ulang sesudah modal atau pemindai memakai kata kunci pencarian yang aktif", () => {
  const src = read("../src/routes/jobs.tsx");
  assert.doesNotMatch(src, /fetchJobs\(\)/, "fetchJobs() tanpa kata kunci mengosongkan hasil pencarian");
  assert.match(src, /onSuccess=\{\(\) => \{ fetchJobs\(searchQuery\)/);
});

test("Pemindai lowongan: Dealls bisa dipilih dan aktif bawaan, id sama dengan registri backend", () => {
  const src = read("../src/components/AIJobScanner.tsx");
  assert.match(src, /\{ name: 'Dealls', icon: '[^']+', id: 'dealls' \}/);
  assert.match(src, /DEFAULT_PLATFORMS = \[[^\]]*'dealls'/);
  const registry = read("../../backend/services/mcp-registry.ts");
  assert.match(registry, /this\.register\('dealls'/);
});

test("Lowongan: panel pencarian tidak menutup sendiri dan pesannya tetap terbaca sesudah selesai", () => {
  const jobs = read("../src/routes/jobs.tsx");
  assert.match(jobs, /<AIJobScanner onComplete=\{\(\) => fetchJobs\(searchQuery\)\} \/>/);
  assert.doesNotMatch(jobs, /onComplete=\{[^}]*setShowScanner\(false\)/);
  const scanner = read("../src/components/AIJobScanner.tsx");
  assert.match(scanner, /\(isScanning \|\| loading \|\| stages\.length > 0\)/);
  assert.doesNotMatch(scanner, /await sleep\(1000\)\s*\n\s*onComplete\(\)/);
});

test("Lowongan: judul halaman tidak menulis Mulai dengan menekan saat masih memuat, dan jujur soal batas 200", () => {
  const jobs = read("../src/routes/jobs.tsx");
  assert.match(jobs, /\{loading\s*\?\s*"Memuat lowongan\.\.\."/);
  assert.match(jobs, /Menampilkan \$\{JOBS_PAGE_LIMIT\} lowongan terbaru/);
});

test("Halaman masuk: tombol LinkedIn memakai provider linkedin_oidc dan kembali ke /auth/callback", () => {
  const src = read("../src/routes/login.tsx");
  assert.match(src, /provider: "linkedin_oidc"/);
  assert.match(src, /onClick=\{handleLinkedInAuth\}/);
  assert.match(src, /Masuk dengan LinkedIn/);
  const linkedIn = src.slice(src.indexOf("const handleLinkedInAuth"));
  assert.match(linkedIn, /redirectTo: window\.location\.origin \+ '\/auth\/callback'/);
});
