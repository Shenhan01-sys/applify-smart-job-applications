import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACHIEVEMENT_DESCRIPTION_MAX,
  ACHIEVEMENT_ISSUER_MAX,
  ACHIEVEMENT_TITLE_MAX,
  EMPTY_EXISTING,
  SECTION_KEYS,
  addedTotal,
  applyImport,
  buildImportPlan,
  countSelected,
  defaultSelection,
  parseImportPreview,
  selectionFromPlan,
  selectionSize,
  setSectionSelection,
  summarizeCommit,
  toggleItem,
  validateAchievement,
  type ExistingProfile,
  type ImportPreview,
  type ImportWriter,
  type PreviewAchievement,
} from "../src/lib/linkedinImport.ts";
import { mockLinkedInImportPreview, mockAchievements } from "../src/mocks/mockData.ts";

// Penghargaan (Honors-Awards) dan publikasi (Publications) dari PDF LinkedIn -> tabel achievements.
// Data di bawah ini SINTETIS: karya, penyelenggara, dan tokoh fiktif.
const NOW = new Date("2026-11-20T10:00:00.000Z");

const ach = (over: Partial<PreviewAchievement> = {}): PreviewAchievement => ({
  title: "Best Paper Award at Simulasi",
  category: "award",
  issuer: "KONFIK",
  achievement_date: "2024-01-01",
  description: null,
  notes: ["Hanya tahun yang tercantum di PDF, tanggal diisi 1 Januari."],
  ...over,
});

const preview = (achievements: PreviewAchievement[]): ImportPreview => ({
  profile: { full_name: null, current_title: null, location: null, linkedin_url: null },
  experiences: [],
  education: [],
  certifications: [],
  achievements,
  skills: [],
  meta: { method: "ai", model: "test", pages: 1, truncated: false, dropped: 0 },
  warnings: [],
});

const existing = (over: Partial<ExistingProfile> = {}): ExistingProfile => ({ ...EMPTY_EXISTING, ...over });

// ---------------------------------------------------------------------------------------------
// respons server
// ---------------------------------------------------------------------------------------------

test("parseImportPreview: achievements dibaca; item tanpa judul atau dengan jenis asing dibuang; meta.dropped.achievements ikut dihitung", () => {
  const ok = parseImportPreview({
    success: true,
    preview: {
      achievements: [
        { title: "  Best Paper Award at Simulasi ", category: "award", issuer: " KONFIK ", achievement_date: "2024-01-01", description: "", notes: ["catatan", 7] },
        { title: "Dashboard Design for Job Seekers", category: "publication" },
        { title: "", category: "award" },
        { title: "Paten Karangan", category: "patent" },
        { category: "award" },
        "bukan objek",
        null,
      ],
      meta: { method: "ai", model: "m", pages: 1, truncated: false, dropped: { experiences: 1, education: 0, certifications: 0, achievements: 3, skills: 2 } },
    },
  });
  assert.ok(ok);
  assert.equal(ok!.meta.dropped, 6, "semua bagian dijumlahkan, termasuk achievements");
  assert.deepEqual(ok!.achievements, [
    { title: "Best Paper Award at Simulasi", category: "award", issuer: "KONFIK", achievement_date: "2024-01-01", description: null, notes: ["catatan"] },
    { title: "Dashboard Design for Job Seekers", category: "publication", issuer: null, achievement_date: null, description: null, notes: [] },
  ]);
  // respons lama tanpa achievements tetap terbaca
  assert.deepEqual(parseImportPreview({ success: true, preview: { experiences: [] } })!.achievements, []);
  assert.deepEqual(parseImportPreview({ success: true, preview: { achievements: "bukan daftar" } })!.achievements, []);
});

// ---------------------------------------------------------------------------------------------
// validator
// ---------------------------------------------------------------------------------------------

test("validateAchievement: baris sah dirapikan (spasi, kosong menjadi null, tanggal YYYY-MM-01, is_featured false)", () => {
  assert.deepEqual(
    validateAchievement({ title: "  Best Paper Award at Simulasi ", category: "award", issuer: " KONFIK ", achievement_date: "2024-03-15", description: " Catatan " }, NOW),
    { ok: true, row: { title: "Best Paper Award at Simulasi", category: "award", issuer: "KONFIK", achievement_date: "2024-03-01", description: "Catatan", is_featured: false } },
  );
  assert.deepEqual(
    validateAchievement({ title: "Dashboard Design for Job Seekers", category: "publication", issuer: "", achievement_date: "", description: null }, NOW),
    { ok: true, row: { title: "Dashboard Design for Job Seekers", category: "publication", issuer: null, achievement_date: null, description: null, is_featured: false } },
  );
  assert.equal(validateAchievement({ title: "x", category: "award", issuer: null, achievement_date: "2026-11-01", description: null }, NOW).ok, true, "bulan ini sah");
  assert.equal(validateAchievement({ title: "x", category: "award", issuer: null, achievement_date: "1950-01-01", description: null }, NOW).ok, true, "batas bawah 1950");
});

test("validateAchievement: judul kosong atau terlalu panjang, jenis asing, penyelenggara dan deskripsi terlalu panjang, tanggal rusak, lama, atau di masa depan ditolak dengan alasan", () => {
  const base = { title: "Judul", category: "award", issuer: null, achievement_date: null, description: null };
  const reason = (over: Record<string, unknown>) => {
    const r = validateAchievement({ ...base, ...over }, NOW);
    return r.ok ? "ok" : r.reason;
  };
  assert.match(reason({ title: "   " }), /Judul kosong/);
  assert.match(reason({ title: undefined }), /Judul kosong/);
  assert.match(reason({ title: "x".repeat(ACHIEVEMENT_TITLE_MAX + 1) }), /Judul maksimal 200/);
  assert.equal(reason({ title: "x".repeat(ACHIEVEMENT_TITLE_MAX) }), "ok");
  assert.match(reason({ category: "patent" }), /penghargaan atau publikasi/);
  assert.match(reason({ category: undefined }), /penghargaan atau publikasi/);
  assert.match(reason({ issuer: "i".repeat(ACHIEVEMENT_ISSUER_MAX + 1) }), /Penyelenggara maksimal 120/);
  assert.match(reason({ description: "d".repeat(ACHIEVEMENT_DESCRIPTION_MAX + 1) }), /Deskripsi maksimal 2000/);
  assert.match(reason({ achievement_date: "kemarin" }), /Tanggal tidak valid/);
  assert.match(reason({ achievement_date: "2024-13-01" }), /Tanggal tidak valid/);
  assert.match(reason({ achievement_date: "1949-12-01" }), /sebelum 1950/);
  assert.match(reason({ achievement_date: "2026-12-01" }), /masa depan/);
  assert.match(reason({ achievement_date: "2031-01-01" }), /masa depan/);
});

// ---------------------------------------------------------------------------------------------
// rencana: pemetaan, duplikat, validasi
// ---------------------------------------------------------------------------------------------

test("rencana: seksi achievements ada di urutan sesudah sertifikasi dan sebelum skill", () => {
  assert.deepEqual([...SECTION_KEYS], ["basic", "experiences", "education", "certifications", "achievements", "skills"]);
  assert.deepEqual(buildImportPlan(preview([]), EMPTY_EXISTING, NOW).achievements, []);
});

test("pemetaan pratinjau ke baris achievements: award dan publication, penyelenggara, tanggal, deskripsi; detail dan catatan untuk pengguna", () => {
  const plan = buildImportPlan(
    preview([
      ach(),
      ach({ title: "3rd Place Winner of Hackathon (Smart City Category)", issuer: null, achievement_date: "2023-03-01", notes: [] }),
      ach({ title: "A Study of Caching on Mobile Learning", category: "publication", issuer: "Jurnal Fiktif", achievement_date: "2024-05-01", description: "Penulis: Tokoh Sintetis", notes: [] }),
      ach({ title: "Beasiswa Unggulan Fiktif Angkatan 2022", issuer: null, achievement_date: null, notes: [] }),
    ]),
    EMPTY_EXISTING,
    NOW,
  );
  assert.deepEqual(plan.achievements.map((i) => [i.key, i.status, i.title, i.detail]), [
    ["ach:0", "new", "Best Paper Award at Simulasi", "Penghargaan · KONFIK · Jan 2024"],
    ["ach:1", "new", "3rd Place Winner of Hackathon (Smart City Category)", "Penghargaan · Mar 2023"],
    ["ach:2", "new", "A Study of Caching on Mobile Learning", "Publikasi · Jurnal Fiktif · Mei 2024"],
    ["ach:3", "new", "Beasiswa Unggulan Fiktif Angkatan 2022", "Penghargaan"],
  ]);
  assert.deepEqual(plan.achievements[0].notes, ["Hanya tahun yang tercantum di PDF, tanggal diisi 1 Januari."], "catatan server diteruskan ke dialog");
  const sel = selectionFromPlan(plan, defaultSelection(plan));
  assert.deepEqual(sel.achievements, [
    { title: "Best Paper Award at Simulasi", category: "award", issuer: "KONFIK", achievement_date: "2024-01-01", description: null, is_featured: false },
    { title: "3rd Place Winner of Hackathon (Smart City Category)", category: "award", issuer: null, achievement_date: "2023-03-01", description: null, is_featured: false },
    { title: "A Study of Caching on Mobile Learning", category: "publication", issuer: "Jurnal Fiktif", achievement_date: "2024-05-01", description: "Penulis: Tokoh Sintetis", is_featured: false },
    { title: "Beasiswa Unggulan Fiktif Angkatan 2022", category: "award", issuer: null, achievement_date: null, description: null, is_featured: false },
  ]);
  assert.equal(selectionSize(sel), 4);
});

test("duplikat: judul sama tanpa peduli huruf besar, spasi, dan tanda baca = Sudah ada; judul lain tetap baru; baris database dengan judul null tidak error", () => {
  const plan = buildImportPlan(
    preview([ach(), ach({ title: "Dean's List Award Semester 3", issuer: null }), ach({ title: "Juara 2 Lomba Karya Tulis Ilmiah", issuer: null })]),
    existing({ achievements: [{ title: "best paper  AWARD at simulasi" }, { title: "DEAN'S LIST AWARD, Semester 3" }, { title: null }, {}] }),
    NOW,
  );
  assert.deepEqual(plan.achievements.map((i) => i.status), ["duplicate", "duplicate", "new"]);
  assert.match(plan.achievements[0].reason, /sudah ada/i);
  assert.equal(plan.achievements[0].row, null);
  assert.deepEqual(selectionFromPlan(plan, new Set(plan.achievements.map((i) => i.key))).achievements.map((r) => r.title), ["Juara 2 Lomba Karya Tulis Ilmiah"], "duplikat tidak ikut ditulis walau dipaksa masuk pilihan");
});

test("duplikat di dalam PDF yang sama: judul kembar kedua ditandai Sudah ada, bukan ditulis dua kali", () => {
  const plan = buildImportPlan(preview([ach(), ach({ category: "publication" }), ach({ title: "Judul Lain" })]), EMPTY_EXISTING, NOW);
  assert.deepEqual(plan.achievements.map((i) => i.status), ["new", "duplicate", "new"]);
});

test("validasi: tanggal masa depan, judul terlalu panjang, dan jenis asing ditandai tidak valid dan tidak pernah ditulis", () => {
  const plan = buildImportPlan(
    preview([
      ach({ title: "Dari Masa Depan", achievement_date: "2027-01-01" }),
      ach({ title: "x".repeat(ACHIEVEMENT_TITLE_MAX + 1) }),
      ach({ title: "Jenis Asing", category: "patent" as never }),
      ach({ title: "Tahun Terlalu Lama", achievement_date: "1900-01-01" }),
      ach({ title: "Sah" }),
    ]),
    EMPTY_EXISTING,
    NOW,
  );
  assert.deepEqual(plan.achievements.map((i) => i.status), ["invalid", "invalid", "invalid", "invalid", "new"]);
  assert.match(plan.achievements[0].reason, /masa depan/);
  assert.match(plan.achievements[1].reason, /Judul maksimal 200/);
  assert.match(plan.achievements[2].reason, /penghargaan atau publikasi/);
  assert.match(plan.achievements[3].reason, /sebelum 1950/);
  const everything = new Set(plan.achievements.map((i) => i.key));
  assert.deepEqual(selectionFromPlan(plan, everything).achievements.map((r) => r.title), ["Sah"]);
});

test("pilihan: bawaan mencentang item baru; centang per item dan per seksi; hitungan sama dengan ukuran pilihan", () => {
  const plan = buildImportPlan(preview([ach({ title: "A1" }), ach({ title: "A2" }), ach({ title: "A3" })]), existing({ achievements: [{ title: "a3" }] }), NOW);
  const all = defaultSelection(plan);
  assert.deepEqual([...all].sort(), ["ach:0", "ach:1"]);
  assert.equal(countSelected(plan, all), selectionSize(selectionFromPlan(plan, all)));
  assert.deepEqual(selectionFromPlan(plan, toggleItem(plan, "ach:0", all)).achievements.map((r) => r.title), ["A2"]);
  assert.equal(toggleItem(plan, "ach:2", all).has("ach:2"), false, "duplikat tidak bisa dicentang");
  assert.equal(setSectionSelection(plan, "achievements", new Set(), true).size, 2);
  assert.equal(setSectionSelection(plan, "achievements", all, false).size, 0);
});

// ---------------------------------------------------------------------------------------------
// penulisan
// ---------------------------------------------------------------------------------------------

function fakeWriter(failOn: (kind: string, row: any) => boolean = () => false) {
  const calls: Array<{ kind: string; row: any }> = [];
  const make = (kind: string) => async (row: any) => {
    await new Promise((r) => setTimeout(r, 1));
    calls.push({ kind, row });
    if (failOn(kind, row)) throw new Error(`gagal ${kind}`);
    return { ...row, id: `${kind}-${calls.length}` };
  };
  const writer: ImportWriter = {
    upsertProfile: async () => {},
    createExperience: make("experience"),
    createEducation: make("education"),
    createCertification: make("certification"),
    createAchievement: make("achievement"),
    createSkill: make("skill"),
  };
  return { writer, calls };
}

test("applyImport: achievements ditulis sesudah sertifikasi dan sebelum skill; baris persis seperti rencana; hasil dihitung", async () => {
  const p = preview([ach(), ach({ title: "Dashboard Design for Job Seekers", category: "publication" })]);
  p.certifications = [{ name: "AWS Certified Cloud Practitioner", issuer: "" }];
  p.skills = [{ name: "Python", category: "technical", proficiency_level: 3 }];
  const plan = buildImportPlan(p, EMPTY_EXISTING, NOW);
  const sel = selectionFromPlan(plan, defaultSelection(plan));
  const f = fakeWriter();
  const result = await applyImport(sel, f.writer);
  assert.deepEqual(f.calls.map((c) => c.kind), ["certification", "achievement", "achievement", "skill"]);
  assert.deepEqual(f.calls.filter((c) => c.kind === "achievement").map((c) => c.row), sel.achievements);
  assert.equal(result.added.achievements, 2);
  assert.equal(result.created.achievements.length, 2);
  assert.equal(addedTotal(result), 4);
  assert.deepEqual(summarizeCommit(result), { kind: "success", message: "Ditambahkan ke profil: 1 sertifikasi, 2 penghargaan dan publikasi, 1 skill." });
});

test("applyImport: satu penghargaan gagal tidak menghentikan yang lain; kegagalan dilaporkan dengan judulnya", async () => {
  const plan = buildImportPlan(preview([ach({ title: "A1" }), ach({ title: "A2" }), ach({ title: "A3" })]), EMPTY_EXISTING, NOW);
  const f = fakeWriter((kind, row) => kind === "achievement" && row.title === "A2");
  const result = await applyImport(selectionFromPlan(plan, defaultSelection(plan)), f.writer);
  assert.equal(result.added.achievements, 2);
  assert.deepEqual(result.failed.map((x) => [x.section, x.label]), [["penghargaan", "A2"]]);
  const s = summarizeCommit(result);
  assert.equal(s.kind, "partial");
  assert.match(s.message, /2 penghargaan dan publikasi/);
  assert.match(s.message, /1 item belum tersimpan/);
});

test("applyImport: tanpa penghargaan terpilih, createAchievement tidak dipanggil", async () => {
  const plan = buildImportPlan(preview([ach()]), EMPTY_EXISTING, NOW);
  const f = fakeWriter();
  await applyImport(selectionFromPlan(plan, new Set()), f.writer);
  assert.equal(f.calls.length, 0);
});

// ---------------------------------------------------------------------------------------------
// data demo
// ---------------------------------------------------------------------------------------------

test("data demo: pratinjau demo memuat achievements yang lolos pembaca respons; satu sudah ada di profil demo, sisanya baru", () => {
  const parsed = parseImportPreview({ success: true, preview: mockLinkedInImportPreview });
  assert.ok(parsed);
  assert.equal(parsed!.achievements.length, mockLinkedInImportPreview.achievements.length);
  assert.deepEqual(parsed!.achievements.map((a) => a.category), ["award", "award", "publication"]);
  const plan = buildImportPlan(parsed!, existing({ achievements: mockAchievements }), NOW);
  assert.deepEqual(plan.achievements.map((i) => i.status), ["duplicate", "new", "new"]);
  assert.deepEqual(mockLinkedInImportPreview.meta.dropped, { experiences: 0, education: 0, certifications: 0, achievements: 0, skills: 0 });
});
