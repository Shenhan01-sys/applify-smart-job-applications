import { expect, test, TEST_ACCESS_TOKEN } from "./helpers/test";
import { TEST_USER_ID } from "./helpers/constants";
import {
  EXTENSION_QUESTIONS,
  QUESTIONS,
  applyLog,
  approvedApproval,
  approval,
  awaitingCodeLog,
  extensionQuestionsLog,
  isoAgo,
  jobRow,
  questionsLog,
  queueRow,
  stoppedLog,
} from "./helpers/fixtures";

/**
 * Halaman Persetujuan (src/routes/approvals.tsx). Backend Fastify dan Supabase dipalsukan; kode aplikasi asli
 * yang berjalan. Kartu agen (pertanyaan, kode keamanan) ada di persetujuan berstatus approved, karena di sanalah
 * status tugas apply dibaca. Persetujuan yang sudah disetujui tetapi belum terkirim tetap di tab Menunggu; tab
 * Riwayat hanya memuat yang sudah terkirim, ditolak, atau kedaluwarsa (src/lib/approvalTabs.ts).
 */

test.describe("Persetujuan: menunggu", () => {
  test("kartu persetujuan menunggu tampil dengan judul, perusahaan, dan tombol Periksa", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-1", { job_title: "Frontend Engineer", company: "PT Maju Jaya" })];
    await app.goto("/approvals");

    await expect(app.getByRole("heading", { name: "Persetujuan Lamaran", level: 1 })).toBeVisible();
    await expect(app.getByRole("heading", { name: "Frontend Engineer" })).toBeVisible();
    await expect(app.getByText("PT Maju Jaya")).toBeVisible();
    await expect(app.getByRole("button", { name: /Periksa/ })).toBeVisible();
    await expect(app.getByRole("button", { name: /Menunggu/ })).toContainText("1");

    // Panggilan ke backend membawa token sesi pengguna.
    const pending = backend.callsTo("GET", "/api/approvals/pending");
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0].authorization).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  });

  test("pengguna yang belum pernah punya persetujuan: belum ada yang menunggu, tanpa kata 'semua sudah diperiksa'", async ({ app }) => {
    await app.goto("/approvals");
    await expect(app.getByRole("heading", { name: "Belum ada lamaran yang menunggu persetujuan" })).toBeVisible();
    await expect(app.getByText("Jalankan pencarian lowongan dulu.", { exact: false })).toBeVisible();
    await expect(app.getByText("Semua sudah diperiksa")).toHaveCount(0);
    await expect(app.getByRole("link", { name: "Cari lowongan" })).toBeVisible();
  });

  test("antrean kosong tetapi riwayat berisi: Semua sudah diperiksa", async ({ app, backend }) => {
    backend.state.history = [approval("apr-old", { job_title: "Sudah Ditolak", status: "rejected", reviewed_at: isoAgo(60_000) })];
    await app.goto("/approvals");
    await expect(app.getByRole("heading", { name: "Semua sudah diperiksa" })).toBeVisible();
    await expect(app.getByText("Belum ada lamaran yang menunggu persetujuan")).toHaveCount(0);
  });

  test("Setujui memanggil POST approve tepat sekali, tanpa reject, dan kartu tetap di Menunggu sampai terkirim", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-1", { job_title: "Frontend Engineer" })];
    await app.goto("/approvals");

    await app.getByRole("button", { name: /Periksa/ }).click();
    const dialog = app.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Persetujuan Lamaran" })).toBeVisible();
    await dialog.getByRole("button", { name: /Setujui/ }).click();

    await expect(app.getByText("Disetujui. Lamaran masuk antrean agen.")).toBeVisible();
    // Disetujui belum berarti terkirim: kartunya tetap di Menunggu dengan label status, dan Riwayat tetap kosong.
    await expect(app.getByRole("heading", { name: "Frontend Engineer" })).toBeVisible();
    await expect(app.getByRole("heading", { name: "Semua sudah diperiksa" })).toHaveCount(0);
    await expect(app.getByText("Menunggu giliran")).toBeVisible();
    await expect(app.getByRole("button", { name: /Periksa/ })).toHaveCount(0);
    await expect(app.getByRole("button", { name: /Menunggu/ })).toContainText("1");
    await expect(app.getByRole("button", { name: /Riwayat/ })).toContainText("0");

    const approves = backend.callsTo("POST", "/api/approvals/apr-1/approve");
    expect(approves).toHaveLength(1);
    // Surat tidak diedit, jadi badan permintaan kosong: backend memakai surat tersimpan.
    expect(approves[0].body).toEqual({});
    expect(backend.callsTo("POST", "/api/approvals/apr-1/reject")).toHaveLength(0);

    await app.getByRole("button", { name: /Riwayat/ }).click();
    await expect(app.getByRole("heading", { name: "Belum ada riwayat" })).toBeVisible();
    await expect(app.getByRole("heading", { name: "Frontend Engineer" })).toHaveCount(0);
  });

  test("Setujui sesudah surat diedit mengirim versi yang diedit", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-1")];
    await app.goto("/approvals");

    await app.getByRole("button", { name: /Periksa/ }).click();
    const dialog = app.getByRole("dialog");
    await dialog.getByRole("button", { name: "Edit" }).click();
    await dialog.getByRole("textbox").first().fill("Surat yang sudah saya edit.");
    await expect(dialog.getByText("diedit")).toBeVisible();
    await dialog.getByRole("button", { name: /Setujui/ }).click();

    await expect.poll(() => backend.callsTo("POST", "/api/approvals/apr-1/approve").length).toBe(1);
    expect(backend.callsTo("POST", "/api/approvals/apr-1/approve")[0].body).toEqual({ cover_letter: "Surat yang sudah saya edit." });
  });

  test("Tolak butuh alasan, lalu memanggil POST reject tepat sekali dengan alasan itu", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-1", { job_title: "Frontend Engineer" })];
    await app.goto("/approvals");

    await app.getByRole("button", { name: /Periksa/ }).click();
    const dialog = app.getByRole("dialog");
    await dialog.getByRole("button", { name: "Tolak" }).click();

    const confirm = dialog.getByRole("button", { name: "Konfirmasi Tolak" });
    await expect(confirm).toBeDisabled();
    await dialog.getByPlaceholder(/tidak cocok/).fill("Gaji terlalu rendah");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(app.getByText("Ditolak. Alasanmu tersimpan di riwayat persetujuan.")).toBeVisible();
    const rejects = backend.callsTo("POST", "/api/approvals/apr-1/reject");
    expect(rejects).toHaveLength(1);
    expect(rejects[0].body).toEqual({ reason: "Gaji terlalu rendah" });
    expect(backend.callsTo("POST", "/api/approvals/apr-1/approve")).toHaveLength(0);

    await app.getByRole("button", { name: /Riwayat/ }).click();
    await expect(app.getByText("Alasan: Gaji terlalu rendah")).toBeVisible();
  });

  test("galat backend saat menyetujui tampil sebagai pesan dan tidak memindahkan kartu", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-1")];
    backend.override("POST /api/approvals/apr-1/approve", { status: 500, body: { error: "boom" } });
    await app.goto("/approvals");

    await app.getByRole("button", { name: /Periksa/ }).click();
    await app.getByRole("dialog").getByRole("button", { name: /Setujui/ }).click();

    await expect.poll(() => backend.callsTo("POST", "/api/approvals/apr-1/approve").length).toBe(1);
    await expect(app.getByRole("dialog")).toBeVisible();
    await expect(app.getByText("Disetujui. Lamaran masuk antrean agen.")).toHaveCount(0);
  });
});

test.describe("Persetujuan: kartu pertanyaan agen", () => {
  function seedQuestions(backend: import("./helpers/mockBackend").MockBackend) {
    backend.state.history = [approvedApproval("apr-q", { job_title: "Data Analyst", company: "PT Tanya" })];
    backend.state.queue = [queueRow("queue-q", "apr-q", "completed")];
    backend.state.logs = [questionsLog("queue-q", "apr-q")];
  }

  test("menampilkan pertanyaan yang tidak bisa dijawab agen, per jenis isian", async ({ app, backend }) => {
    seedQuestions(backend);
    await app.goto("/approvals");

    await expect(app.getByRole("heading", { name: "Agen butuh jawabanmu" })).toBeVisible();
    await expect(app.getByText("3 pertanyaan")).toBeVisible();
    await expect(app.getByLabel(QUESTIONS[0].label)).toBeVisible(); // textarea
    const select = app.getByLabel(QUESTIONS[1].label);
    await expect(select.locator("option")).toHaveText(["Pilih jawaban", "Yes", "No"]);
    await expect(app.getByRole("group", { name: QUESTIONS[2].label })).toBeVisible(); // kotak centang Ya atau Tidak
    // Alur lain tidak ikut tampil: tidak ada kolom kode, tidak ada "Kirim sendiri".
    await expect(app.getByRole("heading", { name: "Masukkan kode keamanan" })).toHaveCount(0);
    await expect(app.getByRole("heading", { name: "Kirim sendiri di situs lowongan" })).toHaveCount(0);
  });

  test("jawaban kosong ditolak di layar: tidak menyimpan dan tidak menjalankan agen", async ({ app, backend }) => {
    seedQuestions(backend);
    await app.goto("/approvals");

    await app.getByRole("button", { name: "Simpan jawaban dan jalankan agen lagi" }).click();
    await expect(app.getByText("Lengkapi semua jawaban dulu")).toBeVisible();
    expect(backend.restWrites).toHaveLength(0);
    expect(backend.callsTo("POST", "/api/approvals/apr-q/rerun")).toHaveLength(0);
  });

  test("jawaban disimpan ke bank jawaban lalu agen dijalankan ulang tepat sekali, dalam urutan itu", async ({ app, backend }) => {
    seedQuestions(backend);
    await app.goto("/approvals");

    await app.getByLabel(QUESTIONS[0].label).fill("Karena produknya membantu pencari kerja.");
    await app.getByLabel(QUESTIONS[1].label).selectOption("Yes");
    await app.getByRole("group", { name: QUESTIONS[2].label }).getByRole("radio", { name: "Ya" }).check();
    await app.getByRole("button", { name: "Simpan jawaban dan jalankan agen lagi" }).click();

    await expect(app.getByText("Agen berjalan lagi dengan jawabanmu.")).toBeVisible();

    expect(backend.restWrites).toHaveLength(1);
    const save = backend.restWrites[0];
    expect(save.method).toBe("POST");
    expect(save.path).toBe("/rest/v1/user_form_answers");
    const rows = (save.body as Array<Record<string, string>>).map(({ updated_at, ...rest }) => {
      expect(Number.isNaN(Date.parse(updated_at))).toBe(false);
      return rest;
    });
    expect(rows).toEqual([
      { user_id: TEST_USER_ID, question_key: QUESTIONS[0].key, question_label: QUESTIONS[0].label, answer: "Karena produknya membantu pencari kerja." },
      { user_id: TEST_USER_ID, question_key: QUESTIONS[1].key, question_label: QUESTIONS[1].label, answer: "Yes" },
      { user_id: TEST_USER_ID, question_key: QUESTIONS[2].key, question_label: QUESTIONS[2].label, answer: "Yes" },
    ]);

    const reruns = backend.callsTo("POST", "/api/approvals/apr-q/rerun");
    expect(reruns).toHaveLength(1);
    expect(reruns[0].authorization).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(save.seq).toBeLessThan(reruns[0].seq);
    // Tidak ada jalur lain yang menjalankan agen atau menandai terkirim.
    expect(backend.callsTo("POST", "/api/approvals/apr-q/mark-sent")).toHaveLength(0);
  });

  test("jawaban tersimpan mengisi formulir lebih dulu untuk pertanyaan yang kuncinya sama", async ({ app, backend }) => {
    seedQuestions(backend);
    backend.state.answers = [
      { id: "ans-1", question_key: QUESTIONS[0].key, question_label: QUESTIONS[0].label, answer: "Jawaban dari lowongan lain.", updated_at: isoAgo(1000) },
    ];
    await app.goto("/approvals");
    await expect(app.getByLabel(QUESTIONS[0].label)).toHaveValue("Jawaban dari lowongan lain.");
  });
});

test.describe("Persetujuan: kartu kode keamanan", () => {
  const CODE = "K7Q93X";

  function seedAwaiting(backend: import("./helpers/mockBackend").MockBackend) {
    backend.state.history = [approvedApproval("apr-c", { job_title: "Product Designer", company: "PT Kode" })];
    backend.state.queue = [queueRow("queue-c", "apr-c", "processing")];
    backend.state.logs = [awaitingCodeLog("queue-c", "apr-c")];
  }

  test("agen menunggu kode: kolom kode dan penghitung waktu tampil", async ({ app, backend }) => {
    seedAwaiting(backend);
    await app.goto("/approvals");

    await expect(app.getByText("Menunggu kode keamanan").first()).toBeVisible();
    await expect(app.getByRole("heading", { name: "Masukkan kode keamanan" })).toBeVisible();
    await expect(app.getByRole("timer")).toBeVisible();
    // Panjang kode dari worker (code_length 6) dipakai sebagai petunjuk.
    await expect(app.getByLabel("Kode dari email")).toHaveAttribute("placeholder", "6 karakter");
    await expect(app.getByRole("button", { name: "Kirim kode ke agen" })).toBeDisabled();
  });

  test("kode dikirim ke POST /api/agent/security-code tepat sekali dan tidak bocor ke URL, konsol, atau penyimpanan", async ({ app, backend, guard }) => {
    seedAwaiting(backend);
    await app.goto("/approvals");

    await app.getByLabel("Kode dari email").fill(CODE);
    await app.getByRole("button", { name: "Kirim kode ke agen" }).click();
    await expect(app.getByText(/Kode diteruskan/)).toBeVisible();

    const sent = backend.callsTo("POST", "/api/agent/security-code");
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ queue_job_id: "queue-c", code: CODE });
    expect(sent[0].authorization).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(sent[0].search).toBe("");

    // Kode tidak ada di alamat halaman, riwayat navigasi, atau alamat permintaan mana pun.
    expect(app.url()).not.toContain(CODE);
    for (const url of guard.navigations) expect(url).not.toContain(CODE);
    const seen = guard.requestsContaining(CODE);
    expect(seen.inUrl).toEqual([]);
    // Isi permintaan yang memuat kode: hanya satu, yaitu POST ke endpoint kode keamanan.
    expect(seen.inBody.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual(["POST /mock-api/api/agent/security-code"]);

    // Tidak ada pesan konsol yang memuat kode.
    expect(guard.consoleMessages.filter((m) => m.includes(CODE))).toEqual([]);

    // Kode tidak disimpan di penyimpanan peramban dan kolomnya tidak ikut ada di halaman lagi.
    const stored = await app.evaluate(() => JSON.stringify({ ...window.localStorage }) + JSON.stringify({ ...window.sessionStorage }));
    expect(stored).not.toContain(CODE);
    await expect(app.getByLabel("Kode dari email")).toHaveCount(0);
    await expect(app.locator("body")).not.toContainText(CODE);
  });

  test("kode dengan spasi atau tanda hubung dirapikan sebelum dikirim", async ({ app, backend }) => {
    seedAwaiting(backend);
    await app.goto("/approvals");

    await app.getByLabel("Kode dari email").fill("K7Q-93X");
    await app.getByRole("button", { name: "Kirim kode ke agen" }).click();
    await expect.poll(() => backend.callsTo("POST", "/api/agent/security-code").length).toBe(1);
    expect(backend.callsTo("POST", "/api/agent/security-code")[0].body).toEqual({ queue_job_id: "queue-c", code: "K7Q93X" });
  });

  test("kode yang panjangnya salah tidak dikirim", async ({ app, backend }) => {
    seedAwaiting(backend);
    await app.goto("/approvals");

    const input = app.getByLabel("Kode dari email");
    await input.fill("12");
    await input.blur();
    await expect(app.getByText("Kode harus 6 karakter.")).toBeVisible();
    await expect(app.getByRole("button", { name: "Kirim kode ke agen" })).toBeDisabled();
    expect(backend.callsTo("POST", "/api/agent/security-code")).toHaveLength(0);
  });

  test("backend menolak kode (409): pesan tampil, kolom tetap ada, kode tidak muncul di konsol", async ({ app, backend, guard }) => {
    seedAwaiting(backend);
    backend.override("POST /api/agent/security-code", { status: 409, body: { error: "agent_not_waiting", code: "agent_not_waiting" } });
    await app.goto("/approvals");

    await app.getByLabel("Kode dari email").fill(CODE);
    await app.getByRole("button", { name: "Kirim kode ke agen" }).click();
    await expect(app.getByRole("alert")).toBeVisible();
    expect(backend.callsTo("POST", "/api/agent/security-code")).toHaveLength(1);
    expect(guard.consoleMessages.filter((m) => m.includes(CODE))).toEqual([]);
    expect(guard.requestsContaining(CODE).inUrl).toEqual([]);
  });

  test("kode tidak dimasukkan tepat waktu: tombol Jalankan agen lagi memanggil POST rerun tepat sekali", async ({ app, backend }) => {
    backend.state.history = [approvedApproval("apr-t")];
    backend.state.queue = [queueRow("queue-t", "apr-t", "completed")];
    backend.state.logs = [stoppedLog("queue-t", "apr-t", null, { reason: "code_timeout" })];
    await app.goto("/approvals");

    await expect(app.getByText("Kode tidak dimasukkan")).toBeVisible();
    await app.getByRole("button", { name: "Jalankan agen lagi" }).click();
    await expect(app.getByText(/Agen berjalan lagi/).first()).toBeVisible();

    expect(backend.callsTo("POST", "/api/approvals/apr-t/rerun")).toHaveLength(1);
    expect(backend.callsTo("POST", "/api/agent/security-code")).toHaveLength(0);
  });

  test("log awaiting_code lama (tugas sudah selesai) tidak memunculkan kolom kode", async ({ app, backend }) => {
    backend.state.history = [approvedApproval("apr-o")];
    backend.state.queue = [queueRow("queue-o", "apr-o", "completed")];
    backend.state.logs = [applyLog("queue-o", "apr-o", "awaiting_code", { awaiting_until: new Date(Date.now() + 600_000).toISOString(), code_length: 6 })];
    await app.goto("/approvals");

    await expect(app.getByText("Agen pengisi formulir")).toBeVisible();
    await expect(app.getByRole("heading", { name: "Masukkan kode keamanan" })).toHaveCount(0);
  });
});

test.describe("Persetujuan: log Ekstensi Browser", () => {
  const APR = "apr-x";
  const SAVED_TEXT = "Jawaban tersimpan. Kembali ke tab lowongan lalu klik Simpan jawaban dan isi ulang di panel Applify.";
  const WHY = EXTENSION_QUESTIONS[0];
  const SAVE_BUTTON = "Simpan jawaban";

  /** Persetujuan yang hanya dikerjakan ekstensi: tidak ada tugas apply di antrean worker, hanya log ekstensi tanpa queue_job_id. */
  function seedExtension(backend: import("./helpers/mockBackend").MockBackend, log: Record<string, any> = extensionQuestionsLog(APR)) {
    backend.state.history = [approvedApproval(APR, { job_title: "Data Analyst", company: "PT Ekstensi" })];
    backend.state.queue = [];
    backend.state.logs = [log];
  }

  async function openApproved(app: import("@playwright/test").Page) {
    await app.goto("/approvals");
  }

  test("kartu menampilkan pertanyaan dari ekstensi, kolom rahasia tanpa isian, dan ringkasan berkas tanpa path", async ({ app, backend }) => {
    seedExtension(backend);
    await openApproved(app);

    await expect(app.getByRole("heading", { name: "Agen butuh jawabanmu" })).toBeVisible();
    // Hanya dua pertanyaan yang bisa dijawab; kolom rahasia tidak dihitung.
    await expect(app.getByText("2 pertanyaan")).toBeVisible();
    await expect(app.getByLabel(WHY.label)).toBeVisible();
    await expect(app.getByText("(wajib)").first()).toBeVisible();
    await expect(app.getByText("(opsional)")).toBeVisible();
    await expect(app.getByRole("button", { name: SAVE_BUTTON, exact: true })).toBeVisible();
    await expect(app.getByRole("button", { name: "Simpan jawaban dan jalankan agen lagi" })).toHaveCount(0);

    const selfFill = app.getByTestId("agent-self-fill");
    await expect(selfFill).toContainText("Account password");
    await expect(selfFill).toContainText("Isi sendiri di halaman lowongan");
    await expect(selfFill.getByRole("textbox")).toHaveCount(0);
    await expect(app.getByLabel("Account password")).toHaveCount(0);

    await expect(app.getByTestId("agent-documents")).toHaveText("Ekstensi Browser memasang berkas: CV, surat lamaran.");
    await expect(app.getByText("Agen pengisi formulir")).toBeVisible();
  });

  test("log ekstensi dibaca dengan sesi pengguna: kueri dibatasi action apply, kanal ekstensi, dan id persetujuan", async ({ app, backend }) => {
    seedExtension(backend);
    await openApproved(app);
    await expect(app.getByRole("heading", { name: "Agen butuh jawabanmu" })).toBeVisible();

    const reads = backend.readsOf("application_logs");
    const extension = reads.filter((r) => r["details->>channel"] === "eq.extension");
    // Halaman memuat data lebih dari sekali (mode dev React): setiap panggilan harus punya filter yang sama.
    expect(extension.length).toBeGreaterThan(0);
    for (const r of extension) expect(r).toMatchObject({ action: "eq.apply", "details->>approval_request_id": `in.(${APR})` });
    // Tidak ada baca log tanpa filter: setiap kueri membatasi baris yang diminta (RLS tetap penjaga utama).
    for (const r of reads) {
      expect(Object.keys(r).filter((k) => !["select", "order", "limit"].includes(k)).length, JSON.stringify(r)).toBeGreaterThan(0);
    }
    // Membuka halaman tidak menulis apa pun.
    expect(backend.restWrites).toEqual([]);
    expect(backend.apiCalls.filter((c) => c.method === "POST" && !c.path.endsWith("/claim-statuses"))).toEqual([]);
  });

  test("jawaban disimpan ke bank jawaban tanpa memanggil rerun worker, lalu kartu minta kembali ke tab lowongan", async ({ app, backend }) => {
    seedExtension(backend);
    await openApproved(app);

    await app.getByLabel(WHY.label).fill("Karena produknya membantu pencari kerja.");
    await app.getByRole("button", { name: SAVE_BUTTON, exact: true }).click();

    await expect(app.getByText(SAVED_TEXT)).toBeVisible();
    await expect(app.getByText("Agen berjalan lagi dengan jawabanmu.")).toHaveCount(0);

    expect(backend.restWrites).toHaveLength(1);
    const save = backend.restWrites[0];
    expect(save.path).toBe("/rest/v1/user_form_answers");
    const rows = (save.body as Array<Record<string, string>>).map(({ updated_at, ...rest }) => {
      expect(Number.isNaN(Date.parse(updated_at))).toBe(false);
      return rest;
    });
    // Pertanyaan opsional yang kosong dan kolom rahasia tidak ikut disimpan.
    expect(rows).toEqual([{ user_id: TEST_USER_ID, question_key: WHY.key, question_label: WHY.label, answer: "Karena produknya membantu pencari kerja." }]);

    // Tidak ada tugas worker yang diantrekan ulang dan tidak ada panggilan ke ekstensi (tidak ditiru).
    expect(backend.callsTo("POST", `/api/approvals/${APR}/rerun`)).toHaveLength(0);
    expect(backend.callsTo("POST", `/api/approvals/${APR}/mark-sent`)).toHaveLength(0);
    expect(backend.apiCalls.filter((c) => c.method === "POST" && !c.path.endsWith("/claim-statuses"))).toEqual([]);
  });

  test("pertanyaan wajib yang kosong ditolak di layar, tidak menyimpan; opsional boleh kosong", async ({ app, backend }) => {
    seedExtension(backend);
    await openApproved(app);

    await app.getByRole("button", { name: SAVE_BUTTON, exact: true }).click();
    await expect(app.getByText("Lengkapi semua jawaban dulu")).toBeVisible();
    await app.getByLabel("LinkedIn profile").fill("https://linkedin.example.test/in/penguji");
    await app.getByRole("button", { name: SAVE_BUTTON, exact: true }).click();
    await expect(app.getByText("Lengkapi semua jawaban dulu")).toBeVisible();
    expect(backend.restWrites).toHaveLength(0);
    expect(backend.callsTo("POST", `/api/approvals/${APR}/rerun`)).toHaveLength(0);
  });

  test("log ekstensi yang lebih baru daripada log worker dipakai: kartu ekstensi tanpa tombol jalankan agen", async ({ app, backend }) => {
    backend.state.history = [approvedApproval("apr-m")];
    backend.state.queue = [queueRow("queue-m", "apr-m", "completed")];
    backend.state.logs = [
      { ...questionsLog("queue-m", "apr-m"), created_at: isoAgo(10 * 60_000) },
      extensionQuestionsLog("apr-m", { questions: [{ key: "expected salary", label: "Expected salary (IDR)", kind: "text", required: true }] }),
    ];
    await openApproved(app);

    await expect(app.getByLabel("Expected salary (IDR)")).toBeVisible();
    await expect(app.getByLabel(QUESTIONS[1].label)).toHaveCount(0);
    await expect(app.getByRole("button", { name: SAVE_BUTTON, exact: true })).toBeVisible();
    await expect(app.getByRole("button", { name: "Simpan jawaban dan jalankan agen lagi" })).toHaveCount(0);
  });

  test("log worker yang lebih baru daripada log ekstensi dipakai: perilaku worker lama tetap", async ({ app, backend }) => {
    backend.state.history = [approvedApproval("apr-m")];
    backend.state.queue = [queueRow("queue-m", "apr-m", "completed")];
    backend.state.logs = [
      questionsLog("queue-m", "apr-m"),
      { ...extensionQuestionsLog("apr-m", { questions: [{ key: "expected salary", label: "Expected salary (IDR)", kind: "text", required: true }] }), created_at: isoAgo(10 * 60_000) },
    ];
    await openApproved(app);

    await expect(app.getByLabel(QUESTIONS[1].label)).toBeVisible();
    await expect(app.getByLabel("Expected salary (IDR)")).toHaveCount(0);
    await expect(app.getByRole("button", { name: "Simpan jawaban dan jalankan agen lagi" })).toBeVisible();
    await expect(app.getByTestId("agent-documents")).toHaveCount(0);
  });

  test("hanya kolom rahasia: tidak ada isian dan tidak ada tombol simpan", async ({ app, backend }) => {
    seedExtension(
      backend,
      extensionQuestionsLog(APR, { questions: [EXTENSION_QUESTIONS[2]], questions_pending: 1, documents_attached: { resume: false } }),
    );
    await openApproved(app);

    await expect(app.getByRole("heading", { name: "Isi sendiri di halaman lowongan" })).toBeVisible();
    await expect(app.getByTestId("agent-self-fill")).toContainText("Account password");
    await expect(app.getByRole("button", { name: /Simpan jawaban/ })).toHaveCount(0);
    await expect(app.getByRole("heading", { name: "Agen butuh jawabanmu" })).toHaveCount(0);
    await expect(app.getByTestId("agent-documents")).toHaveText("Ekstensi Browser tidak memasang berkas apa pun.");
    expect(backend.restWrites).toEqual([]);
  });

  test("berkas yang gagal terpasang (kind file) tampil sebagai petunjuk unggah manual, bukan kolom isian, dan tidak ikut disimpan", async ({ app, backend }) => {
    const fileQuestion = { key: "unggah cv secara manual", label: "Unggah CV secara manual", kind: "file", required: true };
    seedExtension(
      backend,
      extensionQuestionsLog(APR, { questions: [EXTENSION_QUESTIONS[0], fileQuestion], questions_pending: 2, documents_attached: { resume: false } }),
    );
    await openApproved(app);

    // Hanya satu pertanyaan yang bisa dijawab; berkas tidak dihitung dan tidak punya isian.
    await expect(app.getByText("1 pertanyaan")).toBeVisible();
    await expect(app.getByLabel(WHY.label)).toBeVisible();
    await expect(app.getByLabel("Unggah CV secara manual")).toHaveCount(0);
    const upload = app.getByTestId("agent-file-upload");
    await expect(upload).toContainText("Unggah CV sendiri di tab lowongan yang dibuka ekstensi, lalu tekan Kirim di sana.");
    await expect(upload).toContainText("(wajib)");
    await expect(upload.getByRole("textbox")).toHaveCount(0);
  });

  test("hanya berkas: kartu Isi sendiri dengan petunjuk, tanpa isian dan tanpa tombol simpan", async ({ app, backend }) => {
    const fileQuestion = { key: "unggah cv secara manual", label: "Unggah CV secara manual", kind: "file", required: true };
    seedExtension(backend, extensionQuestionsLog(APR, { questions: [fileQuestion], questions_pending: 1, documents_attached: { resume: false } }));
    await openApproved(app);

    await expect(app.getByRole("heading", { name: "Isi sendiri di halaman lowongan" })).toBeVisible();
    await expect(app.getByTestId("agent-file-upload")).toContainText("Unggah CV sendiri di tab lowongan yang dibuka ekstensi");
    await expect(app.getByRole("button", { name: /Simpan jawaban/ })).toHaveCount(0);
    await expect(app.getByRole("heading", { name: "Agen butuh jawabanmu" })).toHaveCount(0);
    expect(backend.restWrites).toEqual([]);
  });

  test("ekstensi sudah mengirim (success): tidak ada kartu pertanyaan, hanya status Terkirim", async ({ app, backend }) => {
    seedExtension(backend, extensionQuestionsLog(APR, { questions: [] }, { status: "success" }));
    await openApproved(app);
    // Sudah terkirim: kartunya pindah ke Riwayat.
    await expect(app.getByRole("heading", { name: "Data Analyst" })).toHaveCount(0);
    await app.getByRole("button", { name: /Riwayat/ }).click();

    await expect(app.getByText("Terkirim").first()).toBeVisible();
    await expect(app.getByRole("heading", { name: "Agen butuh jawabanmu" })).toHaveCount(0);
    await expect(app.getByTestId("agent-self-fill")).toHaveCount(0);
  });
});

test.describe("Persetujuan: antrean ekstensi & jeda menunggu login", () => {
  test("extension_apply awaiting_login menampilkan lencana Menunggu login, petunjuk pindah ke tab ekstensi, dan tautan cadangan ke halaman lowongan (bukan host OAuth terpisah)", async ({ app, backend }) => {
    const jobUrl = "https://id.jobstreet.com/id/job/96011760";
    backend.state.history = [
      approvedApproval("apr-login", {
        job_id: "job-login",
        job_title: "Backend Engineer",
        company: "Acme ID",
        platform: "jobstreet",
      }),
    ];
    backend.state.jobs = [jobRow("job-login", { platform_source: "jobstreet", external_url: jobUrl })];
    backend.state.queue = [
      {
        ...queueRow("queue-login", "apr-login", "processing"),
        job_type: "extension_apply",
        created_at: isoAgo(5 * 60_000),
      },
    ];
    backend.state.logs = [
      {
        ...extensionQuestionsLog(
          "apr-login",
          {
            queue_job_id: "queue-login",
            login_url: "https://login.seek.com/login",
            awaiting_until: new Date(Date.now() + 10 * 60_000).toISOString(),
            questions: [],
            reason: "awaiting_login",
          },
          { status: "awaiting_login" },
        ),
        created_at: isoAgo(1 * 60_000),
      },
    ];

    await app.goto("/approvals");

    await expect(app.getByText("Menunggu login di tab browser").first()).toBeVisible();
    const openBtn = app.getByTestId("open-login-tab");
    await expect(openBtn).toBeVisible();
    // Petunjuk utama: pindah ke tab yang dibuka ekstensi. Tautan hanya cadangan.
    await expect(app.getByTestId("login-tab-guide")).toContainText("Pindah ke tab itu");
    await expect(app.getByTestId("login-tab-guide")).toContainText("grup tab Applify");
    await expect(openBtn).toHaveText(/Buka halaman lowongan/);
    await expect(openBtn).not.toHaveText(/Buka tab login/);
    await expect(openBtn).toHaveAttribute("href", jobUrl);
  });
});

test.describe("Persetujuan: izin Ekstensi Browser", () => {
  const PORTAL_URL = "https://id.jobstreet.com/id/job/96011760";
  const CONSENT_PATH = (id: string) => `/api/approvals/${id}/extension-consent`;

  function seedPortal(backend: import("./helpers/mockBackend").MockBackend, id = "apr-ext") {
    backend.state.history = [approvedApproval(id, { platform: "jobstreet", job_title: "Data Analyst", company: "PT Portal" })];
    backend.state.jobs = [jobRow(`job-${id}`, { platform_source: "jobstreet", external_url: PORTAL_URL })];
  }

  test("lamaran disetujui di situs login tanpa tugas agen: blok izin tampil, Izinkan memanggil endpoint sekali dan status menjadi menunggu ekstensi", async ({ app, backend }) => {
    seedPortal(backend);
    await app.goto("/approvals");

    const consent = app.getByTestId("extension-consent");
    await expect(consent.getByText("Izinkan ekstensi browser mengisi formulir ini")).toBeVisible();
    await expect(consent.getByText(/berhenti sebelum mengirim/)).toBeVisible();
    await expect(consent.getByText(/menekan Kirim/)).toBeVisible();
    await expect(consent.getByLabel("Selalu izinkan tanpa bertanya")).not.toBeChecked();
    // Status sambungan ekstensi tidak diketahui Applify, jadi hanya ada tautan ke bagian ekstensi di Pengaturan.
    await expect(consent.getByRole("link", { name: "Hubungkan di Pengaturan" })).toHaveAttribute("href", /\/settings#ekstensi/);
    expect(backend.callsTo("POST", CONSENT_PATH("apr-ext"))).toHaveLength(0);

    await consent.getByRole("button", { name: "Izinkan" }).click();
    await expect.poll(() => backend.callsTo("POST", CONSENT_PATH("apr-ext")).length).toBe(1);
    const call = backend.callsTo("POST", CONSENT_PATH("apr-ext"))[0];
    expect(call.authorization).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
    expect(call.body).toEqual({});

    await expect(app.getByTestId("extension-consent")).toHaveCount(0);
    await expect(app.getByText("Menunggu Ekstensi Browser").first()).toBeVisible();
    // Izin tidak mengirim apa pun ke situs: tidak ada rerun atau tanda terkirim.
    expect(backend.callsTo("POST", "/api/approvals/apr-ext/rerun")).toHaveLength(0);
    expect(backend.callsTo("POST", "/api/approvals/apr-ext/mark-sent")).toHaveLength(0);
  });

  test("centang 'Selalu izinkan tanpa bertanya' mengirim always: true", async ({ app, backend }) => {
    seedPortal(backend);
    await app.goto("/approvals");

    const consent = app.getByTestId("extension-consent");
    await consent.getByLabel("Selalu izinkan tanpa bertanya").check();
    await consent.getByRole("button", { name: "Izinkan" }).click();
    await expect.poll(() => backend.callsTo("POST", CONSENT_PATH("apr-ext")).length).toBe(1);
    expect(backend.callsTo("POST", CONSENT_PATH("apr-ext"))[0].body).toEqual({ always: true });
    await expect(app.getByText("Izin diberikan. Ekstensi akan dipakai otomatis untuk situs yang perlu login.", { exact: false })).toBeVisible();
  });

  test("jawaban approve meminta izin: kartu tetap di Menunggu, blok izin tampil, tanpa lamaran masuk antrean", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-flag", { platform: "jobstreet", job_title: "Frontend Engineer" })];
    backend.state.approveExtra = { apply_channel: "extension", extension_consent_required: true };
    await app.goto("/approvals");

    await app.getByRole("button", { name: /Periksa/ }).click();
    await app.getByRole("dialog").getByRole("button", { name: /Setujui/ }).click();

    await expect(app.getByText("Disetujui. Izinkan ekstensi browser untuk mengisi formulirnya di tab Menunggu.")).toBeVisible();
    await expect(app.getByRole("heading", { name: "Frontend Engineer" })).toBeVisible();
    await expect(app.getByText("Perlu tindakanmu")).toBeVisible();
    await expect(app.getByTestId("extension-consent")).toBeVisible();
    await expect(app.getByRole("button", { name: /Menunggu/ })).toContainText("1");
    await expect(app.getByRole("button", { name: /Riwayat/ })).toContainText("0");

    await app.getByTestId("extension-consent").getByRole("button", { name: "Izinkan" }).click();
    await expect.poll(() => backend.callsTo("POST", CONSENT_PATH("apr-flag")).length).toBe(1);
    await expect(app.getByTestId("extension-consent")).toHaveCount(0);
  });

  test("tugas agen aktif, LinkedIn, atau sudah terkirim: blok izin tidak tampil", async ({ app, backend }) => {
    backend.state.history = [
      approvedApproval("apr-active", { platform: "jobstreet", job_title: "Aktif" }),
      approvedApproval("apr-li", { platform: "linkedin", job_title: "Dari LinkedIn" }),
      approvedApproval("apr-sent", { platform: "jobstreet", job_title: "Sudah Terkirim" }),
    ];
    backend.state.jobs = [
      jobRow("job-apr-active", { platform_source: "jobstreet", external_url: PORTAL_URL }),
      jobRow("job-apr-li", { platform_source: "linkedin", external_url: "https://www.linkedin.com/jobs/view/999" }),
      jobRow("job-apr-sent", { platform_source: "jobstreet", external_url: PORTAL_URL }),
    ];
    backend.state.queue = [
      queueRow("queue-active", "apr-active", "pending", { job_type: "extension_apply" }),
      queueRow("queue-sent", "apr-sent", "completed"),
    ];
    backend.state.logs = [applyLog("queue-sent", "apr-sent", "success", { confirmation_phrase: "Terima kasih" })];
    await app.goto("/approvals");

    // Menunggu: yang masih berjalan dan yang belum punya tugas (LinkedIn). Yang sudah terkirim pindah ke Riwayat.
    await expect(app.getByRole("heading", { name: "Aktif" })).toBeVisible();
    await expect(app.getByRole("heading", { name: "Dari LinkedIn" })).toBeVisible();
    await expect(app.getByRole("heading", { name: "Sudah Terkirim" })).toHaveCount(0);
    await expect(app.getByTestId("extension-consent")).toHaveCount(0);

    await app.getByRole("button", { name: /Riwayat/ }).click();
    await expect(app.getByRole("heading", { name: "Sudah Terkirim" })).toBeVisible();
    await expect(app.getByRole("heading", { name: "Aktif" })).toHaveCount(0);
    await expect(app.getByTestId("extension-consent")).toHaveCount(0);
  });

  test("percobaan agen berhenti karena situs meminta login: izin ditawarkan lagi dengan catatan login", async ({ app, backend }) => {
    seedPortal(backend, "apr-auth");
    backend.state.queue = [queueRow("queue-auth", "apr-auth", "completed")];
    backend.state.logs = [applyLog("queue-auth", "apr-auth", "incomplete", { reason: "auth_required", fields_filled: 0 })];
    await app.goto("/approvals");

    const consent = app.getByTestId("extension-consent");
    await expect(consent).toBeVisible();
    await expect(consent.getByText(/meminta kamu masuk ke akun pelamar/)).toBeVisible();
  });

  test("izin gagal: pesan galat tampil tanpa teks server dan blok tetap ada; 409 dianggap sudah berjalan", async ({ app, backend }) => {
    seedPortal(backend);
    backend.override(`POST ${CONSENT_PATH("apr-ext")}`, { status: 500, body: { error: "boom SECRET_KEY", code: "internal_error" } });
    await app.goto("/approvals");

    const consent = app.getByTestId("extension-consent");
    await consent.getByRole("button", { name: "Izinkan" }).click();
    await expect(consent.getByRole("alert")).toContainText("Izin belum bisa diberikan");
    await expect(consent.getByRole("alert")).not.toContainText("SECRET_KEY");
    await expect(consent).toBeVisible();

    backend.override(`POST ${CONSENT_PATH("apr-ext")}`, { status: 409, body: { error: "already active" } });
    await consent.getByRole("button", { name: "Izinkan" }).click();
    await expect(app.getByText("Ekstensi sudah berjalan untuk lamaran ini.")).toBeVisible();
    await expect(consent.getByRole("alert")).toHaveCount(0);
  });
});

test.describe("Persetujuan: ekstensi menunggu", () => {
  const DEALLS_URL = "https://dealls.com/loker/backend-engineer~acme";

  function seedDealls(backend: import("./helpers/mockBackend").MockBackend, queueOver: Record<string, unknown>) {
    backend.state.history = [approvedApproval("apr-dl", { platform: "dealls", job_title: "Backend Engineer", company: "PT Dealls Mitra" })];
    backend.state.jobs = [jobRow("job-apr-dl", { platform_source: "dealls", external_url: DEALLS_URL })];
    backend.state.queue = [queueRow("queue-dl", "apr-dl", "pending", { job_type: "extension_apply", ...queueOver })];
  }

  test("tugas tertahan izin situs: kartu menyebut host dan langkahnya, bukan teks menunggu umum", async ({ app, backend }) => {
    seedDealls(backend, {
      error_message: "permission_required:dealls.com — Izin situs ATS belum diberikan di ekstensi.",
      scheduled_at: new Date(Date.now() + 30_000).toISOString(),
    });
    await app.goto("/approvals");

    await expect(app.getByText("Menunggu Ekstensi Browser").first()).toBeVisible();
    const hint = app.getByTestId("extension-wait-hint");
    await expect(hint).toHaveAttribute("data-wait-reason", "permission_required");
    await expect(hint).toHaveText("Ekstensi perlu izin untuk membuka dealls.com. Buka panel ekstensi Applify lalu klik Izinkan dealls.com.");
    await expect(app.getByText(/akan membuka tab baru di browser kamu/)).toHaveCount(0);
  });

  test("baris lama dengan pesan tanpa kode tetap terbaca sebagai butuh izin, tanpa menyebut host", async ({ app, backend }) => {
    seedDealls(backend, { error_message: "Izin situs ATS belum diberikan di ekstensi.", scheduled_at: new Date(Date.now() + 60_000).toISOString() });
    await app.goto("/approvals");

    const hint = app.getByTestId("extension-wait-hint");
    await expect(hint).toContainText("Ekstensi perlu izin untuk membuka situs lowongan ini.");
    await expect(hint).toContainText("klik tombol Izinkan");
  });

  test("tugas jatuh tempo lebih dari lima menit tanpa disentuh: ekstensi belum aktif", async ({ app, backend }) => {
    seedDealls(backend, { error_message: null, scheduled_at: isoAgo(12 * 60_000) });
    await app.goto("/approvals");

    const hint = app.getByTestId("extension-wait-hint");
    await expect(hint).toHaveAttribute("data-wait-reason", "no_extension_seen");
    await expect(hint).toContainText("Belum ada ekstensi Applify yang aktif");
    await expect(hint).toContainText("Isi otomatis di latar");
  });

  test("menunggu biasa (baru masuk antrean): teks lama dipertahankan tanpa sorotan", async ({ app, backend }) => {
    seedDealls(backend, { error_message: null, scheduled_at: isoAgo(30_000) });
    await app.goto("/approvals");

    await expect(app.getByText("Menunggu Ekstensi Browser").first()).toBeVisible();
    await expect(app.getByText(/Ekstensi akan membuka tab baru di browser kamu dan mengisi formulir di sana/)).toBeVisible();
    await expect(app.getByTestId("extension-wait-hint")).toHaveCount(0);
  });
});

test.describe("Persetujuan: email yang tidak dikirim karena mode uji", () => {
  function seedEmail(backend: import("./helpers/mockBackend").MockBackend, logs: Array<Record<string, any>>) {
    backend.state.history = [approvedApproval("apr-mail", { job_title: "Staf Admin", company: "PT Surat" })];
    backend.state.queue = [{ ...queueRow("queue-mail", "apr-mail", "completed"), job_type: "email_apply" }];
    backend.state.logs = logs;
  }
  const emailLog = (status: string, details: Record<string, any>) => ({
    action: "email_apply",
    status,
    job_id: "job-apr-mail",
    created_at: isoAgo(60_000),
    details: { to: "hrd@perusahaan.test", approval_request_id: "apr-mail", ...details },
  });

  test("log skipped real_submit_off: lencana Belum dikirim (mode uji) dan penjelasannya, bukan dianggap terkirim", async ({ app, backend }) => {
    seedEmail(backend, [emailLog("skipped", { reason: "real_submit_off", note: "email tidak dikirim" })]);
    await app.goto("/approvals");

    const badge = app.getByTestId("email-test-mode");
    await expect(badge).toHaveText("Belum dikirim (mode uji)");
    await app.getByRole("button", { name: /Opsi lain: Kirim lewat Email/ }).click();
    await expect(app.getByText(/tidak dikirim ke rekruter/)).toBeVisible();
    await expect(app.getByText("sudah dipakai")).toHaveCount(0);
    // Teks catatan pengembang tidak tampil di mana pun.
    await expect(app.getByText(/Bila server berjalan dalam mode uji/)).toHaveCount(0);
    await expect(app.getByText(/ALLOW_REAL_SUBMIT/)).toHaveCount(0);
  });

  test("catatan lama (ALLOW_REAL_SUBMIT=false tanpa reason) dikenali sama; skipped karena kuota bukan mode uji", async ({ app, backend }) => {
    seedEmail(backend, [emailLog("skipped", { note: "email tidak dikirim (ALLOW_REAL_SUBMIT=false)" })]);
    await app.goto("/approvals");
    await expect(app.getByTestId("email-test-mode")).toBeVisible();
  });

  test("skipped karena alasan lain atau tanpa log: tidak ada lencana mode uji", async ({ app, backend }) => {
    seedEmail(backend, [emailLog("skipped", { note: "kuota harian habis (10/10, paket free); email tidak dikirim" })]);
    await app.goto("/approvals");
    await expect(app.getByRole("heading", { name: "Staf Admin" })).toBeVisible();
    await expect(app.getByTestId("email-test-mode")).toHaveCount(0);
  });

  test("email sudah benar-benar terkirim (log success) menghapus tanda mode uji", async ({ app, backend }) => {
    seedEmail(backend, [
      emailLog("skipped", { reason: "real_submit_off" }),
      emailLog("success", { note: "terkirim" }),
    ]);
    await app.goto("/approvals");
    await app.getByRole("button", { name: /Riwayat/ }).click();
    await expect(app.getByRole("heading", { name: "Staf Admin" })).toBeVisible();
    await expect(app.getByTestId("email-test-mode")).toHaveCount(0);
  });
});

test.describe("Persetujuan: lampiran email", () => {
  const CV_URL = "https://proyek.supabase.co/storage/v1/object/sign/resumes/cv-1.pdf?token=RAHASIA-TOKEN";
  const profile = (over: Record<string, unknown> = {}) => ({
    id: TEST_USER_ID,
    full_name: "Budi Uji",
    resume_url: `${TEST_USER_ID}/cv-1.pdf`,
    transcript_url: `${TEST_USER_ID}/transcript-111.pdf`,
    portfolio_file_url: `${TEST_USER_ID}/portfolio-222.pdf`,
    ...over,
  });
  const mailLog = (status: string, details: Record<string, any>) => ({
    action: "email_apply",
    status,
    job_id: "job-apr-mail",
    created_at: isoAgo(60_000),
    details: { to: "hrd@perusahaan.test", approval_request_id: "apr-mail", ...details },
  });

  function seed(backend: import("./helpers/mockBackend").MockBackend, opts: { description?: string; approval?: Record<string, unknown>; profile?: Record<string, unknown> | null } = {}) {
    backend.state.history = [approvedApproval("apr-mail", { job_title: "Staf Admin", company: "PT Surat", resume_url: CV_URL, ...opts.approval })];
    backend.state.jobs = [jobRow("job-apr-mail", { title: "Staf Admin", description: opts.description ?? "Kirim CV, transkrip nilai, dan portofolio ke hrd@perusahaan.test." })];
    backend.state.profiles = opts.profile === null ? [] : [opts.profile ?? profile()];
    backend.state.gmail = true;
    backend.state.gmailEmail = "pelamar@gmail.test";
  }

  async function openPanel(app: import("@playwright/test").Page) {
    await app.goto("/approvals");
    await app.getByRole("button", { name: /Opsi lain: Kirim lewat Email/ }).click();
  }

  test("sebelum konfirmasi: CV (nama berkas), Cover letter (PDF), dan dokumen yang diminta lowongan tampil; tidak ada teks 'tanpa lampiran'", async ({ app, backend }) => {
    seed(backend);
    await openPanel(app);

    const box = app.getByTestId("email-attachments");
    await expect(box).toBeVisible();
    await expect(box.getByText("Lampiran yang akan dikirim")).toBeVisible();
    await expect(app.getByTestId("email-attachment-cv")).toHaveText("CV (CV-Budi-Uji.pdf)");
    await expect(app.getByTestId("email-attachment-cover_letter")).toHaveText("Cover letter (PDF)");
    await expect(app.getByTestId("email-attachment-transcript")).toHaveText("Transkrip nilai (Budi-Uji-Transcript.pdf)");
    await expect(app.getByTestId("email-attachment-portfolio")).toHaveText("Portofolio (Budi-Uji-Portfolio.pdf)");
    await expect(box.getByRole("status")).toHaveCount(0);
    await expect(app.getByText(/tanpa lampiran/i)).toHaveCount(0);
    await expect(app.getByText(/RAHASIA-TOKEN/)).toHaveCount(0);
  });

  test("lowongan yang tidak meminta transkrip atau portofolio: hanya CV dan Cover letter (PDF)", async ({ app, backend }) => {
    seed(backend, { description: "Kami mencari staf admin. Kirim CV ke hrd@perusahaan.test." });
    await openPanel(app);
    await expect(app.getByTestId("email-attachment-cv")).toBeVisible();
    await expect(app.getByTestId("email-attachment-cover_letter")).toBeVisible();
    await expect(app.getByTestId("email-attachment-transcript")).toHaveCount(0);
    await expect(app.getByTestId("email-attachment-portfolio")).toHaveCount(0);
  });

  test("konfirmasi menampilkan alamat Gmail pengirim dan daftar lampiran sebelum mengantre email", async ({ app, backend }) => {
    seed(backend);
    backend.override("POST /api/automation/queue", { status: 200, body: { id: "queue-mail-1", status: "pending" } });
    await openPanel(app);

    await app.getByLabel("Email rekruter (tujuan)").fill("hrd@perusahaan.test");
    await app.getByRole("button", { name: "Kirim lewat Email", exact: true }).click();
    await expect(app.getByTestId("email-confirm-sender")).toContainText("pelamar@gmail.test");
    const confirm = app.getByTestId("email-confirm-attachments");
    await expect(confirm).toContainText("CV (CV-Budi-Uji.pdf)");
    await expect(confirm).toContainText("Cover letter (PDF)");
    await expect(confirm).toContainText("Transkrip nilai (Budi-Uji-Transcript.pdf)");
    await expect(confirm).toContainText("Portofolio (Budi-Uji-Portfolio.pdf)");
    expect(backend.callsTo("POST", "/api/automation/queue")).toHaveLength(0);

    await app.getByRole("button", { name: "Ya, masukkan ke antrean" }).click();
    await expect(app.getByText("dalam antrean")).toBeVisible();
    const calls = backend.callsTo("POST", "/api/automation/queue");
    expect(calls).toHaveLength(1);
    // Kontrak antrean tidak berubah: hanya id persetujuan dan alamat; lampiran dipilih worker, bukan klien.
    expect(calls[0].body).toMatchObject({ job_type: "email_apply", payload: { approval_request_id: "apr-mail", apply_email: "hrd@perusahaan.test" } });
    expect(Object.keys((calls[0].body as any).payload).sort()).toEqual(["apply_email", "approval_request_id"]);
  });

  test("tanpa CV: wajib centang konfirmasi eksplisit, reset saat konfirmasi dibuka ulang, lalu antrekan mencatat opt-in", async ({ app, backend }) => {
    seed(backend, { approval: { resume_url: null }, profile: profile({ resume_url: null }), description: "Kirim CV." });
    backend.state.gmailEmail = null;
    backend.override("POST /api/automation/queue", { status: 200, body: { id: "queue-no-cv", status: "pending" } });
    await openPanel(app);

    const warning = app.getByTestId("email-attachment-warning-no_cv");
    await expect(warning).toContainText("Kamu belum mengunggah CV; email terkirim tanpa CV");
    await expect(warning.getByRole("link", { name: "Unggah CV di Profil" })).toHaveAttribute("href", "/profile");
    await expect(app.getByTestId("email-attachment-cv")).toHaveCount(0);
    await expect(app.getByTestId("email-attachment-cover_letter")).toBeVisible();

    await app.getByLabel("Email rekruter (tujuan)").fill("hrd@perusahaan.test");
    await expect(app.getByRole("button", { name: "Kirim lewat Email", exact: true })).toBeEnabled();
    await app.getByRole("button", { name: "Kirim lewat Email", exact: true }).click();
    await expect(app.getByTestId("email-confirm-attachments")).toContainText("tanpa CV");
    await expect(app.getByTestId("email-confirm-sender")).toContainText("sambungkan ulang Gmail di Pengaturan agar alamat pengirim tampil di sini");
    const consent = app.getByTestId("email-confirm-no-cv");
    const send = app.getByRole("button", { name: "Ya, masukkan ke antrean" });
    await expect(consent).not.toBeChecked();
    await expect(send).toBeDisabled();
    await consent.check();
    await expect(send).toBeEnabled();
    await app.getByRole("button", { name: "Batal" }).click();
    await app.getByRole("button", { name: "Kirim lewat Email", exact: true }).click();
    await expect(consent).not.toBeChecked();
    await expect(send).toBeDisabled();
    await consent.check();
    await expect(send).toBeEnabled();
    await send.click();
    await expect(app.getByText("dalam antrean")).toBeVisible();
    const calls = backend.callsTo("POST", "/api/automation/queue");
    expect(calls).toHaveLength(1);
    expect((calls[0].body as any).payload).toMatchObject({ approval_request_id: "apr-mail", apply_email: "hrd@perusahaan.test", allow_without_cv: true });
  });

  test("tanpa CV saat pratinjau lampiran tidak tersedia (data lowongan tidak termuat): tetap wajib centang konfirmasi tanpa CV", async ({ app, backend }) => {
    seed(backend, { approval: { resume_url: null }, profile: null, description: "Kirim CV." });
    backend.state.jobs = [];
    backend.override("POST /api/automation/queue", { status: 200, body: { id: "queue-no-cv-fallback", status: "pending" } });
    await openPanel(app);

    await app.getByLabel("Email rekruter (tujuan)").fill("hrd@perusahaan.test");
    await app.getByRole("button", { name: "Kirim lewat Email", exact: true }).click();
    await expect(app.getByTestId("email-confirm-attachments")).toHaveCount(0);
    const consent = app.getByTestId("email-confirm-no-cv");
    const send = app.getByRole("button", { name: "Ya, masukkan ke antrean" });
    await expect(consent).not.toBeChecked();
    await expect(send).toBeDisabled();
    await consent.check();
    await expect(send).toBeEnabled();
    await send.click();
    await expect(app.getByText("dalam antrean")).toBeVisible();
    const calls = backend.callsTo("POST", "/api/automation/queue");
    expect(calls).toHaveLength(1);
    expect((calls[0].body as any).payload).toMatchObject({ approval_request_id: "apr-mail", apply_email: "hrd@perusahaan.test", allow_without_cv: true });
  });

  const seedCvDownloadFailed = (backend: Parameters<typeof seed>[0]) => {
    seed(backend);
    backend.state.queue = [
      {
        id: "queue-cv-fail",
        job_type: "email_apply",
        status: "failed",
        payload: { approval_request_id: "apr-mail", apply_email: "hrd@perusahaan.test" },
        error_message: "Berkas CV pada persetujuan ini gagal diunduh untuk dilampirkan dan pengiriman tanpa CV belum dikonfirmasi; email tidak dikirim.",
        created_at: isoAgo(30_000),
      },
    ];
    backend.override("POST /api/automation/queue", { status: 200, body: { id: "queue-cv-retry", status: "pending" } });
  };

  test("gangguan unduh CV sementara: Coba kirim ulang (tetap wajib CV) langsung aktif, tanpa centang dan tanpa allow_without_cv", async ({ app, backend }) => {
    seedCvDownloadFailed(backend);
    await openPanel(app);

    await app.getByLabel("Email rekruter (tujuan)").fill("hrd@perusahaan.test");
    await app.getByRole("button", { name: "Kirim lewat Email", exact: true }).click();
    await expect(app.getByTestId("email-confirm-cv-retry-note")).toContainText("Kirim ulang dengan CV yang sama");
    const retry = app.getByRole("button", { name: "Coba kirim ulang (tetap wajib CV)" });
    await expect(retry).toBeVisible();
    await expect(retry).toBeEnabled();
    await expect(app.getByTestId("email-confirm-no-cv")).not.toBeChecked();
    // Kirim tanpa CV tetap pilihan eksplisit terpisah: terkunci sampai kotak centang dipilih.
    await expect(app.getByRole("button", { name: "Kirim tanpa CV" })).toBeDisabled();
    await retry.click();
    await expect(app.getByText("dalam antrean")).toBeVisible();
    const calls = backend.callsTo("POST", "/api/automation/queue");
    expect(calls).toHaveLength(1);
    const payload = (calls[0].body as any).payload;
    expect(payload).toMatchObject({ approval_request_id: "apr-mail", apply_email: "hrd@perusahaan.test" });
    expect("allow_without_cv" in payload).toBe(false);
  });

  test("resume_url ada tetapi percobaan sebelumnya gagal mengunduh CV: tampilkan catatan & centang kirim tanpa CV sebagai pilihan eksplisit terpisah", async ({ app, backend }) => {
    seedCvDownloadFailed(backend);
    await openPanel(app);

    await app.getByLabel("Email rekruter (tujuan)").fill("hrd@perusahaan.test");
    await app.getByRole("button", { name: "Kirim lewat Email", exact: true }).click();
    await expect(app.getByTestId("email-confirm-cv-retry-note")).toContainText("gagal mengunduh berkas CV");
    const consent = app.getByTestId("email-confirm-no-cv");
    const send = app.getByRole("button", { name: "Kirim tanpa CV" });
    await expect(consent).not.toBeChecked();
    await expect(send).toBeDisabled();
    await consent.check();
    await expect(send).toBeEnabled();
    await send.click();
    await expect(app.getByText("dalam antrean")).toBeVisible();
    const calls = backend.callsTo("POST", "/api/automation/queue");
    expect(calls).toHaveLength(1);
    expect((calls[0].body as any).payload).toMatchObject({ approval_request_id: "apr-mail", apply_email: "hrd@perusahaan.test", allow_without_cv: true });
  });

  test("CV baru diunggah sesudah draf diajukan: peringatan menyuruh mengajukan ulang, bukan 'belum mengunggah'", async ({ app, backend }) => {
    seed(backend, { approval: { resume_url: null }, description: "Kirim CV." });
    await openPanel(app);
    await expect(app.getByTestId("email-attachment-warning-cv_not_on_approval")).toContainText("Ajukan draf lagi");
    await expect(app.getByTestId("email-attachment-warning-no_cv")).toHaveCount(0);
  });

  test("dokumen diminta lowongan tetapi belum ada di profil: peringatan dan tidak masuk daftar", async ({ app, backend }) => {
    seed(backend, { profile: profile({ transcript_url: null }) });
    await openPanel(app);
    await expect(app.getByTestId("email-attachment-warning-document_missing")).toContainText("meminta transkrip nilai");
    await expect(app.getByTestId("email-attachment-transcript")).toHaveCount(0);
    await expect(app.getByTestId("email-attachment-portfolio")).toBeVisible();
  });

  test("profil tidak terbaca: daftar lampiran tidak ditampilkan (tidak menebak), panel tetap bekerja", async ({ app, backend }) => {
    seed(backend);
    backend.override("GET /rest/v1/profiles", { status: 500, body: {} });
    await openPanel(app);
    await expect(app.getByRole("button", { name: "Kirim lewat Email", exact: true })).toBeVisible();
    await expect(app.getByTestId("email-attachments")).toHaveCount(0);
  });

  test("sesudah terkirim: baris status menampilkan nama lampiran dari log, tanpa membuka panel", async ({ app, backend }) => {
    seed(backend);
    backend.state.logs = [
      mailLog("success", {
        note: "email sent; message_id=m1",
        attachments: [
          { kind: "cv", filename: "CV-Budi-Uji.pdf", bytes: 4017 },
          { kind: "cover_letter", filename: "Budi-Uji-Cover-Letter.pdf", bytes: 1200 },
          { kind: "portfolio", filename: "Budi-Uji-Portfolio.pdf", bytes: 5000 },
        ],
        dropped: [{ kind: "transcript", reason: "unavailable", note: "tidak ada berkas di profil" }],
      }),
    ];
    await app.goto("/approvals");
    await app.getByRole("button", { name: /Riwayat/ }).click();

    const line = app.getByTestId("email-sent-attachments");
    await expect(line).toContainText("Terkirim dengan lampiran: CV (CV-Budi-Uji.pdf), Cover letter (PDF), Portofolio (Budi-Uji-Portfolio.pdf)");
    await expect(line).toContainText("Tidak terlampir: Transkrip nilai (tidak bisa diambil)");
    await expect(app.getByText("sudah dipakai")).toBeVisible();
    // Sudah terkirim: pratinjau "akan dikirim" tidak tampil lagi.
    await app.getByRole("button", { name: /Opsi lain: Kirim lewat Email/ }).click();
    await expect(app.getByTestId("email-attachments")).toHaveCount(0);
  });

  test("email lama yang terkirim sebelum fitur lampiran (log tanpa daftar): tidak ada baris lampiran, tetap sudah dipakai", async ({ app, backend }) => {
    seed(backend);
    backend.state.logs = [mailLog("success", { note: "email sent; message_id=m0" })];
    await app.goto("/approvals");
    await app.getByRole("button", { name: /Riwayat/ }).click();
    await expect(app.getByText("sudah dipakai")).toBeVisible();
    await expect(app.getByTestId("email-sent-attachments")).toHaveCount(0);
  });
});

test.describe("Persetujuan: pembagian tab Menunggu dan Riwayat", () => {
  test("disetujui tetapi belum terkirim tetap di Menunggu dengan label status; Riwayat hanya terkirim, ditolak, kedaluwarsa", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-new", { job_title: "Draf Baru" })];
    backend.state.history = [
      approvedApproval("apr-proc", { job_title: "Sedang Jalan" }),
      approvedApproval("apr-fill", { job_title: "Terisi Saja" }),
      approvedApproval("apr-fail", { job_title: "Agen Gagal" }),
      approvedApproval("apr-sent", { job_title: "Sudah Terkirim" }),
      approval("apr-rej", { job_title: "Ditolak Pengguna", status: "rejected", reviewed_at: isoAgo(60_000) }),
      approval("apr-exp", { job_title: "Sudah Lewat", status: "expired", expires_at: isoAgo(60_000), reviewed_at: isoAgo(120_000) }),
    ];
    backend.state.queue = [
      queueRow("queue-proc", "apr-proc", "processing"),
      queueRow("queue-fill", "apr-fill", "completed"),
      queueRow("queue-fail", "apr-fail", "failed", { error_message: "Timeout membuka formulir" }),
      queueRow("queue-sent", "apr-sent", "completed"),
    ];
    backend.state.logs = [
      stoppedLog("queue-fill", "apr-fill", "not_allowed"),
      applyLog("queue-sent", "apr-sent", "success", { confirmation_phrase: "Terima kasih" }),
    ];
    await app.goto("/approvals");

    // Menunggu: draf baru + tiga persetujuan yang belum terkirim.
    await expect(app.getByRole("button", { name: /Menunggu/ })).toContainText("4");
    await expect(app.getByRole("button", { name: /Riwayat/ })).toContainText("3");
    for (const title of ["Draf Baru", "Sedang Jalan", "Terisi Saja", "Agen Gagal"]) {
      await expect(app.getByRole("heading", { name: title })).toBeVisible();
    }
    for (const title of ["Sudah Terkirim", "Ditolak Pengguna", "Sudah Lewat"]) {
      await expect(app.getByRole("heading", { name: title })).toHaveCount(0);
    }
    await expect(app.getByText("Menunggu persetujuan", { exact: true })).toBeVisible();
    await expect(app.getByText("Sedang diproses", { exact: true })).toBeVisible();
    await expect(app.getByText("Terisi, belum terkirim", { exact: true })).toBeVisible();
    await expect(app.getByText("Belum terkirim, bisa dicoba lagi", { exact: true })).toBeVisible();
    // Hanya draf yang menunggu keputusan yang punya tombol Periksa.
    await expect(app.getByRole("button", { name: /Periksa/ })).toHaveCount(1);

    // Riwayat: terkirim, ditolak, dan kedaluwarsa, tanpa yang masih berjalan.
    await app.getByRole("button", { name: /Riwayat/ }).click();
    for (const title of ["Sudah Terkirim", "Ditolak Pengguna", "Sudah Lewat"]) {
      await expect(app.getByRole("heading", { name: title })).toBeVisible();
    }
    for (const title of ["Draf Baru", "Sedang Jalan", "Terisi Saja", "Agen Gagal"]) {
      await expect(app.getByRole("heading", { name: title })).toHaveCount(0);
    }
    await expect(app.getByText("Terkirim", { exact: true }).first()).toBeVisible();
    await expect(app.getByText("Ditolak", { exact: true })).toBeVisible();
    await expect(app.getByText("Kedaluwarsa", { exact: true })).toBeVisible();
    await expect(app.getByRole("button", { name: /Periksa/ })).toHaveCount(0);
  });

  test("agen gagal dan masa berlaku persetujuan habis: tidak bisa dicoba lagi, ditutup di Riwayat sebagai kedaluwarsa", async ({ app, backend }) => {
    backend.state.history = [approvedApproval("apr-late", { job_title: "Gagal Lama", expires_at: isoAgo(30 * 60_000) })];
    backend.state.queue = [queueRow("queue-late", "apr-late", "failed", { error_message: "Timeout membuka formulir" })];
    await app.goto("/approvals");

    await expect(app.getByRole("heading", { name: "Semua sudah diperiksa" })).toBeVisible();
    await app.getByRole("button", { name: /Riwayat/ }).click();
    await expect(app.getByRole("heading", { name: "Gagal Lama" })).toBeVisible();
    await expect(app.getByText("Kedaluwarsa, belum terkirim", { exact: true })).toBeVisible();
  });

  test("tombol 'Saya sudah mengirimnya sendiri' tidak ada; panel kirim sendiri tetap menawarkan buka formulir dan salin isian", async ({ app, backend }) => {
    backend.state.history = [approvedApproval("apr-m", { job_title: "Berhenti Sebelum Kirim" })];
    backend.state.jobs = [jobRow("job-apr-m", { external_url: "https://jobs.example.test/job-apr-m" })];
    backend.state.queue = [queueRow("queue-m", "apr-m", "completed")];
    backend.state.logs = [stoppedLog("queue-m", "apr-m", "not_allowed")];
    await app.goto("/approvals");

    await expect(app.getByText("Terisi, belum terkirim", { exact: true })).toBeVisible();
    const manual = app.getByRole("region", { name: "Kirim sendiri di situs lowongan" });
    await expect(manual).toBeVisible();
    await expect(manual.getByRole("link", { name: /Buka formulir lowongan/ })).toBeVisible();
    await expect(manual.getByText("Salin isian agen (1)")).toBeVisible();
    await expect(app.getByRole("button", { name: /Saya sudah mengirimnya sendiri/ })).toHaveCount(0);
    await expect(app.getByText(/sudah mengirimnya sendiri/i)).toHaveCount(0);
    await expect(app.getByRole("button", { name: /Ya, tandai terkirim/ })).toHaveCount(0);
    expect(backend.callsTo("POST", "/api/approvals/apr-m/mark-sent")).toHaveLength(0);
  });
});

test.describe("Persetujuan: disetujui tanpa antrean (LinkedIn, email langsung)", () => {
  const LINKEDIN_URL = "https://www.linkedin.com/jobs/view/999";

  async function approveFirst(app: import("@playwright/test").Page) {
    await app.goto("/approvals");
    await app.getByRole("button", { name: /Periksa/ }).click();
    await app.getByRole("dialog").getByRole("button", { name: /Setujui/ }).click();
  }

  test("jawaban approve manual_only: toast jujur, kartu berlabel Perlu diisi sendiri, tanpa Menunggu giliran dan tanpa tombol sudah terkirim", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-li", { platform: "linkedin", job_title: "Frontend Engineer" })];
    backend.state.jobs = [jobRow("job-apr-li", { platform_source: "linkedin", external_url: LINKEDIN_URL })];
    backend.state.approveExtra = { apply_channel: "manual", queued: false, queue_job_id: null, manual_only: true };
    await approveFirst(app);

    await expect(app.getByText("Disetujui. Lamar sendiri di situs lowongan.")).toBeVisible();
    await expect(app.getByText("Disetujui. Lamaran masuk antrean agen.")).toHaveCount(0);
    await expect(app.getByRole("heading", { name: "Frontend Engineer" })).toBeVisible();
    await expect(app.getByText("Perlu diisi sendiri", { exact: true })).toBeVisible();
    await expect(app.getByText("Menunggu giliran")).toHaveCount(0);
    await expect(app.getByText("Agen belum dijalankan")).toHaveCount(0);
    const notice = app.getByTestId("not-queued-notice");
    await expect(notice).toHaveAttribute("data-route", "manual");
    await expect(notice.getByRole("link", { name: /Buka lowongan/ })).toHaveAttribute("href", LINKEDIN_URL);
    await expect(app.getByRole("button", { name: /sudah (kukirim|mengirim)/i })).toHaveCount(0);
    await expect(app.getByRole("button", { name: /Menunggu/ })).toContainText("1");
    await expect(app.getByRole("button", { name: /Riwayat/ })).toContainText("0");
    expect(backend.callsTo("POST", "/api/approvals/apr-li/mark-sent")).toHaveLength(0);
  });

  test("jawaban approve email_direct: toast menyebut panel Email dan kartu berlabel Kirim lewat panel Email", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-em", { platform: "jooble", job_title: "Data Analyst" })];
    backend.state.approveExtra = { apply_channel: "email_direct", queued: false, queue_job_id: null };
    await approveFirst(app);

    await expect(app.getByText("Disetujui. Kirim lewat panel Email.", { exact: true })).toBeVisible();
    await expect(app.getByText("Kirim lewat panel Email", { exact: true })).toBeVisible();
    await expect(app.getByText("Menunggu giliran")).toHaveCount(0);
    await expect(app.getByTestId("not-queued-notice")).toHaveAttribute("data-route", "email_direct");
    await expect(app.getByRole("button", { name: /Menunggu/ })).toContainText("1");
  });

  test("dimuat ulang tanpa jawaban approve: jalurnya dibaca dari data lowongan, dan yang kedaluwarsa tanpa tugas pindah ke Riwayat", async ({ app, backend }) => {
    backend.state.history = [
      approvedApproval("apr-li", { platform: "linkedin", job_title: "Dari LinkedIn" }),
      approvedApproval("apr-em", { platform: "jooble", job_title: "Lewat Email" }),
      approvedApproval("apr-ws", { platform: "web", job_title: "Situs Biasa" }),
      approvedApproval("apr-old", { platform: "linkedin", job_title: "LinkedIn Lama", expires_at: isoAgo(60 * 60_000) }),
    ];
    backend.state.jobs = [
      jobRow("job-apr-li", { platform_source: "linkedin", external_url: LINKEDIN_URL }),
      jobRow("job-apr-em", { platform_source: "jooble", external_url: "https://jooble.example.test/em", description: "Kirim CV ke hr@perusahaan-contoh.co.id" }),
      jobRow("job-apr-ws", { platform_source: "web", external_url: "https://karier.example.test/ws" }),
      jobRow("job-apr-old", { platform_source: "linkedin", external_url: LINKEDIN_URL }),
    ];
    await app.goto("/approvals");

    const card = (title: string) => app.getByRole("heading", { name: title }).locator("xpath=ancestor::div[contains(@class,'group')][1]");
    await expect(card("Dari LinkedIn").getByText("Perlu diisi sendiri", { exact: true })).toBeVisible();
    await expect(card("Lewat Email").getByText("Kirim lewat panel Email", { exact: true })).toBeVisible();
    // lowongan biasa tetap lewat jalur antrean: belum ada tugas = Menunggu giliran
    await expect(card("Situs Biasa").getByText("Menunggu giliran")).toBeVisible();
    await expect(app.getByRole("heading", { name: "LinkedIn Lama" })).toHaveCount(0);

    await app.getByRole("button", { name: /Riwayat/ }).click();
    await expect(card("LinkedIn Lama").getByText("Kedaluwarsa, belum terkirim")).toBeVisible();
  });
});
