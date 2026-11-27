import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./helpers/test";
import type { MockBackend } from "./helpers/mockBackend";
import {
  applicationRow,
  applyLog,
  approvedApproval,
  approval,
  isoAgo,
  jobRow,
  queueRow,
  questionsLog,
  stoppedLog,
} from "./helpers/fixtures";

/**
 * Tidak ada status buntu (keputusan Hans, 26 November 2026): setiap status yang tampil di Persetujuan, Lamaran Saya,
 * dan banner Beranda punya sedikitnya satu tindakan. Daftar statusnya ada di docs/status-actions.md dan di
 * STAGE_ACTIONS (src/lib/outcomeActions.ts). Kode aplikasi asli yang berjalan; backend dan Supabase dipalsukan.
 *
 * Tiga tindakan untuk hasil yang tidak pasti (kirim belum terkonfirmasi, kode tidak sampai, kedaluwarsa tanpa bukti):
 *   Sudah terkirim            POST /api/approvals/:id/mark-sent  (konfirmasi pengguna, bukan konfirmasi sistem)
 *   Belum terkirim, ulangi    POST /api/approvals/:id/not-sent   (persetujuan baru)
 *   Tutup                     POST /api/approvals/:id/close
 * Semua tulis ke approval_requests, application_logs, dan automation_queue lewat backend; browser tidak menulis langsung.
 */

const DAY = 24 * 3600_000;
const HOUR = 3600_000;

/** Kartu persetujuan berdasarkan judulnya (pola yang sama dengan approvals.spec.ts). */
const cardOf = (app: Page, title: string): Locator =>
  app.getByRole("heading", { name: title }).locator("xpath=ancestor::div[contains(@class,'group')][1]");

/** Binance: disetujui 23 November, masa berlaku habis, agen menekan kirim tetapi halaman konfirmasi tidak terbaca. */
function seedBinance(backend: MockBackend, id = "apr-bin") {
  backend.state.history = [
    approvedApproval(id, {
      job_title: "Operations Analyst",
      company: "Binance",
      created_at: isoAgo(3 * DAY),
      reviewed_at: isoAgo(3 * DAY),
      expires_at: isoAgo(2 * DAY),
    }),
  ];
  backend.state.jobs = [jobRow(`job-${id}`, { external_url: "https://jobs.example.test/binance" })];
  backend.state.queue = [queueRow("queue-bin", id, "completed", { created_at: isoAgo(3 * DAY) })];
  backend.state.logs = [applyLog("queue-bin", id, "submit_unverified", {}, { created_at: isoAgo(3 * DAY) })];
}

test.describe("Persetujuan: tiga tindakan untuk hasil yang tidak pasti", () => {
  test("Binance (kirim belum terkonfirmasi, kedaluwarsa): tetap di Menunggu dan menawarkan tiga tindakan, bukan kartu mati", async ({ app, backend }) => {
    seedBinance(backend);
    await app.goto("/approvals");

    const card = cardOf(app, "Operations Analyst");
    await expect(card.getByText("Perlu dicek, kirim belum terkonfirmasi")).toBeVisible();
    await expect(card.getByTestId("outcome-intro")).toBeVisible();
    await expect(card.getByTestId("action-confirm_sent")).toHaveText(/Sudah terkirim/);
    await expect(card.getByTestId("action-retry_fresh")).toHaveText(/Belum terkirim, ulangi/);
    await expect(card.getByTestId("action-close")).toHaveText(/Tutup/);
    await expect(card.getByTestId("action-open_form")).toHaveAttribute("href", "https://jobs.example.test/binance");

    // Membuka layar tidak menjalankan tindakan apa pun.
    expect(backend.apiCalls.filter((c) => c.method === "POST" && !c.path.endsWith("/claim-statuses"))).toEqual([]);
  });

  test("Sudah terkirim: satu konfirmasi, POST mark-sent sekali, kartu pindah ke Riwayat sebagai dikonfirmasi pengguna", async ({ app, backend }) => {
    seedBinance(backend);
    await app.goto("/approvals");
    const card = cardOf(app, "Operations Analyst");

    await card.getByTestId("action-confirm_sent").click();
    // Belum ada panggilan sebelum pengguna menjawab konfirmasi.
    await expect(card.getByTestId("outcome-confirm")).toBeVisible();
    expect(backend.callsTo("POST", "/api/approvals/apr-bin/mark-sent")).toHaveLength(0);
    await card.getByTestId("outcome-confirm-yes").click();

    await expect(app.getByRole("heading", { name: "Semua sudah diperiksa" })).toBeVisible();
    expect(backend.callsTo("POST", "/api/approvals/apr-bin/mark-sent")).toHaveLength(1);
    expect(backend.restWrites).toEqual([]);

    await app.getByRole("button", { name: /Riwayat/ }).click();
    const sent = cardOf(app, "Operations Analyst");
    // Lencana halaman dan label kartu agen sama-sama menyebut siapa yang mengonfirmasi.
    await expect(sent.getByText("Terkirim (dikonfirmasi kamu)").first()).toBeVisible();
    await expect(sent.getByTestId("action-view_application")).toBeVisible();
  });

  test("Batal di konfirmasi tidak memanggil backend", async ({ app, backend }) => {
    seedBinance(backend);
    await app.goto("/approvals");
    const card = cardOf(app, "Operations Analyst");

    await card.getByTestId("action-retry_fresh").click();
    await expect(card.getByTestId("outcome-confirm")).toBeVisible();
    await card.getByTestId("outcome-confirm-cancel").click();
    await expect(card.getByTestId("outcome-confirm")).toHaveCount(0);
    await expect(card.getByTestId("action-retry_fresh")).toBeVisible();
    expect(backend.apiCalls.filter((c) => c.method === "POST" && !c.path.endsWith("/claim-statuses"))).toEqual([]);
  });

  test("Belum terkirim, ulangi: POST not-sent sekali, persetujuan lama Diganti, persetujuan baru menunggu keputusan", async ({ app, backend }) => {
    seedBinance(backend);
    await app.goto("/approvals");
    const card = cardOf(app, "Operations Analyst");

    await card.getByTestId("action-retry_fresh").click();
    await card.getByTestId("outcome-confirm-yes").click();

    // Persetujuan baru ada di Menunggu dengan tombol Periksa; yang lama pindah ke Riwayat.
    await expect(app.getByRole("button", { name: /Periksa/ })).toHaveCount(1);
    expect(backend.callsTo("POST", "/api/approvals/apr-bin/not-sent")).toHaveLength(1);
    expect(backend.restWrites).toEqual([]);
    await app.getByRole("button", { name: /Riwayat/ }).click();
    await expect(cardOf(app, "Operations Analyst").getByText("Diganti persetujuan baru")).toBeVisible();
  });

  test("Tutup: tanpa konfirmasi tambahan, POST close sekali, kartu pindah ke Riwayat sebagai Ditutup dan bisa diajukan lagi", async ({ app, backend }) => {
    seedBinance(backend);
    await app.goto("/approvals");

    await cardOf(app, "Operations Analyst").getByTestId("action-close").click();
    await expect(app.getByRole("heading", { name: "Semua sudah diperiksa" })).toBeVisible();
    expect(backend.callsTo("POST", "/api/approvals/apr-bin/close")).toHaveLength(1);
    expect(backend.callsTo("POST", "/api/approvals/apr-bin/mark-sent")).toHaveLength(0);
    expect(backend.restWrites).toEqual([]);

    await app.getByRole("button", { name: /Riwayat/ }).click();
    const closed = cardOf(app, "Operations Analyst");
    await expect(closed.getByText("Ditutup", { exact: true }).first()).toBeVisible();
    await expect(closed.getByTestId("action-reapply")).toBeVisible();
  });

  test("galat dari backend (409 already_sent) ditampilkan jujur, kartu tidak diam", async ({ app, backend }) => {
    seedBinance(backend);
    backend.override("POST /api/approvals/apr-bin/mark-sent", { status: 409, body: { error: "Agent already confirmed sending", code: "already_sent" } });
    await app.goto("/approvals");
    const card = cardOf(app, "Operations Analyst");

    await card.getByTestId("action-confirm_sent").click();
    await card.getByTestId("outcome-confirm-yes").click();
    // Sudah dikonfirmasi agen di tempat lain: halaman memuat ulang datanya dan pengguna melihat hasil sebenarnya.
    await expect.poll(() => backend.callsTo("POST", "/api/approvals/apr-bin/mark-sent").length).toBe(1);
    await expect(app.getByRole("heading", { name: "Operations Analyst" })).toBeVisible();
  });

  test("kode tidak dimasukkan tepat waktu (code_timeout): tiga tindakan di samping Jalankan agen lagi", async ({ app, backend }) => {
    backend.state.history = [approvedApproval("apr-t", { job_title: "Kode Terlambat" })];
    backend.state.queue = [queueRow("queue-t", "apr-t", "completed")];
    backend.state.logs = [stoppedLog("queue-t", "apr-t", null, { reason: "code_timeout" })];
    await app.goto("/approvals");

    const card = cardOf(app, "Kode Terlambat");
    await expect(card.getByText("Perlu dicek: kode tidak dimasukkan")).toBeVisible();
    await expect(card.getByTestId("action-confirm_sent")).toBeVisible();
    await expect(card.getByTestId("action-retry_fresh")).toBeVisible();
    await expect(card.getByTestId("action-close")).toBeVisible();
    await expect(card.getByRole("button", { name: "Jalankan agen lagi" })).toBeVisible();
  });

  test("disetujui, masa berlaku habis, tanpa tugas agen: Riwayat dengan penjelasan dan tiga tindakan", async ({ app, backend }) => {
    backend.state.history = [approvedApproval("apr-old", { job_title: "Tanpa Tugas", platform: "web", expires_at: isoAgo(2 * HOUR) })];
    backend.state.jobs = [jobRow("job-apr-old", { platform_source: "web", external_url: "https://karier.example.test/old" })];
    await app.goto("/approvals");

    await expect(app.getByRole("heading", { name: "Semua sudah diperiksa" })).toBeVisible();
    await app.getByRole("button", { name: /Riwayat/ }).click();
    const card = cardOf(app, "Tanpa Tugas");
    await expect(card.getByText("Kedaluwarsa, belum terkirim")).toBeVisible();
    await expect(card.getByTestId("action-confirm_sent")).toBeVisible();
    await expect(card.getByTestId("action-retry_fresh")).toBeVisible();
    await expect(card.getByTestId("action-close")).toBeVisible();
    await expect(card.getByTestId("action-open_form")).toHaveAttribute("href", "https://karier.example.test/old");
    // Penjelasan kenapa kartu ini ada di Riwayat, jujur bahwa Applify tidak punya bukti terkirim.
    await expect(card.getByTestId("outcome-intro")).toContainText("tidak punya bukti");
  });

  test("Kedaluwarsa yang tidak pernah disetujui: penjelasan dan Ajukan lagi, tanpa tombol konfirmasi", async ({ app, backend }) => {
    backend.state.history = [approval("apr-x", { job_title: "Tidak Pernah Disetujui", status: "expired", expires_at: isoAgo(HOUR) })];
    await app.goto("/approvals");
    await app.getByRole("button", { name: /Riwayat/ }).click();

    const card = cardOf(app, "Tidak Pernah Disetujui");
    await expect(card.getByTestId("status-explanation")).toBeVisible();
    await expect(card.getByTestId("action-reapply")).toBeVisible();
    await expect(card.getByTestId("action-confirm_sent")).toHaveCount(0);
    await expect(card.getByTestId("action-close")).toHaveCount(0);
  });

  test("GoToGroup: email terkirim dan percobaan agen lama yang berhenti: Terkirim tanpa teks lama 'berhenti sebelum kirim' atau 'butuh jawabanmu'", async ({ app, backend }) => {
    backend.state.history = [approvedApproval("apr-g", { job_title: "Staf Operasional", company: "GoToGroup", expires_at: isoAgo(HOUR) })];
    backend.state.queue = [queueRow("queue-g", "apr-g", "completed", { created_at: isoAgo(2 * DAY) })];
    backend.state.logs = [
      questionsLog("queue-g", "apr-g", {}),
      {
        action: "email_apply",
        status: "success",
        job_id: "job-apr-g",
        created_at: isoAgo(30 * 60_000),
        details: { approval_request_id: "apr-g", to: "hrd@gotogroup.test" },
      },
    ];
    backend.state.logs[0].created_at = isoAgo(2 * DAY);
    await app.goto("/approvals");

    await app.getByRole("button", { name: /Riwayat/ }).click();
    const card = cardOf(app, "Staf Operasional");
    await expect(card.getByText("Terkirim", { exact: true })).toBeVisible();
    await expect(card.getByText(/Agen butuh jawabanmu/)).toHaveCount(0);
    await expect(card.getByText(/Agen berhenti sebelum kirim/)).toHaveCount(0);
    // Yang tampil hanya catatan bahwa percobaan lama tidak berlaku lagi.
    await expect(card.getByText(/tidak berlaku lagi/)).toBeVisible();
    await expect(card.getByTestId("action-view_application")).toBeVisible();
  });

  test("klaim ditutup dan diganti: Ditutup dan Diganti persetujuan baru masing-masing punya tindakan", async ({ app, backend }) => {
    backend.state.history = [
      approvedApproval("apr-c", { job_title: "Sudah Ditutup" }),
      approvedApproval("apr-r", { job_title: "Sudah Diganti" }),
    ];
    backend.state.claims = {
      "apr-c": { approvalId: "apr-c", state: "closed", channel: null },
      "apr-r": { approvalId: "apr-r", state: "abandoned", channel: null },
    };
    await app.goto("/approvals");
    await app.getByRole("button", { name: /Riwayat/ }).click();

    await expect(cardOf(app, "Sudah Ditutup").getByText("Ditutup", { exact: true }).first()).toBeVisible();
    await expect(cardOf(app, "Sudah Ditutup").getByTestId("action-reapply")).toBeVisible();
    await expect(cardOf(app, "Sudah Diganti").getByText("Diganti persetujuan baru")).toBeVisible();
    await expect(cardOf(app, "Sudah Diganti").getByTestId("action-view_new_approval")).toBeVisible();
  });
});

test.describe("Persetujuan: penjaga, setiap kartu punya sedikitnya satu tindakan", () => {
  test("semua status di kedua tab punya tombol atau tautan yang bisa dipakai", async ({ app, backend }) => {
    const live = (id: string, over: Record<string, unknown> = {}) => approvedApproval(id, { job_title: `Judul ${id}`, platform: "web", ...over });
    backend.state.pending = [approval("p-review", { job_title: "Judul p-review" })];
    backend.state.history = [
      live("g-wait"),
      live("g-run"),
      live("g-ask"),
      live("g-unv", { expires_at: isoAgo(2 * DAY) }),
      live("g-filled"),
      live("g-failed"),
      live("g-sent"),
      live("g-expired", { expires_at: isoAgo(2 * HOUR) }),
      live("g-closed"),
      live("g-replaced"),
      approval("g-rejected", { job_title: "Judul g-rejected", status: "rejected", reviewed_at: isoAgo(HOUR) }),
      approval("g-lapsed", { job_title: "Judul g-lapsed", status: "expired", expires_at: isoAgo(HOUR) }),
    ];
    backend.state.jobs = ["g-wait", "g-run", "g-ask", "g-unv", "g-filled", "g-failed", "g-sent", "g-expired", "g-closed", "g-replaced"].map((id) =>
      jobRow(`job-${id}`, { platform_source: "web", external_url: `https://karier.example.test/${id}` }),
    );
    backend.state.queue = [
      queueRow("q-run", "g-run", "processing"),
      queueRow("q-ask", "g-ask", "completed"),
      queueRow("q-unv", "g-unv", "completed"),
      queueRow("q-filled", "g-filled", "completed"),
      queueRow("q-failed", "g-failed", "failed", { error_message: "Timeout membuka formulir" }),
      queueRow("q-sent", "g-sent", "completed"),
    ];
    backend.state.logs = [
      questionsLog("q-ask", "g-ask"),
      applyLog("q-unv", "g-unv", "submit_unverified"),
      stoppedLog("q-filled", "g-filled", "not_allowed"),
      applyLog("q-sent", "g-sent", "success", { submit_clicked: true, confirmation_detected: true }),
    ];
    backend.state.claims = {
      "g-closed": { approvalId: "g-closed", state: "closed", channel: null },
      "g-replaced": { approvalId: "g-replaced", state: "abandoned", channel: null },
    };
    await app.goto("/approvals");

    const usable = async (title: string) => {
      const card = cardOf(app, title);
      await expect(card, `kartu ${title} tampil`).toBeVisible();
      const controls = card.locator("button:not([disabled]), a[href]");
      expect(await controls.count(), `kartu ${title} punya tombol atau tautan`).toBeGreaterThan(0);
    };

    for (const id of ["p-review", "g-wait", "g-run", "g-ask", "g-unv", "g-filled", "g-failed"]) await usable(`Judul ${id}`);

    await app.getByRole("button", { name: /Riwayat/ }).click();
    for (const id of ["g-sent", "g-expired", "g-closed", "g-replaced", "g-rejected", "g-lapsed"]) await usable(`Judul ${id}`);
  });
});

test.describe("Lamaran Saya: status dan teks yang tidak menyesatkan", () => {
  const APP_ID = "app-ideku";
  const JOB_ID = "job-ideku";
  const APPROVAL_ID = "apr-ideku";

  function seedApplication(backend: MockBackend, approvalOver: Record<string, unknown> = {}) {
    backend.state.applications = [
      applicationRow(APP_ID, JOB_ID, { jobs: jobRow(JOB_ID, { title: "Staf IDEKU", company: "IDEKU", external_url: "https://jobs.example.test/ideku" }) }),
    ];
    backend.state.approvalDetail[APPROVAL_ID] = approval(APPROVAL_ID, { cover_letter: "Surat untuk IDEKU." });
    backend.state.history = [approvedApproval(APPROVAL_ID, { job_id: JOB_ID, application_id: APP_ID, ...approvalOver })];
  }

  async function openDetail(app: Page) {
    await app.goto("/applications");
    await app.getByRole("button", { name: "Lihat detail", exact: true }).first().click();
    const dialog = app.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Staf IDEKU" })).toBeVisible();
    return dialog;
  }

  test("IDEKU: persetujuan kedaluwarsa tidak menautkan ke Persetujuan dan tidak menawarkan jawaban atau kode", async ({ app, backend }) => {
    seedApplication(backend, { expires_at: isoAgo(2 * DAY) });
    backend.state.logs = [{ ...questionsLog("queue-1", APPROVAL_ID), job_id: JOB_ID }];
    const dialog = await openDetail(app);

    await expect(dialog.getByTestId("agent-stale-approval")).toBeVisible();
    await expect(dialog.getByTestId("agent-questions-link")).toHaveCount(0);
    await expect(dialog.getByRole("link", { name: "Buka Persetujuan" })).toHaveCount(0);
    await expect(dialog.getByText(/Agen butuh jawabanmu/)).toHaveCount(0);
  });

  test("IDEKU: persetujuan yang masih berlaku tetap menautkan pertanyaan ke Persetujuan", async ({ app, backend }) => {
    seedApplication(backend);
    backend.state.logs = [{ ...questionsLog("queue-1", APPROVAL_ID), job_id: JOB_ID }];
    const dialog = await openDetail(app);

    await expect(dialog.getByTestId("agent-stale-approval")).toHaveCount(0);
    await expect(dialog.getByTestId("agent-questions-link").getByRole("link", { name: "Persetujuan" })).toHaveAttribute("href", "/approvals");
  });

  test("agen berhenti sebelum kirim: tanpa teks lama 'selama uji coba, pengiriman dimatikan'", async ({ app, backend }) => {
    seedApplication(backend);
    backend.state.logs = [{ ...stoppedLog("queue-1", APPROVAL_ID, null), job_id: JOB_ID }];
    const dialog = await openDetail(app);

    await expect(dialog.getByText(/selama uji coba/i)).toHaveCount(0);
    await expect(dialog.getByText(/pengiriman dimatikan/i)).toHaveCount(0);
  });

  test("kirim belum terkonfirmasi: jendela detail menawarkan tiga tindakan dan tautan formulir", async ({ app, backend }) => {
    seedApplication(backend);
    backend.state.logs = [{ ...applyLog("queue-1", APPROVAL_ID, "submit_unverified"), job_id: JOB_ID }];
    const dialog = await openDetail(app);

    const actions = dialog.getByTestId("status-actions");
    await expect(actions.getByTestId("action-confirm_sent")).toBeVisible();
    await expect(actions.getByTestId("action-retry_fresh")).toBeVisible();
    await expect(actions.getByTestId("action-close")).toBeVisible();
    await expect(actions.getByTestId("action-open_form")).toHaveAttribute("href", "https://jobs.example.test/ideku");
  });

  test("Datadog: lamaran Ditutup tidak memakai bukti pengiriman milik lamaran lain untuk lowongan yang sama", async ({ app, backend }) => {
    const job = jobRow("job-dd", { title: "Data Engineer", company: "Datadog" });
    backend.state.applications = [
      applicationRow("app-dd-old", "job-dd", { status: "closed", created_at: isoAgo(6 * DAY), updated_at: isoAgo(5 * DAY), jobs: job }),
      applicationRow("app-dd-new", "job-dd", { status: "submitted", submitted_at: isoAgo(HOUR), created_at: isoAgo(2 * DAY), updated_at: isoAgo(HOUR), jobs: job }),
    ];
    backend.state.logs = [{ ...applyLog("queue-dd", "apr-dd", "success", { submit_clicked: true, confirmation_detected: true }, { created_at: isoAgo(HOUR) }), job_id: "job-dd" }];
    await app.goto("/applications");

    const closedColumn = app.getByRole("group", { name: /Kolom Ditutup/ });
    await closedColumn.getByRole("button", { name: "Lihat detail", exact: true }).first().click();
    const dialog = app.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Data Engineer" })).toBeVisible();
    await expect(dialog.getByTestId("agent-proof")).toHaveCount(0);
    await expect(dialog.getByText("Bukti pengiriman")).toHaveCount(0);
  });
});

// ---- pengalihan ke ekstensi (temuan E2E production 27 November 2026) ----------------------------------------------------

const FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSeDemo/viewform";

/**
 * Google Form "Uji Applify (Peneliti)": worker mengisi formulir lalu berhenti karena pertanyaan wajib "Posisi yang
 * dilamar" tanpa jawaban (details.reason google_forms_missing_required) dan mengalihkan ke Ekstensi Browser.
 * `extensionJob` = status tugas extension_apply yang diantrekan sesudahnya (null: pengalihan belum diantre).
 */
function seedGoogleFormHandoff(backend: MockBackend, extensionJob: string | null, id = "apr-gf") {
  backend.state.history = [approvedApproval(id, { job_title: "Uji Applify (Peneliti)", company: "Applify", platform: "web" })];
  backend.state.jobs = [jobRow(`job-${id}`, { platform_source: "web", external_url: FORM_URL })];
  backend.state.queue = [queueRow("q-apply", id, "completed", { created_at: isoAgo(10 * 60_000) })];
  if (extensionJob) backend.state.queue.unshift(queueRow("q-ext", id, extensionJob, { job_type: "extension_apply", created_at: isoAgo(9 * 60_000) }));
  backend.state.logs = [
    applyLog("q-apply", id, "incomplete", {
      reason: "google_forms_missing_required",
      extension_handoff: true,
      handoff_reason: "missing_required",
      remaining_required: ["Posisi yang dilamar"],
      questions: [{ key: "posisi yang dilamar", label: "Posisi yang dilamar", kind: "text" }],
      questions_pending: 1,
      fields_filled: 3,
      note: "formulir Google Form memiliki pertanyaan wajib yang belum punya jawaban; agen berhenti dan mengalihkan ke Ekstensi Browser",
    }),
  ];
}

test.describe("Persetujuan: Google Form yang dialihkan ke Ekstensi Browser", () => {
  test("tugas ekstensi antre: tetap Menunggu Ekstensi Browser, menyebut pertanyaan yang kosong, dan tidak berganti ke Agen belum dijalankan", async ({ app, backend }) => {
    seedGoogleFormHandoff(backend, "pending");
    await app.goto("/approvals");

    const card = cardOf(app, "Uji Applify (Peneliti)");
    await expect(card.getByText("Menunggu Ekstensi Browser")).toBeVisible();
    const list = card.getByTestId("handoff-questions");
    await expect(list).toContainText("formulir punya pertanyaan wajib yang belum terjawab");
    await expect(list.getByRole("listitem")).toHaveText(["Posisi yang dilamar"]);
    await expect(card.getByText("Agen belum dijalankan")).toHaveCount(0);
    await expect(card.getByTestId("action-open_form")).toHaveAttribute("href", FORM_URL);
    // Teks lama yang menyalahkan daftar situs tidak tampil: alasannya pertanyaan wajib, bukan host.
    await expect(app.getByText(/daftar situs yang boleh dikirim otomatis/)).toHaveCount(0);
  });

  test("Muat ulang status yang gagal membaca antrean tidak mengganti kartu ke Agen belum dijalankan", async ({ app, backend }) => {
    seedGoogleFormHandoff(backend, "pending");
    await app.goto("/approvals");
    const card = cardOf(app, "Uji Applify (Peneliti)");
    await expect(card.getByText("Menunggu Ekstensi Browser")).toBeVisible();

    // Kueri antrean gagal (misalnya batas waktu database): baris agen yang sudah terbaca dipertahankan.
    backend.override("GET /rest/v1/automation_queue", { status: 500, body: { message: "canceling statement due to statement timeout" } });
    for (let i = 1; i <= 2; i++) {
      const failedRead = app.waitForResponse((r) => r.url().includes("/rest/v1/automation_queue") && r.status() === 500);
      await card.getByTestId("action-refresh").click();
      await failedRead;
      await expect(card.getByText("Menunggu Ekstensi Browser")).toBeVisible();
      await expect(card.getByTestId("handoff-questions")).toBeVisible();
      await expect(app.getByText("Agen belum dijalankan")).toHaveCount(0);
    }
  });

  test("pemuatan pertama gagal membaca antrean: kartu berkata status belum terbaca, bukan Agen belum dijalankan", async ({ app, backend }) => {
    seedGoogleFormHandoff(backend, "pending");
    backend.override("GET /rest/v1/automation_queue", { status: 500, body: { message: "statement timeout" } });
    await app.goto("/approvals");

    const card = cardOf(app, "Uji Applify (Peneliti)");
    await expect(card.getByText("Status agen belum terbaca")).toBeVisible();
    await expect(card.getByText("Agen belum dijalankan")).toHaveCount(0);
    await expect(card.getByTestId("action-refresh")).toBeVisible();
  });

  test("pengalihan belum diantre: alasan dan pertanyaan tampil, dengan Buka formulir, Sudah terkirim, dan Tutup tanpa blok izin", async ({ app, backend }) => {
    seedGoogleFormHandoff(backend, null);
    await app.goto("/approvals");

    const card = cardOf(app, "Uji Applify (Peneliti)");
    await expect(card.getByText("Formulir punya pertanyaan wajib yang belum terjawab", { exact: true })).toBeVisible();
    await expect(card.getByText(/pertanyaan wajib yang belum terjawab: Posisi yang dilamar\./)).toBeVisible();
    await expect(card.getByText("Posisi yang dilamar").first()).toBeVisible();
    await expect(card.getByText(/belum ada di daftar situs/)).toHaveCount(0);
    await expect(card.getByTestId("extension-consent")).toHaveCount(0);
    await expect(card.getByTestId("action-open_form")).toHaveAttribute("href", FORM_URL);
    await expect(card.getByTestId("action-confirm_sent")).toHaveText(/Sudah terkirim/);
    await expect(card.getByTestId("action-close")).toHaveText(/Tutup/);

    // Tutup memindahkan kartu ke Riwayat lewat backend.
    await card.getByTestId("action-close").click();
    await expect.poll(() => backend.callsTo("POST", "/api/approvals/apr-gf/close").length).toBe(1);
    expect(backend.restWrites).toEqual([]);
  });
});
