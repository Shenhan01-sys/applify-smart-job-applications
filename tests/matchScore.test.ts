import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HIGH_MATCH_THRESHOLD,
  NO_PROFILE_SKILLS_TEXT,
  cleanSkillTerm,
  computeMatch,
  displaySkillGaps,
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

test("temuan 24: Skill yang Disorot tidak pernah kalimat persyaratan, dengan atau tanpa skill profil", () => {
  const kalimat = [
    "Memiliki kemampuan menggunakan perangkat lunak komputer",
    "Memiliki kemampuan analisa yang baik",
    "Mampu bekerja secara mandiri maupun tim",
  ];
  // skill profil belum diketahui: kalimat persyaratan dibuang, duplikat dibuang
  assert.deepEqual(highlightedSkills(kalimat), []);
  assert.deepEqual(highlightedSkills([...kalimat, "Excel", "excel", "Komunikasi"]), ["Excel", "Komunikasi"]);
  // skill profil diketahui: kalimat tetap dibuang, dan hanya skill profil yang tampil
  assert.deepEqual(highlightedSkills([...kalimat, "Excel", "Komunikasi", "Docker"], ["Excel", "Komunikasi"]), ["Excel", "Komunikasi"]);
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
  assert.match(read("../src/lib/draftApproval.ts"), /highlightedSkills\(app\.tailored_skills, profileSkills\)/);
});

test("temuan 29: daftar skill yang belum ada di profil membuang judul jabatan, kalimat persyaratan, dan syarat pendidikan", () => {
  // butir nyata dari uji klik 21 November 2026 (draf Staf Merchandiser)
  const model = [
    "Staf Merchandiser",
    "Pendidikan S1 semua jurusan",
    "Pengalaman kerja merchandising",
    "Visual Merchandising",
    "Analisis penjualan",
    "Microsoft Excel",
  ];
  assert.deepEqual(displaySkillGaps(model, "Staf Merchandiser"), ["Visual Merchandising", "Analisis penjualan", "Microsoft Excel"]);
  // judul yang lebih panjang memuat potongan "Staf Merchandiser"
  assert.deepEqual(displaySkillGaps(["Staf Merchandiser", "SQL"], "Staf Merchandiser - Fullstack Developer"), ["SQL"]);
  // huruf besar-kecil dan tanda baca pada judul tidak menghalangi
  assert.deepEqual(displaySkillGaps(["staf merchandiser"], "STAF MERCHANDISER (Jakarta)"), []);
  // skill kamus tetap skill walau kata itu ada di judul
  assert.deepEqual(displaySkillGaps(["React"], "React Developer"), ["React"]);
  // kata judul yang hanya potongan kata lain tidak ikut terbuang ("java" bukan bagian dari "javascript")
  assert.deepEqual(displaySkillGaps(["Java"], "JavaScript Developer"), ["Java"]);
  // tanpa judul, hanya penyaring frasa yang berlaku
  assert.deepEqual(displaySkillGaps(model), ["Staf Merchandiser", "Visual Merchandising", "Analisis penjualan", "Microsoft Excel"]);
  // duplikat dibuang, batas 8 butir, bentuk rusak tidak melempar
  assert.deepEqual(displaySkillGaps(["Excel", "excel", "EXCEL"], ""), ["Excel"]);
  assert.equal(displaySkillGaps("ABCDEFGHIJ".split("").map((c) => `Skill ${c}`), "").length, 8);
  for (const bad of [undefined, null, "Excel", 5, {}, [1, null, ""]]) assert.deepEqual(displaySkillGaps(bad, "x"), []);
  for (const badTitle of [undefined, null, 5, {}]) assert.deepEqual(displaySkillGaps(["Excel"], badTitle), ["Excel"]);
});

test("temuan 29: tab Strategi AI menampilkan daftar yang sudah disaring dengan judul lowongan", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  assert.match(src, /displaySkillGaps\(skillGaps, jobTitle\)/);
  const tab = src.slice(src.indexOf('activeTab === "strategy"'), src.indexOf("{/* Footer Actions */}"));
  assert.match(tab, /shownSkillGaps\.map\(/);
  assert.doesNotMatch(tab, /[^n]skillGaps\.map\(/);
});

test("temuan 30: draf lama disaring dengan skill profil saat ditampilkan (irisan, ejaan profil, kata utuh)", () => {
  // butir nyata dari draf lama Web3 Developer (uji klik 21 November 2026)
  const lama = ["React", "Decentralized Applications", "Smart Contracts", "Blockchain Technology", "TypeScript"];
  const profil = ["react", "TypeScript", "Tailwind CSS", "Git"];
  // hanya skill profil, ejaan profil
  assert.deepEqual(highlightedSkills(lama, profil), ["react", "TypeScript"]);
  // skill profil belum diketahui (null): hanya penyaring frasa, perilaku lama
  assert.deepEqual(highlightedSkills(lama, null), lama);
  assert.deepEqual(highlightedSkills(lama), lama);
  // profil tanpa skill: tidak ada yang tampil
  assert.deepEqual(highlightedSkills(lama, []), []);
  // butir model yang memuat skill profil sebagai kata utuh dipetakan ke skill profil, dan duplikat dibuang
  assert.deepEqual(highlightedSkills(["Smart Contracts", "Smart Contracts Development", "smart contracts"], ["Smart Contracts"]), ["Smart Contracts"]);
  // pencocokan kata utuh: "Java" bukan skill profil "JavaScript", dan skill dua huruf ("Go") hanya cocok bila sama persis
  assert.deepEqual(highlightedSkills(["Java", "Go", "Google Cloud"], ["JavaScript", "Go"]), ["Go"]);
  // kalimat persyaratan tetap dibuang walau memuat skill profil
  assert.deepEqual(highlightedSkills(["Memiliki kemampuan React", "React"], ["React"]), ["React"]);
  // bentuk rusak tidak melempar
  for (const bad of [undefined, null, "React", 5, {}, [1, null, ""]]) assert.deepEqual(highlightedSkills(bad, profil), []);
});

test("temuan 30: Lamaran Saya memuat skill profil dan memakainya di jendela detail dan di daftar", () => {
  const src = read("../src/routes/applications.tsx");
  assert.match(src, /profileSkillList\(await profileService\.getSkillSource\(user\.id\)\)/);
  assert.match(src, /highlightedSkills\(selectedApp\.tailored_skills, profileSkills\)/);
  assert.match(src, /highlightedSkills\(app\.tailored_skills, profileSkills\)/);
  // tidak ada pemanggilan tanpa skill profil yang tersisa
  assert.doesNotMatch(src, /highlightedSkills\((?:selectedApp|app)\.tailored_skills\)/);
  // galat memuat profil tidak menjatuhkan halaman: hanya dicatat, daftar memakai penyaring frasa
  assert.match(src, /catch \(err\) \{\s*console\.warn\("Skill profil belum bisa dimuat/);
});

// ---- temuan 34: satu jalur untuk jendela draf di Lowongan dan Lamaran Saya ----

// isi tailored_skills draf lama Web3 Developer yang tersimpan, dan skill profil akun uji (uji klik 21 November 2026)
const WEB3_TERSIMPAN = ["Privy Wallet", "Google Gemini", "Decentralized Applications", "Smart Contracts", "Blockchain Technology"];
const WEB3_PROFIL = ["Google Gemini", "Web3", "Privy Wallet"];

test("temuan 34: draf Web3 Developer menampilkan skill yang sama di mana pun, bukan hasil computeMatch", () => {
  // tailored_skills tersimpan disaring dengan skill profil: ejaan profil, urutan draf
  assert.deepEqual(highlightedSkills(WEB3_TERSIMPAN, WEB3_PROFIL), ["Privy Wallet", "Google Gemini"]);
  // computeMatch untuk lowongan yang menyebut Web3 menghasilkan ["Web3"]; itu bukan isi draf dan tidak lagi dipakai
  const m = computeMatch({ title: "Web3 Developer", description: "Membangun aplikasi Web3 dan smart contracts." }, WEB3_PROFIL);
  assert.deepEqual(m.matched, ["Web3"]);
  // masukan yang sama selalu keluaran yang sama, termasuk huruf besar-kecil dan duplikat
  assert.deepEqual(highlightedSkills([...WEB3_TERSIMPAN, "privy wallet", "GOOGLE GEMINI"], WEB3_PROFIL), ["Privy Wallet", "Google Gemini"]);
  // skill profil yang bernama berangka ("Web3") lolos bila tersimpan di draf, walau penyaring frasa menolak angka
  assert.deepEqual(highlightedSkills(["web3", "Smart Contracts"], WEB3_PROFIL), ["Web3"]);
  assert.deepEqual(highlightedSkills(["Web3 Development"], WEB3_PROFIL), ["Web3"]);
  // angka tidak meloloskan butir yang bukan skill profil, dan tanpa skill profil aturan angka lama tetap berlaku
  assert.deepEqual(highlightedSkills(["Pendidikan S1 semua jurusan", "Web3 Development"], ["Excel"]), []);
  assert.deepEqual(highlightedSkills(["Web3", "Pendidikan S1 semua jurusan"], null), []);
});

test("temuan 34: skill dua huruf 'Go' tidak cocok dengan 'Google Gemini'", () => {
  // butir "Go" pada draf, profil tanpa skill Go: dibuang
  assert.deepEqual(highlightedSkills(["Go", "Google Gemini"], WEB3_PROFIL), ["Google Gemini"]);
  assert.deepEqual(highlightedSkills(["Go"], WEB3_PROFIL), []);
  // skill profil "Go" hanya cocok dengan "Go" yang persis, tidak dengan Google Gemini atau Google Cloud
  assert.deepEqual(highlightedSkills(["Go", "Google Gemini", "Google Cloud"], ["Go"]), ["Go"]);
  assert.deepEqual(highlightedSkills(["Google Gemini"], ["Go"]), []);
  // arah sebaliknya: butir "Gemini" menunjuk skill profil "Google Gemini" (kata utuh), ejaan profil dipakai
  assert.deepEqual(highlightedSkills(["gemini"], WEB3_PROFIL), ["Google Gemini"]);
  // "Java" bukan "JavaScript"
  assert.deepEqual(highlightedSkills(["Java"], ["JavaScript"]), []);
});

test("temuan 34: jendela draf, detail Lamaran Saya, dan hitungan kartu memanggil highlightedSkills dengan masukan yang sama", () => {
  const modal = read("../src/components/AIApplyModal.tsx");
  const apps = read("../src/routes/applications.tsx");
  // masukan: isi mentah tailored_skills draf dan skill profil; tidak ada argumen kecocokan lowongan (computeMatch) lagi
  assert.match(modal, /highlightedSkills\(rawSkills, profileSkills\)/);
  assert.match(apps, /highlightedSkills\(selectedApp\.tailored_skills, profileSkills\)/);
  assert.match(apps, /highlightedSkills\(app\.tailored_skills, profileSkills\)/);
  assert.doesNotMatch(modal, /highlightedSkills\([^)]*match\??\.matched/);
  assert.doesNotMatch(read("../src/lib/draftApproval.ts"), /matchedSkills/);
  // satu definisi saja
  const defs = [...read("../src/lib/matchScore.ts").matchAll(/export function highlightedSkills\(/g)];
  assert.equal(defs.length, 1);
});

// ---- temuan 29 (uji ulang): penyaring tidak membuang skill sungguhan, kotak hilang karena draf lama tidak menyimpan daftarnya ----

const BUTIR_STAF_MERCHANDISER = [
  "Staf Merchandiser",
  "Pendidikan S1 semua jurusan",
  "Pengalaman kerja merchandising",
  "Microsoft Office",
  "Microsoft Excel",
  "Java",
  "MySQL",
  "PostgreSQL",
  "Sistem pembelian",
];

test("temuan 29: sembilan butir nyata Staf Merchandiser, hanya skill sungguhan yang tersisa dan urutannya dijaga", () => {
  const skill = ["Microsoft Office", "Microsoft Excel", "Java", "MySQL", "PostgreSQL", "Sistem pembelian"];
  for (const judul of ["Staf Merchandiser - Fullstack Developer", "Staf Merchandiser", ""]) {
    const hasil = displaySkillGaps(BUTIR_STAF_MERCHANDISER, judul);
    assert.deepEqual(hasil.filter((x) => skill.includes(x)), skill, `skill sungguhan utuh (judul: ${judul})`);
    // judul jabatan dibuang bila judul lowongan diketahui; syarat pendidikan dan kalimat pengalaman selalu dibuang
    assert.equal(hasil.includes("Pendidikan S1 semua jurusan"), false);
    assert.equal(hasil.includes("Pengalaman kerja merchandising"), false);
    assert.equal(hasil.includes("Staf Merchandiser"), judul === "", `judul jabatan (judul: ${judul})`);
  }
  // masing-masing skill sungguhan lolos sendirian, tidak bergantung pada butir lain
  for (const x of skill) assert.deepEqual(displaySkillGaps([x], "Staf Merchandiser - Fullstack Developer"), [x]);
});

test("temuan 29: daftar kesenjangan hanya ada untuk draf yang baru dibuat atau ditulis ulang, tidak untuk draf tersimpan", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  // kolom ai_applications tidak menyimpan skill yang belum ada di profil; daftar hanya datang dari analisis Edge Function
  assert.equal([...src.matchAll(/setSkillGaps\(/g)].length, 2, "buat draf dan tulis ulang");
  const muat = src.slice(src.indexOf("const loadExistingDraft"), src.indexOf("}, [jobId]);", src.indexOf("const loadExistingDraft")));
  assert.doesNotMatch(muat, /setSkillGaps/);
  // null (belum ada analisis) menyembunyikan kotak; daftar kosong tetap menampilkannya dengan keterangan
  assert.match(src, /skillGaps === null \? null : displaySkillGaps\(skillGaps, jobTitle\)/);
  assert.match(src, /shownSkillGaps !== null && \(/);
  assert.match(src, /Model tidak melaporkan kesenjangan skill/);
});

test("skill berangka yang sah (standar dan sertifikasi) tidak dibuang; angka syarat lain tetap ditolak", async () => {
  const { cleanSkillTerm } = await import("../src/lib/matchScore.ts");
  for (const t of ["ISO 27001", "ISO 9001:2015", "SOC 2", "PCI DSS", "NIST 800-53", "ITIL 4"]) assert.equal(cleanSkillTerm(t), t, t);
  for (const t of ["3 tahun", "S1", "IPK 3.0", "Min. 2 tahun", "2 years", "IT SYSTEM DEVELOPMENT"]) assert.equal(cleanSkillTerm(t), null, t);
});
