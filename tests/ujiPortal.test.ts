import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("Portal Uji: isian wajib, pesan validasi, dan halaman konfirmasi untuk detektor kirim worker", () => {
  const src = read("../src/routes/uji-portal.tsx");
  assert.match(src, /createFileRoute\("\/uji-portal"\)/);
  assert.match(src, /noindex, nofollow/);
  assert.match(src, /const REQUIRED: Array<keyof Fields> = \["nama", "email", "telepon", "surat", "setuju"\]/);
  assert.match(src, /"Wajib diisi\."/);
  // Kalimat yang dikenali classifySubmitResult di worker sebagai konfirmasi.
  assert.match(src, /Terima kasih telah melamar/);
  assert.match(src, /Lamaran Anda sudah kami terima/);
  // Tidak menyimpan atau mengirim data ke mana pun.
  assert.doesNotMatch(src, /supabase|fetch\(|apiFetch/);
  assert.match(src, /bukan lowongan sungguhan/);
});
