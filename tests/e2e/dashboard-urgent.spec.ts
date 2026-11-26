import { expect, test } from "./helpers/test";
import type { MockBackend } from "./helpers/mockBackend";
import { applicationRow, applyLog, approval, approvedApproval, awaitingCodeLog, isoAgo, jobRow, queueRow, questionsLog, stoppedLog } from "./helpers/fixtures";

/**
 * Banner "Tindakan mendesak" di Beranda (src/routes/dashboard.tsx, E2E-06). Kode aplikasi asli; backend dan Supabase
 * palsu (tests/e2e/helpers). Yang dijaga: banner menghitung setiap kartu tab Menunggu yang butuh tindakan pengguna
 * (draf, kode, pertanyaan, kode gagal, kirim belum terkonfirmasi, perlu diisi sendiri, panel Email, terisi belum
 * terkirim, gagal bisa dicoba lagi, mode uji, dan berhenti karena login atau CAPTCHA), angkanya sama dengan kartu di tab
 * Menunggu halaman Persetujuan, kartu yang sedang diproses atau menunggu giliran tidak dihitung, hanya membaca (tidak
 * ada tulis ke tabel yang dikunci RLS), tidak polling, dan tidak membuat Beranda menunggu backend.
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

// ---- setiap tahap Menunggu yang butuh tindakan ikut dihitung (keputusan Hans, 27 November 2026) -----------------------

const LINKEDIN_URL = "https://www.linkedin.com/jobs/view/999";
const MAIL_JOB = { platform_source: "jooble", external_url: "https://jooble.example.test/em", description: "Kirim CV ke hr@perusahaan-contoh.co.id" };

interface UrgentStage {
  name: string;
  /** Teks baris banner, dan data-testid barisnya. null = kartu Menunggu yang tidak dihitung. */
  line: { field: string; text: string } | null;
  /** Label kartu di tab Menunggu. */
  cardLabel: string | RegExp;
  seed: (backend: MockBackend, id: string) => void;
}

const live = (id: string, over: Record<string, unknown> = {}) => approvedApproval(id, { job_title: `Judul ${id}`, platform: "web", ...over });
const webJob = (id: string, over: Record<string, unknown> = {}) => jobRow(`job-${id}`, { platform_source: "web", external_url: `https://karier.example.test/${id}`, ...over });

const URGENT_STAGES: UrgentStage[] = [
  {
    name: "draf menunggu persetujuan",
    line: { field: "pendingApprovalsCount", text: "1 draf menunggu persetujuanmu." },
    cardLabel: "Menunggu persetujuan",
    seed: (b, id) => {
      b.state.pending.push(approval(id, { job_title: `Judul ${id}` }));
    },
  },
  {
    name: "perlu diisi sendiri (LinkedIn)",
    line: { field: "fillYourselfCount", text: "1 lamaran perlu diisi sendiri." },
    cardLabel: "Perlu diisi sendiri",
    seed: (b, id) => {
      b.state.history.push(live(id, { platform: "linkedin" }));
      b.state.jobs.push(webJob(id, { platform_source: "linkedin", external_url: LINKEDIN_URL }));
    },
  },
  {
    name: "kirim lewat panel Email",
    line: { field: "sendByEmailCount", text: "1 lamaran perlu dikirim lewat panel Email." },
    cardLabel: "Kirim lewat panel Email",
    seed: (b, id) => {
      b.state.history.push(live(id, { platform: "jooble" }));
      b.state.jobs.push(webJob(id, MAIL_JOB));
    },
  },
  {
    name: "kode tidak dimasukkan (code_timeout)",
    line: { field: "codeFailedCount", text: "1 lamaran perlu dicek: kode keamanan tidak dimasukkan atau ditolak." },
    cardLabel: "Perlu dicek: kode tidak dimasukkan",
    seed: (b, id) => {
      b.state.history.push(live(id));
      b.state.queue.push(queueRow(`q-${id}`, id, "completed"));
      b.state.logs.push(stoppedLog(`q-${id}`, id, null, { reason: "code_timeout" }));
    },
  },
  {
    name: "kode ditolak (code_rejected)",
    line: { field: "codeFailedCount", text: "1 lamaran perlu dicek: kode keamanan tidak dimasukkan atau ditolak." },
    cardLabel: /Perlu dicek: kode/,
    seed: (b, id) => {
      b.state.history.push(live(id));
      b.state.queue.push(queueRow(`q-${id}`, id, "completed"));
      b.state.logs.push(stoppedLog(`q-${id}`, id, null, { reason: "code_rejected" }));
    },
  },
  {
    name: "CAPTCHA menahan agen",
    line: { field: "otherActionCount", text: "1 lamaran berhenti dan perlu tindakanmu (login, CAPTCHA, atau isian wajib)." },
    cardLabel: /CAPTCHA/,
    seed: (b, id) => {
      b.state.history.push(live(id));
      b.state.queue.push(queueRow(`q-${id}`, id, "completed"));
      b.state.logs.push(applyLog(`q-${id}`, id, "incomplete", { reason: "captcha_blocked" }));
    },
  },
  {
    name: "kirim belum terkonfirmasi",
    line: { field: "unverifiedCount", text: "1 lamaran perlu dicek: kirim belum terkonfirmasi." },
    cardLabel: "Perlu dicek, kirim belum terkonfirmasi",
    seed: (b, id) => {
      b.state.history.push(live(id, { expires_at: isoAgo(2 * DAY) }));
      b.state.queue.push(queueRow(`q-${id}`, id, "completed", { created_at: isoAgo(3 * DAY) }));
      b.state.logs.push(applyLog(`q-${id}`, id, "submit_unverified", {}, { created_at: isoAgo(3 * DAY) }));
    },
  },
  {
    name: "terisi, belum terkirim",
    line: { field: "filledNotSentCount", text: "1 lamaran terisi, belum terkirim." },
    cardLabel: /Terisi|Formulir terisi|Formulir diisi/,
    seed: (b, id) => {
      b.state.history.push(live(id));
      b.state.queue.push(queueRow(`q-${id}`, id, "completed"));
      b.state.logs.push(stoppedLog(`q-${id}`, id, "not_allowed"));
    },
  },
  {
    name: "belum terkirim, bisa dicoba lagi",
    line: { field: "failedRetryCount", text: "1 lamaran belum terkirim, bisa dicoba lagi." },
    cardLabel: /Belum terkirim, bisa dicoba lagi/,
    seed: (b, id) => {
      b.state.history.push(live(id));
      b.state.queue.push(queueRow(`q-${id}`, id, "failed", { error_message: "Timeout membuka formulir" }));
    },
  },
  {
    name: "email tidak dikirim karena mode uji",
    line: { field: "testModeCount", text: "1 lamaran belum dikirim (mode uji)." },
    cardLabel: "Belum dikirim (mode uji)",
    seed: (b, id) => {
      b.state.history.push(live(id));
      b.state.queue.push({ ...queueRow(`q-${id}`, id, "completed"), job_type: "email_apply" });
      b.state.logs.push({
        action: "email_apply",
        status: "skipped",
        job_id: `job-${id}`,
        created_at: isoAgo(60_000),
        details: { to: "hrd@perusahaan.test", approval_request_id: id, reason: "real_submit_off", note: "email tidak dikirim" },
      });
    },
  },
  // Kartu Menunggu yang tidak dihitung: agen bekerja atau belum ada yang bisa dilakukan pengguna.
  {
    name: "sedang diproses",
    line: null,
    cardLabel: "Sedang diproses",
    seed: (b, id) => {
      b.state.history.push(live(id));
      b.state.queue.push(queueRow(`q-${id}`, id, "processing"));
    },
  },
  {
    name: "menunggu giliran",
    line: null,
    cardLabel: "Menunggu giliran",
    seed: (b, id) => {
      b.state.history.push(live(id));
      b.state.jobs.push(webJob(id));
    },
  },
];

test.describe("Beranda: banner menghitung setiap tahap Menunggu yang butuh tindakan", () => {
  for (const stage of URGENT_STAGES) {
    test(`${stage.name}: ${stage.line ? "satu baris banner, angkanya sama dengan satu kartu di Menunggu" : "kartu ada di Menunggu tetapi tidak dihitung banner"}`, async ({ app, backend }) => {
      const id = "apr-stage";
      stage.seed(backend, id);
      await app.goto("/dashboard");

      const banner = app.getByTestId("dashboard-urgent-actions");
      if (stage.line) {
        await expect(banner).toContainText("Ada 1 tindakan");
        await expect(banner.getByTestId(`urgent-${stage.line.field}`)).toHaveText(stage.line.text);
        await expect(banner.getByRole("listitem")).toHaveCount(1);
        await expect(banner.getByRole("link", { name: /Tinjau di Persetujuan/ })).toHaveAttribute("href", "/approvals");
        await banner.getByRole("link", { name: /Tinjau di Persetujuan/ }).click();
      } else {
        // Tunggu Beranda selesai memuat banner: bila kartunya dihitung, banner akan muncul sebelum pemeriksaan ini lewat.
        await expect(app.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await app.waitForLoadState("networkidle");
        await expect(banner).toHaveCount(0);
        await app.goto("/approvals");
      }

      // Kartunya ada di Menunggu, dengan label yang sama dengan yang dituju banner.
      await expect(app.getByRole("button", { name: /Menunggu/ })).toContainText("1");
      await expect(app.getByRole("heading", { name: `Judul ${id}` })).toBeVisible();
      await expect(app.getByText(stage.cardLabel).first()).toBeVisible();
      expect(backend.restWrites).toEqual([]);
    });
  }

  test("semua tahap sekaligus: total banner = kartu Menunggu dikurangi kartu yang sedang diproses atau menunggu giliran", async ({ app, backend }) => {
    URGENT_STAGES.forEach((stage, i) => stage.seed(backend, `apr-${i}`));
    // Kartu "pertanyaan formulir" dan "kode keamanan" dari agen yang sedang menunggu pengguna.
    backend.state.history.push(live("apr-ask"), live("apr-otp"));
    backend.state.queue.push(queueRow("q-ask", "apr-ask", "completed"), queueRow("q-otp", "apr-otp", "processing"));
    backend.state.logs.push(questionsLog("q-ask", "apr-ask"), awaitingCodeLog("q-otp", "apr-otp"));

    const notCounted = URGENT_STAGES.filter((s) => s.line === null).length;
    const counted = URGENT_STAGES.length - notCounted + 2;
    await app.goto("/dashboard");

    const banner = app.getByTestId("dashboard-urgent-actions");
    await expect(banner).toContainText(`Ada ${counted} tindakan`);
    // Dua baris untuk kode dan pertanyaan, dan satu baris per kelompok lain (kode gagal dan lainnya terisi dua kartu).
    await expect(banner.getByTestId("urgent-awaitingCodeCount")).toHaveText("1 lamaran menunggu kode keamanan dari emailmu.");
    await expect(banner.getByTestId("urgent-pendingQuestionsCount")).toHaveText("1 lamaran menunggu jawaban pertanyaan formulir untuk agen.");
    await expect(banner.getByTestId("urgent-codeFailedCount")).toHaveText("2 lamaran perlu dicek: kode keamanan tidak dimasukkan atau ditolak.");
    await expect(banner.getByRole("listitem")).toHaveCount(11);

    await banner.getByRole("link", { name: /Tinjau di Persetujuan/ }).click();
    await expect(app.getByRole("button", { name: /Menunggu/ })).toContainText(String(counted + notCounted));
    await expect(app.getByText("Sedang diproses").first()).toBeVisible();
    await expect(app.getByText("Menunggu giliran").first()).toBeVisible();
    expect(backend.restWrites).toEqual([]);
  });
});

test.describe("Beranda: chip Siap dikirim", () => {
  test("menghitung lamaran di kolom Siap dikirim, bukan persetujuan Menunggu, dan labelnya menyebut kolom itu", async ({ app, backend }) => {
    // Temuan E2E production 27 November 2026: chip menunjukkan 3 sementara tab Menunggu berisi 1 kartu.
    backend.state.applications = ["a1", "a2", "a3"].map((id) => applicationRow(id, `job-${id}`, { status: "ready" }));
    backend.state.history = [approvedApproval("apr-a1", { application_id: "a1", job_id: "job-a1" })];
    backend.state.queue = [queueRow("q-a1", "apr-a1", "processing")];
    await app.goto("/dashboard");

    const chip = app.getByTestId("dashboard-ready-chip");
    await expect(chip).toHaveText("3 lamaran belum terkirim di kolom Siap dikirim");
    await expect(chip).toHaveAttribute("href", "/applications");
    await expect(chip).toHaveAttribute("title", /bisa berbeda dari tab Menunggu/);
    await expect(app.getByText(/lamaran siap dikirim/)).toHaveCount(0);
  });
});
