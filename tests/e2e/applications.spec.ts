import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/test";
import type { MockBackend } from "./helpers/mockBackend";
import { applicationRow, approval, awaitingCodeLog, isoAgo, jobRow, questionsLog, stoppedLog } from "./helpers/fixtures";

/**
 * Halaman Lamaran Saya (src/routes/applications.tsx), jendela detail: yang ditawarkan ke pengguna saat agen
 * berhenti sebelum tombol kirim (log apply berstatus "ready"). Kode aplikasi asli; backend dan Supabase palsu.
 *
 * Satu lamaran "Siap dikirim" (app-1, lowongan job-a, persetujuan apr-1) dengan satu log percobaan agen.
 */

const APP_ID = "app-1";
const JOB_ID = "job-a";
const APPROVAL_ID = "apr-1";
const FORM_URL = "https://jobs.example.test/job-a";

function seed(backend: MockBackend, log: Record<string, any>) {
  backend.state.applications = [applicationRow(APP_ID, JOB_ID, { jobs: jobRow(JOB_ID, { title: "Backend Engineer", company: "PT Contoh", external_url: FORM_URL }) })];
  backend.state.logs = [{ ...log, job_id: JOB_ID }];
  backend.state.approvalDetail[APPROVAL_ID] = approval(APPROVAL_ID, { cover_letter: "Surat yang disetujui untuk PT Contoh." });
}

async function openDetail(app: Page) {
  await app.goto("/applications");
  // Kartu papan juga berperan tombol (dnd-kit) dan namanya memuat "Lihat detail": exact memilih tombol di dalamnya.
  await app.getByRole("button", { name: "Lihat detail", exact: true }).click();
  const dialog = app.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Backend Engineer" })).toBeVisible();
  return dialog;
}

const MARK_LABEL = "Saya sudah mengirimnya sendiri";
const RERUN_LABEL = "Coba kirim otomatis lagi";

test.describe("Lamaran: agen berhenti sebelum kirim", () => {
  test("situs belum diizinkan (not_allowed): buka formulir, tandai terkirim, dan coba kirim otomatis lagi", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, "not_allowed"));
    const dialog = await openDetail(app);

    const manual = dialog.getByRole("region", { name: "Kirim sendiri di situs lowongan" });
    await expect(manual).toBeVisible();
    await expect(manual.getByText(/belum didukung untuk kirim otomatis/)).toBeVisible();
    const open = manual.getByRole("link", { name: /Buka formulir lowongan/ });
    await expect(open).toHaveAttribute("href", FORM_URL);
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", /noopener/);
    await expect(manual.getByRole("button", { name: MARK_LABEL })).toBeVisible();
    await expect(manual.getByRole("button", { name: RERUN_LABEL })).toBeVisible();
    // Cover letter disetujui dimuat dari GET /api/approvals/:id, jadi tombol salinnya muncul.
    await expect(manual.getByRole("button", { name: "Salin cover letter" })).toBeVisible();
    // Isian yang diisi agen bisa disalin satu per satu.
    await expect(manual.getByText("Salin isian agen (1)")).toBeVisible();

    // Membuka layar ini tidak memanggil aksi apa pun.
    expect(backend.callsTo("POST", `/api/approvals/${APPROVAL_ID}/rerun`)).toHaveLength(0);
    expect(backend.callsTo("POST", `/api/approvals/${APPROVAL_ID}/mark-sent`)).toHaveLength(0);
  });

  test("Coba kirim otomatis lagi memanggil POST rerun tepat sekali dan tidak menandai terkirim", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, "not_allowed"));
    const dialog = await openDetail(app);

    await dialog.getByRole("button", { name: RERUN_LABEL }).click();
    await expect(dialog.getByText(/Agen berjalan lagi/)).toBeVisible();

    const reruns = backend.callsTo("POST", `/api/approvals/${APPROVAL_ID}/rerun`);
    expect(reruns).toHaveLength(1);
    expect(reruns[0].body).toEqual({});
    expect(backend.callsTo("POST", `/api/approvals/${APPROVAL_ID}/mark-sent`)).toHaveLength(0);
    // Tombolnya dikunci sesudah berhasil, jadi klik kedua tidak bisa mengantrekan ulang.
    await expect(dialog.getByRole("button", { name: RERUN_LABEL })).toBeDisabled();
    expect(backend.callsTo("POST", `/api/approvals/${APPROVAL_ID}/rerun`)).toHaveLength(1);
  });

  test("Tandai terkirim minta konfirmasi, lalu memanggil POST mark-sent tepat sekali dan tidak menjalankan agen", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, "not_allowed"));
    const dialog = await openDetail(app);

    await dialog.getByRole("button", { name: MARK_LABEL }).click();
    // Belum ada panggilan sebelum pengguna menjawab pertanyaan konfirmasi.
    await expect(dialog.getByText("Tandai lamaran ini sudah terkirim? Agen tidak akan mengirimnya lagi.")).toBeVisible();
    expect(backend.callsTo("POST", `/api/approvals/${APPROVAL_ID}/mark-sent`)).toHaveLength(0);

    await dialog.getByRole("button", { name: "Ya, tandai terkirim" }).click();
    await expect(dialog.getByText("Ditandai terkirim manual")).toBeVisible();
    await expect(app.getByText("Lamaran ditandai terkirim. Kartunya pindah ke Terkirim.")).toBeVisible();

    const marks = backend.callsTo("POST", `/api/approvals/${APPROVAL_ID}/mark-sent`);
    expect(marks).toHaveLength(1);
    expect(marks[0].body).toEqual({});
    expect(backend.callsTo("POST", `/api/approvals/${APPROVAL_ID}/rerun`)).toHaveLength(0);
  });

  test("Batal pada konfirmasi tidak memanggil mark-sent", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, "not_allowed"));
    const dialog = await openDetail(app);

    await dialog.getByRole("button", { name: MARK_LABEL }).click();
    await dialog.getByRole("button", { name: "Batal" }).click();
    await expect(dialog.getByRole("button", { name: MARK_LABEL })).toBeVisible();
    expect(backend.callsTo("POST", `/api/approvals/${APPROVAL_ID}/mark-sent`)).toHaveLength(0);
  });

  test("galat 409 already_sent dari mark-sent tampil sebagai pesan, satu panggilan saja", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, "not_allowed"));
    backend.override(`POST /api/approvals/${APPROVAL_ID}/mark-sent`, { status: 409, body: { error: "sudah", code: "already_sent" } });
    const dialog = await openDetail(app);

    await dialog.getByRole("button", { name: MARK_LABEL }).click();
    await dialog.getByRole("button", { name: "Ya, tandai terkirim" }).click();
    await expect(dialog.getByRole("alert")).toContainText("sudah tercatat terkirim");
    expect(backend.callsTo("POST", `/api/approvals/${APPROVAL_ID}/mark-sent`)).toHaveLength(1);
    await expect(dialog.getByText("Ditandai terkirim manual")).toHaveCount(0);
  });

  test("isian wajib kosong (required_remaining): tandai terkirim ada, coba otomatis lagi tidak ada", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, "required_remaining"));
    const dialog = await openDetail(app);

    const manual = dialog.getByRole("region", { name: "Kirim sendiri di situs lowongan" });
    await expect(manual.getByText(/masih ada isian wajib yang kosong/)).toBeVisible();
    await expect(manual.getByRole("button", { name: MARK_LABEL })).toBeVisible();
    // Menjalankan ulang tidak mengisi isian yang kosong, jadi tombolnya tidak ditawarkan.
    await expect(manual.getByRole("button", { name: RERUN_LABEL })).toHaveCount(0);
    await expect(dialog.getByText("Isian wajib yang masih kosong saat agen berhenti:")).toBeVisible();
    await expect(dialog.getByRole("listitem").filter({ hasText: "Nomor telepon" })).toBeVisible();
  });

  test("berhenti tanpa alasan khusus: hanya Tandai terkirim, tanpa coba otomatis lagi", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, null));
    const dialog = await openDetail(app);

    const manual = dialog.getByRole("region", { name: "Kirim sendiri di situs lowongan" });
    await expect(manual.getByText("Agen berhenti sebelum tombol kirim. Lamaran belum terkirim.")).toBeVisible();
    await expect(manual.getByRole("button", { name: MARK_LABEL })).toBeVisible();
    await expect(manual.getByRole("button", { name: RERUN_LABEL })).toHaveCount(0);
  });

  test("tanpa alamat lowongan tersimpan, tidak ada tautan formulir dan ada penjelasannya", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, "not_allowed"));
    backend.state.applications[0].jobs.external_url = "javascript:alert(1)";
    const dialog = await openDetail(app);

    const manual = dialog.getByRole("region", { name: "Kirim sendiri di situs lowongan" });
    await expect(manual.getByRole("link", { name: /Buka formulir lowongan/ })).toHaveCount(0);
    await expect(manual.getByText(/Alamat lowongan tidak tersimpan/)).toBeVisible();
  });
});

test.describe("Lamaran: berhenti karena alasan lain tidak menawarkan jalan keluar manual", () => {
  test("pertanyaan menunggu jawaban: tautan ke Persetujuan, tanpa tombol aksi", async ({ app, backend }) => {
    seed(backend, questionsLog("queue-1", APPROVAL_ID));
    const dialog = await openDetail(app);

    const link = dialog.getByTestId("agent-questions-link");
    await expect(link).toContainText("Agen butuh jawabanmu untuk 3 pertanyaan");
    await expect(link.getByRole("link", { name: "Persetujuan" })).toHaveAttribute("href", "/approvals");
    await expect(dialog.getByRole("button", { name: MARK_LABEL })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: RERUN_LABEL })).toHaveCount(0);
    expect(backend.apiCalls.filter((c) => c.method === "POST")).toEqual([]);
  });

  test("agen menunggu kode keamanan: tautan ke Persetujuan, tanpa tombol aksi", async ({ app, backend }) => {
    seed(backend, awaitingCodeLog("queue-1", APPROVAL_ID));
    const dialog = await openDetail(app);

    await expect(dialog.getByTestId("agent-code-link")).toContainText("Agen menunggu kode keamanan");
    await expect(dialog.getByRole("button", { name: MARK_LABEL })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: RERUN_LABEL })).toHaveCount(0);
    await expect(dialog.getByLabel("Kode dari email")).toHaveCount(0);
  });

  test("kirim sebelumnya belum terkonfirmasi (prior_unverified): peringatan cek dulu, tanpa tombol tandai atau coba lagi", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, "prior_unverified"));
    const dialog = await openDetail(app);

    await expect(dialog.getByTestId("agent-outcome")).toContainText("Perlu dicek: kirim sebelumnya belum terkonfirmasi");
    await expect(dialog.getByRole("button", { name: MARK_LABEL })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: RERUN_LABEL })).toHaveCount(0);
  });

  test("kode tidak dimasukkan tepat waktu: hasilnya dijelaskan, tombol jalankan ulang ada di halaman Persetujuan", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, null, { reason: "code_timeout" }));
    const dialog = await openDetail(app);

    await expect(dialog.getByTestId("agent-outcome")).toContainText("Kode tidak dimasukkan");
    await expect(dialog.getByRole("button", { name: MARK_LABEL })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: RERUN_LABEL })).toHaveCount(0);
  });

  test("draf yang sudah menunggu persetujuan: hanya tautan Buka Persetujuan, tanpa panel kirim sendiri", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, "not_allowed"));
    backend.state.pending = [approval("apr-2", { application_id: APP_ID, job_id: JOB_ID })];
    const dialog = await openDetail(app);

    await expect(dialog.getByRole("link", { name: "Buka Persetujuan" })).toHaveAttribute("href", "/approvals");
    await expect(dialog.getByRole("region", { name: "Kirim sendiri di situs lowongan" })).toHaveCount(0);
  });

  test("percobaan agen lebih tua daripada lamarannya diabaikan: tidak ada panel kirim sendiri", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, "not_allowed", {}, { created_at: isoAgo(120 * 60_000) }));
    const dialog = await openDetail(app);

    await expect(dialog.getByRole("region", { name: "Kirim sendiri di situs lowongan" })).toHaveCount(0);
    await expect(dialog.getByText(/Draf ini ditandai siap dikirim/)).toBeVisible();
  });
});
