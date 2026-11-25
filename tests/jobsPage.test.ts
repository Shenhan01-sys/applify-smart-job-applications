import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("router: layar error dan 404 berbahasa Indonesia terpasang di router aplikasi", () => {
  const main = read("../src/main.tsx");
  assert.match(main, /defaultErrorComponent: DefaultErrorComponent/);
  assert.match(main, /defaultNotFoundComponent: DefaultNotFoundComponent/);
  const fallbacks = read("../src/components/RouterFallbacks.tsx");
  assert.match(fallbacks, /Terjadi kesalahan/);
  assert.match(fallbacks, /Coba lagi/);
  assert.match(fallbacks, /Ke beranda/);
  assert.doesNotMatch(fallbacks, /Something went wrong|Try again|Go home/);
  assert.doesNotMatch(read("../src/router.tsx"), /Something went wrong|Try again|Go home/);
});

test("jobs: tombol Filter yang diam dihapus, pencarian berlabel, penyaring memberi tahu statusnya", () => {
  const src = read("../src/routes/jobs.tsx");
  assert.doesNotMatch(src, /SlidersHorizontal/);
  assert.match(src, /htmlFor="cari-lowongan"/);
  assert.match(src, /id="cari-lowongan"/);
  assert.match(src, /aria-pressed=\{activeFilter === filter\.key\}/);
  assert.doesNotMatch(src, /Job Feed|AI Job Discovery|\bFREE\b|\bPRO\b/);
});

test("jobs: simpan lowongan memeriksa error database dan memberi toast, tidak diam", () => {
  const src = read("../src/routes/jobs.tsx");
  const fn = src.slice(src.indexOf("const toggleSaveJob"), src.indexOf("const handleApply"));
  assert.match(fn, /const \{ error \} = await supabase\.from\("saved_jobs"\)\.delete\(\)/);
  assert.match(fn, /const \{ error \} = await supabase\.from\("saved_jobs"\)\.insert/);
  assert.equal([...fn.matchAll(/if \(error\) throw error/g)].length, 2);
  assert.match(fn, /toast\.error\(describeError/);
  // status layar baru berubah setelah database berhasil, bukan sebelumnya
  assert.ok(fn.indexOf("if (error) throw error") < fn.indexOf("setSavedJobs((prev) => new Set(prev).add(jobId))"));
});

test("jobs: kuota dari database lewat useSubscription, tidak membaca tier dari penyimpanan browser", () => {
  const src = read("../src/routes/jobs.tsx");
  assert.match(src, /useSubscription/);
  assert.doesNotMatch(src, /localStorage|ai_model_tier/);
  assert.match(src, /direset bulan depan/);
});

test("jobs: gagal memuat tampil sebagai ErrorState dengan Coba lagi, bukan daftar kosong", () => {
  const src = read("../src/routes/jobs.tsx");
  assert.match(src, /<ErrorState/);
  assert.match(src, /onRetry=/);
});

test("pemindai lowongan: toast Indonesia, pencarian gagal tidak ditulis sebagai nol hasil", () => {
  const src = read("../src/components/AIJobScanner.tsx");
  assert.doesNotMatch(src, /Please select|Scanning failed|v2\.1/);
  assert.match(src, /Pilih minimal satu situs/);
  assert.match(src, /if \(failed\)/);
  assert.match(src, /aria-pressed=/);
  assert.match(src, /role="progressbar"/);
  const hook = read("../src/hooks/useAutomation.ts");
  assert.match(hook, /failed: true/);
});

test("JobCard: tombol ikon punya nama untuk pembaca layar dan target sentuh 44px", () => {
  const src = read("../src/components/JobCard.tsx");
  assert.match(src, /aria-label=\{isSaved \?/);
  assert.match(src, /aria-pressed=\{isSaved\}/);
  assert.match(src, /aria-label=\{`Buka lowongan/);
  assert.match(src, /aria-expanded=\{expanded\}/);
  assert.match(src, /role="img" aria-label=\{`Grafik radar/);
  assert.doesNotMatch(src, /text-\[8px\]|fontSize: 8\b/);
  assert.doesNotMatch(src, /h-9 w-9|h-10 w-10/);
});

test("jobs: subjudul daftar tidak memakai kata tersimpan, yang dipakai saringan Tersimpan (temuan 19)", () => {
  const src = read("../src/routes/jobs.tsx");
  assert.match(src, /lowongan ditemukan dari sumber yang didukung/);
  assert.doesNotMatch(src, /lowongan tersimpan dari sumber/);
});

test("waitinglist: tanpa janji bonus atau kuota karangan, label terhubung ke kolom, popup landing dipertahankan", () => {
  const src = read("../src/routes/waitinglist.tsx");
  assert.doesNotMatch(src, /bonus 1 bulan|Tidak ada spam|500 pendaftar|Submit & Lanjut/);
  assert.match(src, /htmlFor=\{id\}/);
  assert.match(src, /role="radiogroup"/);
  // WaitinglistPopup dipulihkan bersama landing page desain asli (keputusan Hans 2026-11-19).
});

test("UX Wave 2: beranda ke mode daftar, kampus tidak ke payment, dan JobCard menampilkan detail lowongan", () => {
  const landing = read("../src/routes/index.tsx");
  assert.doesNotMatch(landing, /margin kontribusi Pro 91%|href="#"/);
  assert.match(landing, /search=\{authLink === "\/login" \? \{ mode: "daftar" \} : undefined\}/);

  const sub = read("../src/routes/subscription.tsx");
  assert.match(sub, /if \(tier === "kampus"\) \{\s*setKampusOpen\(true\)/);
  assert.doesNotMatch(sub, /margin kontribusi Pro 91%/);

  const success = read("../src/routes/payment.success.tsx");
  assert.doesNotMatch(success, /tab <span[^>]*>Applications<\/span>|dikirim lewat Telegram/);

  const login = read("../src/routes/login.tsx");
  assert.match(login, /role="tablist"/);
  assert.match(login, /supabase\.auth\.resend\(/);

  const reset = read("../src/routes/reset-password.tsx");
  assert.match(reset, /showPassword/);
  assert.match(reset, /to="\/dashboard"/);

  const card = read("../src/components/JobCard.tsx");
  assert.match(card, /Deskripsi Pekerjaan/);
  assert.match(card, /Cocok \(perkiraan\)/);
  assert.match(card, /Lihat semua persyaratan/);

  const jobs = read("../src/routes/jobs.tsx");
  assert.match(jobs, /validateSearch:/);
  assert.match(jobs, /Memperbarui daftar lowongan\.\.\./);

  const scanner = read("../src/components/AIJobScanner.tsx");
  assert.match(scanner, /Portal Karir/);
  assert.match(scanner, /Situs Karir Perusahaan \(ATS\)/);
  assert.match(scanner, /prev\.filter\(\(s\) => s\.type === 'error'\)/);
});
