import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectTailoredSkills } from "../supabase/functions/_shared/tailored-skills.ts";

// Edge Function generate-application berjalan di Deno dan tidak bisa dijalankan di sini, jadi pengaitannya diperiksa
// lewat teks sumber dan pemilih skillnya dites langsung. Uji klik produksi 21 November 2026, temuan 24.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const FN = "../supabase/functions/generate-application/index.ts";

const PROFILE = ["Excel", "Komunikasi", "React Native", "Go"];
const JOB_TEXT = "Staf Merchandiser\nMengelola stok dengan Excel. Memiliki kemampuan analisa yang baik\n[\"Mampu bekerja secara mandiri maupun tim\"]";

test("temuan 24: kalimat persyaratan dari keluaran model tidak pernah menjadi skill yang disorot", () => {
  const model = [
    "Memiliki kemampuan menggunakan perangkat lunak komputer",
    "Memiliki kemampuan analisa yang baik",
    "Mampu bekerja secara mandiri maupun tim",
  ];
  assert.deepEqual(selectTailoredSkills(model, PROFILE, JOB_TEXT), ["Excel"]);
  assert.deepEqual(selectTailoredSkills(model, PROFILE, "Staf gudang"), []);
});

test("temuan 24: hasil memakai ejaan profil dan hanya butir yang ada di profil", () => {
  assert.deepEqual(selectTailoredSkills(["excel", "KOMUNIKASI", "Python"], PROFILE, ""), ["Excel", "Komunikasi"]);
  // butir model "React" menunjuk skill profil "React Native"
  assert.deepEqual(selectTailoredSkills(["React"], PROFILE, ""), ["React Native"]);
  // skill di luar profil (Python) tidak masuk walau disebut lowongan
  assert.deepEqual(selectTailoredSkills(["Python"], PROFILE, "Menguasai Python"), []);
});

test("temuan 24: skill profil yang disebut lowongan ikut, skill dua huruf tidak dicocokkan ke teks bebas", () => {
  assert.deepEqual(selectTailoredSkills([], PROFILE, "Wajib menguasai Excel dan komunikasi tim"), ["Excel", "Komunikasi"]);
  // "Go" adalah kata biasa di teks lowongan
  assert.deepEqual(selectTailoredSkills([], ["Go"], "Ready to go the extra mile"), []);
  // potongan kata tidak dihitung: "java" bukan "javascript"
  assert.deepEqual(selectTailoredSkills([], ["Java"], "Menguasai JavaScript"), []);
});

test("temuan 24: bentuk rusak tidak melempar, duplikat dibuang, dibatasi delapan", () => {
  for (const bad of [undefined, null, "Excel", 7, {}, [1, null, {}]]) assert.deepEqual(selectTailoredSkills(bad, PROFILE, ""), []);
  assert.deepEqual(selectTailoredSkills(["Excel", "excel", "Excel"], PROFILE, "Excel"), ["Excel"]);
  assert.deepEqual(selectTailoredSkills(["Excel"], [], "Excel"), []);
  const many = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet"];
  assert.equal(selectTailoredSkills(many, many, "").length, 8);
});

test("temuan 24: Edge Function memakai pemilih ini dan prompt melarang kalimat dari lowongan", () => {
  const src = read(FN);
  assert.match(src, /import \{ selectTailoredSkills \} from "\.\.\/_shared\/tailored-skills\.ts";/);
  assert.match(src, /const tailoredSkills = selectTailoredSkills\(\s*parsed\.tailoredSkills,\s*profileFacts\.skills,/);
  assert.match(src, /tailoredSkills,\n/);
  assert.match(src, /highlighted_skills: tailoredSkills/);
  assert.doesNotMatch(src, /tailoredSkills: parsed\.tailoredSkills \?\? \[\]/);
  assert.match(src, /copied exactly from the candidate's Skills list[^"]*never sentences or requirements taken from the job posting/);
});
