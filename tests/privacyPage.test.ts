import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_UPDATED } from "../src/lib/privacyContent.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const allText = [PRIVACY_INTRO, ...PRIVACY_SECTIONS.flatMap((s) => [s.title, ...(s.paragraphs ?? []), ...(s.items ?? [])])].join("\n");

test("kontak peneliti: Ketentuan dan Privasi memakai email yang sama, tanpa penanda data kosong", () => {
  const terms = read("../src/routes/terms.tsx");
  assert.doesNotMatch(terms, /MENUNGGU DATA/);
  assert.match(terms, /RESEARCHER_EMAIL/);
  assert.match(allText, /hansgunawan775@gmail\.com/);
});

test("kebijakan privasi: tanggal pembaruan 21 November 2026 dan tampil di halaman", () => {
  assert.equal(PRIVACY_UPDATED, "21 November 2026");
  assert.match(read("../src/routes/privacy.tsx"), /\{PRIVACY_UPDATED\}/);
});

test("kebijakan privasi: rute publik tanpa pemeriksaan login dan tanpa AppShell", () => {
  const src = read("../src/routes/privacy.tsx").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /createFileRoute\("\/privacy"\)/);
  assert.doesNotMatch(src, /beforeLoad|redirect\(|AppShell|supabase/);
  assert.match(read("../src/routeTree.gen.ts"), /'\/privacy': typeof PrivacyRoute/);
});

test("kebijakan privasi: menyebut data, penyimpanan, pihak ketiga, persetujuan, saklar kirim, dan penghapusan", () => {
  for (const kata of [
    "Supabase", "Vercel", "Railway", "Gemini", "Claude", "OpenRouter", "Groq", "Telegram",
    "Google", "LinkedIn", "CV", "PDF LinkedIn", "Persetujuan", "ALLOW_REAL_SUBMIT", "skripsi", "Sistem Informasi", "Universitas Kristen Duta Wacana",
  ]) {
    assert.ok(allText.includes(kata), `kata tidak ada: ${kata}`);
  }
  assert.ok(PRIVACY_SECTIONS.some((s) => s.id === "hapus-data"));
  assert.match(allText, /belum punya tombol hapus akun/);
});

test("kebijakan privasi: satu-satunya alamat email adalah kontak peneliti, dan tidak ada penanda data kosong di halaman", () => {
  const emails = allText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
  assert.deepEqual([...new Set(emails)], ["hansgunawan775@gmail.com"]);
  assert.doesNotMatch(allText, /MENUNGGU DATA/);
});

test("kebijakan privasi: penyedia model AI di kebijakan dan di halaman ketentuan sama-sama lengkap", () => {
  const terms = read("../src/routes/terms.tsx");
  assert.match(terms, /Google Gemini, Anthropic Claude, OpenRouter, dan Groq/);
  assert.match(terms, /to="\/privacy"/);
  // Penyedia yang dipanggil di kode (Edge Function) tercantum di kebijakan.
  const providers = read("../supabase/functions/_shared/providers.ts");
  for (const [kode, nama] of [["openrouter", "OpenRouter"], ["gemini", "Gemini"], ["anthropic", "Claude"]] as const) {
    assert.match(providers, new RegExp(`${kode}:\\s*"https://`));
    assert.ok(allText.includes(nama));
  }
});

test("kebijakan privasi: ditautkan dari login, daftar tunggu, dan pengaturan", () => {
  for (const f of ["login", "waitinglist", "settings"]) {
    assert.match(read(`../src/routes/${f}.tsx`), /to="\/privacy"/, `${f}.tsx belum menautkan /privacy`);
  }
});
