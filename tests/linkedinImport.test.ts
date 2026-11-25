import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_EXISTING,
  LINKEDIN_PDF_HINT,
  LINKEDIN_PDF_MAX_BYTES,
  addedTotal,
  applyImport,
  applyProfilePatch,
  buildImportPlan,
  countSelected,
  defaultSelection,
  describeLinkedInImportError,
  aiCvConsentHeaders,
  emptyCommit,
  experienceKey,
  hasPdfMagic,
  normKey,
  parseImportPreview,
  runLimited,
  selectionFromPlan,
  selectionSize,
  setSectionSelection,
  skillKey,
  summarizeCommit,
  toggleItem,
  validateAchievement,
  validateCertification,
  validateLinkedInPdfFile,
  type ExistingProfile,
  type ImportPreview,
  type ImportWriter,
} from "../src/lib/linkedinImport.ts";
import { ApiError } from "../src/lib/apiErrors.ts";

// Data di bawah ini SINTETIS: tokoh dan perusahaan fiktif.
const NOW = new Date("2026-11-20T10:00:00.000Z");

const basePreview = (over: Partial<ImportPreview> = {}): ImportPreview => ({
  profile: { full_name: "Rina Kusuma Wardhani", current_title: "Senior Data Analyst", location: "Yogyakarta, Indonesia", linkedin_url: "https://www.linkedin.com/in/rina-kusuma-sintetis" },
  experiences: [
    { company_name: "Biru Langit Labs", role_title: "Senior Data Analyst", employment_type: "full-time", location_type: "on-site", start_date: "2022-01-01", end_date: null, is_current: true, description: "Memimpin tim analis.", notes: [] },
    { company_name: "Studio Kopi Hitam", role_title: "Data Intern", employment_type: "internship", location_type: "remote", start_date: "2018-06-01", end_date: "2018-08-01", is_current: false, description: null, notes: ["Bulan selesai tidak tercantum di PDF, diisi Desember."] },
  ],
  education: [{ institution: "Universitas Fiktif Nusantara", degree: "Bachelor of Engineering - BE", field_of_study: "Information Systems", start_year: 2014, end_year: 2018, is_current: false, notes: [] }],
  certifications: [{ name: "AWS Certified Cloud Practitioner", issuer: "" }],
  achievements: [],
  skills: [
    { name: "Python", category: "technical", proficiency_level: 3 },
    { name: "English", category: "language", proficiency_level: 4 },
  ],
  meta: { method: "ai", model: "test", pages: 2, truncated: false, dropped: 0 },
  warnings: [],
  ...over,
});

const existing = (over: Partial<ExistingProfile> = {}): ExistingProfile => ({ ...EMPTY_EXISTING, ...over });

// ---------------------------------------------------------------------------------------------
// berkas dan galat
// ---------------------------------------------------------------------------------------------

test("validateLinkedInPdfFile: PDF sah diterima; kosong, bukan PDF, dan lebih dari 5 MB ditolak dengan alasan", () => {
  assert.deepEqual(validateLinkedInPdfFile({ name: "Profile.pdf", size: 120_000, type: "application/pdf" }), { ok: true });
  assert.deepEqual(validateLinkedInPdfFile({ name: "Profile.PDF", size: 1, type: "" }), { ok: true }, "MIME kosong tetapi nama .pdf");
  assert.deepEqual(validateLinkedInPdfFile({ name: "x.pdf", size: LINKEDIN_PDF_MAX_BYTES, type: "application/pdf" }), { ok: true }, "tepat 5 MB");
  const reason = (f: { name: string; size: number; type: string }) => {
    const r = validateLinkedInPdfFile(f);
    return r.ok ? "ok" : r.reason;
  };
  assert.match(reason({ name: "a.pdf", size: 0, type: "application/pdf" }), /kosong/);
  assert.match(reason({ name: "a.docx", size: 10, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), /harus PDF/);
  assert.match(reason({ name: "a.png", size: 10, type: "image/png" }), /harus PDF/);
  assert.match(reason({ name: "a.pdf", size: LINKEDIN_PDF_MAX_BYTES + 1, type: "application/pdf" }), /5 MB/);
  assert.equal(hasPdfMagic("%PDF-"), true);
  assert.equal(hasPdfMagic("PK\u0003\u0004"), false);
  assert.equal(hasPdfMagic(""), false);
});

test("describeLinkedInImportError: tiap kode server menjadi kalimat Indonesia yang bisa ditindaklanjuti", () => {
  const err = (status: number, body: object, retry?: number) => new ApiError(status, JSON.stringify(body), retry);
  const msg = (e: unknown) => describeLinkedInImportError(e);
  assert.match(msg(err(400, { code: "not_pdf" })), /bukan PDF/);
  assert.match(msg(err(400, { code: "ai_consent_required" })), /Centang persetujuan/);
  assert.match(msg(err(413, { code: "file_too_large" })), /5 MB/);
  assert.match(msg(err(422, { code: "pdf_no_text" })), /hasil pindai/);
  assert.match(msg(err(422, { code: "pdf_unreadable" })), /dikunci kata sandi/);
  assert.match(msg(err(422, { code: "nothing_found" })), /Tidak ada data profil/);
  assert.match(msg(err(429, { code: "rate_limited", retryAfterSec: 40 })), /Terlalu banyak impor.*40 detik/);
  assert.match(msg(err(429, { code: "rate_limited", retryAfterSec: 600 })), /10 menit/);
  assert.match(msg(err(503, { code: "rate_limit_check_failed" })), /Batas impor tidak dapat diperiksa/);
  assert.match(msg(err(401, { error: "Invalid token" })), /Masuk lagi/);
  assert.match(msg(err(500, { error: "x" })), /Server sedang bermasalah/);
  assert.match(msg(new TypeError("Failed to fetch")), /tidak dapat dihubungi/, "fetch gagal karena jaringan");
  assert.match(msg(new Error("sesuatu yang aneh")), /PDF belum bisa diimpor/, "galat tak dikenal memakai kalimat bawaan");
  assert.match(msg(Object.assign(new Error("t"), { name: "TimeoutError" })), /terlalu lama/);
  assert.match(msg(new ApiError(0, "Failed to fetch")), /tidak dapat dihubungi/);
  // pesan tidak pernah memuat em dash dan selalu berbahasa Indonesia
  for (const code of ["not_pdf", "empty_file", "file_too_large", "pdf_unreadable", "pdf_too_long", "pdf_no_text", "nothing_found", "rate_limited", "rate_limit_check_failed", "bad_response"]) {
    assert.doesNotMatch(msg(err(422, { code })), /—/, code);
  }
});

test("header consent AI CV hanya disertakan setelah persetujuan eksplisit", () => {
  assert.deepEqual(aiCvConsentHeaders(false), {});
  assert.deepEqual(aiCvConsentHeaders(true), { "x-ai-consent": "true" });
});

test("LINKEDIN_PDF_HINT menyebut jalur LinkedIn: Lainnya (More) lalu Simpan ke PDF (Save to PDF)", () => {
  assert.match(LINKEDIN_PDF_HINT, /Lainnya \(More\)/);
  assert.match(LINKEDIN_PDF_HINT, /Simpan ke PDF \(Save to PDF\)/);
});

// ---------------------------------------------------------------------------------------------
// respons server
// ---------------------------------------------------------------------------------------------

test("parseImportPreview: respons sah dibaca; item cacat dibuang satu per satu; bentuk asing menghasilkan null", () => {
  const ok = parseImportPreview({ success: true, preview: { ...basePreview(), meta: { method: "rules", model: null, pages: 3, truncated: true, dropped: { experiences: 1, education: 0, certifications: 2, skills: 0 } }, warnings: ["peringatan", 42] } });
  assert.ok(ok);
  assert.equal(ok!.meta.method, "rules");
  assert.equal(ok!.meta.dropped, 3);
  assert.equal(ok!.meta.truncated, true);
  assert.deepEqual(ok!.warnings, ["peringatan"]);
  assert.equal(ok!.experiences.length, 2);

  const messy = parseImportPreview({
    success: true,
    preview: {
      profile: null,
      experiences: [null, "x", { company_name: "A" }, { company_name: "A", role_title: "B", start_date: "2020-01-01" }],
      education: [{ institution: "S", degree: "D", start_year: "2020" }, { institution: "S", degree: "D", start_year: 2020 }],
      certifications: [{ issuer: "x" }, { name: "Sertifikat" }],
      skills: [{ name: "" }, { name: "Go" }, "Rust"],
    },
  });
  assert.equal(messy!.experiences.length, 1);
  assert.equal(messy!.experiences[0].employment_type, "full-time", "nilai bawaan bila server tidak mengirim");
  assert.equal(messy!.education.length, 1);
  assert.deepEqual(messy!.certifications, [{ name: "Sertifikat", issuer: "" }]);
  assert.deepEqual(messy!.skills.map((s) => s.name), ["Go"]);
  assert.deepEqual(messy!.profile, { full_name: null, current_title: null, location: null, linkedin_url: null });

  for (const bad of [null, undefined, "teks", 42, {}, { success: false, preview: {} }, { success: true }, { success: true, preview: [] }]) assert.equal(parseImportPreview(bad), null);
});

// ---------------------------------------------------------------------------------------------
// duplikat
// ---------------------------------------------------------------------------------------------

test("kunci perbandingan: huruf besar, aksen, dan tanda baca diabaikan; C++ dan C# tetap berbeda", () => {
  assert.equal(normKey("PT. Biru  Langit-Labs"), normKey("pt biru langit labs"));
  assert.equal(normKey("Café Étoile"), normKey("cafe etoile"));
  assert.notEqual(normKey("C++ Developer"), normKey("C# Developer"));
  assert.equal(experienceKey("Biru Langit Labs", "Senior Data Analyst"), experienceKey("biru langit labs.", "SENIOR DATA ANALYST"));
  assert.equal(skillKey("  Data   Analysis "), skillKey("data analysis"));
  assert.notEqual(skillKey("C++"), skillKey("C#"));
});

test("duplikat pengalaman: perusahaan dan posisi sama (tanpa peduli huruf) = Sudah ada, tidak ikut ditulis", () => {
  const plan = buildImportPlan(
    basePreview(),
    existing({ experiences: [{ company_name: "biru langit labs", role_title: "SENIOR DATA ANALYST" }, { company_name: "Studio Kopi Hitam", role_title: "Barista" }] }),
    NOW,
  );
  assert.deepEqual(plan.experiences.map((e) => e.status), ["duplicate", "new"], "posisi berbeda di perusahaan yang sama bukan duplikat");
  assert.match(plan.experiences[0].reason, /sudah ada/i);
  assert.equal(plan.experiences[0].row, null);
});

test("duplikat pendidikan: institusi dan jenjang sama; jenjang lain di institusi sama tetap baru", () => {
  const dup = buildImportPlan(basePreview(), existing({ education: [{ institution: "Universitas Fiktif Nusantara", degree: "bachelor of engineering - be" }] }), NOW);
  assert.equal(dup.education[0].status, "duplicate");
  const other = buildImportPlan(basePreview(), existing({ education: [{ institution: "Universitas Fiktif Nusantara", degree: "Master" }] }), NOW);
  assert.equal(other.education[0].status, "new");
});

test("duplikat skill: nama sama tanpa peduli huruf besar; juga duplikat di dalam PDF dan sertifikasi sama", () => {
  const plan = buildImportPlan(
    basePreview({ skills: [{ name: "PYTHON", category: "technical", proficiency_level: 3 }, { name: "Go", category: "technical", proficiency_level: 3 }, { name: "go", category: "technical", proficiency_level: 3 }, { name: "C++", category: "technical", proficiency_level: 3 }, { name: "C#", category: "technical", proficiency_level: 3 }] }),
    existing({ skills: [{ name: "python" }], certifications: [{ name: "aws certified cloud practitioner" }] }),
    NOW,
  );
  assert.deepEqual(plan.skills.map((s) => s.status), ["duplicate", "new", "duplicate", "new", "new"]);
  assert.equal(plan.certifications[0].status, "duplicate");
});

test("profil dasar: kolom yang sudah terisi tidak ditimpa (Sudah ada); yang kosong boleh diisi; URL tidak sah ditolak", () => {
  const plan = buildImportPlan(
    basePreview({ profile: { full_name: "Rina K", current_title: "Analis", location: null, linkedin_url: "linkedin-tanpa-skema" } }),
    existing({ basic: { full_name: "Nama Yang Sudah Ada", current_title: "", location: "" } }),
    NOW,
  );
  const by = Object.fromEntries(plan.basic.map((b) => [b.key, b]));
  assert.equal(by["basic:full_name"].status, "duplicate");
  assert.equal(by["basic:current_title"].status, "new");
  assert.deepEqual(by["basic:current_title"].row, { field: "current_title", value: "Analis" });
  assert.equal(by["basic:location"], undefined, "nilai null tidak ditampilkan");
  assert.equal(by["basic:linkedin_url"].status, "invalid");
  assert.match(by["basic:linkedin_url"].reason, /http/);
});

// ---------------------------------------------------------------------------------------------
// pratinjau -> baris yang ditulis
// ---------------------------------------------------------------------------------------------

test("pemetaan pratinjau ke baris: kolom, format tanggal, dan nilai bawaan sama dengan editor Profil", () => {
  const plan = buildImportPlan(basePreview(), EMPTY_EXISTING, NOW);
  const sel = selectionFromPlan(plan, defaultSelection(plan));
  assert.deepEqual(sel.profilePatch, {
    full_name: "Rina Kusuma Wardhani",
    current_title: "Senior Data Analyst",
    location: "Yogyakarta, Indonesia",
    linkedin_url: "https://www.linkedin.com/in/rina-kusuma-sintetis",
  });
  assert.deepEqual(sel.experiences[0], {
    company_name: "Biru Langit Labs",
    role_title: "Senior Data Analyst",
    employment_type: "full-time",
    location_type: "on-site",
    start_date: "2022-01-01",
    end_date: null,
    is_current: true,
    description: "Memimpin tim analis.",
    achievements: [],
    skills_used: [],
  });
  assert.deepEqual(sel.experiences[1], {
    company_name: "Studio Kopi Hitam",
    role_title: "Data Intern",
    employment_type: "internship",
    location_type: "remote",
    start_date: "2018-06-01",
    end_date: "2018-08-01",
    is_current: false,
    description: null,
    achievements: [],
    skills_used: [],
  });
  assert.deepEqual(sel.education[0], {
    institution: "Universitas Fiktif Nusantara",
    degree: "Bachelor of Engineering - BE",
    field_of_study: "Information Systems",
    start_year: 2014,
    end_year: 2018,
    is_current: false,
    gpa: null,
    max_gpa: null,
    description: null,
  });
  assert.deepEqual(sel.certifications, [{ name: "AWS Certified Cloud Practitioner", issuer: "", is_verified: false }]);
  assert.deepEqual(sel.skills, [
    { name: "Python", category: "technical", proficiency_level: 3, years_experience: null, is_verified: false, source: "linkedin_pdf" },
    { name: "English", category: "language", proficiency_level: 4, years_experience: null, is_verified: false, source: "linkedin_pdf" },
  ]);
  assert.equal(selectionSize(sel), 4 + 2 + 1 + 1 + 2);
});

test("item yang tidak lolos validator editor ditandai tidak valid dan tidak pernah ditulis (tanggal masa depan, selesai sebelum mulai, tahun salah)", () => {
  const bad = basePreview({
    experiences: [
      { company_name: "A", role_title: "B", employment_type: "full-time", location_type: "on-site", start_date: "2027-01-01", end_date: null, is_current: true, description: null, notes: [] },
      { company_name: "C", role_title: "D", employment_type: "full-time", location_type: "on-site", start_date: "2020-05-01", end_date: "2019-01-01", is_current: false, description: null, notes: [] },
      { company_name: "E", role_title: "F", employment_type: "tak-dikenal", location_type: "on-site", start_date: "2020-05-01", end_date: "2021-01-01", is_current: false, description: null, notes: [] },
    ],
    education: [
      { institution: "S", degree: "D", field_of_study: null, start_year: 1900, end_year: 1904, is_current: false, notes: [] },
      { institution: "S2", degree: "D", field_of_study: null, start_year: 2020, end_year: 2010, is_current: false, notes: [] },
    ],
    certifications: [{ name: "x".repeat(201), issuer: "" }],
  });
  const plan = buildImportPlan(bad, EMPTY_EXISTING, NOW);
  assert.deepEqual(plan.experiences.map((e) => e.status), ["invalid", "invalid", "invalid"]);
  assert.match(plan.experiences[0].reason, /masa depan/);
  assert.match(plan.experiences[1].reason, /sebelum tanggal mulai/);
  assert.deepEqual(plan.education.map((e) => e.status), ["invalid", "invalid"]);
  assert.deepEqual(plan.certifications.map((e) => e.status), ["invalid"]);
  const everything = new Set(Object.values(plan).flatMap((items: any[]) => items.map((i) => i.key)));
  const sel = selectionFromPlan(plan, everything);
  assert.equal(sel.experiences.length + sel.education.length + sel.certifications.length, 0, "walau kuncinya dipaksa masuk pilihan");
});

test("pilihan pengguna: hanya item baru yang dicentang yang ikut; duplikat tidak bisa dicentang walau dipaksa", () => {
  const plan = buildImportPlan(basePreview(), existing({ skills: [{ name: "python" }] }), NOW);
  const all = defaultSelection(plan);
  assert.ok(!all.has("skill:0"), "skill duplikat tidak dicentang bawaan");
  assert.ok(all.has("skill:1") && all.has("exp:0") && all.has("edu:0") && all.has("cert:0"));
  assert.equal(countSelected(plan, all), selectionSize(selectionFromPlan(plan, all)));

  // hapus centang satu pengalaman dan satu skill
  let sel = toggleItem(plan, "exp:1", all);
  sel = toggleItem(plan, "skill:1", sel);
  const picked = selectionFromPlan(plan, sel);
  assert.deepEqual(picked.experiences.map((e) => e.role_title), ["Senior Data Analyst"]);
  assert.deepEqual(picked.skills, []);
  // memaksa mencentang duplikat tidak berefek
  assert.equal(toggleItem(plan, "skill:0", sel).has("skill:0"), false);
  assert.deepEqual(selectionFromPlan(plan, new Set(["skill:0"])).skills, []);
  // pilih semua / kosongkan per seksi
  assert.equal(setSectionSelection(plan, "experiences", new Set(), true).size, 2);
  assert.equal(setSectionSelection(plan, "experiences", all, false).has("exp:0"), false);
  assert.equal(selectionSize(selectionFromPlan(plan, new Set())), 0);
});

test("batas 50 skill: skill baru yang melewati batas ditandai tidak valid dengan alasan", () => {
  const have = Array.from({ length: 49 }, (_, i) => ({ name: `Skill lama ${i}` }));
  const plan = buildImportPlan(
    basePreview({ skills: ["A1", "A2", "A3"].map((name) => ({ name, category: "technical", proficiency_level: 3 })) }),
    existing({ skills: have }),
    NOW,
  );
  assert.deepEqual(plan.skills.map((s) => s.status), ["new", "invalid", "invalid"]);
  assert.match(plan.skills[1].reason, /Maksimal 50/);
});

test("applyProfilePatch hanya mengisi kolom yang kosong", () => {
  const prev = { full_name: "Sudah Ada", current_title: "", location: "  ", linkedin_url: "", phone: "0812" };
  const next = applyProfilePatch(prev, { full_name: "Lain", current_title: "Analis", location: "Bandung", linkedin_url: "https://www.linkedin.com/in/x" });
  assert.deepEqual(next, { full_name: "Sudah Ada", current_title: "Analis", location: "Bandung", linkedin_url: "https://www.linkedin.com/in/x", phone: "0812" });
  assert.equal(prev.current_title, "", "objek asal tidak diubah");
});

test("validateCertification: nama wajib, batas panjang, penerbit boleh kosong", () => {
  assert.deepEqual(validateCertification({ name: "  CKAD ", issuer: "" }), { ok: true, row: { name: "CKAD", issuer: "", is_verified: false } });
  assert.equal(validateCertification({ name: "", issuer: "x" }).ok, false);
  assert.equal(validateCertification({ name: "ok", issuer: "i".repeat(121) }).ok, false);
});

// ---------------------------------------------------------------------------------------------
// penulisan
// ---------------------------------------------------------------------------------------------

function fakeWriter(failOn: (kind: string, row: any) => boolean = () => false) {
  const calls: Array<{ kind: string; row: any }> = [];
  let running = 0;
  let maxRunning = 0;
  const make = (kind: string) => async (row: any) => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await new Promise((r) => setTimeout(r, 2));
    running--;
    calls.push({ kind, row });
    if (failOn(kind, row)) throw new Error(`gagal ${kind}`);
    return { ...row, id: `${kind}-${calls.length}` };
  };
  const writer: ImportWriter = {
    upsertProfile: async (patch) => {
      calls.push({ kind: "profile", row: patch });
      if (failOn("profile", patch)) throw new Error("gagal profile");
    },
    createExperience: make("experience"),
    createEducation: make("education"),
    createCertification: make("certification"),
    createAchievement: make("achievement"),
    createSkill: make("skill"),
  };
  return { writer, calls, maxRunning: () => maxRunning };
}

test("applyImport: menulis hanya yang dipilih, urut profil lalu pengalaman, pendidikan, sertifikasi, skill; hasil dihitung", async () => {
  const plan = buildImportPlan(basePreview(), existing({ skills: [{ name: "python" }] }), NOW);
  const sel = selectionFromPlan(plan, toggleItem(plan, "exp:1", defaultSelection(plan)));
  const f = fakeWriter();
  const result = await applyImport(sel, f.writer);
  assert.deepEqual(f.calls.map((c) => c.kind), ["profile", "experience", "education", "certification", "skill"], "satu skill duplikat dan satu pengalaman dicabut");
  assert.deepEqual(f.calls[0].row, sel.profilePatch);
  assert.deepEqual(result.added, { basic: 4, experiences: 1, education: 1, certifications: 1, achievements: 0, skills: 1 });
  assert.equal(result.failed.length, 0);
  assert.equal(result.created.experiences.length, 1);
  assert.deepEqual(result.profilePatch, sel.profilePatch);
  assert.equal(addedTotal(result), 8);
  assert.deepEqual(summarizeCommit(result), { kind: "success", message: "Ditambahkan ke profil: 4 data profil dasar, 1 pengalaman, 1 pendidikan, 1 sertifikasi, 1 skill." });
});

test("applyImport: pilihan kosong tidak menulis apa pun, termasuk upsert profil", async () => {
  const f = fakeWriter();
  const plan = buildImportPlan(basePreview(), EMPTY_EXISTING, NOW);
  const result = await applyImport(selectionFromPlan(plan, new Set()), f.writer);
  assert.equal(f.calls.length, 0);
  assert.equal(addedTotal(result), 0);
});

test("applyImport: satu item gagal tidak menghentikan yang lain; kegagalan dilaporkan dengan nama item", async () => {
  const plan = buildImportPlan(basePreview(), EMPTY_EXISTING, NOW);
  const sel = selectionFromPlan(plan, defaultSelection(plan));
  const f = fakeWriter((kind, row) => (kind === "experience" && row.role_title === "Data Intern") || kind === "certification");
  const result = await applyImport(sel, f.writer);
  assert.deepEqual(result.added, { basic: 4, experiences: 1, education: 1, certifications: 0, achievements: 0, skills: 2 });
  assert.deepEqual(result.failed.map((x) => [x.section, x.label]), [["pengalaman", "Data Intern di Studio Kopi Hitam"], ["sertifikasi", "AWS Certified Cloud Practitioner"]]);
  const s = summarizeCommit(result);
  assert.equal(s.kind, "partial");
  assert.match(s.message, /2 item belum tersimpan/);
  assert.match(s.message, /dilewati/);
});

test("applyImport: upsert profil gagal tidak membuang item lain; kolom profil tidak dilaporkan tersimpan", async () => {
  const plan = buildImportPlan(basePreview(), EMPTY_EXISTING, NOW);
  const sel = selectionFromPlan(plan, defaultSelection(plan));
  const f = fakeWriter((kind) => kind === "profile");
  const result = await applyImport(sel, f.writer);
  assert.deepEqual(result.profilePatch, {});
  assert.equal(result.added.basic, 0);
  assert.equal(result.added.experiences, 2);
  assert.equal(result.failed[0].section, "profil");
});

test("applyImport: semuanya gagal = kind failed dengan pesan galat pertama", async () => {
  const plan = buildImportPlan(basePreview(), EMPTY_EXISTING, NOW);
  const sel = selectionFromPlan(plan, defaultSelection(plan));
  const result = await applyImport(sel, fakeWriter(() => true).writer);
  assert.equal(addedTotal(result), 0);
  const s = summarizeCommit(result);
  assert.equal(s.kind, "failed");
  assert.match(s.message, /Belum ada yang tersimpan/);
  assert.equal(summarizeCommit(emptyCommit()).kind, "success");
});

test("runLimited: urutan hasil terjaga, galat tidak menghentikan, dan tidak lebih dari batas yang berjalan bersamaan", async () => {
  let running = 0;
  let max = 0;
  const out = await runLimited([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async (n) => {
    running++;
    max = Math.max(max, running);
    await new Promise((r) => setTimeout(r, 3));
    running--;
    if (n === 4) throw new Error("empat");
    return n * 2;
  });
  assert.ok(max <= 3 && max >= 2, `maksimum bersamaan ${max}`);
  assert.deepEqual(out.map((o) => (o.ok ? o.value : "x")), [2, 4, 6, "x", 10, 12, 14, 16, 18, 20]);
  assert.deepEqual(await runLimited([], 4, async () => 1), []);
});

test("applyImport memakai batas 4 penulisan bersamaan", async () => {
  const many = basePreview({ skills: Array.from({ length: 12 }, (_, i) => ({ name: `Skill${i}`, category: "technical", proficiency_level: 3 })) });
  const plan = buildImportPlan(many, EMPTY_EXISTING, NOW);
  const f = fakeWriter();
  await applyImport(selectionFromPlan(plan, defaultSelection(plan)), f.writer);
  assert.ok(f.maxRunning() <= 4, `maksimum bersamaan ${f.maxRunning()}`);
  assert.equal(f.calls.filter((c) => c.kind === "skill").length, 12);
});
