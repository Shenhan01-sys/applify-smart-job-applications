import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AXES, buildRadarData, findGaps, describeRadar, hasKeyword, unmatchedSkillLabels, DEMO_SKILLS, UNMATCHED_SECTION_TEXT, UNMATCHED_SECTION_TITLE } from "../src/lib/skillRadar.ts";

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
  assert.match(src, /safeJobUrl\(job\.external_url\)/);
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
    { name: "Fotografi", category: "Seni", proficiency_level: 4 },
    { name: "Memasak", category: "Dapur", proficiency_level: 3 },
  ];
  const r = buildRadarData(skills);
  assert.equal(r.status, "unmatched");
  assert.deepEqual(r.data, []);
  assert.deepEqual(r.unmatched, skills);
  assert.deepEqual(unmatchedSkillLabels(r.unmatched), ["Fotografi (4/5)", "Memasak (3/5)"]);
});

test("temuan 11: profil campuran: radar untuk yang cocok, sisanya masuk daftar di luar enam bidang", () => {
  const r = buildRadarData([
    { name: "React", category: "Frontend", proficiency_level: 4 },
    { name: "Fotografi", category: "Seni", proficiency_level: 5 },
    { name: "Hukum Kontrak", category: null, proficiency_level: 2 },
  ]);
  assert.equal(r.status, "ok");
  assert.equal(r.data.find((d) => d.name === "Frontend")?.userLevel, 80);
  assert.equal(r.matchedCount, 1);
  assert.deepEqual(r.unmatched.map((s) => s.name), ["Fotografi", "Hukum Kontrak"]);
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

// Tindak lanjut temuan 11: kata kunci dicocokkan sebagai kata utuh, bukan potongan kata.
const axisOf = (skill: { name: string; category?: string | null; proficiency_level?: number }) =>
  buildRadarData([{ proficiency_level: 4, ...skill }]).data.filter((d) => d.userLevel > 0).map((d) => d.name);

test("kata kunci: Blockchain tidak masuk Data/AI karena memuat ai; sejak 21 November 2026 profil Web3 masuk Backend", () => {
  assert.equal(hasKeyword("Blockchain", "ai"), false);
  // bukan Data/AI, melainkan Backend (kata kunci "blockchain", "solidity", "smart contract", "web3")
  assert.deepEqual(axisOf({ name: "Solidity", category: "Blockchain" }), ["Backend"]);
  assert.deepEqual(axisOf({ name: "Blockchain" }), ["Backend"]);
  const r = buildRadarData([{ name: "Solidity", category: "Blockchain", proficiency_level: 5 }, { name: "Smart Contract", category: "Web3", proficiency_level: 4 }]);
  assert.equal(r.status, "ok");
  assert.equal(r.unmatched.length, 0);
  assert.deepEqual(r.data.filter((d) => d.userLevel > 0).map((d) => d.name), ["Backend"]);
});

test("kata kunci: potongan kata lain yang dulu salah tangkap tidak lagi cocok", () => {
  const misses: Array<[string, string]> = [
    ["Software Engineering", "soft"], // bukan soft skill
    ["JavaScript", "java"], // bukan Java
    ["HTML", "ml"], // bukan machine learning
    ["Maintenance", "ai"],
    ["Retail", "ai"],
    ["Email Marketing", "ai"],
    ["Metadata", "data"],
    ["Frontier Markets", "front"],
    ["Restaurant Management", "rest"],
    ["Serverless", "server"],
  ];
  for (const [text, kw] of misses) assert.equal(hasKeyword(text, kw), false, `${text} / ${kw}`);
  assert.deepEqual(axisOf({ name: "Software Engineering", category: "technical" }), []);
  assert.deepEqual(axisOf({ name: "Email Marketing", category: "tool" }), []);
  assert.deepEqual(axisOf({ name: "Pelayanan Pelanggan", category: "language" }), []);
});

test("kata kunci: kata utuh, frasa, tanda hubung, garis miring, dan jamak tetap cocok", () => {
  const hits: Array<[string, string]> = [
    ["AI", "ai"],
    ["AI/ML Engineer", "ai"],
    ["AI/ML Engineer", "ml"],
    ["Machine Learning", "machine"],
    ["Front-End Developer", "front end"],
    ["Frontend", "frontend"],
    ["Back_End", "back end"],
    ["REST API", "api"],
    ["REST APIs", "api"],
    ["Cloud Computing", "cloud"],
    ["Data Analytics", "analytic"],
    ["Rapid Prototyping", "prototyping"],
    ["Project Management", "management"],
    ["Soft skill", "soft"],
  ];
  for (const [text, kw] of hits) assert.equal(hasKeyword(text, kw), true, `${text} / ${kw}`);
  // frasa harus utuh dan berurutan
  assert.equal(hasKeyword("Back Office", "back end"), false);
  assert.equal(hasKeyword("end to back", "back end"), false);
});

test("kata kunci bersimbol tetap bekerja: c++, c#, node.js, .net, ci/cd, ui/ux", () => {
  assert.equal(hasKeyword("C++ Developer", "c++"), true);
  assert.equal(hasKeyword("Embedded C++", "c++"), true);
  assert.equal(hasKeyword("abc++", "c++"), false);
  assert.equal(hasKeyword("C#", "c#"), true);
  assert.equal(hasKeyword("Node.js", "node.js"), true);
  assert.equal(hasKeyword("Node.js", "node"), true, "node di dalam node.js");
  assert.equal(hasKeyword("Backend (Node.js, Express)", "node.js"), true);
  assert.equal(hasKeyword("ASP.NET", ".net"), true);
  assert.equal(hasKeyword("CI/CD Pipeline", "ci/cd"), true);
  assert.equal(hasKeyword("UI/UX Designer", "ui/ux"), true);
  assert.equal(hasKeyword("UI/UX Designer", "ux"), true);
  assert.equal(hasKeyword("anything", ""), false);
});

test("kata kunci: kasus nyata tetap masuk bidangnya, dan bentuk yang dulu awalan ditulis eksplisit", () => {
  assert.deepEqual(axisOf({ name: "React", category: "technical" }), ["Frontend"]);
  assert.deepEqual(axisOf({ name: "Next.js", category: "Frontend" }), ["Frontend"]);
  assert.deepEqual(axisOf({ name: "Node.js", category: "technical" }), ["Backend"]);
  assert.deepEqual(axisOf({ name: "Figma", category: "tool" }), ["UI/UX"]);
  assert.deepEqual(axisOf({ name: "Docker", category: "tool" }), ["Cloud/DevOps"]);
  assert.deepEqual(axisOf({ name: "Kubernetes", category: "tool" }), ["Cloud/DevOps"]);
  assert.deepEqual(axisOf({ name: "PostgreSQL", category: "tool" }), ["Data/AI"]);
  assert.deepEqual(axisOf({ name: "Pandas", category: "technical" }), ["Data/AI"]);
  assert.deepEqual(axisOf({ name: "Scrum", category: "tool" }), ["Agile/Soft"]);
  assert.deepEqual(axisOf({ name: "Komunikasi", category: "soft" }), ["Agile/Soft"], "kategori soft memetakan ke Agile/Soft");
  assert.deepEqual(axisOf({ name: "Wireframes", category: "tool" }), ["UI/UX"], "jamak");
  assert.deepEqual(axisOf({ name: "UX Prototyping", category: "technical" }), ["UI/UX"]);
  assert.deepEqual(axisOf({ name: "TensorFlow", category: "technical" }), ["Data/AI"]);
  assert.deepEqual(axisOf({ name: "Data Analytics", category: "technical" }), ["Data/AI"]);
  // semua kata kunci kata utuh cocok dengan dirinya sendiri
  for (const ax of AXES) for (const k of ax.kw) assert.equal(hasKeyword(k, k), true, `${ax.name}: ${k}`);
});

// Item J (21 November 2026): profil nyata dengan "Google Gemini", "Web3", dan "Privy Wallet" tidak memetakan ke bidang mana pun.
test("J: Google Gemini masuk Data/AI, Web3 masuk Backend, Privy Wallet tetap di luar enam bidang", () => {
  assert.deepEqual(axisOf({ name: "Google Gemini" }), ["Data/AI"]);
  assert.deepEqual(axisOf({ name: "Web3" }), ["Backend"]);
  assert.deepEqual(axisOf({ name: "Privy Wallet" }), []);
  const r = buildRadarData([
    { name: "Google Gemini", proficiency_level: 4 },
    { name: "Web3", proficiency_level: 3 },
    { name: "Privy Wallet", proficiency_level: 3 },
  ]);
  assert.equal(r.status, "ok", "radar tampil");
  assert.equal(r.matchedCount, 2);
  assert.equal(r.data.find((d) => d.name === "Data/AI")?.userLevel, 80);
  assert.equal(r.data.find((d) => d.name === "Backend")?.userLevel, 60);
  assert.deepEqual(r.unmatched.map((s) => s.name), ["Privy Wallet"]);
});

test("J: kata kunci baru tiap bidang memetakan ke bidang yang benar", () => {
  const cases: Array<[string, string]> = [
    ...["OpenAI", "ChatGPT", "GPT-4", "Claude", "Prompt Engineering", "Generative AI", "GenAI", "NLP", "Deep Learning", "Computer Vision", "LangChain", "RAG"].map((n): [string, string] => [n, "Data/AI"]),
    ...["Blockchain", "Solidity", "Smart Contracts", "Ethereum", "Express", "Express.js", "Django", "Laravel", "Spring", "Spring Boot"].map((n): [string, string] => [n, "Backend"]),
    ...["Next.js", "NextJS", "Svelte", "Angular"].map((n): [string, string] => [n, "Frontend"]),
    ...["Vercel", "Supabase", "Firebase", "Linux"].map((n): [string, string] => [n, "Cloud/DevOps"]),
    ...["User Research", "Usability Testing"].map((n): [string, string] => [n, "UI/UX"]),
    ...["Teamwork", "Problem Solving", "Presentation Skills", "Public Speaking", "Kerja Sama Tim"].map((n): [string, string] => [n, "Agile/Soft"]),
  ];
  for (const [name, axis] of cases) assert.deepEqual(axisOf({ name }), [axis], name);
});

test("J: kata kunci baru tetap kata utuh dan tidak menangkap potongan kata atau kata ambigu", () => {
  for (const [text, kw] of [
    ["Drag and Drop", "rag"],
    ["Fragment", "rag"],
    ["Springfield", "spring"],
    ["Expressive Writing", "express"],
    ["Gptq", "gpt"],
    ["Linuxy", "linux"],
    ["Angularity", "angular"],
    ["Slagging", "ai"],
    ["Privy Wallet", "wallet"],
  ] as const) {
    // "wallet" tidak ada di daftar mana pun; baris ini memastikan tidak ada kata kunci yang cocok dengan teks
    assert.equal(AXES.some((ax) => ax.kw.some((k) => k === kw && hasKeyword(text, k))), false, `${text} / ${kw}`);
  }
  assert.equal(AXES.some((ax) => (ax.kw as readonly string[]).includes("wallet")), false);
  // kata kunci baru bukan kata tunggal pendek yang ambigu
  const added = ["gemini", "openai", "chatgpt", "gpt", "claude", "genai", "nlp", "rag", "web3", "express", "spring", "vercel", "supabase", "firebase", "linux", "svelte", "angular"];
  for (const k of added) assert.ok(AXES.some((ax) => (ax.kw as readonly string[]).includes(k)), k);
  // tidak ada kata kunci yang muncul di dua bidang sekaligus
  const all = AXES.flatMap((ax) => [...ax.kw]);
  assert.equal(new Set(all).size, all.length, "kata kunci ganda di antar bidang");
});

test("UX Wave 3: multi-skill memakai tingkat tertinggi per bidang (matchedSkills) dan Karier Hijau simpan hasil + konfirmasi keluar", () => {
  const r = buildRadarData([
    { name: "React", proficiency_level: 5 },
    { name: "Vue", proficiency_level: 1 },
  ]);
  const fe = r.data.find((d) => d.name === "Frontend");
  assert.equal(fe?.userLevel, 100);
  assert.deepEqual(fe?.matchedSkills, ["React", "Vue"]);

  const radarPage = read("../src/routes/skill-radar.tsx");
  assert.match(radarPage, /AXIS_GUIDANCE/);
  assert.match(radarPage, /d\.matchedSkills/);

  const gc = read("../src/routes/green-career.tsx");
  assert.match(gc, /completedResults/);
  assert.match(gc, /Buka di Lowongan/);
  assert.match(gc, /Keluar dari asesmen ini\?/);
});
