import { expect, test } from "./helpers/test";

/**
 * Halaman Pengaturan (src/routes/settings.tsx) dan Pengaturan Agen (src/routes/automation-settings.tsx).
 * Kode aplikasi asli; backend dan Supabase palsu (tests/e2e/helpers).
 */

test.describe("Pengaturan: sambungan Gmail", () => {
  test("gmail=connected: kabar berhasil tampil lalu alamat dibersihkan", async ({ app }) => {
    await app.goto("/settings?gmail=connected");
    const banner = app.getByTestId("gmail-banner");
    await expect(banner).toContainText("Gmail terhubung");
    await expect(banner.getByRole("link", { name: "Buka Persetujuan" })).toBeVisible();
    await expect.poll(() => new URL(app.url()).search).toBe("");
    // Kabar tetap ada walau alamatnya sudah bersih.
    await expect(banner).toBeVisible();
  });

  test("gmail=error&reason=access_denied: kabar galat yang jelas, kode mentah tidak tampil", async ({ app }) => {
    await app.goto("/settings?gmail=error&reason=access_denied");
    const banner = app.getByTestId("gmail-banner");
    await expect(banner).toHaveAttribute("role", "alert");
    await expect(banner).toContainText("Izin Gmail tidak diberikan");
    await expect(banner).not.toContainText("access_denied");
    await expect.poll(() => new URL(app.url()).search).toBe("");
  });

  test("alasan tidak dikenal memakai kabar umum, bukan teks dari alamat", async ({ app }) => {
    await app.goto("/settings?gmail=error&reason=sesuatu_yang_aneh");
    const banner = app.getByTestId("gmail-banner");
    await expect(banner).toContainText("Gmail belum terhubung");
    await expect(banner).not.toContainText("sesuatu_yang_aneh");
  });

  test("tanpa parameter Gmail tidak ada kabar", async ({ app }) => {
    await app.goto("/settings");
    await expect(app.getByRole("heading", { name: "Pengaturan", level: 1 })).toBeVisible();
    await expect(app.getByTestId("gmail-banner")).toHaveCount(0);
  });
});

test.describe("Pengaturan: kartu yang fiturnya mati", () => {
  test("Kunci API Sendiri dan Notifikasi WhatsApp menampilkan Belum tersedia, bukan galat atau istilah teknis", async ({ app, backend }) => {
    backend.state.notificationStatus = { telegram: false, notificationsEnabled: false, whatsappKapso: false, email: false };
    await app.goto("/settings");

    await expect(app.getByRole("heading", { name: "Kunci API Sendiri" })).toBeVisible();
    await expect(app.getByTestId("llm-keys-unavailable")).toContainText("Belum tersedia");
    await expect(app.getByRole("heading", { name: "Notifikasi WhatsApp" })).toBeVisible();
    await expect(app.getByTestId("notifications-unavailable")).toContainText("Belum tersedia");

    const text = (await app.locator("main, body").first().innerText()).toLowerCase();
    for (const word of ["kapso", "administrator", "production", "byok", "migrasi", "skema notifikasi"]) {
      expect(text, `teks teknis di halaman: ${word}`).not.toContain(word);
    }
    // Keadaan Belum tersedia bukan galat: tidak ada peringatan merah di kedua kartu.
    await expect(app.getByTestId("llm-keys-unavailable")).not.toHaveAttribute("role", "alert");
    await expect(app.getByRole("alert")).toHaveCount(0);
  });

  test("notifikasi aktif: formulir WhatsApp tampil tanpa nama penyedia", async ({ app }) => {
    await app.goto("/settings");
    await expect(app.getByLabel("Nomor WhatsApp")).toBeVisible();
    await expect(app.getByTestId("notifications-unavailable")).toHaveCount(0);
    expect((await app.locator("body").innerText()).toLowerCase()).not.toContain("kapso");
  });
});

test.describe("Pengaturan: kartu Ekstensi Browser", () => {
  test("langkah pasang, masa berlaku token, dan cadangan bila menyalin ditolak peramban", async ({ app }) => {
    await app.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("NotAllowedError")) } });
    });
    await app.goto("/settings");
    await expect(app.getByTestId("extension-install-steps")).toContainText("Pasang ekstensi Applify");
    await expect(app.getByRole("link", { name: "Baca panduan pasang ekstensi" })).toHaveAttribute("href", "/bantuan#ekstensi");

    await app.getByRole("button", { name: "Hubungkan Ekstensi Chrome/Edge" }).click();
    await expect(app.getByTestId("extension-token-expiry")).toContainText(/Berlaku sampai pukul \d{2}[.:]\d{2} \(/);
    await expect(app.getByTestId("extension-token-expiry")).toContainText("jam lagi");

    await app.getByRole("button", { name: "Salin Token" }).click();
    const fallback = app.getByTestId("extension-token-fallback");
    await expect(fallback).toContainText("belum bisa disalin otomatis");
    await expect(fallback.getByRole("textbox")).toHaveValue("ext_tok_v1.e2e-test-token-value.e2e-signature");
  });
});

test.describe("Unduhan zip ekstensi", () => {
  test("kartu Pengaturan menyediakan tombol unduh dan berkas zip benar-benar terunduh", async ({ app }) => {
    await app.goto("/settings");
    const link = app.getByTestId("extension-download-link");
    await expect(link).toHaveText("Unduh ekstensi (zip)");
    await expect(link).toHaveAttribute("href", "/downloads/applify-extension-uat.zip");

    const [download] = await Promise.all([app.waitForEvent("download"), link.click()]);
    expect(download.suggestedFilename()).toBe("applify-extension-uat.zip");

    // Dilayani sebagai berkas statis (zip), bukan index.html milik rute SPA.
    const res = await app.request.get("/downloads/applify-extension-uat.zip");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).not.toContain("text/html");
    expect((await res.body()).subarray(0, 2).toString()).toBe("PK");
  });

  test("halaman Bantuan #ekstensi memuat enam langkah, catatan, dan tombol unduh", async ({ app }) => {
    await app.goto("/bantuan#ekstensi");
    const steps = app.getByTestId("help-extension-steps").getByRole("listitem");
    await expect(steps).toHaveCount(6);
    await expect(steps.nth(1)).toContainText("chrome://extensions");
    await expect(steps.nth(2)).toContainText("Muat yang belum dikemas");
    await expect(app.getByTestId("help-extension-notes")).toContainText("Jangan hapus atau pindahkan folder hasil ekstrak");
    const download = app.getByTestId("help-extension-download");
    await expect(download).toHaveText("Unduh ekstensi (zip)");
    await expect(download).toHaveAttribute("href", "/downloads/applify-extension-uat.zip");
    await expect(steps.nth(4).getByRole("link", { name: "bagian Ekstensi Browser di Pengaturan" })).toHaveAttribute("href", "/settings#ekstensi");
  });
});

test.describe("Pengaturan Agen", () => {
  test("daftar dipisah koma menjaga spasi dan koma saat mengetik, lalu menyimpan daftar yang rapi", async ({ app, backend }) => {
    backend.state.settings = { search_keywords: ["Designer"], pause_before_submit: true };
    await app.goto("/automation-settings");
    await app.getByRole("tab", { name: "Pencarian" }).click();

    const keywords = app.getByLabel("Kata kunci pencarian (pisahkan dengan koma)");
    await expect(keywords).toHaveValue("Designer");
    await keywords.fill("");
    await keywords.pressSequentially("React, ", { delay: 10 });
    // Dulu spasi dan koma yang baru diketik langsung hilang.
    await expect(keywords).toHaveValue("React, ");
    await keywords.pressSequentially("Node ,, Go", { delay: 10 });
    await expect(keywords).toHaveValue("React, Node ,, Go");
    await keywords.blur();
    await expect(keywords).toHaveValue("React, Node, Go");

    await app.getByRole("button", { name: "Simpan Pengaturan" }).click();
    await expect.poll(() => backend.callsTo("PUT", "/api/automation/settings").length).toBe(1);
    expect(backend.callsTo("PUT", "/api/automation/settings")[0].body).toMatchObject({ search_keywords: ["React", "Node", "Go"] });
  });

  test("gaji dikosongkan dikirim null, masa pemberitahuan kosong tidak tampil 30", async ({ app, backend }) => {
    backend.state.settings = { desired_salary: 8000000, current_ctc: null, notice_period: null };
    await app.goto("/automation-settings");
    await app.getByRole("tab", { name: "Jawaban Lamaran" }).click();

    const desired = app.getByLabel("Gaji yang diharapkan (Rp, sesuai isian formulir)");
    const notice = app.getByLabel("Masa pemberitahuan (hari)");
    await expect(desired).toHaveValue("8000000");
    await expect(notice).toHaveValue("");
    await desired.fill("");
    await app.getByRole("button", { name: "Simpan Pengaturan" }).click();

    await expect.poll(() => backend.callsTo("PUT", "/api/automation/settings").length).toBe(1);
    const body = backend.callsTo("PUT", "/api/automation/settings")[0].body as Record<string, unknown>;
    expect(body.desired_salary).toBeNull();
    expect(body.notice_period).toBeNull();
    expect(body.current_ctc).toBeNull();
  });

  test("sakelar ekstensi otomatis: bawaan mati, menyala lalu tersimpan sebagai extension_auto_use", async ({ app, backend }) => {
    backend.state.settings = {};
    await app.goto("/automation-settings");
    await app.getByRole("tab", { name: "Perilaku Agen" }).click();

    const toggle = app.getByRole("switch", { name: "Pakai ekstensi browser otomatis untuk situs yang perlu login" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(app.getByText(/kamu yang menekan Kirim/)).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await app.getByRole("button", { name: "Simpan Pengaturan" }).click();

    await expect.poll(() => backend.callsTo("PUT", "/api/automation/settings").length).toBe(1);
    expect(backend.callsTo("PUT", "/api/automation/settings")[0].body).toMatchObject({ extension_auto_use: true });
  });

  test("kontrol yang tidak dibaca siapa pun tidak ditampilkan", async ({ app }) => {
    await app.goto("/automation-settings");
    await app.getByRole("tab", { name: "Pencarian" }).click();
    await expect(app.getByRole("switch", { name: /Easy Apply/ })).toHaveCount(0);
    await app.getByRole("tab", { name: "Perilaku Agen" }).click();
    await expect(app.getByRole("switch", { name: /jawaban terbaru/ })).toHaveCount(0);
    // Persetujuan sebelum kirim selalu wajib: tidak ada saklar, hanya keterangan tetap.
    await expect(app.getByRole("switch", { name: "Berhenti sebelum mengirim" })).toHaveCount(0);
    await expect(app.getByTestId("always-approve-note")).toBeVisible();
  });
});

test.describe("Pusat Notifikasi In-App (AppShell)", () => {
  test("lonceng menampilkan jumlah belum dibaca, membuka daftar, dan menandai semua dibaca lewat backend", async ({ app, backend }) => {
    backend.state.inAppNotifications = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        event: "ready",
        title: "Applify: Siap ditinjau",
        body: "Cek halaman Persetujuan.",
        href: "/approvals",
        read_at: null,
        created_at: "2026-11-26T09:00:00Z",
      },
    ];
    await app.goto("/settings");
    const bell = app.getByTestId("in-app-notifications-bell").first();
    await expect(bell).toBeVisible();
    await expect(bell.getByTestId("in-app-notifications-badge")).toHaveText("1");

    await bell.click();
    await expect(app.getByTestId("in-app-notifications-list")).toContainText("Applify: Siap ditinjau");
    await app.getByTestId("in-app-notifications-mark-all").click();
    await expect.poll(() => backend.callsTo("POST", "/api/notifications/in-app/read").length).toBe(1);
    await expect(bell.getByTestId("in-app-notifications-badge")).toHaveCount(0);
  });
});
