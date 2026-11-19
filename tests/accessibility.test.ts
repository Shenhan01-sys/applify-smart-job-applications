import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Landing page dan popup waitinglist sengaja dipertahankan dengan desain asli atas keputusan Hans (2026-11-19).
// Aturan teks minimal dan modal Radix diberlakukan untuk halaman aplikasi, bukan untuk landing ini.
const LANDING_DESAIN_ASLI = ["/src/routes/index.tsx", "/src/components/WaitinglistPopup.tsx"];
const isLanding = (f: string) => LANDING_DESAIN_ASLI.some((x) => f.endsWith(x));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

test("gaya global: prefers-reduced-motion, fokus keyboard terlihat, kolom 16px di ponsel", () => {
  const css = read("../src/styles.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 0\.01ms !important/);
  assert.match(css, /animation-iteration-count: 1 !important/);
  assert.match(css, /\.animate-popUI \{ animation: none !important; opacity: 1 !important; \}/);
  assert.match(css, /:focus-visible \{\s*outline: 3px solid/);
  assert.match(css, /@media \(max-width: 767px\)[\s\S]*font-size: 16px/);
});

test("tidak ada teks di bawah 12px (text-[8..11px]) di kode aplikasi", () => {
  const offenders: string[] = [];
  for (const f of walk(new URL("../src", import.meta.url).pathname)) {
    if (f.includes("/components/ui/") || isLanding(f)) continue; // shadcn bawaan pustaka; landing desain asli
    const src = readFileSync(f, "utf8");
    if (/text-\[(8|9|10|11)px\]/.test(src)) offenders.push(f.replace(/.*\/src\//, "src/"));
  }
  assert.deepEqual(offenders, []);
});

test("tidak ada modal buatan sendiri: semua dialog memakai Radix (Dialog atau Sheet)", () => {
  for (const f of ["../src/components/AIApplyModal.tsx", "../src/routes/applications.tsx", "../src/components/ApprovalReviewModal.tsx"]) {
    assert.match(read(f), /@\/components\/ui\/dialog/, f);
  }
  assert.match(read("../src/components/app/AppShell.tsx"), /@\/components\/ui\/sheet/);
  for (const f of walk(new URL("../src", import.meta.url).pathname)) {
    if (f.includes("/components/ui/") || !f.endsWith(".tsx") || isLanding(f)) continue;
    assert.doesNotMatch(readFileSync(f, "utf8"), /fixed inset-0/, `${f} masih memakai overlay buatan sendiri`);
  }
});

test("Mode Anonim: halaman hanya menjanjikan pratinjau, bukan fitur yang belum ada", () => {
  const src = read("../src/routes/blind-mode.tsx");
  assert.doesNotMatch(src, /Blind Merit|Recruiter melihat|identitas dibuka setelah shortlist|agen otomatis menyesuaikan/);
  assert.match(src, /baru berupa pratinjau|Segera hadir/);
  assert.match(src, /to="\/profile"/);
});

test("sakelar: semua tombol geser memakai role=switch dengan aria-checked", () => {
  const src = read("../src/routes/automation-settings.tsx");
  assert.match(src, /role="switch"/);
  assert.match(src, /aria-checked=\{checked\}/);
  assert.match(src, /htmlFor=\{id\}/);
});
