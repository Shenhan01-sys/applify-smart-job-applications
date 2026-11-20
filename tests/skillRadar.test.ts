import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRadarData, findGaps, describeRadar, unmatchedSkillLabels, DEMO_SKILLS, UNMATCHED_SECTION_TEXT, UNMATCHED_SECTION_TITLE } from "../src/lib/skillRadar.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("peta skill: tanpa skill hasilnya kosong, bukan data contoh karangan", () => {
  const r = buildRadarData([]);
  assert.equal(r.status, "empty");
  assert.deepEqual(r.data, []);
});

test("peta skill: skill yang tidak cocok bidang manapun dilaporkan, tidak diganti data contoh", () => {
  const r = buildRadarData([{ name: "Memasak", category: "Dapur", proficiency_level: 4 }]);
  assert.equal(r.status, "unmatched");
  assert.deepEqual(r.data, []);
});

test("peta skill: skala 1-5 menjadi persen dan skill dipetakan ke bidangnya", () => {
  const r = buildRadarData([
    { name: "React", category: "Frontend", proficiency_level: 4 },
    { name: "Docker", category: "DevOps", proficiency_level: 2 },
  ]);
  assert.equal(r.status, "ok");
  const by = Object.fromEntries(r.data.map((d) => [d.name, d.userLevel]));
  assert.equal(by["Frontend"], 80);
  assert.equal(by["Cloud/DevOps"], 40);
  assert.equal(by["Backend"], 0);
  assert.equal(r.matchedCount, 2);
});

test("peta skill: nilai di atas 5 dianggap sudah persen dan tidak lewat 100", () => {
  const r = buildRadarData([{ name: "SQL", category: "Data", proficiency_level: 150 }]);
  assert.equal(r.data.find((d) => d.name === "Data/AI")?.userLevel, 100);
});

test("peta skill: selisih lebih dari 10 poin dihitung sebagai gap, urut dari yang terbesar", () => {
  const gaps = findGaps(DEMO_SKILLS);
  assert.deepEqual(gaps.map((g) => g.name), ["Cloud/DevOps", "UI/UX", "Backend", "Data/AI"].sort((a, b) => {
    const f = (n: string) => DEMO_SKILLS.find((d) => d.name === n)!;
    return f(b).marketDemand - f(b).userLevel - (f(a).marketDemand - f(a).userLevel);
  }));
  assert.ok(!gaps.some((g) => g.name === "Frontend"));
  assert.match(describeRadar(DEMO_SKILLS), /Frontend: skill kamu 85 persen, patokan 90 persen/);
});

test("halaman Peta Skill: tanpa klaim karangan, grafik punya nama dan tabel angka, mock hanya di mode demo", () => {
  const src = read("../src/routes/skill-radar.tsx");
  assert.doesNotMatch(src, /1\.200|Coursera|Udemy|Dicoding|Tutup Gap Ini|Market Divergence|ilustratif/);
  assert.match(src, /role="img"/);
  assert.match(src, /aria-label=\{`Grafik radar skill\./);
  assert.match(src, /<RadarTable/);
  assert.match(src, /const demo = isMockMode\(\) && built\.status !== "ok"/);
  assert.match(src, /patokan perkiraan/);
  assert.match(src, /<ErrorState/);
  assert.doesNotMatch(src, /text-\[(8|9|10|11)px\]/);
});

test("Karier Hijau: tanpa biaya dan refund karangan, ada langkah berikutnya, galat diterjemahkan", () => {
  const src = read("../src/routes/green-career.tsx");
  assert.doesNotMatch(src, /Rp15\.000|refund|Commitment fee|Eksklusif|setError\(e\.message\)|setError\(e\?\.message\)/);
  assert.match(src, /Lihat lowongan yang cocok/);
  assert.match(src, /to="\/jobs"/);
  assert.match(src, /job\?\.external_url/);
  assert.match(src, /describeError\(e,/);
  assert.match(src, /<ErrorState/);
  assert.match(src, /perkiraan AI/);
  // agen tidak mengirim lamaran sendiri: teks hasil tidak boleh menjanjikannya
  assert.doesNotMatch(src, /mengirim lamaran\./);
  assert.doesNotMatch(src, /text-\[(8|9|10)px\]/);
});

// Uji E2E klik 20 November 2026 (temuan 11): profil niche hanya melihat keadaan kosong.
test("temuan 11: skill di luar enam bidang dikembalikan, bukan dibuang", () => {
  const skills = [
    { name: "Solidity", category: "Kripto", proficiency_level: 4 },
    { name: "Memasak", category: "Dapur", proficiency_level: 3 },
  ];
  const r = buildRadarData(skills);
  assert.equal(r.status, "unmatched");
  assert.deepEqual(r.data, []);
  assert.deepEqual(r.unmatched, skills);
  assert.deepEqual(unmatchedSkillLabels(r.unmatched), ["Solidity (4/5)", "Memasak (3/5)"]);
});

test("temuan 11: profil campuran: radar untuk yang cocok, sisanya masuk daftar di luar enam bidang", () => {
  const r = buildRadarData([
    { name: "React", category: "Frontend", proficiency_level: 4 },
    { name: "Solidity", category: "Kripto", proficiency_level: 5 },
    { name: "Hukum Kontrak", category: null, proficiency_level: 2 },
  ]);
  assert.equal(r.status, "ok");
  assert.equal(r.data.find((d) => d.name === "Frontend")?.userLevel, 80);
  assert.equal(r.matchedCount, 1);
  assert.deepEqual(r.unmatched.map((s) => s.name), ["Solidity", "Hukum Kontrak"]);
  // semua cocok: tidak ada daftar tambahan
  assert.deepEqual(buildRadarData([{ name: "Docker", category: "DevOps", proficiency_level: 3 }]).unmatched, []);
  // tanpa skill: tidak ada apa pun
  assert.deepEqual(buildRadarData([]).unmatched, []);
});

test("temuan 11: unmatchedSkillLabels membuang nama kosong dan duplikat, dan hanya menulis tingkat 1-5", () => {
  assert.deepEqual(
    unmatchedSkillLabels([
      { name: "  Solidity ", proficiency_level: 4 },
      { name: "solidity", proficiency_level: 2 },
      { name: "", proficiency_level: 3 },
      { name: null },
      { name: "Rust Embedded", proficiency_level: 80 },
      { name: "Copywriting", proficiency_level: "5" },
      { name: "Fotografi", proficiency_level: 0 },
    ]),
    ["Solidity (4/5)", "Rust Embedded", "Copywriting (5/5)", "Fotografi"],
  );
  assert.deepEqual(unmatchedSkillLabels([]), []);
});

test("temuan 11: halaman Peta Skill menampilkan bagian Skill di luar enam bidang dengan penjelasan, termasuk saat tidak ada yang cocok", () => {
  assert.equal(UNMATCHED_SECTION_TITLE, "Skill di luar enam bidang");
  assert.match(UNMATCHED_SECTION_TEXT, /enam bidang: Frontend, Backend, UI\/UX, Cloud\/DevOps, Data\/AI, dan Agile\/Soft/);
  assert.match(UNMATCHED_SECTION_TEXT, /tidak ikut di grafik/);
  const src = read("../src/routes/skill-radar.tsx");
  // keadaan "belum cocok": daftar skill tampil di dalam kotak keadaan kosong
  assert.match(src, /built\.status === "unmatched" && <UnmatchedSkills skills=\{built\.unmatched\}/);
  // profil campuran: daftar tampil di bawah radar dan tabel
  assert.match(src, /\{!demo && <UnmatchedSkills skills=\{built\.unmatched\}/);
  assert.match(src, /UNMATCHED_SECTION_TITLE/);
  assert.match(src, /<section aria-labelledby="skill-luar-bidang"/);
  // profil tanpa skill tetap memakai keadaan kosong lama
  assert.match(src, /Skill-mu belum ada di profil/);
});
