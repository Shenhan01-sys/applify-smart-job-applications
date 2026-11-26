import { expect, test } from "./helpers/test";
import { TEST_USER_ID } from "./helpers/constants";
import { applyLog, approval, awaitingCodeLog, queueRow } from "./helpers/fixtures";

/**
 * Banner "Tindakan mendesak" di Beranda (src/routes/dashboard.tsx, E2E-06). Kode aplikasi asli; backend dan Supabase
 * palsu (tests/e2e/helpers). Yang dijaga: banner muncul dari tiga sumber, hanya membaca (tidak ada tulis ke tabel
 * yang dikunci RLS), memakai filter user_id, tidak polling, dan tidak membuat Beranda menunggu backend.
 */

test.describe("Beranda: banner Tindakan mendesak", () => {
  test("persetujuan pending, kode keamanan, dan pertanyaan agen dihitung dan mengarah ke Persetujuan", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-1"), approval("apr-2")];
    backend.state.queue = [
      queueRow("queue-otp", "apr-otp", "processing"),
      queueRow("queue-ask", "apr-ask", "completed"),
    ];
    backend.state.logs = [
      awaitingCodeLog("queue-otp", "apr-otp"),
      applyLog("queue-ask", "apr-ask", "ready", {
        questions: [{ key: "gaji", label: "Ekspektasi gaji?", type: "text", required: true }],
      }),
    ];

    await app.goto("/dashboard");
    const banner = app.getByTestId("dashboard-urgent-actions");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("2 draf lamaran menunggu persetujuanmu");
    await expect(banner).toContainText("1 lamaran menunggu kode keamanan");
    await expect(banner.getByRole("link", { name: /Tinjau di Persetujuan/ })).toHaveAttribute("href", "/approvals");

    // Hanya membaca: tidak ada tulis ke PostgREST, dan kueri antrean dan log memakai filter user_id pengguna ini.
    expect(backend.restWrites).toEqual([]);
    const reads = backend.restReads.filter((r) => r.path.endsWith("/automation_queue") || r.path.endsWith("/application_logs"));
    // Mode dev memakai StrictMode (efek dijalankan dua kali), jadi yang dicek tabelnya, bukan jumlah bacaannya.
    expect([...new Set(reads.map((r) => r.path.split("/").pop()))].sort()).toEqual(["application_logs", "automation_queue"]);
    for (const read of reads) expect(read.search).toContain(`user_id=eq.${TEST_USER_ID}`);
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
    await expect(app.getByTestId("dashboard-urgent-actions")).toContainText("1 draf lamaran menunggu persetujuanmu");
  });

  test("backend persetujuan gagal: Beranda tetap tampil dan banner tidak muncul", async ({ app, backend }) => {
    backend.override("GET /api/approvals/pending", { status: 500, body: { error: "boom" } });
    await app.goto("/dashboard");
    await expect(app.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(app.getByTestId("dashboard-urgent-actions")).toHaveCount(0);
    await expect(app.getByText("Data belum bisa dimuat")).toHaveCount(0);
  });
});
