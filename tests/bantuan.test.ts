import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HELP_EXTENSION, HELP_FAQ, HELP_GLOSSARY, HELP_STEPS } from "../src/components/help/helpContent.ts";
import { HELP_NAV_ITEM, MOBILE_TAB_ITEMS, NAV_GROUPS, NAV_ITEMS, PAGE_LABELS } from "../src/lib/navItems.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const uiText = [
  ...HELP_STEPS.flatMap((s) => [s.title, s.detail]),
  HELP_EXTENSION.title,
  HELP_EXTENSION.intro,
  HELP_EXTENSION.use,
  HELP_EXTENSION.token,
  HELP_EXTENSION.stop,
  ...HELP_GLOSSARY.flatMap((g) => [g.term, g.meaning]),
  ...HELP_FAQ.flatMap((f) => [f.question, f.answer]),
].join("\n");

test("ON-07: lima langkah dan janji tidak mengirim sebelum Setujui", () => {
  assert.equal(HELP_STEPS.length, 5);
  for (const title of ["Lengkapi profil", "Unggah CV PDF", "Cari lowongan", "Buat draf lamaran dengan AI", "Periksa dan tekan Setujui"]) {
    assert.ok(HELP_STEPS.some((s) => s.title === title), `langkah tidak ada: ${title}`);
  }
  assert.match(HELP_STEPS[4]?.detail ?? "", /Tidak ada lamaran yang dikirim sebelum kamu menekan Setujui di halaman Persetujuan/);
});

test("ON-07: panduan ekstensi jujur dan anchor #ekstensi dipakai halaman lain", () => {
  for (const kata of ["Chrome", "Edge", "laptop", "HP", "JobStreet", "Glints", "Kalibrr", "Dealls", "token", "Pengaturan", "berhenti sebelum kirim"]) {
    assert.ok(uiText.includes(kata), `kata tidak ada: ${kata}`);
  }
  const page = read("../src/routes/bantuan.tsx");
  assert.match(page, /id="ekstensi"/);
  assert.match(page, /to="\/settings" hash="ekstensi"/);
});

test("ON-07: glosarium enam istilah, masing-masing satu kalimat", () => {
  assert.equal(HELP_GLOSSARY.length, 6);
  for (const term of ["ATS", "Ekstensi Browser", "Antrean", "Kuota draf", "Persetujuan", "Token ekstensi"]) {
    assert.ok(HELP_GLOSSARY.some((g) => g.term.includes(term)), `istilah tidak ada: ${term}`);
  }
  for (const g of HELP_GLOSSARY) assert.ok(g.meaning.length > 20 && g.meaning.length < 180);
});

test("ON-07: FAQ lima penyebab lamaran belum terkirim", () => {
  assert.equal(HELP_FAQ.length, 5);
  for (const kata of ["belum menekan Setujui", "menunggu giliran", "Greenhouse", "Ekstensi Browser", "Gmail terhubung"]) {
    assert.ok(uiText.includes(kata), `penyebab tidak ada: ${kata}`);
  }
});

test("ON-07: rute /bantuan publik dan terdaftar di router", () => {
  const src = read("../src/routes/bantuan.tsx").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /createFileRoute\("\/bantuan"\)/);
  assert.doesNotMatch(src, /beforeLoad|redirect\(|AppShell|supabase/);
  assert.match(read("../src/routeTree.gen.ts"), /'\/bantuan': typeof BantuanRoute/);
});

test("ON-07: teks UI tanpa em dash dan tanpa tanda seru", () => {
  const sources = [
    uiText,
    read("../src/routes/bantuan.tsx"),
    read("../src/components/help/HelpSteps.tsx"),
    read("../src/components/help/HelpGlossary.tsx"),
    read("../src/components/help/HelpFaq.tsx"),
  ];
  for (const [i, src] of sources.entries()) {
    assert.ok(!src.includes("\u2014"), `em dash masih ada di berkas ${i}`);
    assert.ok(!src.includes("!"), `tanda seru masih ada di berkas ${i}`);
  }
});

test("ON-21 dan ON-19: Bantuan di kamus label, Mode Anonim keluar dari menu", () => {
  assert.equal(PAGE_LABELS["/bantuan"], "Bantuan");
  assert.deepEqual(HELP_NAV_ITEM, { to: "/bantuan", label: "Bantuan" });
  for (const it of NAV_ITEMS) assert.notEqual(it.to, "/blind-mode");
  assert.ok(!NAV_GROUPS.some((g) => g.items.includes("/blind-mode")));
  for (const it of [...NAV_ITEMS, ...MOBILE_TAB_ITEMS]) {
    const label = PAGE_LABELS[it.to as keyof typeof PAGE_LABELS];
    if (label) assert.equal(it.label, label, `label tidak konsisten untuk ${it.to}`);
  }
});
