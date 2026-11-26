import { expect, test } from "./helpers/test";
import { applyLog, approval, approvedApproval, awaitingCodeLog, isoAgo, jobRow, queueRow } from "./helpers/fixtures";

/**
 * Banner "Tindakan mendesak" di Beranda (src/routes/dashboard.tsx, E2E-06). Kode aplikasi asli; backend dan Supabase
 * palsu (tests/e2e/helpers). Yang dijaga: banner muncul dari empat sumber (draf, kode, pertanyaan, kirim belum
 * terkonfirmasi) dan angkanya sama dengan kartu di tab Menunggu halaman Persetujuan, hanya membaca (tidak ada tulis ke
 * tabel yang dikunci RLS), tidak polling, dan tidak membuat Beranda menunggu backend.
 */

const DAY = 24 * 3600_000;

test.describe("Beranda: banner Tindakan mendesak", () => {
  test("persetujuan pending, kode keamanan, dan pertanyaan agen dihitung dan mengarah ke Persetujuan", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-1"), approval("apr-2")];
    // Kode dan pertanyaan agen hanya dihitung untuk persetujuan yang masih berlaku (disetujui dan belum kedaluwarsa).
    backend.state.history = [approvedApproval("apr-otp"), approvedApproval("apr-ask")];
    backend.state.queue = [
      queueRow("queue-otp", "apr-otp", "processing"),
      queueRow("queue-ask", "apr-ask", "completed"),
    ];
    backend.state.logs = [
      awaitingCodeLog("queue-otp", "apr-otp"),
      applyLog("queue-ask", "apr-ask", "ready", {
        questions: [{ key: "gaji", label: "Ekspektasi gaji?", kind: "text", required: true }],
      }),
    ];

    await app.goto("/dashboard");
    const banner = app.getByTestId("dashboard-urgent-actions");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("2 draf menunggu persetujuanmu");
    await expect(banner).toContainText("1 lamaran menunggu kode keamanan");
    await expect(banner).toContainText("1 lamaran menunggu jawaban pertanyaan formulir");
    await expect(banner.getByRole("link", { name: /Tinjau di Persetujuan/ })).toHaveAttribute("href", "/approvals");

    // Hanya membaca: tidak ada tulis ke PostgREST. Data kartu dibaca oleh pemuat yang sama dengan halaman Persetujuan.
    expect(backend.restWrites).toEqual([]);
    const tables = new Set(backend.restReads.map((r) => r.path.split("/").pop()));
    expect(tables.has("automation_queue")).toBe(true);
    expect(tables.has("application_logs")).toBe(true);
  });

  test("kartu Binance 'perlu dicek: kirim belum terkonfirmasi' (kedaluwarsa, tetap di Menunggu) disebut banner dan angkanya sama dengan tab Menunggu", async ({ app, backend }) => {
    // Temuan production 26 November 2026, 23.20 WIB: Menunggu berisi 2 kartu (draf Uji Applify dan Binance), banner hanya
    // menyebut 1 draf. Kartu Binance masa berlakunya lewat tetapi sengaja tetap di Menunggu dengan tiga tindakan.
    backend.state.pending = [approval("apr-uji", { job_title: "Uji Applify (Peneliti)" })];
    backend.state.history = [
      approvedApproval("apr-bin", { job_title: "Operations Analyst", company: "Binance", created_at: isoAgo(3 * DAY), reviewed_at: isoAgo(3 * DAY), expires_at: isoAgo(2 * DAY) }),
    ];
    backend.state.jobs = [jobRow("job-apr-bin", { external_url: "https://jobs.example.test/binance" })];
    backend.state.queue = [queueRow("queue-bin", "apr-bin", "completed", { created_at: isoAgo(3 * DAY) })];
    backend.state.logs = [applyLog("queue-bin", "apr-bin", "submit_unverified", {}, { created_at: isoAgo(3 * DAY) })];

    await app.goto("/dashboard");
    const banner = app.getByTestId("dashboard-urgent-actions");
    await expect(banner).toContainText("Ada 2 tindakan");
    await expect(banner).toContainText("1 draf menunggu persetujuanmu");
    await expect(banner).toContainText("1 lamaran perlu dicek: kirim belum terkonfirmasi");
    expect(backend.restWrites).toEqual([]);

    // Tautan banner membawa ke tab Menunggu yang berisi tepat 2 kartu itu.
    await banner.getByRole("link", { name: /Tinjau di Persetujuan/ }).click();
    await expect(app.getByRole("button", { name: /Menunggu/ })).toContainText("2");
    await expect(app.getByRole("heading", { name: "Uji Applify (Peneliti)" })).toBeVisible();
    await expect(app.getByRole("heading", { name: "Operations Analyst" })).toBeVisible();
    await expect(app.getByText("Perlu dicek, kirim belum terkonfirmasi")).toBeVisible();
  });

  test("kartu 'perlu dicek' yang sudah ditutup atau terkirim tidak dihitung banner, dan draf pending kedaluwarsa juga tidak", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-lazy", { expires_at: isoAgo(2 * 3600_000) })];
    backend.state.history = [
      approvedApproval("apr-closed", { expires_at: isoAgo(2 * DAY) }),
      approvedApproval("apr-sent", { expires_at: isoAgo(2 * DAY) }),
    ];
    backend.state.queue = [queueRow("queue-closed", "apr-closed", "completed"), queueRow("queue-sent", "apr-sent", "completed")];
    backend.state.logs = [
      applyLog("queue-closed", "apr-closed", "submit_unverified"),
      applyLog("queue-sent", "apr-sent", "submit_unverified"),
      { action: "apply", status: "success", job_id: "job-apr-sent", created_at: isoAgo(1 * 60_000), details: { approval_request_id: "apr-sent", manual: true, confirmed_by: "user" } },
    ];
    backend.state.claims = { "apr-closed": { approvalId: "apr-closed", state: "closed", channel: null } };

    await app.goto("/dashboard");
    await expect(app.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(app.getByTestId("dashboard-urgent-actions")).toHaveCount(0);
  });

  test("pertanyaan dan kode dari persetujuan kedaluwarsa tidak dihitung: banner tidak menautkan ke kartu yang tidak ada di Menunggu", async ({ app, backend }) => {
    // Temuan Gemini 26 November 2026: banner menghitung pertanyaan agen, tetapi /approvals tidak menampilkannya karena
    // persetujuannya sudah kedaluwarsa dan kartunya ada di Riwayat. Hanya persetujuan yang masih berlaku yang dihitung.
    backend.state.history = [approvedApproval("apr-old-otp", { expires_at: isoAgo(2 * 3600_000) }), approvedApproval("apr-old-ask", { expires_at: isoAgo(2 * 3600_000) })];
    // Percobaan sudah selesai (sisa log awaiting_code dari percobaan lama): tidak ada agen yang menunggu, kartunya ada di Riwayat.
    backend.state.queue = [queueRow("queue-otp", "apr-old-otp", "completed"), queueRow("queue-ask", "apr-old-ask", "completed")];
    backend.state.logs = [
      awaitingCodeLog("queue-otp", "apr-old-otp"),
      applyLog("queue-ask", "apr-old-ask", "ready", {
        questions: [{ key: "gaji", label: "Ekspektasi gaji?", kind: "text", required: true }],
      }),
    ];

    await app.goto("/dashboard");
    await expect(app.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(app.getByTestId("dashboard-urgent-actions")).toHaveCount(0);
  });

  test("agen masih menunggu kode walau masa berlaku habis: kartunya tetap di Menunggu, jadi banner menghitungnya", async ({ app, backend }) => {
    // Tugas yang masih berjalan tidak ikut ditutup saat masa berlakunya habis (approvalTabs.placeApproval), jadi halaman
    // Persetujuan menampilkan kolom kodenya. Banner memakai penempatan yang sama dan harus menyebutnya.
    backend.state.history = [approvedApproval("apr-otp", { job_title: "Data Analyst", expires_at: isoAgo(5 * 60_000) })];
    backend.state.queue = [queueRow("queue-otp", "apr-otp", "processing")];
    backend.state.logs = [awaitingCodeLog("queue-otp", "apr-otp")];

    await app.goto("/dashboard");
    await expect(app.getByTestId("dashboard-urgent-actions")).toContainText("1 lamaran menunggu kode keamanan");
    await app.getByTestId("dashboard-urgent-actions").getByRole("link", { name: /Tinjau di Persetujuan/ }).click();
    await expect(app.getByRole("button", { name: /Menunggu/ })).toContainText("1");
    await expect(app.getByRole("heading", { name: "Data Analyst" })).toBeVisible();
  });

  test("tanpa tindakan mendesak banner tidak muncul", async ({ app, backend }) => {
    await app.goto("/dashboard");
    await expect(app.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(app.getByTestId("dashboard-urgent-actions")).toHaveCount(0);
  });

  test("tidak polling: waktu tunggu tidak menambah panggilan persetujuan atau antrean", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-1")];
    await app.goto("/dashboard");
    await expect(app.getByTestId("dashboard-urgent-actions")).toBeVisible();
    const count = () =>
      backend.apiCalls.filter((c) => c.path === "/api/approvals/pending").length +
      backend.restReads.filter((r) => r.path.endsWith("/automation_queue")).length;
    const before = count();
    await app.waitForTimeout(3000);
    expect(count()).toBe(before);
  });

  test("backend persetujuan lambat: Beranda tampil lebih dulu, banner menyusul sesudah backend menjawab", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-1")];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Rute yang dipasang belakangan dicoba lebih dulu; fallback() meneruskan ke tiruan backend setelah gerbang dibuka.
    await app.route("**/mock-api/api/approvals/pending", async (route) => {
      await gate;
      await route.fallback();
    });
    await app.goto("/dashboard");
    await expect(app.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(app.getByTestId("dashboard-urgent-actions")).toHaveCount(0);
    release();
    await expect(app.getByTestId("dashboard-urgent-actions")).toContainText("1 draf menunggu persetujuanmu");
  });

  test("backend persetujuan gagal: Beranda tetap tampil dan banner tidak muncul", async ({ app, backend }) => {
    backend.override("GET /api/approvals/pending", { status: 500, body: { error: "boom" } });
    await app.goto("/dashboard");
    await expect(app.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(app.getByTestId("dashboard-urgent-actions")).toHaveCount(0);
    await expect(app.getByText("Data belum bisa dimuat")).toHaveCount(0);
  });
});
