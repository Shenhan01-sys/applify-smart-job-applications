import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/lib/apiErrors.ts";
import {
  EMPTY_EXISTING,
  LINKEDIN_PDF_HINT,
  buildImportPlan,
  defaultSelection,
  describeLinkedInImportError,
  parseImportPreview,
  selectionFromPlan,
  validateLinkedInPdfFile,
  type ExistingProfile,
  type ImportPreview,
} from "../src/lib/linkedinImport.ts";

// Data di bawah ini SINTETIS.
//
// Impor kini menerima PDF CV biasa (skill dibaca dari seksi Skills/Keahlian/Tools), bukan hanya PDF LinkedIn.
// Teks kartu harus mengatakannya, dan skill dari CV digabung dengan skill yang sudah ada tanpa duplikat.
const NOW = new Date("2026-11-20T10:00:00.000Z");

const preview = (skills: string[]) =>
  parseImportPreview({
    success: true,
    preview: {
      profile: { full_name: "Dewi Lestari Sintetis" },
      experiences: [],
      education: [],
      certifications: [],
      achievements: [],
      skills: skills.map((name) => ({ name, category: "technical", proficiency_level: 3 })),
      meta: { method: "ai", model: "m", pages: 1, truncated: false, dropped: {} },
      warnings: [],
    },
  }) as ImportPreview;

const existing = (names: string[]): ExistingProfile => ({ ...EMPTY_EXISTING, skills: names.map((name) => ({ name })) as ExistingProfile["skills"] });

test("petunjuk kartu: menyebut PDF LinkedIn (Lainnya > Simpan ke PDF) dan PDF CV biasa", () => {
  assert.match(LINKEDIN_PDF_HINT, /PDF profil LinkedIn/);
  assert.match(LINKEDIN_PDF_HINT, /Lainnya \(More\)/);
  assert.match(LINKEDIN_PDF_HINT, /Simpan ke PDF \(Save to PDF\)/);
  assert.match(LINKEDIN_PDF_HINT, /CV biasa/);
});

test("pesan galat unggahan tidak lagi menyuruh memakai PDF LinkedIn saja: CV biasa juga diterima", () => {
  const notPdf = validateLinkedInPdfFile({ name: "cv.docx", size: 1000, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  assert.equal(notPdf.ok, false);
  assert.match((notPdf as { reason: string }).reason, /CV/);
  for (const code of ["not_pdf", "pdf_no_text", "nothing_found", "pdf_too_long"]) {
    const msg = describeLinkedInImportError(new ApiError(422, JSON.stringify({ success: false, code, error: "x" })));
    assert.match(msg, /CV/, code);
  }
});

test("skill dari CV digabung dengan skill yang sudah ada: duplikat (tanpa memandang huruf besar dan spasi) tidak ditambah", () => {
  const plan = buildImportPlan(preview(["python", "SQL", "POWER BI", "Excel", "excel"]), existing(["Python", "power bi"]), NOW);
  assert.deepEqual(plan.skills.map((s) => [s.title, s.status]), [
    ["python", "duplicate"],
    ["SQL", "new"],
    ["POWER BI", "duplicate"],
    ["Excel", "new"],
    ["excel", "duplicate"],
  ]);
  const sel = selectionFromPlan(plan, defaultSelection(plan));
  assert.deepEqual(sel.skills.map((s) => s.name), ["SQL", "Excel"]);
});
