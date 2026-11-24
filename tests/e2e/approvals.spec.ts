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
 * yang berjalan. Kartu agen (pertanyaan, kode keamanan) hanya ada di tab Riwayat untuk persetujuan berstatus
 * approved, karena di sanalah status tugas apply dibaca.
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

  test("tanpa antrean, halaman menjelaskan bahwa tidak ada yang perlu disetujui", async ({ app }) => {
    await app.goto("/approvals");
    await expect(app.getByRole("heading", { name: "Tidak ada yang perlu disetujui" })).toBeVisible();
  });

  test("Setujui memanggil POST approve tepat sekali, tanpa reject, dan memindahkan kartu ke Riwayat", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-1", { job_title: "Frontend Engineer" })];
    await app.goto("/approvals");

    await app.getByRole("button", { name: /Periksa/ }).click();
    const dialog = app.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Gerbang Persetujuan" })).toBeVisible();
    await dialog.getByRole("button", { name: /Setujui/ }).click();

    await expect(app.getByText("Disetujui — lamaran masuk antrean agen.")).toBeVisible();
    await expect(app.getByRole("heading", { name: "Tidak ada yang perlu disetujui" })).toBeVisible();

    const approves = backend.callsTo("POST", "/api/approvals/apr-1/approve");
    expect(approves).toHaveLength(1);
    // Surat tidak diedit, jadi badan permintaan kosong: backend memakai surat tersimpan.
    expect(approves[0].body).toEqual({});
    expect(backend.callsTo("POST", "/api/approvals/apr-1/reject")).toHaveLength(0);

    await app.getByRole("button", { name: /Riwayat/ }).click();
    await expect(app.getByRole("heading", { name: "Frontend Engineer" })).toBeVisible();
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
    await expect(app.getByText("Disetujui — lamaran masuk antrean agen.")).toHaveCount(0);
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
    await app.getByRole("button", { name: /Riwayat/ }).click();

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
    await app.getByRole("button", { name: /Riwayat/ }).click();

    await app.getByRole("button", { name: "Simpan jawaban dan jalankan agen lagi" }).click();
    await expect(app.getByText("Lengkapi semua jawaban dulu")).toBeVisible();
    expect(backend.restWrites).toHaveLength(0);
    expect(backend.callsTo("POST", "/api/approvals/apr-q/rerun")).toHaveLength(0);
  });

  test("jawaban disimpan ke bank jawaban lalu agen dijalankan ulang tepat sekali, dalam urutan itu", async ({ app, backend }) => {
    seedQuestions(backend);
    await app.goto("/approvals");
    await app.getByRole("button", { name: /Riwayat/ }).click();

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
    await app.getByRole("button", { name: /Riwayat/ }).click();
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
    await app.getByRole("button", { name: /Riwayat/ }).click();

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
    await app.getByRole("button", { name: /Riwayat/ }).click();

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
    await app.getByRole("button", { name: /Riwayat/ }).click();

    await app.getByLabel("Kode dari email").fill("K7Q-93X");
    await app.getByRole("button", { name: "Kirim kode ke agen" }).click();
    await expect.poll(() => backend.callsTo("POST", "/api/agent/security-code").length).toBe(1);
    expect(backend.callsTo("POST", "/api/agent/security-code")[0].body).toEqual({ queue_job_id: "queue-c", code: "K7Q93X" });
  });

  test("kode yang panjangnya salah tidak dikirim", async ({ app, backend }) => {
    seedAwaiting(backend);
    await app.goto("/approvals");
    await app.getByRole("button", { name: /Riwayat/ }).click();

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
    await app.getByRole("button", { name: /Riwayat/ }).click();

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
    await app.getByRole("button", { name: /Riwayat/ }).click();

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
    await app.getByRole("button", { name: /Riwayat/ }).click();

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

  async function openHistory(app: import("@playwright/test").Page) {
    await app.goto("/approvals");
    await app.getByRole("button", { name: /Riwayat/ }).click();
  }

  test("kartu menampilkan pertanyaan dari ekstensi, kolom rahasia tanpa isian, dan ringkasan berkas tanpa path", async ({ app, backend }) => {
    seedExtension(backend);
    await openHistory(app);

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
    await openHistory(app);
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
    await openHistory(app);

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
    await openHistory(app);

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
    await openHistory(app);

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
    await openHistory(app);

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
    await openHistory(app);

    await expect(app.getByRole("heading", { name: "Isi sendiri di halaman lowongan" })).toBeVisible();
    await expect(app.getByTestId("agent-self-fill")).toContainText("Account password");
    await expect(app.getByRole("button", { name: /Simpan jawaban/ })).toHaveCount(0);
    await expect(app.getByRole("heading", { name: "Agen butuh jawabanmu" })).toHaveCount(0);
    await expect(app.getByTestId("agent-documents")).toHaveText("Ekstensi Browser tidak memasang berkas apa pun.");
    expect(backend.restWrites).toEqual([]);
  });

  test("ekstensi sudah mengirim (success): tidak ada kartu pertanyaan, hanya status Terkirim", async ({ app, backend }) => {
    seedExtension(backend, extensionQuestionsLog(APR, { questions: [] }, { status: "success" }));
    await openHistory(app);

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
    await app.getByRole("button", { name: /Riwayat/ }).click();

    await expect(app.getByText("Menunggu login di tab browser").first()).toBeVisible();
    const openBtn = app.getByTestId("open-login-tab");
    await expect(openBtn).toBeVisible();
    // Petunjuk utama: pindah ke tab yang dibuka ekstensi. Tautan hanya cadangan.
    await expect(app.getByTestId("login-tab-guide")).toContainText("Pindah ke tab itu");
    await expect(app.getByTestId("login-tab-guide")).toContainText("tab latar belakang");
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
    await app.getByRole("button", { name: /Riwayat/ }).click();

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
    await app.getByRole("button", { name: /Riwayat/ }).click();

    const consent = app.getByTestId("extension-consent");
    await consent.getByLabel("Selalu izinkan tanpa bertanya").check();
    await consent.getByRole("button", { name: "Izinkan" }).click();
    await expect.poll(() => backend.callsTo("POST", CONSENT_PATH("apr-ext")).length).toBe(1);
    expect(backend.callsTo("POST", CONSENT_PATH("apr-ext"))[0].body).toEqual({ always: true });
    await expect(app.getByText("Izin diberikan. Ekstensi akan dipakai otomatis untuk situs yang perlu login.", { exact: false })).toBeVisible();
  });

  test("jawaban approve meminta izin: Riwayat terbuka sendiri dan blok izin tampil tanpa lamaran masuk antrean", async ({ app, backend }) => {
    backend.state.pending = [approval("apr-flag", { platform: "jobstreet", job_title: "Frontend Engineer" })];
    backend.state.approveExtra = { apply_channel: "extension", extension_consent_required: true };
    await app.goto("/approvals");

    await app.getByRole("button", { name: /Periksa/ }).click();
    await app.getByRole("dialog").getByRole("button", { name: /Setujui/ }).click();

    await expect(app.getByText("Disetujui. Izinkan ekstensi browser untuk mengisi formulirnya di tab Riwayat.")).toBeVisible();
    await expect(app.getByRole("heading", { name: "Frontend Engineer" })).toBeVisible();
    await expect(app.getByTestId("extension-consent")).toBeVisible();
    await expect(app.getByRole("button", { name: /Riwayat/ })).toContainText("1");

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
    await app.getByRole("button", { name: /Riwayat/ }).click();

    await expect(app.getByRole("heading", { name: "Aktif" })).toBeVisible();
    await expect(app.getByRole("heading", { name: "Sudah Terkirim" })).toBeVisible();
    await expect(app.getByRole("heading", { name: "Dari LinkedIn" })).toBeVisible();
    await expect(app.getByTestId("extension-consent")).toHaveCount(0);
  });

  test("percobaan agen berhenti karena situs meminta login: izin ditawarkan lagi dengan catatan login", async ({ app, backend }) => {
    seedPortal(backend, "apr-auth");
    backend.state.queue = [queueRow("queue-auth", "apr-auth", "completed")];
    backend.state.logs = [applyLog("queue-auth", "apr-auth", "incomplete", { reason: "auth_required", fields_filled: 0 })];
    await app.goto("/approvals");
    await app.getByRole("button", { name: /Riwayat/ }).click();

    const consent = app.getByTestId("extension-consent");
    await expect(consent).toBeVisible();
    await expect(consent.getByText(/meminta kamu masuk ke akun pelamar/)).toBeVisible();
  });

  test("izin gagal: pesan galat tampil tanpa teks server dan blok tetap ada; 409 dianggap sudah berjalan", async ({ app, backend }) => {
    seedPortal(backend);
    backend.override(`POST ${CONSENT_PATH("apr-ext")}`, { status: 500, body: { error: "boom SECRET_KEY", code: "internal_error" } });
    await app.goto("/approvals");
    await app.getByRole("button", { name: /Riwayat/ }).click();

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
