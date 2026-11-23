import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeControlCharsInStrings, extractDraftJson, salvageCoverLetter } from "../supabase/functions/_shared/json-salvage.ts";

const LETTER = "Dengan hormat,\n\nSaya ingin melamar posisi Data Scientist Intern di GoTo. Saya mahasiswa Sistem Informasi.\n\nTerima kasih.";

test("JSON utuh tetap diurai apa adanya, termasuk di dalam pagar kode", () => {
  const body = JSON.stringify({ coverLetter: LETTER, matchScore: 80 });
  assert.deepEqual(extractDraftJson(body), { coverLetter: LETTER, matchScore: 80 });
  assert.deepEqual(extractDraftJson("```json\n" + body + "\n```"), { coverLetter: LETTER, matchScore: 80 });
  assert.deepEqual(extractDraftJson("Berikut hasilnya:\n" + body + "\nSelesai."), { coverLetter: LETTER, matchScore: 80 });
});

test("baris baru mentah di dalam string tidak lagi membuat JSON gagal diurai", () => {
  const broken = `{"coverLetter": "${LETTER}", "matchScore": 75}`;
  assert.throws(() => JSON.parse(broken));
  const v = extractDraftJson(broken);
  assert.equal(v?.coverLetter, LETTER);
  assert.equal(v?.matchScore, 75);
});

test("jawaban terpotong: surat tetap diambil dari kunci coverLetter", () => {
  const full = JSON.stringify({ coverLetter: LETTER, matchScore: 80, tailoredSkills: ["Python", "SQL"] });
  const cut = full.slice(0, full.indexOf("tailoredSkills") + 5);
  const v = extractDraftJson(cut);
  assert.equal(v?.coverLetter, LETTER);
  assert.equal(v?.salvaged, true, "JSON tidak tertutup, surat diselamatkan dari kunci coverLetter");
  const cutInsideLetter = full.slice(0, full.indexOf("Terima") + 3);
  const w = extractDraftJson(cutInsideLetter);
  assert.equal(w?.salvaged, true);
  assert.ok(String(w?.coverLetter).startsWith("Dengan hormat,\n\nSaya ingin melamar"));
});

test("escape yang patah di ujung potongan dibuang, bukan membuat galat", () => {
  assert.equal(salvageCoverLetter('{"coverLetter": "Halo dunia\\'), "Halo dunia");
  assert.equal(salvageCoverLetter('{"coverLetter": "Halo \\u00'), "Halo ");
});

test("tanpa kunci coverLetter dan bukan JSON: null", () => {
  assert.equal(extractDraftJson("Maaf, saya tidak bisa membantu."), null);
  assert.equal(salvageCoverLetter('{"matchScore": 3}'), null);
});

test("escapeControlCharsInStrings hanya menyentuh isi string", () => {
  assert.equal(escapeControlCharsInStrings('{\n"a": "x\ny"\n}'), '{\n"a": "x\\ny"\n}');
  assert.equal(escapeControlCharsInStrings('{"a": "kutip \\" tetap"}'), '{"a": "kutip \\" tetap"}');
});
