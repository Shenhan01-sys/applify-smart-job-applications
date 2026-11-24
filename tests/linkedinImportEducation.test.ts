import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_EXISTING, buildImportPlan, parseImportPreview, selectionFromPlan, defaultSelection, type ImportPreview } from "../src/lib/linkedinImport.ts";

// Data di bawah ini SINTETIS: tokoh dan institusi fiktif.
//
// Laporan produksi: pengguna mengunggah CV biasa dan seksi Pendidikan profil kosong. Sisi server kini mengirim
// IPK (`gpa`, `max_gpa`) dan tahun lulus tunggal sebagai start_year = end_year. Sisi frontend harus membawa IPK
// sampai ke baris `education` dan tidak boleh membuang pendidikan hanya karena IPK-nya aneh.
const NOW = new Date("2026-11-20T10:00:00.000Z");

const edu = (over: Record<string, unknown> = {}) => ({
  institution: "Universitas Fiktif Nusantara",
  degree: "S1",
  field_of_study: "Sistem Informasi",
  start_year: 2019,
  end_year: 2023,
  is_current: false,
  notes: [],
  ...over,
});

const preview = (education: unknown[]) =>
  parseImportPreview({
    success: true,
    preview: {
      profile: { full_name: "Dewi Lestari Sintetis" },
      experiences: [],
      education,
      certifications: [],
      achievements: [],
      skills: [],
      meta: { method: "ai", model: "m", pages: 1, truncated: false, dropped: {} },
      warnings: [],
    },
  }) as ImportPreview;

test("parseImportPreview: IPK dan skala dari server dibawa; server lama tanpa IPK menghasilkan null", () => {
  const p = preview([edu({ gpa: 3.75, max_gpa: 4 }), edu({ institution: "Politeknik Fiktif", degree: "D3" }), edu({ institution: "Akademi Fiktif", degree: "D4", gpa: "3.5", max_gpa: null })]);
  assert.deepEqual(p.education.map((e) => [e.institution, e.gpa, e.max_gpa]), [
    ["Universitas Fiktif Nusantara", 3.75, 4],
    ["Politeknik Fiktif", null, null],
    ["Akademi Fiktif", null, null], // bukan angka dari server: diabaikan, bukan ditebak
  ]);
});

test("buildImportPlan: IPK masuk ke baris education dan tampil di detail (koma desimal)", () => {
  const plan = buildImportPlan(preview([edu({ gpa: 3.75, max_gpa: 4 })]), EMPTY_EXISTING, NOW);
  assert.equal(plan.education[0].status, "new");
  assert.match(plan.education[0].detail, /IPK 3,75\/4/);
  const sel = selectionFromPlan(plan, defaultSelection(plan));
  assert.deepEqual([sel.education[0].gpa, sel.education[0].max_gpa], [3.75, 4]);
});

test("buildImportPlan: skala IPK 100 (bukan 4) ikut tersimpan", () => {
  const plan = buildImportPlan(preview([edu({ gpa: 85.5, max_gpa: 100 })]), EMPTY_EXISTING, NOW);
  const sel = selectionFromPlan(plan, defaultSelection(plan));
  assert.deepEqual([sel.education[0].gpa, sel.education[0].max_gpa], [85.5, 100]);
});

test("buildImportPlan: IPK yang tidak sah (melebihi skala) dibuang, pendidikannya tetap masuk dengan catatan", () => {
  const plan = buildImportPlan(preview([edu({ gpa: 4.5, max_gpa: 4 })]), EMPTY_EXISTING, NOW);
  assert.equal(plan.education[0].status, "new", "pendidikan tidak boleh ikut hilang karena IPK-nya");
  const sel = selectionFromPlan(plan, defaultSelection(plan));
  assert.deepEqual([sel.education[0].gpa, sel.education[0].max_gpa], [null, null]);
  assert.match(plan.education[0].notes.join(" "), /IPK/);
});

test("buildImportPlan: tahun lulus tunggal (start_year = end_year) dari CV valid dan bisa dipilih", () => {
  const plan = buildImportPlan(preview([edu({ start_year: 2023, end_year: 2023, notes: ["Hanya satu tahun (2023) tercantum di PDF."] })]), EMPTY_EXISTING, NOW);
  assert.equal(plan.education[0].status, "new");
  const sel = selectionFromPlan(plan, defaultSelection(plan));
  assert.deepEqual([sel.education[0].start_year, sel.education[0].end_year], [2023, 2023]);
  assert.deepEqual(plan.education[0].notes, ["Hanya satu tahun (2023) tercantum di PDF."]);
});
