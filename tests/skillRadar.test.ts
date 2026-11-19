import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRadarData, findGaps, describeRadar, DEMO_SKILLS } from "../src/lib/skillRadar.ts";

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
