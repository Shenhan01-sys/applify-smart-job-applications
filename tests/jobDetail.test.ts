import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BENCHMARK_MIN_SAMPLES,
  CLOSED_JOB_NOTE,
  GLINTS_DETAIL_NOTE,
  isClosedJob,
  shouldCheckSource,
  benchmarkScale,
  benchmarkText,
  benchmarkView,
  enrichFailureNote,
  formatMoney,
  formatMoneyRange,
  isProvisionalMatch,
  isThinDetail,
  DETAIL_MIN_DESCRIPTION_LENGTH,
  PROVISIONAL_MATCH_NOTE,
  matchBreakdown,
  mergeJobUpdate,
  needsDetail,
  needsGlintsNote,
  salaryText,
  skillAnalysisNote,
} from "../src/lib/jobDetail.ts";
import { computeMatch } from "../src/lib/matchScore.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const LONG = "Deskripsi lengkap. ".repeat(40); // 760 karakter
const TEASER = "Mencari staf IT support untuk perusahaan kami di Jakarta.";

// ---- lowongan ditutup ----

test("shouldCheckSource: JobStreet/Dealls dengan URL https dicek walau detailnya lengkap; yang closed, Glints, atau tanpa URL tidak", () => {
  const url = "https://id.jobstreet.com/id/job/1";
  assert.equal(shouldCheckSource({ platform_source: "jobstreet", external_url: url, status: "active", description: "x".repeat(700), requirements: ["Excel"] }), true);
  assert.equal(shouldCheckSource({ platform_source: "dealls", external_url: "https://dealls.com/loker/a~b", status: "active" }), true);
  assert.equal(shouldCheckSource({ platform_source: "jobstreet", external_url: url, status: "closed" }), false);
  assert.equal(shouldCheckSource({ platform_source: "glints", external_url: "https://glints.com/x", status: "active" }), false);
  assert.equal(shouldCheckSource({ platform_source: "jobstreet", external_url: null, status: "active" }), false);
  assert.equal(shouldCheckSource({ platform_source: "jobstreet", external_url: "http://localhost/x", status: "active" }), false);
});

test("isClosedJob dan CLOSED_JOB_NOTE", () => {
  assert.equal(isClosedJob({ status: "closed" }), true);
  assert.equal(isClosedJob({ status: "active" }), false);
  assert.equal(isClosedJob({}), false);
  assert.match(CLOSED_JOB_NOTE, /sudah ditutup di situs asal/);
});

test("JobCard: kartu closed menampilkan catatan dan tombol lamar dimatikan; kartu lengkap dicek diam-diam", () => {
  const src = readFileSync(new URL("../src/components/JobCard.tsx", import.meta.url), "utf8");
  assert.match(src, /!shouldCheckSource\(job\) \|\| detailAttempts\.has\(job\.id\)/);
  assert.match(src, /if \(showProgress\) setDetail\(\{ phase: "loading" \}\)/);
  assert.match(src, /merged && isClosedJob\(merged\)\) \{\s*onJobUpdated\?\.\(merged\)/);
  assert.match(src, /\{closed && \(\s*<p role="alert"[^>]*>\s*\{CLOSED_JOB_NOTE\}/);
  assert.match(src, /disabled=\{closed\}/);
  assert.match(src, /closed \? JOB_LABELS\.card\.closed : JOB_LABELS\.card\.apply/);
});

// ---- needsDetail ----

test("needsDetail: JobStreet dan Dealls dengan deskripsi pendek atau tanpa requirements perlu detail", () => {
  assert.equal(needsDetail({ platform_source: "jobstreet", description: TEASER, requirements: [] }), true);
  assert.equal(needsDetail({ platform_source: "dealls", description: TEASER, requirements: ["SQL"] }), true);
  assert.equal(needsDetail({ platform_source: "dealls", description: LONG, requirements: [] }), true);
  assert.equal(needsDetail({ platform_source: "jobstreet", description: LONG, requirements: [" ", ""] }), true);
  assert.equal(needsDetail({ platform_source: "jobstreet", description: null, requirements: null }), true);
});

test("needsDetail: deskripsi panjang dan requirements terisi tidak perlu diambil lagi", () => {
  assert.equal(needsDetail({ platform_source: "jobstreet", description: LONG, requirements: ["Excel"] }), false);
  assert.equal(needsDetail({ platform_source: "dealls", description: LONG, requirements: ["SQL", "Python"] }), false);
});

test("needsDetail: Glints dan sumber lain tidak pernah diambil; nama sumber tidak peka huruf besar", () => {
  assert.equal(needsDetail({ platform_source: "glints", description: TEASER, requirements: [] }), false);
  assert.equal(needsDetail({ platform_source: "linkedin", description: TEASER, requirements: [] }), false);
  assert.equal(needsDetail({ platform_source: "kalibrr", description: TEASER, requirements: [] }), false);
  assert.equal(needsDetail({ description: TEASER }), false);
  assert.equal(needsDetail({ platform_source: " JobStreet ", description: TEASER, requirements: [] }), true);
});

test("deskripsi HTML dihitung dari teksnya, bukan dari tag", () => {
  const html = "<p><strong><em></em></strong></p>".repeat(40) + "<p>pendek</p>";
  assert.equal(isThinDetail({ description: html, requirements: ["a"] }), true);
  assert.equal(isThinDetail({ description: LONG, requirements: ["a"] }), false);
});

test("needsGlintsNote: hanya Glints yang masih berisi ringkasan", () => {
  assert.equal(needsGlintsNote({ platform_source: "glints", description: TEASER, requirements: [] }), true);
  assert.equal(needsGlintsNote({ platform_source: "glints", description: LONG, requirements: ["a"] }), false);
  assert.equal(needsGlintsNote({ platform_source: "jobstreet", description: TEASER, requirements: [] }), false);
  assert.equal(GLINTS_DETAIL_NOTE, "Glints tidak mengizinkan detail diambil otomatis. Buka lowongan di Glints untuk deskripsi lengkap.");
});

test("enrichFailureNote: alasan dari server ikut ditampilkan, dipendekkan bila panjang", () => {
  assert.equal(enrichFailureNote(), "Detail lengkap belum bisa diambil.");
  assert.equal(enrichFailureNote("  "), "Detail lengkap belum bisa diambil.");
  assert.equal(enrichFailureNote("Halaman  asal\nkosong"), "Detail lengkap belum bisa diambil: Halaman asal kosong");
  const long = enrichFailureNote("x".repeat(500));
  assert.ok(long.endsWith("..."));
  assert.ok(long.length < 200);
});

test("mergeJobUpdate: baris dari server menimpa kolom yang sama, kolom lain dipertahankan", () => {
  const current = { id: "j1", title: "IT Support", description: TEASER, skill_matches: [1], salary_min: null as number | null };
  const merged = mergeJobUpdate(current, { id: "j1", description: LONG, requirements: ["TCP/IP"], salary_min: 5_000_000, title: undefined });
  assert.equal(merged.description, LONG);
  assert.equal(merged.salary_min, 5_000_000);
  assert.equal(merged.title, "IT Support");
  assert.deepEqual(merged.skill_matches, [1]);
  assert.deepEqual((merged as unknown as { requirements: string[] }).requirements, ["TCP/IP"]);
  assert.notEqual(merged, current);
  // baris lain atau bukan objek tidak mengubah apa pun
  assert.equal(mergeJobUpdate(current, { id: "j2", description: "x" }), current);
  assert.equal(mergeJobUpdate(current, null), current);
  assert.equal(mergeJobUpdate(current, "x"), current);
  assert.equal(mergeJobUpdate(current, [current]), current);
});

// ---- salaryText ----

test("salaryText: rentang ditulis ringkas dengan satuan waktu", () => {
  assert.equal(salaryText({ salary_min: 5_000_000, salary_max: 7_000_000, salary_currency: "IDR", salary_period: "monthly" }), "Rp 5–7 jt / bulan");
  assert.equal(salaryText({ salary_min: 5_000_000, salary_max: 7_000_000, salary_currency: "IDR", salary_period: "month" }), "Rp 5–7 jt / bulan");
  assert.equal(salaryText({ salary_min: 8_500_000, salary_max: 12_000_000, salary_period: "monthly" }), "Rp 8,5–12 jt / bulan");
  assert.equal(salaryText({ salary_min: 500_000, salary_max: 2_000_000, salary_period: "yearly" }), "Rp 500 rb–2 jt / tahun");
  assert.equal(salaryText({ salary_min: 6_000_000, salary_max: 6_000_000, salary_period: "monthly" }), "Rp 6 jt / bulan");
});

test("salaryText: satu batas ditulis Mulai atau Hingga, bukan dibuang", () => {
  assert.equal(salaryText({ salary_min: 5_000_000, salary_max: null, salary_period: "monthly" }), "Mulai Rp 5 jt / bulan");
  assert.equal(salaryText({ salary_min: null, salary_max: 7_000_000, salary_period: "monthly" }), "Hingga Rp 7 jt / bulan");
  assert.equal(salaryText({ salary_min: 0, salary_max: 7_000_000 }), "Hingga Rp 7 jt");
});

test("salaryText: tanpa gaji null; angka teks dibaca; satuan tidak diketahui tidak dikarang; mata uang lain ditulis lengkap", () => {
  assert.equal(salaryText({}), null);
  assert.equal(salaryText({ salary_min: null, salary_max: null, salary_period: "monthly" }), null);
  assert.equal(salaryText({ salary_min: 0, salary_max: 0 }), null);
  assert.equal(salaryText({ salary_min: "abc", salary_max: undefined }), null);
  assert.equal(salaryText({ salary_min: "5000000", salary_max: "7000000", salary_period: "monthly" }), "Rp 5–7 jt / bulan");
  assert.equal(salaryText({ salary_min: 5_000_000, salary_max: 7_000_000 }), "Rp 5–7 jt");
  assert.equal(salaryText({ salary_min: 3000, salary_max: 5000, salary_currency: "usd", salary_period: "month" }), "USD 3.000–5.000 / bulan");
  assert.equal(salaryText({ salary_min: 5_000_000, salary_period: "per_pekan" }), "Mulai Rp 5 jt / per_pekan");
});

test("formatMoney dan formatMoneyRange: juta, ribu, miliar, dan urutan ujung yang terbalik", () => {
  assert.equal(formatMoney(8_450_000), "Rp 8,5 jt");
  assert.equal(formatMoney(750_000), "Rp 750 rb");
  assert.equal(formatMoney(1_200_000_000), "Rp 1,2 M");
  assert.equal(formatMoney(500), "Rp 500");
  assert.equal(formatMoneyRange(10_000_000, 7_000_000), "Rp 7–10 jt");
  assert.equal(formatMoneyRange(8_000_000, 8_000_000), "Rp 8 jt");
});

// ---- pembanding gaji ----

const BENCH = { n: 12, p25: 7_000_000, median: 8_500_000, p75: 10_000_000, currency: "IDR", period: "month", keywords: ["frontend"], sufficient: true };

test("benchmarkView compare: di atas, di dalam, dan di bawah rentang tengah", () => {
  const above = benchmarkView({ salary_min: 11_000_000, salary_max: 13_000_000, salary_period: "monthly" }, BENCH);
  assert.equal(above?.kind, "compare");
  assert.equal(above?.kind === "compare" && above.position, "above");
  const within = benchmarkView({ salary_min: 8_000_000, salary_max: 9_000_000 }, BENCH);
  assert.equal(within?.kind === "compare" && within.position, "within");
  const below = benchmarkView({ salary_min: 4_000_000, salary_max: 6_000_000, salary_period: "monthly" }, BENCH);
  assert.equal(below?.kind === "compare" && below.position, "below");
  // batas p25 dan p75 sendiri masih "di dalam"
  assert.equal(benchmarkView({ salary_min: 7_000_000, salary_max: 7_000_000 }, BENCH)?.kind === "compare", true);
  const edge = benchmarkView({ salary_min: 7_000_000, salary_max: 7_000_000 }, BENCH);
  assert.equal(edge?.kind === "compare" && edge.position, "within");
});

test("benchmarkView compare: gaji satu batas dan gaji tahunan dibandingkan per bulan", () => {
  const oneSided = benchmarkView({ salary_min: 12_000_000, salary_max: null }, BENCH);
  assert.equal(oneSided?.kind === "compare" && oneSided.position, "above");
  const yearly = benchmarkView({ salary_min: 120_000_000, salary_max: 144_000_000, salary_period: "yearly" }, BENCH);
  assert.equal(yearly?.kind === "compare" && yearly.jobMin, 10_000_000);
  assert.equal(yearly?.kind === "compare" && yearly.jobMax, 12_000_000);
});

test("benchmarkView market-only: lowongan tanpa gaji, atau gaji yang tidak bisa dibandingkan per bulan", () => {
  const none = benchmarkView({ salary_min: null, salary_max: null }, BENCH);
  assert.deepEqual(none, { kind: "market-only", n: 12, p25: 7_000_000, median: 8_500_000, p75: 10_000_000, currency: "IDR", jobHasSalary: false });
  const hourly = benchmarkView({ salary_min: 50_000, salary_max: 80_000, salary_period: "hourly" }, BENCH);
  assert.equal(hourly?.kind === "market-only" && hourly.jobHasSalary, true);
  const usd = benchmarkView({ salary_min: 3000, salary_max: 5000, salary_currency: "USD", salary_period: "monthly" }, BENCH);
  assert.equal(usd?.kind, "market-only");
});

test("benchmarkView insufficient: data kurang tidak diubah menjadi perbandingan", () => {
  const few = { n: 3, p25: null, median: null, p75: null, currency: "IDR", period: "month", keywords: [], sufficient: false };
  assert.deepEqual(benchmarkView({ salary_min: 5_000_000, salary_max: 7_000_000 }, few), { kind: "insufficient", n: 3 });
  assert.deepEqual(benchmarkView({}, few), { kind: "insufficient", n: 3 });
  // sufficient tanpa median tetap tidak dipakai
  assert.deepEqual(benchmarkView({}, { ...BENCH, median: null }), { kind: "insufficient", n: 12 });
  assert.deepEqual(benchmarkView({}, { ...BENCH, sufficient: false }), { kind: "insufficient", n: 12 });
  assert.deepEqual(benchmarkView({}, { sufficient: false }), { kind: "insufficient", n: 0 });
});

test("benchmarkView: tanpa hasil dari server tidak ada tampilan (kartu bilang belum tersedia)", () => {
  assert.equal(benchmarkView({ salary_min: 5_000_000 }, null), null);
  assert.equal(benchmarkView({ salary_min: 5_000_000 }, undefined), null);
  assert.equal(benchmarkView({ salary_min: 5_000_000 }, "error"), null);
});

test("benchmarkText: kalimat untuk compare, market-only, dan insufficient", () => {
  const view = (job: object, bench: object = BENCH) => benchmarkView(job, bench)!;
  assert.equal(
    benchmarkText(view({ salary_min: 11_000_000, salary_max: 13_000_000 })),
    "Gaji lowongan ini di atas median 12 lowongan serupa (Rp 8,5 jt per bulan). Rentang tengahnya Rp 7–10 jt.",
  );
  assert.equal(
    benchmarkText(view({ salary_min: 4_000_000, salary_max: 6_000_000 })),
    "Gaji lowongan ini di bawah median 12 lowongan serupa (Rp 8,5 jt per bulan). Rentang tengahnya Rp 7–10 jt.",
  );
  assert.equal(
    benchmarkText(view({ salary_min: 8_000_000, salary_max: 9_000_000 })),
    "Gaji lowongan ini berada di rentang tengah 12 lowongan serupa (Rp 7–10 jt). Mediannya Rp 8,5 jt per bulan.",
  );
  assert.equal(
    benchmarkText(view({})),
    "Lowongan ini tidak mencantumkan gaji. Median 12 lowongan serupa: Rp 8,5 jt per bulan (rentang tengah Rp 7–10 jt).",
  );
  assert.match(benchmarkText(view({ salary_min: 50_000, salary_period: "hourly" })), /^Gaji lowongan ini memakai satuan yang tidak bisa dibandingkan langsung\. Median 12/);
  assert.equal(BENCHMARK_MIN_SAMPLES, 5);
  assert.equal(
    benchmarkText({ kind: "insufficient", n: 3 }),
    "Baru ada 3 lowongan serupa yang mencantumkan gaji, belum cukup untuk dibandingkan (butuh minimal 5).",
  );
  assert.equal(
    benchmarkText({ kind: "insufficient", n: 0 }),
    "Belum ada lowongan serupa yang mencantumkan gaji, belum cukup untuk dibandingkan (butuh minimal 5).",
  );
});

test("benchmarkScale: pita, median, dan rentang gaji lowongan berada di dalam batang 0 sampai 100 persen", () => {
  const cases = [
    { salary_min: 11_000_000, salary_max: 13_000_000 },
    { salary_min: 1_000_000, salary_max: 2_000_000 },
    { salary_min: 8_500_000, salary_max: 8_500_000 },
    { salary_min: 40_000_000, salary_max: null },
  ];
  for (const job of cases) {
    const v = benchmarkView(job, BENCH)!;
    assert.equal(v.kind, "compare");
    if (v.kind !== "compare") continue;
    const s = benchmarkScale(v);
    for (const n of [s.bandLeft, s.bandWidth, s.medianAt, s.jobLeft, s.jobWidth]) assert.ok(n >= 0 && n <= 100, `${JSON.stringify(job)} ${n}`);
    assert.ok(s.bandLeft + s.bandWidth <= 100.0001);
    assert.ok(s.jobLeft + s.jobWidth <= 100.0001);
    assert.ok(s.medianAt >= s.bandLeft && s.medianAt <= s.bandLeft + s.bandWidth);
    assert.ok(s.jobWidth >= 1.5, "gaji satu angka tetap terlihat");
  }
  // gaji tinggi ada di kanan median, gaji rendah di kiri
  const high = benchmarkScale(benchmarkView(cases[0], BENCH) as never);
  const low = benchmarkScale(benchmarkView(cases[1], BENCH) as never);
  assert.ok(high.jobLeft > high.medianAt);
  assert.ok(low.jobLeft + low.jobWidth < low.bandLeft);
});

// ---- grafik kecocokan skill ----

test("matchBreakdown: hitungan hanya bila ada skill yang dihitung, bukan grafik nol", () => {
  assert.deepEqual(matchBreakdown({ status: "ok", matched: ["React", "Git"], missing: ["Docker"] }), { matched: 2, missing: 1, total: 3, share: 2 / 3 });
  assert.equal(matchBreakdown({ status: "ok", matched: [], missing: ["Docker"] })?.share, 0);
  assert.equal(matchBreakdown({ status: "ok", matched: [], missing: [] }), null);
  assert.equal(matchBreakdown({ status: "no-job-skills", matched: [], missing: [] }), null);
  assert.equal(matchBreakdown({ status: "no-profile-skills" }), null);
  assert.equal(matchBreakdown(null), null);
});

test("skillAnalysisNote: penjelasan menurut keadaan, bukan satu kalimat untuk semua", () => {
  assert.equal(skillAnalysisNote({ status: null }), "Menghitung kecocokan skill...");
  assert.equal(skillAnalysisNote({ status: null, unavailable: "Skill profil belum termuat." }), "Skill profil belum termuat.");
  assert.match(skillAnalysisNote({ status: "no-profile-skills" }), /Lengkapi skill di Profil/);
  assert.match(skillAnalysisNote({ status: "no-job-skills", loadingDetail: true, thinDetail: true }), /Mengambil detail lengkap/);
  assert.match(skillAnalysisNote({ status: "no-job-skills", thinDetail: true }), /baru menampilkan ringkasan.*situs asal/);
  assert.match(skillAnalysisNote({ status: "no-job-skills", thinDetail: false }), /tidak menyebut skill/);
});

// ---- kamus skill yang diperluas ----

const IT_SUPPORT = {
  title: "IT Support",
  description:
    "Melakukan troubleshooting hardware dan software, instalasi Windows dan Microsoft Office, pemeliharaan jaringan LAN/WAN dan Mikrotik, " +
    "serta memantau CCTV dan printer. Memahami TCP/IP dan Active Directory.",
};

test("lowongan IT support gaya JobStreet: skill terbaca, cocok dan belum cocok dipisah", () => {
  const m = computeMatch(IT_SUPPORT, ["Troubleshooting", "Windows", "Excel"]);
  assert.equal(m.status, "ok");
  assert.deepEqual(m.matched.sort(), ["Troubleshooting", "Windows"]);
  for (const want of ["Hardware", "Microsoft Office", "Jaringan Komputer", "LAN/WAN", "MikroTik", "CCTV", "Printer", "TCP/IP", "Active Directory"]) {
    assert.ok(m.missing.includes(want), `${want} harus terbaca sebagai skill yang diminta: ${m.missing.join(", ")}`);
  }
  assert.equal(m.total, m.matched.length + m.missing.length);
  assert.equal(m.score, Math.round((m.matched.length / m.total) * 100));
});

test("alias profil IT support dikenali: Helpdesk, Jaringan, dan Mikrotik di profil cocok dengan lowongan", () => {
  const m = computeMatch(IT_SUPPORT, ["Helpdesk", "Jaringan", "Mikrotik", "TCP/IP", "Active Directory"]);
  for (const want of ["IT Support", "Jaringan Komputer", "MikroTik", "TCP/IP", "Active Directory"]) assert.ok(m.matched.includes(want), want);
});

test("Windows Server tidak dihitung ganda sebagai Windows; LAN dan WAN yang dipisah tetap satu skill", () => {
  const m = computeMatch({ title: "Admin", description: "Mengelola Windows Server. Paham LAN, WAN." }, ["Windows"]);
  assert.ok(m.missing.includes("Windows Server"));
  assert.ok(!m.matched.includes("Windows"));
  assert.equal(m.missing.filter((s) => s === "LAN/WAN").length, 1);
});

test("kamus administrasi, desain, pemasaran, dan data: skill terbaca dari deskripsi", () => {
  const admin = computeMatch({ title: "Staf Administrasi", description: "Akuntansi dasar, Excel, dan komunikasi." }, ["Administrasi", "Excel"]);
  assert.deepEqual(admin.matched.sort(), ["Administrasi", "Excel"]);
  assert.ok(admin.missing.includes("Akuntansi") && admin.missing.includes("Komunikasi"));

  const design = computeMatch(
    { title: "Graphic Designer", description: "Menguasai Figma, Adobe Photoshop, Illustrator, Canva, dan CorelDraw." },
    ["Photoshop", "Canva"],
  );
  assert.deepEqual(design.matched.sort(), ["Adobe Photoshop", "Canva"]);
  for (const want of ["Desain Grafis", "Figma", "Adobe Illustrator", "CorelDRAW"]) assert.ok(design.missing.includes(want), want);

  const marketing = computeMatch(
    { title: "Social Media Specialist", description: "Copywriting, digital marketing, content creation, dan SEO." },
    ["SEO", "Content Creator"],
  );
  assert.deepEqual(marketing.matched.sort(), ["Content Creation", "SEO"]);
  for (const want of ["Social Media", "Copywriting", "Digital Marketing"]) assert.ok(marketing.missing.includes(want), want);

  const data = computeMatch({ title: "Data Analyst", description: "SQL, Python, Power BI, Tableau, dan visualisasi data." }, ["SQL", "Power BI"]);
  assert.deepEqual(data.matched.sort(), ["Power BI", "SQL"]);
  for (const want of ["Python", "Tableau", "Data Visualization"]) assert.ok(data.missing.includes(want), want);
});

test("kata biasa tidak jadi skill: Java tetap bukan JavaScript, 'sales' dan 'network' polos tidak dihitung", () => {
  const m = computeMatch({ title: "Sales Executive", description: "Membangun network pelanggan dan mencapai target sales." }, ["Excel"]);
  assert.equal(m.status, "no-job-skills");
});

// ---- kabel antarmuka (kartu, halaman, layanan) ----

test("layanan: enrichJob dan getSalaryBenchmark memakai alamat, header, dan mode demo yang sama dengan API lain", () => {
  const svc = read("../src/services/automationApi.ts");
  assert.match(svc, /async enrichJob\(jobId: string\): Promise<EnrichJobResult \| null>/);
  assert.match(svc, /`\$\{apiBase\(\)\}\/api\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/enrich`,\s*\n\s*\/\/[^\n]*\n\s*\{ method: 'POST', headers: await getAuthHeaders\(\), body: '\{\}' \},\s*\n\s*\(\) => null,/);
  assert.match(svc, /async getSalaryBenchmark\(jobId: string\): Promise<SalaryBenchmarkResult \| null>/);
  assert.match(svc, /`\$\{apiBase\(\)\}\/api\/jobs\/\$\{encodeURIComponent\(jobId\)\}\/salary-benchmark`,\s*\n\s*\{ headers: await getAuthHeaders\(\) \},\s*\n\s*\(\) => null,/);
  assert.match(svc, /import type \{ EnrichJobResult, SalaryBenchmarkResult \} from '@\/lib\/jobDetail'/);
});

test("kartu: situs asal dicek sekali saat dibuka (shouldCheckSource), progres hanya bila needsDetail, dan id dicatat sebelum panggilan", () => {
  const card = read("../src/components/JobCard.tsx");
  assert.match(card, /if \(!expanded \|\| !shouldCheckSource\(job\) \|\| detailAttempts\.has\(job\.id\)\) return;/);
  const effect = card.slice(card.indexOf("if (!expanded || !shouldCheckSource(job)"), card.indexOf("// Salary comparison with similar postings"));
  assert.match(effect, /const showProgress = needsDetail\(job\);/);
  assert.ok(effect.indexOf("detailAttempts.add(job.id)") < effect.indexOf("automationApi.enrichJob(job.id)"));
  assert.equal([...card.matchAll(/automationApi\.enrichJob\(/g)].length, 1);
  assert.match(effect, /\}, \[expanded, job\.id, detailRetry\]\);/);
  // berhasil: baris baru naik ke halaman; gagal atau tidak didukung: catatan, tanpa memutus kartu
  assert.match(effect, /const merged = res\?\.job \? mergeJobUpdate\(job, res\.job\) : null;/);
  // "sudah lengkap" (enriched:false) dengan baris yang sudah lengkap tetap dipakai, bukan dianggap gagal (uji klik 20 Nov)
  assert.match(effect, /merged && \(res\.enriched \|\| !isThinDetail\(merged\) \|\| DETAIL_SETTLED_REASONS\.has\(/);
  assert.match(card, /const DETAIL_SETTLED_REASONS = new Set\(\["sudah lengkap", "tidak ada data baru"\]\)/);
  assert.match(effect, /onJobUpdated\?\.\(merged\)/);
  // gagal bisa dicoba lagi: id dihapus dari catatan percobaan lalu efek dijalankan ulang
  assert.match(card, /const retryDetail = \(\) => \{\s*detailAttempts\.delete\(job\.id\);\s*setDetailRetry\(\(n\) => n \+ 1\);/);
  assert.match(card, /onClick=\{retryDetail\}[\s\S]{0,160}Coba lagi/);
  assert.match(effect, /enrichFailureNote\(res\.reason\)/);
  assert.match(effect, /catch \(err\)[\s\S]*enrichFailureNote\(\)/);
  // id yang sudah pernah diminta disimpan di tingkat halaman
  assert.match(card, /detailAttempts = DETAIL_ATTEMPTS_FALLBACK/);
});

test("kartu: status pengambilan terbaca pembaca layar, kegagalan menyisakan tautan Buka di situs asal, Glints diberi catatan", () => {
  const card = read("../src/components/JobCard.tsx").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.match(card, /<p role="status"[^>]*>\s*<Loader2[\s\S]*?Mengambil detail lengkap dari \{platformLabel\(job\.platform_source\)\}\.\.\./);
  assert.match(card, /detail\.phase === "failed" && \([\s\S]*?\{detail\.note\}[\s\S]*?Buka di situs asal/);
  assert.match(card, /needsGlintsNote\(job\) && \([\s\S]*?\{GLINTS_DETAIL_NOTE\}[\s\S]*?Buka di situs asal/);
  assert.equal([...card.matchAll(/>\s*Buka di situs asal\s*</g)].length, 2);
  assert.match(card, /href=\{job\.external_url\} target="_blank" rel="noopener noreferrer"/);
});

test("kartu: gaji memakai salaryText (sisi tunggal, mata uang, satuan), tanpa rumus min dan max sendiri", () => {
  const card = read("../src/components/JobCard.tsx");
  assert.match(card, /const salary = salaryText\(job\);/);
  assert.match(card, /\{salary \?\? JOB_LABELS\.card\.salaryMissing\}/);
  assert.doesNotMatch(card, /formatCurrency\(job\.salary_min\)/);
  assert.doesNotMatch(card, /job\.salary_min && job\.salary_max \? /);
  assert.doesNotMatch(card, /salaryPeriodLabel/);
});

test("kartu: pembanding gaji diambil sekali per kartu, tiga keadaan memakai benchmarkText, kolom salary_benchmark hanya cadangan", () => {
  const card = read("../src/components/JobCard.tsx");
  assert.equal([...card.matchAll(/automationApi\.getSalaryBenchmark\(/g)].length, 1);
  assert.match(card, /if \(!expanded \|\| benchRequested\.current\) return;\s*\n\s*benchRequested\.current = true;/);
  assert.match(card, /const benchView = bench\.phase === "ready" \? benchmarkView\(job, bench\.data\) : null;/);
  assert.match(card, /benchView\?\.kind === "compare" && \([\s\S]*?<BenchmarkBar view=\{benchView\} \/>[\s\S]*?benchmarkText\(benchView\)/);
  assert.match(card, /benchView && benchView\.kind !== "compare" && \([\s\S]*?benchmarkText\(benchView\)/);
  assert.match(card, /Memuat pembanding gaji\.\.\./);
  assert.match(card, /Pembanding gaji belum tersedia untuk lowongan ini\./);
  // kolom lama hanya dipakai bila tidak ada hasil dari server
  assert.match(card, /\{!benchView && !benchLoading && \(\s*\n\s*job\.salary_min && job\.salary_max && job\.salary_benchmark \?/);
  // teks pembanding ada di pustaka dan teruji di atas
  const lib = read("../src/lib/jobDetail.ts");
  assert.match(lib, /belum cukup untuk dibandingkan \(butuh minimal \$\{BENCHMARK_MIN_SAMPLES\}\)/);
  assert.match(lib, /Lowongan ini tidak mencantumkan gaji\./);
});

test("kartu: grafik skill dari computeMatch (donat), bukan hanya dari skill_matches; tanpa skill ada penjelasan, bukan grafik nol", () => {
  const card = read("../src/components/JobCard.tsx");
  assert.match(card, /const breakdown = matchBreakdown\(match\);/);
  assert.match(card, /\{breakdown && <MatchDonut breakdown=\{breakdown\} \/>\}/);
  // skill_matches tetap sumber tambahan bila baris membawanya
  assert.match(card, /radarFromMatches\(job\.skill_matches\)/);
  assert.match(card, /\{radarSkills && <RadarChart skills=\{radarSkills\} \/>\}/);
  assert.match(card, /\{!breakdown && !radarSkills && \([\s\S]*?skillAnalysisNote\(\{/);
  assert.doesNotMatch(card, /Analisis kecocokan skill belum tersedia untuk lowongan ini\./);
  assert.match(card, /role="img"\s*\n\s*aria-label=\{`Grafik donat kecocokan skill/);
});

test("halaman Lowongan: baris yang diperkaya menggantikan baris lama dan skor dihitung ulang; satu set id untuk semua kartu", () => {
  const page = read("../src/routes/jobs.tsx");
  assert.match(page, /const detailAttempts = useRef\(new Set<string>\(\)\);/);
  assert.match(page, /onJobUpdated=\{handleJobUpdated\}/);
  assert.match(page, /detailAttempts=\{detailAttempts\.current\}/);
  const fn = page.slice(page.indexOf("const handleJobUpdated"), page.indexOf("// Skor kecocokan per pengguna"));
  assert.match(fn, /setJobs\(\(prev\) => prev\.map\(\(j\) => \(j\.id === updated\.id \? updated : j\)\)\)/);
  assert.match(fn, /setSelectedJob\(\(prev\) => \(prev && prev\.id === updated\.id \? updated : prev\)\)/);
  // computeMatch bergantung pada jobs, jadi mengganti baris menghitung ulang kecocokan
  assert.match(page, /computeMatch\(job, profileSkills\)[\s\S]*?\[jobs, profileSkills\]/);
  // urutan ditahan sampai daftar dimuat ulang, supaya kartu yang terbuka tidak melompat
  assert.match(fn, /setHeldScores\(/);
  assert.match(page, /setJobs\(visibleJobs\(\(data \?\? \[\]\) as JobData\[\]\)\);\s*\n\s*setHeldScores\(new Map\(\)\);/);
});

test("komentar jobCardData tidak lagi bilang kolom skill_matches dan salary_benchmark tidak ada", () => {
  const src = read("../src/lib/jobCardData.ts");
  assert.doesNotMatch(src, /the[\s*]+table has no skill_matches/);
  assert.match(src, /live[\s*]+`jobs` table has skill_matches, skill_gaps, ai_actions and salary_benchmark columns/);
  assert.match(src, /no flow ever fills them for a real row/);
});

// ---- skor kartu vs skor detail (uji klik 20 November 2026, temuan 7) ----

test("temuan 7: skor dari ringkasan ditandai perkiraan; skor dari teks lengkap tidak", () => {
  const profile = ["Solidity"];
  // ringkasan menyebut satu skill yang ada di profil: 100%
  const teaser = { title: "Web3 Developer", description: "Cari developer Solidity.", requirements: [] as string[] };
  const card = computeMatch(teaser, profile);
  assert.equal(card.score, 100);
  assert.equal(isProvisionalMatch(teaser), true);
  // teks lengkap menyebut banyak skill lain: rumus dan kamus sama, persen turun
  const full = {
    title: "Web3 Developer",
    description: `Cari developer Solidity. ${"Kami memakai React, TypeScript, Node.js, Docker, AWS, PostgreSQL, GraphQL. ".repeat(10)}`,
    requirements: ["React", "TypeScript", "Node.js", "Docker", "AWS", "PostgreSQL", "GraphQL"],
  };
  const detail = computeMatch(full, profile);
  assert.ok(detail.score !== null && detail.score < 20, `skor detail ${detail.score}`);
  assert.equal(isProvisionalMatch(full), false);
  assert.match(PROVISIONAL_MATCH_NOTE, /Perkiraan/);
});

test("temuan 7: isProvisionalMatch mengabaikan tag HTML dan menolak deskripsi kosong atau bukan teks", () => {
  assert.equal(isProvisionalMatch({ description: `<p>${"x".repeat(100)}</p>` }), true);
  assert.equal(isProvisionalMatch({ description: "y".repeat(DETAIL_MIN_DESCRIPTION_LENGTH) }), false);
  assert.equal(isProvisionalMatch({ description: "y".repeat(DETAIL_MIN_DESCRIPTION_LENGTH - 1) }), true);
  assert.equal(isProvisionalMatch({ description: null }), true);
  assert.equal(isProvisionalMatch({}), true);
});

test("temuan 7: kartu menampilkan catatan perkiraan hanya untuk skor ok dari teks pendek", () => {
  const card = read("../src/components/JobCard.tsx");
  assert.match(card, /match\.status === "ok" && isProvisionalMatch\(job\) && \(/);
  assert.match(card, /\{PROVISIONAL_MATCH_NOTE\}/);
});

test("pustaka jobDetail murni tanpa impor, supaya jalan di bawah node --test", () => {
  assert.doesNotMatch(read("../src/lib/jobDetail.ts"), /^import /m);
});
