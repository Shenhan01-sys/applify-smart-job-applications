import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_EXISTING,
  addedTotal,
  applyImport,
  buildImportPlan,
  countSelected,
  defaultSelection,
  emptyCommit,
  parseImportPreview,
  selectionFromPlan,
  selectionSize,
  setSectionSelection,
  summarizeCommit,
  toggleItem,
  type ExistingProfile,
  type ImportPreview,
  type ImportWriter,
  type PreviewAchievement,
} from "../src/lib/linkedinImport.ts";

// Laporan produksi: 15 penghargaan pemilik hasil impor 23 November berjudul lengkap, tetapi hanya satu yang punya
// deskripsi. Impor ulang CV yang kini membawa deskripsi harus MELENGKAPI baris yang sudah ada (bukan menambah
// duplikat), dan hanya kolom yang masih kosong. Data SINTETIS.
const NOW = new Date("2026-11-20T10:00:00.000Z");

const ach = (over: Partial<PreviewAchievement> = {}): PreviewAchievement => ({
  title: "Juara 1 Lomba Karya Tulis Ilmiah Nasional",
  category: "award",
  issuer: null,
  achievement_date: "2024-01-01",
  description: "Diikuti 120 tim dari 40 perguruan tinggi.",
  url: null,
  notes: [],
  ...over,
});

const preview = (achievements: PreviewAchievement[], education: ImportPreview["education"] = []): ImportPreview => ({
  profile: { full_name: null, current_title: null, location: null, linkedin_url: null },
  experiences: [],
  education,
  certifications: [],
  achievements,
  skills: [],
  meta: { method: "ai", model: "test", pages: 1, truncated: false, dropped: 0 },
  warnings: [],
});

const existing = (achievements: ExistingProfile["achievements"]): ExistingProfile => ({ ...EMPTY_EXISTING, achievements });

test("judul sama, deskripsi di profil kosong: status update (bukan duplikat dan bukan baris baru) dengan kolom kosong yang diisi", () => {
  const plan = buildImportPlan(preview([ach()]), existing([{ id: "a1", title: "juara 1 lomba karya tulis ilmiah nasional", description: null, issuer: null, achievement_date: null, url: null }]), NOW);
  const [item] = plan.achievements;
  assert.equal(item.status, "update");
  assert.equal(item.row, null, "tidak ada baris baru");
  assert.deepEqual(item.fill, { id: "a1", patch: { description: "Diikuti 120 tim dari 40 perguruan tinggi.", achievement_date: "2024-01-01" } });
  assert.match(item.detail, /Melengkapi deskripsi, tanggal dari PDF/);
});

test("hanya kolom kosong yang diisi: deskripsi, penyelenggara, tanggal, dan tautan yang sudah terisi tidak ditimpa", () => {
  const p = preview([ach({ issuer: "Kementerian Fiktif", url: "https://lomba.example.org/juara" })]);
  const full = buildImportPlan(p, existing([{ id: "a1", title: "Juara 1 Lomba Karya Tulis Ilmiah Nasional", description: "Tulisan saya sendiri", issuer: "Kemdikbud", achievement_date: "2023-05-01", url: "https://saya.example.org" }]), NOW);
  assert.equal(full.achievements[0].status, "duplicate", "semua kolom sudah terisi: tidak ada yang ditawarkan");
  assert.equal(full.achievements[0].fill, undefined);

  const partial = buildImportPlan(p, existing([{ id: "a1", title: "Juara 1 Lomba Karya Tulis Ilmiah Nasional", description: "Tulisan saya sendiri", issuer: "", achievement_date: "2023-05-01", url: "  " }]), NOW);
  assert.equal(partial.achievements[0].status, "update");
  assert.deepEqual(partial.achievements[0].fill, { id: "a1", patch: { issuer: "Kementerian Fiktif", url: "https://lomba.example.org/juara" } }, "deskripsi dan tanggal milik pengguna dibiarkan");
});

test("PDF tanpa isi baru untuk kolom yang kosong tetap duplikat; baris tanpa id tidak bisa diperbarui", () => {
  const noExtra = ach({ description: null, achievement_date: null });
  assert.equal(buildImportPlan(preview([noExtra]), existing([{ id: "a1", title: noExtra.title }]), NOW).achievements[0].status, "duplicate");
  assert.equal(buildImportPlan(preview([ach()]), existing([{ title: ach().title, description: "" }]), NOW).achievements[0].status, "duplicate", "tanpa id tidak ada yang bisa diperbarui");
});

test("nilai dari PDF divalidasi: deskripsi terlalu panjang, tanggal masa depan, dan tautan bukan http(s) tidak ikut", () => {
  const plan = buildImportPlan(
    preview([ach({ description: "x".repeat(2001), achievement_date: "2030-01-01", url: "javascript:alert(1)", issuer: "Kementerian Fiktif" })]),
    existing([{ id: "a1", title: ach().title }]),
    NOW,
  );
  assert.deepEqual(plan.achievements[0].fill, { id: "a1", patch: { issuer: "Kementerian Fiktif" } });
});

test("dua baris dengan judul sama: yang sudah punya deskripsi dilewati, yang kosong dilengkapi; satu baris tidak diisi dua kali", () => {
  const rows = [
    { id: "a1", title: ach().title, description: "Sudah ada", issuer: "X", achievement_date: "2024-01-01", url: "https://a.example.org" },
    { id: "a2", title: ach().title, description: null },
  ];
  const plan = buildImportPlan(preview([ach(), ach()]), existing(rows), NOW);
  assert.deepEqual(plan.achievements.map((i) => [i.status, i.fill?.id ?? null]), [["update", "a2"], ["duplicate", null]]);
});

test("judul baru di PDF tetap menjadi baris baru, dan tautan ikut ke baris itu", () => {
  const plan = buildImportPlan(preview([ach({ title: "Beasiswa Unggulan Fiktif", url: "https://beasiswa.example.org/penerima" })]), existing([{ id: "a1", title: "Penghargaan Lain" }]), NOW);
  const [item] = plan.achievements;
  assert.equal(item.status, "new");
  assert.equal(item.row?.url, "https://beasiswa.example.org/penerima");
  assert.equal(item.row?.description, "Diikuti 120 tim dari 40 perguruan tinggi.");
});

test("parseImportPreview: url penghargaan dibaca; server lama tanpa url menghasilkan null", () => {
  const p = parseImportPreview({
    success: true,
    preview: { achievements: [{ title: "A", category: "award", url: " https://x.example.org " }, { title: "B", category: "award" }] },
  });
  assert.deepEqual(p!.achievements.map((a) => a.url), ["https://x.example.org", null]);
});

test("pilihan: item update tercentang bawaan, bisa dicabut, dihitung, dan keluar sebagai achievementFills (bukan achievements)", () => {
  const plan = buildImportPlan(preview([ach(), ach({ title: "Penghargaan Baru Fiktif" })]), existing([{ id: "a1", title: ach().title }]), NOW);
  const all = defaultSelection(plan);
  assert.deepEqual([...all].sort(), ["ach:0", "ach:1"]);
  assert.equal(countSelected(plan, all), 2);
  const sel = selectionFromPlan(plan, all);
  assert.equal(sel.achievements.length, 1);
  assert.deepEqual(sel.achievementFills.map((f) => f.id), ["a1"]);
  assert.equal(selectionSize(sel), 2);

  const off = toggleItem(plan, "ach:0", all);
  assert.equal(selectionFromPlan(plan, off).achievementFills.length, 0, "dicabut = tidak ditulis");
  assert.deepEqual([...setSectionSelection(plan, "achievements", new Set(), true)].sort(), ["ach:0", "ach:1"]);
  assert.equal(selectionFromPlan(plan, new Set()).achievementFills.length, 0, "tanpa centang tidak ada yang ditulis");
});

function fakeWriter(failUpdate = false) {
  const calls: Array<{ kind: string; arg: unknown }> = [];
  const writer: ImportWriter = {
    upsertProfile: async () => {},
    createExperience: async (r) => r,
    createEducation: async (r) => r,
    createCertification: async (r) => r,
    createAchievement: async (r) => {
      calls.push({ kind: "create", arg: r });
      return r;
    },
    updateAchievement: async (id, patch) => {
      calls.push({ kind: "update", arg: { id, patch } });
      if (failUpdate) throw new Error("gagal memperbarui");
      return { id, ...patch };
    },
    createSkill: async (r) => r,
  };
  return { writer, calls };
}

test("applyImport: memperbarui baris yang ada hanya dengan kolom di patch, tanpa membuat baris baru; dihitung dan diringkas", async () => {
  const plan = buildImportPlan(preview([ach()]), existing([{ id: "a1", title: ach().title }]), NOW);
  const f = fakeWriter();
  const result = await applyImport(selectionFromPlan(plan, defaultSelection(plan)), f.writer);
  assert.deepEqual(f.calls, [{ kind: "update", arg: { id: "a1", patch: { description: "Diikuti 120 tim dari 40 perguruan tinggi.", achievement_date: "2024-01-01" } } }]);
  assert.deepEqual(result.filled.achievements.map((x) => x.id), ["a1"]);
  assert.equal(result.added.achievements, 0);
  assert.equal(addedTotal(result), 1, "memicu penyegaran tampilan di halaman");
  assert.deepEqual(summarizeCommit(result), { kind: "success", message: "Ditambahkan ke profil: 1 penghargaan dilengkapi." });
});

test("applyImport: pembaruan yang gagal dilaporkan dan tidak dihitung sebagai tersimpan", async () => {
  const plan = buildImportPlan(preview([ach()]), existing([{ id: "a1", title: ach().title }]), NOW);
  const result = await applyImport(selectionFromPlan(plan, defaultSelection(plan)), fakeWriter(true).writer);
  assert.equal(result.filled.achievements.length, 0);
  assert.equal(addedTotal(result), 0);
  assert.equal(result.failed[0].section, "penghargaan");
  assert.match(result.failed[0].label, /deskripsi/);
  assert.equal(summarizeCommit(result).kind, "failed");
});

test("emptyCommit membawa filled kosong; tanpa pilihan updateAchievement tidak dipanggil", async () => {
  assert.deepEqual(emptyCommit().filled, { achievements: [] });
  const plan = buildImportPlan(preview([ach()]), existing([{ id: "a1", title: ach().title }]), NOW);
  const f = fakeWriter();
  await applyImport(selectionFromPlan(plan, new Set()), f.writer);
  assert.equal(f.calls.length, 0);
});

// ───────────────────────────────────────────────────────────── pendidikan yang masih berjalan

test("pendidikan masih berjalan (is_current true, tanpa tahun lulus): status new, baris is_current true dan end_year null", () => {
  const edu = { institution: "Universitas Kristen Duta Wacana", degree: "S1", field_of_study: "Sistem Informasi", start_year: 2022, end_year: null, is_current: true, gpa: 3.75, max_gpa: 4, notes: [] };
  const plan = buildImportPlan(preview([], [edu]), EMPTY_EXISTING, NOW);
  assert.equal(plan.education[0].status, "new");
  assert.match(plan.education[0].detail, /2022 - Sekarang/);
  assert.match(plan.education[0].detail, /IPK 3,75\/4/);
  const [row] = selectionFromPlan(plan, defaultSelection(plan)).education;
  assert.deepEqual([row.start_year, row.end_year, row.is_current, row.gpa, row.max_gpa], [2022, null, true, 3.75, 4]);
});

test("pendidikan masih berjalan lewat parseImportPreview: end_year null dari JSON server tetap sah", () => {
  const p = parseImportPreview({
    success: true,
    preview: { education: [{ institution: "Universitas Kristen Duta Wacana", degree: "S1", field_of_study: "Sistem Informasi", start_year: 2022, end_year: null, is_current: true, gpa: 3.75, max_gpa: 4, notes: [] }] },
  });
  assert.deepEqual(p!.education.map((e) => [e.start_year, e.end_year, e.is_current]), [[2022, null, true]]);
  assert.equal(buildImportPlan(p!, EMPTY_EXISTING, NOW).education[0].status, "new");
});
