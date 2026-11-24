import { expect, test } from "./helpers/test";
import { TEST_USER_ID } from "./helpers/constants";
import type { MockBackend } from "./helpers/mockBackend";

/**
 * Halaman Profil: mengunggah CV (PDF) di kartu "CV untuk Dilampirkan" otomatis menjalankan alur impor yang sama dengan
 * kartu "Impor dari PDF": pratinjau "Isi profil dari CV ini?", pengguna menyetujui, baru ada yang ditulis.
 * Kode aplikasi asli; backend (/mock-api) dan Supabase (/mock-supabase) palsu. Semua data SINTETIS.
 */

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
const DOCX = Buffer.from("PK\u0003\u0004 bukan PDF");

const ACH_TITLE = "Juara 1 Lomba Karya Tulis Ilmiah Nasional";
const ACH_DESC = "Diikuti 120 tim dari 40 perguruan tinggi.";

const PREVIEW = {
  profile: { full_name: "Dewi Anggraini Sintetis", current_title: null, location: "Yogyakarta", linkedin_url: null },
  experiences: [],
  education: [
    { institution: "Universitas Kristen Duta Wacana", degree: "S1", field_of_study: "Sistem Informasi", start_year: 2022, end_year: null, is_current: true, gpa: 3.75, max_gpa: 4, notes: [] },
  ],
  certifications: [],
  achievements: [{ title: ACH_TITLE, category: "award", issuer: null, achievement_date: "2024-01-01", description: ACH_DESC, url: null, notes: [] }],
  skills: [],
  meta: { method: "ai", model: "test-model", pages: 1, truncated: false, dropped: { experiences: 0, education: 0, certifications: 0, achievements: 0, skills: 0 } },
  warnings: [],
};

const IMPORT_PATH = "/api/profile/import/linkedin-pdf";

function seed(backend: MockBackend) {
  backend.state.profiles = [{ id: TEST_USER_ID, full_name: "", resume_url: null }];
  // Impor 23 November: judulnya sudah ada, deskripsinya kosong.
  backend.state.achievements = [
    { id: "ach-lama", user_id: TEST_USER_ID, title: ACH_TITLE, description: null, category: "award", issuer: "Kementerian Fiktif", achievement_date: null, url: null, is_featured: false },
  ];
  backend.state.importPreview = PREVIEW;
}

const importCalls = (backend: MockBackend) => backend.callsTo("POST", IMPORT_PATH);
const writesTo = (backend: MockBackend, table: string) => backend.restWrites.filter((c) => c.path === `/rest/v1/${table}`);
const dataWrites = (backend: MockBackend) => backend.restWrites.filter((c) => /\/rest\/v1\/(education|achievements|work_experiences|certifications|user_skills)$/.test(c.path));

test.describe("Profil: unggah CV menawarkan isi profil dari CV itu", () => {
  test("CV PDF: tersimpan, satu panggilan impor, pratinjau muncul, tidak ada yang ditulis sebelum setuju, lalu pendidikan dan deskripsi masuk", async ({ app, backend }) => {
    seed(backend);
    await app.goto("/profile");
    await expect(app.getByRole("heading", { name: "CV untuk Dilampirkan" })).toBeVisible();
    await expect(app.getByTestId("resume-import-hint")).toContainText("isinya juga dibaca AI");

    await app.locator("#resume-file").setInputFiles({ name: "cv-dewi.pdf", mimeType: "application/pdf", buffer: PDF });

    // pratinjau persetujuan
    const dialog = app.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Isi profil dari CV ini?" })).toBeVisible();
    await expect(dialog).toContainText("Universitas Kristen Duta Wacana");
    await expect(dialog).toContainText("2022 - Sekarang");
    await expect(dialog).toContainText("IPK 3,75/4");
    await expect(dialog).toContainText("Lengkapi yang kosong");

    // CV sudah tersimpan (Storage dan profiles.resume_url), PDF dikirim sekali ke backend dengan token
    expect(backend.state.storage).toHaveLength(1);
    expect(backend.state.storage[0]).toMatch(new RegExp(`^resumes/${TEST_USER_ID}/cv-\\d+\\.pdf$`));
    expect(backend.state.profiles[0].resume_url).toMatch(/\/cv-\d+\.pdf$/);
    expect(importCalls(backend)).toHaveLength(1);
    expect(String(importCalls(backend)[0].body)).toMatch(/^%PDF/);
    expect(importCalls(backend)[0].authorization).toMatch(/^Bearer /);
    // HITL: belum ada data profil yang ditulis
    expect(dataWrites(backend)).toEqual([]);

    await dialog.getByRole("button", { name: "Tambahkan ke profil" }).click();
    await expect(app.getByText(/Ditambahkan ke profil:.*1 pendidikan.*1 penghargaan dilengkapi/)).toBeVisible();

    // pendidikan masih berjalan: is_current true, end_year null
    const edu = writesTo(backend, "education");
    expect(edu).toHaveLength(1);
    expect(edu[0].body).toMatchObject({ institution: "Universitas Kristen Duta Wacana", degree: "S1", field_of_study: "Sistem Informasi", start_year: 2022, end_year: null, is_current: true, gpa: 3.75, max_gpa: 4 });
    // penghargaan yang sudah ada dilengkapi, bukan digandakan; hanya kolom kosong, penyelenggara yang sudah ada tidak disentuh
    expect(writesTo(backend, "achievements").map((c) => [c.method, new URLSearchParams(c.search).get("id")])).toEqual([["PATCH", "eq.ach-lama"]]);
    expect(writesTo(backend, "achievements")[0].body).toEqual({ description: ACH_DESC, achievement_date: "2024-01-01" });
    expect(backend.state.achievements).toHaveLength(1);
    expect(backend.state.achievements[0]).toMatchObject({ description: ACH_DESC, issuer: "Kementerian Fiktif" });

    // tetap satu panggilan impor untuk satu unggahan
    expect(importCalls(backend)).toHaveLength(1);
  });

  test("Lewati: tidak ada data yang ditulis, CV tetap tersimpan; unggahan berikutnya = satu impor lagi", async ({ app, backend }) => {
    seed(backend);
    await app.goto("/profile");
    await app.locator("#resume-file").setInputFiles({ name: "cv-dewi.pdf", mimeType: "application/pdf", buffer: PDF });

    const dialog = app.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Isi profil dari CV ini?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Lewati" }).click();
    await expect(dialog).toBeHidden();

    expect(dataWrites(backend)).toEqual([]);
    expect(writesTo(backend, "profiles").filter((c) => c.method === "POST")).toEqual([]);
    expect(backend.state.storage).toHaveLength(1);
    await expect(app.getByText(/cv-\d+\.pdf/)).toBeVisible();
    expect(importCalls(backend)).toHaveLength(1);

    await app.locator("#resume-file").setInputFiles({ name: "cv-dewi-2.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(app.getByRole("dialog").getByRole("heading", { name: "Isi profil dari CV ini?" })).toBeVisible();
    expect(importCalls(backend)).toHaveLength(2);
    expect(dataWrites(backend)).toEqual([]);
  });

  test("CV DOCX: tersimpan tanpa dibaca; catatan singkat, tanpa panggilan impor dan tanpa dialog", async ({ app, backend }) => {
    seed(backend);
    await app.goto("/profile");
    await app.locator("#resume-file").setInputFiles({
      name: "cv-dewi.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: DOCX,
    });
    await expect(app.getByTestId("resume-note")).toContainText("hanya untuk berkas PDF");
    await expect(app.getByTestId("resume-note")).toHaveAttribute("role", "status");
    expect(backend.state.storage).toHaveLength(1);
    expect(importCalls(backend)).toEqual([]);
    await expect(app.getByRole("dialog")).toHaveCount(0);
    expect(dataWrites(backend)).toEqual([]);
  });

  test("impor gagal (PDF tanpa teks): CV tetap tersimpan, pesan pendek yang menyebut CV sudah tersimpan, tidak ada yang ditulis", async ({ app, backend }) => {
    seed(backend);
    backend.override(`POST ${IMPORT_PATH}`, { status: 422, body: { success: false, code: "pdf_no_text", error: "Tidak ada teks" } });
    await app.goto("/profile");
    await app.locator("#resume-file").setInputFiles({ name: "cv-pindai.pdf", mimeType: "application/pdf", buffer: PDF });

    const error = app.locator("#li-import-error");
    await expect(error).toContainText("CV tersimpan, tetapi isinya belum bisa dibaca untuk mengisi profil.");
    await expect(error).toContainText("tidak berisi teks");
    await expect(error).toHaveAttribute("role", "alert");
    expect(backend.state.storage).toHaveLength(1);
    expect(backend.state.profiles[0].resume_url).toMatch(/\/cv-\d+\.pdf$/);
    expect(importCalls(backend)).toHaveLength(1);
    expect(dataWrites(backend)).toEqual([]);
    await expect(app.getByRole("dialog")).toHaveCount(0);
  });

  test("kartu Impor dari PDF tetap bekerja sendiri: satu panggilan, dialog umum, dan teksnya menjelaskan bahwa satu unggahan sudah cukup", async ({ app, backend }) => {
    seed(backend);
    await app.goto("/profile");
    await expect(app.getByTestId("li-import-cv-note")).toContainText("Tidak perlu mengunggah dua kali");

    await app.locator("#li-import-file").setInputFiles({ name: "linkedin.pdf", mimeType: "application/pdf", buffer: PDF });
    const dialog = app.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Periksa data dari PDF" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Batal" })).toBeVisible();
    expect(importCalls(backend)).toHaveLength(1);
    // berkas dari kartu impor tidak disimpan sebagai CV
    expect(backend.state.storage).toEqual([]);
    expect(dataWrites(backend)).toEqual([]);
  });
});
