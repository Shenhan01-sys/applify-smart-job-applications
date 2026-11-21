import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HIGH_MATCH_THRESHOLD,
  NO_PROFILE_SKILLS_TEXT,
  cleanSkillTerm,
  computeMatch,
  highlightedSkills,
  matchCaption,
  profileSkillList,
  sortByMatch,
} from "../src/lib/matchScore.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const FRONTEND_PROFILE = ["React", "TypeScript", "Tailwind CSS", "Git"];

// Baris nyata dari data UAT (uat/generate-10-nonit-cover-letters.mjs), termasuk skor global 90 di database.
const APOTEKER = {
  title: "Pharmacist (Apoteker)",
  description:
    "Melayani resep, mengelola inventaris obat, dan memberikan konsultasi farmasi. Requirements: Farmakologi, Pelayanan Resep, Obat-obatan, Komunikasi, BPOM",
  match_score: 90,
};

const FRONTEND_JOB = {
  title: "Frontend Developer",
  description: "Membangun antarmuka web dengan React dan TypeScript. Requirements: React, TypeScript, Tailwind CSS, Git",
  requirements: ["React", "TypeScript", "Tailwind CSS", "Git"],
  match_score: 50,
};

test("lowongan JobStreet Metro Tara (20 November 2026): kalimat kualifikasi dan judul bagian tidak menjadi skill", () => {
  const job = {
    title: "Internship IT",
    description:
      "Kualifikasi:\n• Pendidikan minimal SMK/D3 atau fresh graduate jurusan Teknik Informatika, Sistem Informasi, TKJ, atau bidang terkait.\n• Memahami dasar hardware komputer, laptop, printer, dan jaringan.\nSkills: SQL, Troubleshooting dan bidang terkait",
    requirements: ["IT SYSTEM DEVELOPMENT", "Memiliki pemahaman mengenai database dan SQL.", "SQL", "Responsible, proactive, and reliable", "CV Terbaru"],
  };
  const m = computeMatch(job, ["React"]);
  const labels = [...m.matched, ...m.missing].map((s) => String(s).toLowerCase());
  for (const junk of ["atau bidang terkait", "bidang terkait", "it system development", "tkj", "responsible, proactive, and reliable", "cv terbaru"]) {
    assert.ok(!labels.includes(junk), `${junk} bukan skill`);
  }
  assert.ok(labels.includes("sql"), labels.join(", "));
  assert.ok(labels.some((l) => l.includes("troubleshooting")), labels.join(", "));
});

test("Apoteker untuk profil React/TypeScript: rendah, walau jobs.match_score global bernilai 90", () => {
  const m = computeMatch(APOTEKER, FRONTEND_PROFILE);
  assert.equal(m.status, "ok");
  assert.equal(m.score, 0);
  assert.deepEqual(m.matched, []);
  assert.equal(m.total, 5);
  assert.ok(m.missing.includes("Farmakologi") && m.missing.includes("BPOM"));
  assert.ok((m.score as number) < HIGH_MATCH_THRESHOLD);
  assert.equal(matchCaption(m), "0 dari 5 skill cocok");
});

test("Apoteker lewat daftar requirements (bukan teks deskripsi) juga rendah", () => {
  const m = computeMatch(
    { title: "Apoteker", description: "Melayani resep.", requirements: ["Farmakologi", "Pelayanan Resep", "Obat-obatan", "Komunikasi", "BPOM"] },
    ["React", "TypeScript"],
  );
  assert.equal(m.score, 0);
  assert.equal(m.total, 5);
});

test("Frontend Developer untuk profil React/TypeScript: tinggi", () => {
  const m = computeMatch(FRONTEND_JOB, FRONTEND_PROFILE);
  assert.equal(m.score, 100);
  assert.deepEqual(m.matched, ["React", "TypeScript", "Tailwind CSS", "Git"]);
  assert.deepEqual(m.missing, []);
  assert.ok((m.score as number) >= HIGH_MATCH_THRESHOLD);
});

test("skor transparan: persentase skill yang disebut lowongan dan ada di profil, beserta N dari M", () => {
  const job = { title: "Backend Engineer", description: "Stack kami: React, TypeScript, Docker, Kubernetes." };
  const m = computeMatch(job, ["React", "TypeScript"]);
  assert.equal(m.total, 4);
  assert.deepEqual(m.matched.sort(), ["React", "TypeScript"]);
  assert.deepEqual(m.missing.sort(), ["Docker", "Kubernetes"]);
  assert.equal(m.score, 50);
  assert.equal(matchCaption(m), "2 dari 4 skill cocok");
  // tiga dari empat = 75 (dibulatkan dari 75), satu dari tiga = 33
  assert.equal(computeMatch({ description: "SQL, Docker, Redis, Python" }, ["SQL", "Docker", "Redis"]).score, 75);
  assert.equal(computeMatch({ description: "SQL, Docker, Redis" }, ["SQL"]).score, 33);
});

test("profil tanpa skill: tidak ada persen, ada ajakan melengkapi skill di Profil", () => {
  for (const empty of [[], ["", "  "], ["x"]]) {
    const m = computeMatch(FRONTEND_JOB, empty);
    assert.equal(m.status, "no-profile-skills");
    assert.equal(m.score, null);
    assert.equal(matchCaption(m), NO_PROFILE_SKILLS_TEXT);
  }
  assert.equal(NO_PROFILE_SKILLS_TEXT, "Lengkapi skill di Profil untuk melihat kecocokan");
});

test("lowongan yang tidak menyebut skill apa pun tidak diberi skor (bukan 0% dan bukan angka karangan)", () => {
  const m = computeMatch({ title: "Staf Umum", description: "Mengurus surat menyurat kantor." }, FRONTEND_PROFILE);
  assert.equal(m.status, "no-job-skills");
  assert.equal(m.score, null);
  assert.equal(m.total, 0);
  assert.match(matchCaption(m), /belum terbaca/);
});

test("jobs.match_score global tidak ikut menentukan skor", () => {
  const base = { title: "Frontend Developer", description: "React dan TypeScript" };
  const a = computeMatch({ ...base, match_score: 5 } as any, ["React"]);
  const b = computeMatch({ ...base, match_score: 99 } as any, ["React"]);
  assert.deepEqual(a, b);
  assert.equal(a.score, 50);
});

test("skill profil dibaca dari user_skills dan dari skills_used di pengalaman, tanpa duplikat", () => {
  const list = profileSkillList({
    skills: [{ name: "React" }, { name: " TypeScript " }, { name: "" }, { name: null }, null],
    experiences: [{ skills_used: ["react", "Docker", " "] }, { skills_used: "Go, SQL" }, { skills_used: null }, null],
  });
  assert.deepEqual(list, ["React", "TypeScript", "Docker", "Go", "SQL"]);
  assert.deepEqual(profileSkillList({}), []);
  assert.deepEqual(profileSkillList({ skills: "bukan array", experiences: 5 }), []);
});

test("skill yang hanya ada di pengalaman ikut dihitung", () => {
  const skills = profileSkillList({ skills: [], experiences: [{ skills_used: ["Docker", "Kubernetes"] }] });
  const m = computeMatch({ description: "Pengalaman Docker dan Kubernetes diutamakan" }, skills);
  assert.equal(m.score, 100);
});

test("pencocokan utuh per kata: Java tidak cocok dengan JavaScript, SQL tidak cocok dengan MySQL", () => {
  assert.equal(computeMatch({ description: "Membutuhkan JavaScript" }, ["Java"]).score, 0);
  assert.deepEqual(computeMatch({ description: "Membutuhkan MySQL" }, ["SQL"]).matched, []);
  assert.deepEqual(computeMatch({ description: "Membutuhkan MySQL" }, ["MySQL"]).matched, ["MySQL"]);
});

test("alias dikenali: ReactJS, Node, Postgres di profil cocok dengan React, Node.js, PostgreSQL di lowongan", () => {
  const m = computeMatch({ description: "Stack: React, Node.js, PostgreSQL" }, ["ReactJS", "Node", "Postgres"]);
  assert.equal(m.score, 100);
  assert.equal(m.total, 3);
});

test("nama yang lebih panjang menelan yang pendek: React Native tidak dihitung ganda sebagai React", () => {
  const m = computeMatch({ description: "Pengalaman React Native" }, ["React"]);
  assert.equal(m.total, 1);
  assert.deepEqual(m.missing, ["React Native"]);
  assert.equal(m.score, 0);
});

test("C++, C#, dan .NET terbaca; Go hanya lewat golang di lowongan, tetapi Go di profil dikenali", () => {
  assert.deepEqual(computeMatch({ description: "Menguasai C++ dan C#" }, ["C++", "C#"]).matched.sort(), ["C#", "C++"]);
  assert.equal(computeMatch({ description: "ASP.NET Core" }, [".NET"]).score, 100);
  // kata Inggris "go" bukan bahasa Go
  assert.equal(computeMatch({ description: "Kuasai go-to-market dan React" }, ["Go"]).score, 0);
  assert.equal(computeMatch({ description: "Backend dengan Golang dan React" }, ["Go", "React"]).score, 100);
});

test("HTML di deskripsi dibuang sebelum dibaca", () => {
  const m = computeMatch({ description: "<ul><li>React</li><li><b>Docker</b></li></ul>" }, ["React", "Docker"]);
  assert.equal(m.score, 100);
});

test("skill profil di luar kamus yang disebut langsung di lowongan ikut dihitung", () => {
  const m = computeMatch({ description: "Dibutuhkan pengalaman Farmakologi dan React" }, ["Farmakologi", "React"]);
  assert.deepEqual(m.matched.sort(), ["Farmakologi", "React"]);
  assert.equal(m.score, 100);
});

test("item requirements yang berupa kalimat panjang atau angka tahun tidak dianggap skill", () => {
  const m = computeMatch(
    { description: "React", requirements: ["Minimal 3 tahun pengalaman", "Pengalaman bekerja di tim besar dan terdistribusi lintas zona waktu", "Fresh graduate"] },
    ["React"],
  );
  assert.equal(m.total, 1);
  assert.equal(m.score, 100);
});

test("urutan: skor tinggi lebih dulu, tanpa skor di akhir, urutan asal dipertahankan bila sama", () => {
  const jobs = [
    { id: "a", s: 40 },
    { id: "b", s: null },
    { id: "c", s: 90 },
    { id: "d", s: 40 },
    { id: "e", s: 0 },
  ];
  assert.deepEqual(sortByMatch(jobs, (j) => j.s).map((j) => j.id), ["c", "a", "d", "e", "b"]);
  // masukan tidak diubah
  assert.deepEqual(jobs.map((j) => j.id), ["a", "b", "c", "d", "e"]);
});

// ---- kabel antarmuka ----------------------------------------------------------------------------------

test("halaman Lowongan: saringan 80% dan urutan memakai skor per pengguna, bukan jobs.match_score", () => {
  const page = read("../src/routes/jobs.tsx");
  assert.match(page, /from "@\/lib\/matchScore"/);
  assert.match(page, /computeMatch\(job, profileSkills\)/);
  assert.match(page, /\(scoreOf\(job\) \?\? -1\) >= HIGH_MATCH_THRESHOLD/);
  assert.match(page, /const scoreOf = \(job: JobData\): number \| null => matchOf\(job\)\?\.score \?\? null/);
  assert.match(page, /sortByMatch\(/);
  // skor global tidak lagi dipakai untuk saringan, hitungan, atau urutan di halaman
  assert.doesNotMatch(page, /job\.match_score >= 80|j\.match_score >= 85|\.order\("match_score"/);
  // skill profil dari database, galatnya ditampilkan
  assert.match(page, /profileService\.getSkillSource\(/);
  assert.match(page, /Kecocokan belum bisa dihitung/);
});

test("kartu lowongan: persen hanya dari skor per pengguna, tanpa skor global dan tanpa Peluang diterima, Budaya, Pertumbuhan", () => {
  const card = read("../src/components/JobCard.tsx").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.doesNotMatch(card, /job\.match_score|scoreOrNull\(job\.(acceptance_potential|company_culture_score|growth_potential)\)/);
  assert.doesNotMatch(card, /Peluang diterima|Budaya|Pertumbuhan/);
  assert.match(card, /matchCaption\(match\)/);
  assert.match(card, /NO_PROFILE_SKILLS_TEXT/);
  assert.match(card, /to="\/profile"/);
});

test("profileService.getSkillSource membaca user_skills dan work_experiences.skills_used, dan melempar galat database", () => {
  const svc = read("../src/services/profileService.ts");
  const fn = svc.slice(svc.indexOf("async getSkillSource"), svc.indexOf("// Work Experiences CRUD"));
  assert.match(fn, /from\("user_skills"\)\.select\("name"\)\.eq\("user_id", userId\)/);
  assert.match(fn, /from\("work_experiences"\)\.select\("skills_used"\)\.eq\("user_id", userId\)/);
  assert.equal([...fn.matchAll(/throw new Error\(/g)].length, 2);
});

test("jumlah tailoredSkills dari AI tidak dilabeli skill cocok, supaya tidak bertentangan dengan N dari M", () => {
  for (const rel of ["../src/components/AIApplyModal.tsx", "../src/routes/applications.tsx"]) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.doesNotMatch(src, />Skill Cocok</);
    assert.doesNotMatch(src, /tailored_skills\?\.length \|\| 0\} skill cocok/);
    assert.match(src, /skill disorot AI/i);
  }
});

// Uji klik 21 November 2026, temuan 23 dan 24.

test("temuan 23: judul jabatan dan frasa keterangan di requirements bukan skill", () => {
  const job = {
    title: "Staf Merchandiser - Fullstack Developer",
    description: "",
    requirements: ["Staf Merchandiser", "Berpengalaman diutamakan", "Excel", "Komunikasi"],
  };
  const m = computeMatch(job, ["Excel"]);
  assert.equal(m.status, "ok");
  assert.deepEqual(m.matched, ["Excel"]);
  assert.deepEqual(m.missing, ["Komunikasi"]);
  assert.equal(m.total, 2);
  assert.equal(m.score, 50);
  for (const bukan of ["Staf Merchandiser", "Berpengalaman diutamakan"]) assert.ok(![...m.matched, ...m.missing].includes(bukan), bukan);
});

test("temuan 23: cleanSkillTerm menolak kalimat, frasa keterangan, dan peran; skill pendek lolos", () => {
  for (const bukan of [
    "Berpengalaman diutamakan",
    "Berpengalaman minimal 2 tahun",
    "Pengalaman di bidang sejenis",
    "Nilai plus",
    "Lebih disukai",
    "Mampu bekerja mandiri",
    "Memiliki kemampuan analisa",
    "Memiliki kemampuan menggunakan perangkat lunak komputer",
    "Mampu bekerja secara mandiri maupun tim",
    "IT SYSTEM DEVELOPMENT",
    "Responsible, proactive",
    "",
    "   ",
    42,
    null,
  ]) assert.equal(cleanSkillTerm(bukan), null, String(bukan));
  assert.equal(cleanSkillTerm("- Excel;"), "Excel");
  assert.equal(cleanSkillTerm("Komunikasi"), "Komunikasi");
  assert.equal(cleanSkillTerm("SQL"), "SQL");
  assert.equal(cleanSkillTerm("Analisis data"), "Analisis data");
});

test("temuan 24: Skill yang Disorot memakai kecocokan profil bila ada, dan tidak pernah kalimat persyaratan", () => {
  const kalimat = [
    "Memiliki kemampuan menggunakan perangkat lunak komputer",
    "Memiliki kemampuan analisa yang baik",
    "Mampu bekerja secara mandiri maupun tim",
  ];
  // kecocokan profil diketahui: itulah isinya, apa pun keluaran model
  assert.deepEqual(highlightedSkills(kalimat, ["Excel", "Komunikasi"]), ["Excel", "Komunikasi"]);
  // tanpa kecocokan: kalimat persyaratan dibuang
  assert.deepEqual(highlightedSkills(kalimat), []);
  assert.deepEqual(highlightedSkills([...kalimat, "Excel", "excel", "Komunikasi"]), ["Excel", "Komunikasi"]);
  // bentuk rusak tidak melempar
  for (const bad of [undefined, null, "Excel", 5, {}, [1, null, ""]]) assert.deepEqual(highlightedSkills(bad), []);
  // dibatasi 8 butir
  assert.equal(highlightedSkills(["A1x", "B", "C", "D", "E", "F", "G", "H", "I", "J"].map((x) => `Skill ${x}`).map((x) => x.replace(/\d/g, ""))).length, 8);
});

test("temuan 24: draf lama dengan kalimat di tailored_skills disaring saat ditampilkan, dan tampilan memakai highlightedSkills", () => {
  for (const rel of ["../src/components/AIApplyModal.tsx", "../src/routes/applications.tsx"]) {
    assert.match(read(rel), /highlightedSkills\(/, rel);
  }
  assert.doesNotMatch(read("../src/routes/applications.tsx"), /selectedApp\.tailored_skills\.map/);
  assert.match(read("../src/lib/draftApproval.ts"), /highlightedSkills\(app\.tailored_skills, matchedSkills\)/);
});
