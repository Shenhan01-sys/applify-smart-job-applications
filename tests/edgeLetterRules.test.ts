import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LETTER_MIN_PARAGRAPHS, letterStructureRules } from "../supabase/functions/_shared/letter-rules.ts";

// Edge Function generate-application berjalan di Deno dan tidak bisa dijalankan di sini, jadi prompt-nya diperiksa
// lewat teks sumber dan aturan bentuk surat dites langsung. Uji klik produksi 21 November 2026, temuan 28.
// Salinan yang identik dan prompt backend dites di backend/tests/letter-language.test.ts.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const FN = "../supabase/functions/generate-application/index.ts";

test("temuan 28: aturan surat menuntut nama posisi, nama perusahaan, dan paling sedikit tiga paragraf", () => {
  assert.equal(LETTER_MIN_PARAGRAPHS, 3);
  const [naming, structure] = letterStructureRules("Staf Merchandiser - Fullstack Developer", "FIN HOMEMART");
  assert.match(naming, /Name the exact position "Staf Merchandiser - Fullstack Developer" and the company "FIN HOMEMART"/);
  assert.match(naming, /melamar posisi Staf Merchandiser - Fullstack Developer di FIN HOMEMART/);
  assert.match(structure, /at least 3 short paragraphs separated by one blank line/);
  assert.match(structure, /Never output the letter as one block of text/);
});

test("temuan 28: judul dan perusahaan dari data lowongan menjadi satu baris tanpa kutip ganda, dengan cadangan bila kosong", () => {
  const [naming] = letterStructureRules('Staf\n"Senior"\tAnalis', "  PT   Contoh  ");
  assert.ok(naming.includes(`"Staf 'Senior' Analis"`));
  assert.ok(naming.includes('"PT Contoh"'));
  assert.ok(!naming.includes("\n"));
  for (const bad of [undefined, null, 42, "", "   "]) assert.ok(letterStructureRules(bad, bad)[0].includes('"the position"'));
});

test("temuan 28: prompt Edge Function memasang aturan surat dan meminta jeda paragraf di bentuk JSON", () => {
  const src = read(FN);
  assert.match(src, /import \{ letterStructureRules \} from "\.\.\/_shared\/letter-rules\.ts";/);
  assert.match(src, /LETTER STRUCTURE \(strict\):\n\$\{letterStructureRules\(job\.title, job\.company\)/);
  assert.match(src, /cover letter in at least 3 short paragraphs separated by \\\\n\\\\n, naming the position title and the company/);
  // aturan bahasa yang sudah ada tetap: Indonesia bawaan, Inggris hanya bila lowongan jelas berbahasa Inggris atau diminta
  assert.match(src, /LANGUAGE: \$\{languageInstruction\(language\)\}/);
  assert.match(src, /Bahasa Indonesia by default; English only when the posting is clearly English/);
});
