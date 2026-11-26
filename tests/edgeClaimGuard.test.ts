import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXPERIENCE_CLAIM_RULES,
  computeExperienceFacts,
  experiencePromptBlock,
  isTechnicalJob,
  isTechnicalRole,
  monthsLabelEn,
  monthsLabelId,
  parseDay,
} from "../supabase/functions/_shared/experience-facts.ts";
import {
  correctionNote,
  findClaimViolations,
  removalWarnings,
  removeViolatingSentences,
  type ClaimKnowledge,
} from "../supabase/functions/_shared/letter-claims.ts";
import {
  NEEDS_CHECK_LABEL,
  personalFactCategory,
  splitPersonalFactQuestions,
} from "../supabase/functions/_shared/personal-fact-questions.ts";

/**
 * Temuan E2E production 27 November 2026 (draf Coinbase Software Engineer Intern): surat menyebut kandidat "Web
 * Developer" dengan pengalaman "3 tahun". Profilnya di bawah ini persis daftar work_experiences di temuan itu.
 * Edge Function berjalan di Deno dan tidak bisa dijalankan di sini, jadi modul murninya dites langsung dan index.ts
 * diperiksa lewat teks sumber.
 */

const NOW = new Date("2026-11-27T05:00:00Z");

const HANS_ROLES = [
  { role_title: "Technical Team", company_name: "UKDW Blockchain Club", start_date: "2025-10-01", end_date: null, is_current: true, description: "Mengembangkan aplikasi blockchain kampus." },
  { role_title: "Web 3 Developer", company_name: "Baliola", start_date: "2026-02-01", end_date: null, is_current: true, description: "Membangun antarmuka dApp." },
  { role_title: "Freelance Full-Stack Developer", company_name: "POS KebayaOma", start_date: "2026-07-01", end_date: null, is_current: true, description: "Aplikasi kasir untuk butik." },
  { role_title: "Teaching Assistant", company_name: "UKDW", start_date: "2025-01-01", end_date: null, is_current: true, description: "Mendampingi praktikum mahasiswa." },
  { role_title: "Student Staff", company_name: "UKDW", start_date: "2025-02-01", end_date: "2025-08-31", is_current: false, description: "Membantu administrasi." },
  { role_title: "Fitness Coach", company_name: "Gym Sehat", start_date: "2023-12-01", end_date: "2025-12-01", is_current: false, description: "Melatih anggota gym." },
];

const COINBASE = { jobTitle: "Software Engineer Intern", jobDescription: "Build and test software for the exchange. TypeScript and React." };
const facts = (over: Record<string, unknown> = {}) =>
  computeExperienceFacts(HANS_ROLES, { now: NOW, ...COINBASE, declaredYears: 3, ...over } as Parameters<typeof computeExperienceFacts>[1]);

const knowledge = (claimMonths: number): ClaimKnowledge => ({
  claimMonths,
  titles: ["Web 3 Developer", ...HANS_ROLES.map((r) => r.role_title), "Software Engineer Intern"],
  knownText: [
    "Hans Gunawan", "Yogyakarta", "Coinbase", "Software Engineer Intern", "Universitas Kristen Duta Wacana",
    ...HANS_ROLES.flatMap((r) => [r.company_name, r.role_title, r.description]),
  ].join("\n"),
});

// ---- 1. lama pengalaman dihitung di kode -------------------------------------------------------------

test("profil Hans: pengalaman teknis 13 bulan, bukan 3 tahun; peran non-teknis dipisah", () => {
  const f = facts();
  assert.equal(f.technicalMonths, 13);
  assert.equal(f.technicalRoles.length, 3);
  assert.deepEqual(f.technicalRoles, ["Technical Team @ UKDW Blockchain Club", "Web 3 Developer @ Baliola", "Freelance Full-Stack Developer @ POS KebayaOma"]);
  // Fitness Coach, Student Staff, dan Teaching Assistant tanpa isi pemrograman bukan pengalaman teknis.
  assert.deepEqual(f.nonTechnicalRoles, ["Teaching Assistant @ UKDW", "Student Staff @ UKDW", "Fitness Coach @ Gym Sehat"]);
  assert.equal(f.nonTechnicalMonths, 35);
  assert.equal(f.totalMonths, 35, "peran yang bertumpuk dihitung sekali");
  // Lowongan teknis: batasnya hanya pengalaman teknis, dan angka isian profil (3) diabaikan karena ada peran bertanggal.
  assert.equal(f.jobIsTechnical, true);
  assert.equal(f.claimMonths, 13);
  assert.equal(f.basis, "technical");
  assert.equal(f.declaredYears, 3);
  assert.ok(f.claimMonths < 36, "3 tahun melebihi batas");
});

test("lowongan non-teknis memakai semua peran bertanggal; lowongan teknis tanpa peran teknis tidak boleh mengklaim durasi", () => {
  const marketing = facts({ jobTitle: "Marketing Manager", jobDescription: "Plan campaigns." });
  assert.equal(marketing.jobIsTechnical, false);
  assert.equal(marketing.claimMonths, 35);
  assert.equal(marketing.basis, "total");

  const onlyFitness = computeExperienceFacts([HANS_ROLES[5]], { now: NOW, ...COINBASE, declaredYears: 3 });
  assert.equal(onlyFitness.technicalMonths, 0);
  assert.equal(onlyFitness.claimMonths, 0);
  assert.match(experiencePromptBlock(onlyFitness), /most you may claim for this job is 0 months\. Do not state any duration/);
});

test("tanpa peran bertanggal: angka isian pengguna dipakai dan ditandai belum terverifikasi; tanpa keduanya nol", () => {
  const declared = computeExperienceFacts([{ role_title: "Developer", company_name: "X", start_date: null }], { now: NOW, ...COINBASE, declaredYears: 2 });
  assert.equal(declared.skippedRoles, 1);
  assert.equal(declared.basis, "declared");
  assert.equal(declared.claimMonths, 24);
  assert.match(experiencePromptBlock(declared), /unverified/);
  const none = computeExperienceFacts([], { now: NOW, ...COINBASE });
  assert.equal(none.claimMonths, 0);
  assert.equal(none.basis, "none");
  assert.equal(computeExperienceFacts(null, { now: NOW }).claimMonths, 0);
});

test("tanggal: format sebagian terbaca, tanggal rusak atau di masa depan tidak dihitung, selesai di masa depan dipotong", () => {
  assert.equal(parseDay("2025-10-01"), parseDay("2025-10"), "bulan saja = tanggal 1");
  assert.equal(parseDay("2025"), parseDay("2025-01-01"));
  assert.equal(parseDay("bukan tanggal"), null);
  assert.equal(parseDay(null), null);
  assert.equal(parseDay("2025-13-01"), null);
  const future = computeExperienceFacts(
    [
      { role_title: "Developer", company_name: "A", start_date: "2027-01-01", end_date: null },
      { role_title: "Developer", company_name: "B", start_date: "2026-05-27", end_date: "2030-01-01" },
      { role_title: "Developer", company_name: "C", start_date: "2026-09-01", end_date: "2026-01-01" },
    ],
    { now: NOW, ...COINBASE },
  );
  assert.equal(future.skippedRoles, 2);
  assert.equal(future.technicalMonths, 6, "selesai di masa depan dipotong ke hari ini");
});

test("klasifikasi condong ke bukan teknis: deskripsi hanya menaikkan jabatan fleksibel", () => {
  assert.equal(isTechnicalRole({ role_title: "Fitness Coach", company_name: "Gym", description: "Belajar programming dan React di waktu luang" }), false);
  assert.equal(isTechnicalRole({ role_title: "Teaching Assistant", company_name: "UKDW", description: "Asisten praktikum pemrograman web dengan JavaScript" }), true);
  assert.equal(isTechnicalRole({ role_title: "Teaching Assistant", company_name: "UKDW", description: "Mendampingi mahasiswa" }), false);
  assert.equal(isTechnicalRole({ role_title: "Technical Team", company_name: "UKDW Blockchain Club" }), true);
  assert.equal(isTechnicalRole({ role_title: "Web 3 Developer", company_name: "Baliola" }), true);
  assert.equal(isTechnicalRole({ role_title: "Pengembang Web", company_name: "CV Maju" }), true);
  assert.equal(isTechnicalJob("Software Engineer Intern", ""), true);
  assert.equal(isTechnicalJob("Marketing Manager", "Plan campaigns"), false);
  assert.equal(isTechnicalJob("Staff", "Kami butuh orang yang menguasai javascript dan python untuk proyek kami"), true);
});

test("prompt memuat angka hasil hitungan dan melarang angka lain, jabatan, perusahaan, dan fakta pribadi karangan", () => {
  const block = experiencePromptBlock(facts());
  assert.match(block, /VERIFIED EXPERIENCE/);
  assert.match(block, /Technical roles: 13 months \(1 year 1 month\) - Technical Team @ UKDW Blockchain Club; Web 3 Developer @ Baliola; Freelance Full-Stack Developer @ POS KebayaOma/);
  assert.match(block, /Non-technical roles: 35 months \(2 years 11 months\) - Teaching Assistant @ UKDW; Student Staff @ UKDW; Fitness Coach @ Gym Sehat/);
  assert.match(block, /most you may claim is 13 months \(1 year 1 month\), and only as technical experience/);
  assert.match(block, /Do not write any other number of years or months of experience/);
  const rules = EXPERIENCE_CLAIM_RULES.join("\n");
  assert.match(rules, /Never write a number of years or months of experience/);
  assert.match(rules, /job title or a company name only if it appears/);
  assert.match(rules, /"Web 3 Developer" is not "Web Developer"/);
  assert.match(rules, /certificate, a licence/);
  assert.match(rules, /citizenship, visa or work authorisation, relatives of officials, previous employment at the target company, how you found the job/);
  assert.equal(monthsLabelEn(13), "13 months (1 year 1 month)");
  assert.equal(monthsLabelEn(1), "1 month");
  assert.equal(monthsLabelEn(24), "24 months (2 years)");
  assert.equal(monthsLabelId(13), "1 tahun 1 bulan");
  assert.equal(monthsLabelId(0), "0 bulan");
});

// ---- 3. penguji klaim ---------------------------------------------------------------------------------

const BAD_ID =
  "Yth. Tim Rekrutmen Coinbase,\n\nSaya Hans Gunawan melamar posisi Software Engineer Intern di Coinbase. Saya adalah seorang Web Developer dengan pengalaman 3 tahun di bidang pengembangan web.\n\nDi UKDW Blockchain Club saya membangun aplikasi blockchain kampus bersama tim teknis. Saya terbiasa bekerja dengan TypeScript dan React.\n\nTerima kasih atas waktu Anda.";

test("surat contoh dari temuan: 'Web Developer' dan '3 tahun' ditolak", () => {
  const found = findClaimViolations(BAD_ID, knowledge(13));
  const kinds = found.map((v) => `${v.kind}:${v.claim}`);
  assert.ok(kinds.includes("experience_duration:3 tahun"), kinds.join(" | "));
  assert.ok(kinds.includes("job_title:Web Developer"), kinds.join(" | "));
  // Kalimat perkenalan, pendidikan, dan isi lain tidak ikut.
  assert.equal(new Set(found.map((v) => v.sentence)).size, 1);
});

test("klaim yang sesuai data lolos: 13 bulan, lebih dari setahun, jabatan dan perusahaan persis seperti profil, lowongan target", () => {
  const ok = [
    "Selama 13 bulan terakhir saya bekerja sebagai Web 3 Developer di Baliola.",
    "Saya memiliki pengalaman lebih dari setahun di bidang pengembangan perangkat lunak.",
    "Saya memiliki pengalaman 8 bulan membangun aplikasi kasir sebagai Freelance Full-Stack Developer di POS KebayaOma.",
    "Saya tertarik melamar sebagai Software Engineer Intern di Coinbase.",
    "Saya bekerja sebagai Technical Team di UKDW Blockchain Club sejak Oktober 2025.",
    "Saya menempuh studi selama 4 tahun di Universitas Kristen Duta Wacana.",
    "Saya mengikuti bootcamp pemrograman selama 3 bulan.",
    "I worked as a Web 3 Developer at Baliola for 1 year.",
    "Saya bertugas sebagai Teaching Assistant di UKDW.",
  ];
  for (const sentence of ok) {
    assert.deepEqual(findClaimViolations(sentence, knowledge(13)), [], sentence);
  }
});

test("klaim lama pengalaman yang melebihi batas ditolak, dalam kata dan angka, Indonesia dan Inggris", () => {
  const bad = [
    "Saya memiliki pengalaman 3 tahun di bidang web.",
    "Dengan 3+ tahun pengalaman, saya siap berkontribusi.",
    "Saya berpengalaman selama tiga tahun dalam pengembangan web.",
    "Saya memiliki pengalaman dua tahun sebagai developer.",
    "I bring 3+ years of experience in software development.",
    "I have two years of professional experience.",
    "Saya bekerja selama 14 bulan di bidang ini.",
    "Saya memiliki pengalaman 1,5 tahun.",
  ];
  for (const sentence of bad) {
    const found = findClaimViolations(sentence, knowledge(13));
    assert.ok(found.some((v) => v.kind === "experience_duration"), sentence);
  }
  // Tanpa data teknis sama sekali, durasi apa pun ditolak, termasuk satu bulan.
  assert.equal(findClaimViolations("Saya memiliki pengalaman 1 bulan.", knowledge(0)).length, 1);
});

test("jabatan yang tidak ada di profil ditolak, termasuk kenaikan jabatan dan perubahan nama", () => {
  const bad = [
    "Saya adalah seorang Web Developer yang antusias.",
    "Saya bekerja sebagai Senior Web 3 Developer di Baliola.",
    "I am a Senior Software Engineer with strong skills.",
    "Saya menjabat sebagai Project Manager di UKDW Blockchain Club.",
  ];
  for (const sentence of bad) {
    assert.ok(findClaimViolations(sentence, knowledge(13)).some((v) => v.kind === "job_title"), sentence);
  }
  // Bukan jabatan: tidak ada kata jabatan, atau kalimat tentang maksud melamar.
  for (const sentence of ["Saya adalah mahasiswa Sistem Informasi.", "Saya melamar sebagai Software Engineer Intern di Coinbase."]) {
    assert.deepEqual(findClaimViolations(sentence, knowledge(13)), [], sentence);
  }
});

test("perusahaan tempat bekerja yang tidak ada di profil ditolak; tempat lain dan lokasi tidak", () => {
  const bad = [
    "Saya pernah bekerja sebagai Web 3 Developer di PT Palsu Teknologi.",
    "I worked as a Web 3 Developer at Google.",
    "Saya magang di Tokopedia selama 6 bulan.",
  ];
  for (const sentence of bad) {
    assert.ok(findClaimViolations(sentence, knowledge(13)).some((v) => v.kind === "employer"), sentence);
  }
  const ok = ["Saya bekerja di Yogyakarta sambil kuliah.", "Saya bekerja di Baliola sebagai Web 3 Developer.", "Saya berminat bekerja di Coinbase."];
  for (const sentence of ok) assert.deepEqual(findClaimViolations(sentence, knowledge(13)), [], sentence);
});

test("kalimat yang melanggar dihapus, paragraf lain utuh, dan paragraf yang kosong hilang", () => {
  const found = findClaimViolations(BAD_ID, knowledge(13));
  const cleaned = removeViolatingSentences(BAD_ID, found);
  assert.doesNotMatch(cleaned, /3 tahun|Web Developer/);
  assert.match(cleaned, /Saya Hans Gunawan melamar posisi Software Engineer Intern di Coinbase\./);
  assert.match(cleaned, /Di UKDW Blockchain Club saya membangun aplikasi blockchain kampus/);
  assert.equal(cleaned.split("\n\n").length, 4, "salam, perkenalan (tanpa kalimat palsu), isi, penutup");
  assert.deepEqual(findClaimViolations(cleaned, knowledge(13)), []);
  assert.equal(removeViolatingSentences(BAD_ID, []), BAD_ID);
  // Paragraf yang isinya satu kalimat bermasalah ikut hilang.
  const one = "Paragraf satu yang aman dan cukup panjang.\n\nSaya memiliki pengalaman 5 tahun.\n\nPenutup yang sopan.";
  assert.equal(removeViolatingSentences(one, findClaimViolations(one, knowledge(13))), "Paragraf satu yang aman dan cukup panjang.\n\nPenutup yang sopan.");
});

test("catatan percobaan ulang menyebut klaim dan batas, dan catatan untuk pengguna menyebut apa yang dihapus", () => {
  const found = findClaimViolations(BAD_ID, knowledge(13));
  const note = correctionNote(found, knowledge(13));
  assert.match(note, /^CORRECTION:/);
  assert.match(note, /states "3 tahun" of experience, but the verified maximum is 13 month\(s\)/);
  assert.match(note, /names the job title "Web Developer"/);
  assert.match(note, /Write the whole JSON again/);
  const warnings = removalWarnings(found);
  assert.deepEqual(warnings.map((w) => w.kind).sort(), ["experience_duration", "job_title"]);
  assert.match(warnings.find((w) => w.kind === "experience_duration")?.message ?? "", /Kalimat tentang lama pengalaman dihapus.*3 tahun/);
});

// ---- Edge Function memasang semuanya --------------------------------------------------------------------

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("index.ts: pengalaman dihitung dari semua peran, prompt memakai fakta hitungan, bukan experience_years", () => {
  const src = read("../supabase/functions/generate-application/index.ts");
  assert.match(src, /\.select\("role_title, company_name, description, start_date, end_date, is_current"\)[\s\S]*?\.limit\(50\)/);
  assert.doesNotMatch(src, /work_experiences"\)\s*\.select\([^)]*\)\s*\.eq\("user_id", userId\)\.order\("start_date", \{ ascending: false \}\)\.limit\(3\)/);
  assert.match(src, /const experience = computeExperienceFacts\(work, \{/);
  assert.match(src, /declaredYears: profile\?\.experience_years/);
  assert.match(src, /\$\{experiencePromptBlock\(experience\)\}/);
  assert.doesNotMatch(src, /Total work experience across all roles \(years\): \$\{profile\?\.experience_years/);
  assert.match(src, /yearsOfExperience: Math\.floor\(experience\.claimMonths \/ 12\)/);
  assert.doesNotMatch(src, /yearsOfExperience: profile\?\.experience_years/);
  assert.match(src, /\[\.\.\.GROUNDING_RULES, \.\.\.EXPERIENCE_CLAIM_RULES\]/);
  // Prompt lama yang diuji tes lain tetap ada.
  assert.match(src, /LETTER STRUCTURE \(strict\):/);
});

test("index.ts: klaim palsu memicu satu percobaan ulang dengan peringatan, lalu kalimatnya dihapus; surat yang habis gagal terang-terangan", () => {
  const src = read("../supabase/functions/generate-application/index.ts");
  assert.match(src, /let claimViolations = findClaimViolations\(parsed\.coverLetter \?\? "", claimKnowledge\)/);
  assert.equal((src.match(/correctionNote\(claimViolations, claimKnowledge\)/g) ?? []).length, 1, "tepat satu percobaan ulang");
  assert.match(src, /temperature: 0\.3/);
  assert.match(src, /if \(remaining\.length < claimViolations\.length\)/);
  assert.match(src, /removeViolatingSentences\(parsed\.coverLetter \?\? "", removedClaims\)/);
  assert.match(src, /wordCount\(parsed\.coverLetter\) < MIN_WORDS_AFTER_CLAIM_REMOVAL/);
  assert.match(src, /reason: "unsupported_claims"/);
  // Waktu percobaan ulang dibatasi anggaran yang sama; tidak ada panggilan bila anggaran habis.
  assert.match(src, /if \(retryTimeoutMs > 0\)/);
  // Peringatan untuk pengguna ikut ke analysis.warnings dan ai_notes.
  assert.match(src, /\.\.\.removalWarnings\(removedClaims\)\.map/);
  // Jabatan dan perusahaan sah berasal dari seluruh riwayat kerja, bukan tiga peran terbaru.
  assert.match(src, /titles: \[[\s\S]*?\.\.\.\(work \?\? \[\]\)\.map\(\(w: any\) => String\(w\.role_title \?\? ""\)\)/);
});

// ---- 4. pertanyaan formulir yang butuh fakta pribadi ----------------------------------------------------

test("pertanyaan fakta pribadi dikenali (Inggris dan Indonesia) dan tidak dijawab AI", () => {
  const personal: Array<[string, string]> = [
    ["Are you a citizen of the United States?", "citizenship"],
    ["Apakah Anda warga negara Indonesia?", "citizenship"],
    ["Nationality", "citizenship"],
    ["Are you legally authorized to work in the country where this job is located?", "work_authorization"],
    ["Apakah Anda memiliki izin kerja?", "work_authorization"],
    ["Do you hold a valid work visa?", "work_authorization"],
    ["Will you now or in the future require sponsorship for employment visa status?", "sponsorship"],
    ["Do you have any relatives who are government officials or employees?", "government_relative"],
    ["Apakah Anda memiliki kerabat yang menjabat sebagai pejabat pemerintah?", "government_relative"],
    ["Have you previously worked at Coinbase?", "prior_employment"],
    ["Apakah Anda pernah bekerja di perusahaan ini?", "prior_employment"],
    ["How did you hear about this job?", "job_source"],
    ["Dari mana Anda mengetahui lowongan ini?", "job_source"],
    ["Are you available for a 12-week internship from June to August?", "internship_availability"],
    ["Apakah Anda bersedia mengikuti durasi magang selama 6 bulan?", "internship_availability"],
    ["What is your earliest start date?", "internship_availability"],
    ["Have you ever been convicted of a felony?", "criminal_record"],
    ["Gender", "demographics"],
    ["Veteran status", "demographics"],
  ];
  for (const [label, category] of personal) assert.equal(personalFactCategory(label), category, label);
});

test("pertanyaan yang boleh dijawab dari profil tidak ikut ditandai", () => {
  const fine = [
    "Why do you want to work at Coinbase?",
    "Link to your GitHub profile",
    "Years of experience with TypeScript",
    "Describe a project you are proud of",
    "Apa alasan Anda tertarik pada posisi ini?",
    "LinkedIn URL",
    "Nama lengkap",
    "Which programming languages do you know?",
    "",
  ];
  for (const label of fine) assert.equal(personalFactCategory(label), null, label);
  assert.equal(personalFactCategory(undefined), null);
  assert.equal(personalFactCategory(null, ["Yes", "No"]), null);
});

test("splitPersonalFactQuestions memisahkan yang harus dijawab pengguna dan memberi alasan, pilihan ikut dibaca", () => {
  const questions = [
    { key: "why", label: "Why do you want to join?" },
    { key: "citizen", label: "Citizenship status", options: ["Citizen", "Permanent resident"] },
    { key: "src", label: "Source", options: ["LinkedIn", "How did you hear about us - referral"] },
    { key: "visa", label: "Apakah Anda membutuhkan sponsor visa?" },
  ];
  const { answerable, needsUser } = splitPersonalFactQuestions(questions);
  assert.deepEqual(answerable.map((q) => q.key), ["why"]);
  assert.deepEqual(needsUser.map((n) => [n.question.key, n.category]), [
    ["citizen", "citizenship"],
    ["src", "job_source"],
    ["visa", "sponsorship"],
  ]);
  assert.ok(needsUser.every((n) => n.reason.length > 10));
  assert.equal(NEEDS_CHECK_LABEL, "Perlu dicek");
});
