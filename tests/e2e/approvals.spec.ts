import { expect, test, TEST_ACCESS_TOKEN } from "./helpers/test";
import { TEST_USER_ID } from "./helpers/constants";
import {
  QUESTIONS,
  applyLog,
  approvedApproval,
  approval,
  awaitingCodeLog,
  isoAgo,
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
