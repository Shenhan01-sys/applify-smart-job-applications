import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const landing = read("../src/routes/index.tsx");
const popup = read("../src/components/WaitinglistPopup.tsx");
const subscription = read("../src/routes/subscription.tsx");
const plans = read("../src/lib/planInfo.ts");

test("beranda tidak memuat angka statistik atau fitur kampus yang tidak didukung", () => {
  for (const claim of [
    /12[.,]?400\+?/i,
    /100\+\s*(pengguna|mahasiswa|lamaran)/i,
    /75%\s*(ditolak|rejection|ats)/i,
    /91%\s*(margin|kontribusi)/i,
    /4x\s*(lebih|faster|cepat)/i,
    /Auto-Sync Interview/i,
    /Blind Merit/i,
    /dashboard karier kampus/i,
    /pelaporan penempatan kerja/i,
    /co-branding kampus/i,
    /Collective Intelligence/i,
  ]) {
    assert.doesNotMatch(landing, claim);
    assert.doesNotMatch(subscription, claim);
  }
});

test("hero dan cara kerja menjelaskan persetujuan dan ketiga jalur pengiriman", () => {
  assert.match(landing, /Tidak ada lamaran yang dikirim sebelum kamu menekan Setujui di halaman Persetujuan/);
  assert.ok(landing.includes("Untuk situs yang didukung seperti Greenhouse, Lever, Ashby, dan Workable, agen server mengisi dan mengirim lamaran setelah kamu menekan Setujui."));
  assert.match(landing, /JobStreet, Glints, Kalibrr, dan Dealls, Ekstensi Browser di laptop dengan Chrome atau Edge mengisi formulir lalu berhenti/);
  assert.match(landing, /Kamu yang menekan Kirim Sekarang di panel ekstensi/);
  assert.match(landing, /Setelah kamu menekan Setujui, lamaran dikirim lewat akun Gmail yang sudah kamu hubungkan/);
  assert.doesNotMatch(landing, /melamar otomatis 24\/7|kirim otomatis tanpa persetujuan/i);
});

test("popup menawarkan pendaftaran aktif tanpa janji prapeluncuran atau kuota", () => {
  assert.match(popup, /Pendaftaran Applify sudah dibuka/);
  assert.match(popup, /mode: "daftar"/);
  assert.doesNotMatch(popup, /pre-launch|early access|500 pendaftar|bonus 1 bulan/i);
});

test("paket hanya menyebut fitur yang ada atau jelas berstatus rencana", () => {
  assert.doesNotMatch(plans, /3 platform utama|Semua 7 platform|CV Optimization AI|Blind Merit Mode|Prioritas dukungan/i);
  assert.match(plans, /segera hadir/);
  assert.match(subscription, /Paket Kampus belum bisa diaktifkan melalui pembayaran mandiri/);
  assert.match(subscription, /bukan pesanan/);
  assert.doesNotMatch(subscription, /GoPay|OVO|DANA|QRIS|Midtrans/i);
  assert.doesNotMatch(subscription, /dashboard karier kampus|laporan penempatan|co-branding/i);
});
