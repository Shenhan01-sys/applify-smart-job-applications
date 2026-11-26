import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/test";
import type { MockBackend } from "./helpers/mockBackend";
import { applicationRow, approval, awaitingCodeLog, extensionQuestionsLog, isoAgo, jobRow, questionsLog, stoppedLog } from "./helpers/fixtures";

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

/** Tombol ini sudah dihapus dari layar; tes memastikan ia tidak muncul lagi. */
const MARK_LABEL = "Saya sudah mengirimnya sendiri";
const RERUN_LABEL = "Coba kirim otomatis lagi";

test.describe("Lamaran: agen berhenti sebelum kirim", () => {
  test("situs belum diizinkan (not_allowed): buka formulir, salin isian, dan coba kirim otomatis lagi, tanpa tombol tandai terkirim", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, "not_allowed"));
    const dialog = await openDetail(app);

    const manual = dialog.getByRole("region", { name: "Kirim sendiri di situs lowongan" });
    await expect(manual).toBeVisible();
    await expect(manual.getByText(/belum didukung untuk kirim otomatis/)).toBeVisible();
    const open = manual.getByRole("link", { name: /Buka formulir lowongan/ });
    await expect(open).toHaveAttribute("href", FORM_URL);
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", /noopener/);
    await expect(dialog.getByRole("button", { name: MARK_LABEL })).toHaveCount(0);
    await expect(dialog.getByText(MARK_LABEL)).toHaveCount(0);
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

  test("isian wajib kosong (required_remaining): panel tampil tanpa tombol tandai, coba otomatis lagi tidak ada", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, "required_remaining"));
    const dialog = await openDetail(app);

    const manual = dialog.getByRole("region", { name: "Kirim sendiri di situs lowongan" });
    await expect(manual.getByText(/masih ada isian wajib yang kosong/)).toBeVisible();
    await expect(manual.getByRole("button", { name: MARK_LABEL })).toHaveCount(0);
    // Menjalankan ulang tidak mengisi isian yang kosong, jadi tombolnya tidak ditawarkan.
    await expect(manual.getByRole("button", { name: RERUN_LABEL })).toHaveCount(0);
    await expect(dialog.getByText("Isian wajib yang masih kosong saat agen berhenti:")).toBeVisible();
    await expect(dialog.getByRole("listitem").filter({ hasText: "Nomor telepon" })).toBeVisible();
  });

  test("berhenti tanpa alasan khusus: panel tanpa tombol tandai dan tanpa coba otomatis lagi", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, null));
    const dialog = await openDetail(app);

    const manual = dialog.getByRole("region", { name: "Kirim sendiri di situs lowongan" });
    await expect(manual.getByText("Agen berhenti sebelum tombol kirim. Lamaran belum terkirim.")).toBeVisible();
    await expect(manual.getByRole("button", { name: MARK_LABEL })).toHaveCount(0);
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

  test("log ekstensi tanpa queue_job_id: pertanyaan yang bisa dijawab dihitung, kolom rahasia tidak", async ({ app, backend }) => {
    seed(backend, extensionQuestionsLog(APPROVAL_ID));
    const dialog = await openDetail(app);

    const link = dialog.getByTestId("agent-questions-link");
    await expect(link).toContainText("Agen butuh jawabanmu untuk 2 pertanyaan");
    await expect(link.getByRole("link", { name: "Persetujuan" })).toHaveAttribute("href", "/approvals");
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

    await expect(dialog.getByTestId("agent-outcome")).toContainText("Perlu dicek: kode tidak dimasukkan");
    await expect(dialog.getByRole("button", { name: MARK_LABEL })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: RERUN_LABEL })).toHaveCount(0);
  });

  test("kode keamanan tidak sampai ke agen: kartu Perlu dicek di kolom Perlu tindak lanjut, status tetap ready, langkah email-portal-kirim sendiri", async ({ app, backend }) => {
    seed(backend, stoppedLog("queue-1", APPROVAL_ID, null, { reason: "code_timeout" }));
    await app.goto("/applications");

    // Papan: kartu pindah tampilan ke Perlu tindak lanjut dengan lencana Perlu dicek; Siap dikirim kosong.
    const followUp = app.getByRole("group", { name: "Kolom Perlu tindak lanjut, 1 lamaran" });
    await expect(followUp).toBeVisible();
    await expect(followUp.getByTestId("needs-check-badge")).toContainText("Perlu dicek");
    await expect(followUp.getByText("Backend Engineer")).toBeVisible();
    await expect(app.getByRole("group", { name: "Kolom Siap dikirim, 0 lamaran" })).toBeVisible();

    // Jendela detail: langkah berikutnya jelas, tautan formulir aman, dan tidak ada tombol Sudah terkirim.
    await followUp.getByRole("button", { name: "Lihat detail", exact: true }).click();
    const dialog = app.getByRole("dialog");
    const panel = dialog.getByTestId("needs-check-panel");
    await expect(panel).toContainText("Perlu dicek: kode keamanan dari situs lowongan");
    await expect(panel.getByRole("listitem")).toHaveCount(3);
    await expect(panel.getByRole("listitem").nth(0)).toContainText("Buka emailmu");
    await expect(panel.getByRole("listitem").nth(1)).toContainText("masukkan kodenya di halaman situs");
    const open = panel.getByRole("link", { name: "Buka formulir lowongan" });
    await expect(open).toHaveAttribute("href", FORM_URL);
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", /noopener/);
    await expect(panel.getByRole("link", { name: "Buka Persetujuan" })).toHaveAttribute("href", "/approvals");
    await expect(dialog.getByRole("button", { name: MARK_LABEL })).toHaveCount(0);
    // Status asli tetap Siap dikirim: "Perlu tindak lanjut" tidak bisa dipilih untuk kartu ini dan tidak dihitung terkirim.
    const statusSelect = dialog.getByLabel("Ubah status");
    // Playwright tidak membaca atribut disabled pada <option>, jadi atributnya diperiksa langsung.
    await expect(statusSelect.locator("option[value=follow_up]")).toHaveAttribute("disabled", "");
    await expect(statusSelect).toHaveValue("ready");
    expect(backend.apiCalls.filter((c) => c.method === "POST")).toEqual([]);
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

test.describe("Lamaran: Antrean Agen untuk email yang tidak dikirim (mode uji)", () => {
  test("tugas email_apply selesai dengan log skipped tampil Belum dikirim (mode uji), bukan Selesai", async ({ app, backend }) => {
    backend.state.applications = [applicationRow("app-m", "job-m", { jobs: jobRow("job-m", { title: "Staf Admin", company: "PT Surat" }) })];
    backend.state.queue = [
      {
        id: "queue-mail",
        job_type: "email_apply",
        status: "completed",
        error_message: null,
        created_at: new Date(Date.now() - 120_000).toISOString(),
        completed_at: new Date(Date.now() - 60_000).toISOString(),
        payload: { job_id: "job-m", approval_request_id: "apr-m" },
      },
    ];
    backend.state.logs = [
      {
        action: "email_apply",
        status: "skipped",
        job_id: "job-m",
        created_at: new Date(Date.now() - 60_000).toISOString(),
        details: { to: "hrd@perusahaan.test", approval_request_id: "apr-m", reason: "real_submit_off" },
      },
    ];
    await app.goto("/applications");
    const panel = app.getByRole("region", { name: "Antrean Agen" });
    await expect(panel.getByText("Belum dikirim (mode uji)")).toBeVisible();
    await expect(panel.getByText("Selesai", { exact: true })).toHaveCount(0);
    await expect(panel.getByText(/tidak dikirim ke rekruter/)).toBeVisible();
  });
});
