import { expect, test } from "./helpers/test";
import { approval, isoAgo, jobRow } from "./helpers/fixtures";

/**
 * Alur Impor Lowongan Off-Portal (Gelombang 3) pada halaman /jobs:
 * 1. Pratinjau multi-posisi (Google Form, Email HR, WhatsApp) + laporan anti-scam.
 * 2. Simpan privat aman-migrasi: pesan jelas tanpa galat saat kolom migrasi belum tersedia.
 * 3. Simpan privat berhasil -> langsung buka AIApplyModal ("Buat Draf & Persetujuan").
 */

const SAMPLE_PARSE_RESPONSE = {
  sourceType: "off_portal_poster",
  sourceGroupId: "grp-poster-e2e",
  acceptedUrls: ["https://docs.google.com/forms/d/e/1FAIpQLSeDemo/viewform", "https://wa.me/6281234567890"],
  rejectedUrls: [],
  warnings: ["Kode QR terdeteksi dari poster dan digabungkan ke kandidat."],
  ocr: {
    ran: true,
    status: "ok",
    textLength: 140,
    truncated: false,
  },
  qr: {
    decodedUrls: ["https://docs.google.com/forms/d/e/1FAIpQLSeDemo/viewform"],
    method: "pure-png",
  },
  jobs: [
    {
      title: "Frontend Engineer",
      company: "PT Nusantara Digital",
      location: "Jakarta Selatan",
      workplaceType: "hybrid",
      description: "Lowongan Frontend Engineer via Google Form atau email HR.",
      applyUrl: "https://docs.google.com/forms/d/e/1FAIpQLSeDemo/viewform",
      applyEmail: "hr@nusantara.co.id",
      whatsappUrl: null,
      formProvider: "google_forms",
      sourceType: "off_portal_poster",
      sourceGroupId: "grp-poster-e2e",
      publicationFingerprint: "fp-frontend-e2e-1",
      channel: {
        channel: "extension",
        platform: "google_forms",
        extensionSupported: true,
        manualOnly: false,
        reason: "Formulir Google Form",
      },
      safety: {
        riskLevel: "low",
        flags: [],
      },
    },
    {
      title: "Admin Lapangan Cepat Cair",
      company: "CV Kilat Bersama",
      location: "Indonesia",
      workplaceType: null,
      description: "Daftar lewat WA, bayar biaya registrasi seragam.",
      applyUrl: "https://wa.me/6281234567890",
      applyEmail: null,
      whatsappUrl: "https://wa.me/6281234567890",
      formProvider: null,
      sourceType: "off_portal_poster",
      sourceGroupId: "grp-poster-e2e",
      publicationFingerprint: "fp-wa-scam-e2e-2",
      channel: {
        channel: "manual",
        platform: "whatsapp",
        extensionSupported: false,
        manualOnly: true,
        reason: "WhatsApp Manual",
      },
      safety: {
        riskLevel: "high",
        flags: [
          {
            code: "upfront_fee",
            severity: "high",
            label: "Indikasi permintaan biaya di awal",
            detail: "Teks menyebut biaya registrasi seragam.",
          },
        ],
      },
    },
  ],
};

test.describe("Lowongan Off-Portal (Gelombang 3)", () => {
  test("pratinjau multi-kandidat + anti-scam + pesan aman saat migrasi kolom privat belum dijalankan", async ({ app, backend }) => {
    backend.state.offPortalParse = SAMPLE_PARSE_RESPONSE;
    backend.state.offPortalSave = {
      saved: false,
      migrationRequired: true,
      code: "private_jobs_migration_required",
      message: "Kolom penyimpanan lowongan pribadi belum diaktifkan di database. Pratinjau tetap aman digunakan.",
      jobs: [],
    };

    await app.goto("/jobs");
    await app.getByTestId("open-offportal-modal").click();

    const dialog = app.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Impor Lowongan dari Poster, Caption, atau Link" })).toBeVisible();

    await dialog.locator("#offportal-caption").fill("PT Nusantara Digital Hiring: Frontend Engineer & Admin Lapangan");
    await dialog.getByRole("button", { name: "Analisis & Pratinjau" }).click();

    // Kedua kandidat tampil dengan kanal dan laporan anti-scam masing-masing.
    const preview = dialog.getByTestId("offportal-preview");
    await expect(preview.getByText("Frontend Engineer")).toBeVisible();
    await expect(preview.getByText("Google Form · Ekstensi")).toBeVisible();
    await expect(preview.getByText("Admin Lapangan Cepat Cair")).toBeVisible();
    await expect(preview.getByText("WhatsApp Manual")).toBeVisible();
    await expect(preview.getByText("Risiko tinggi (1)")).toBeVisible();
    await expect(preview.getByText(/Indikasi permintaan biaya di awal/)).toBeVisible();

    // Simpan privat saat migrasi belum ada -> pesan kuning jelas, tidak crash.
    await dialog.getByRole("button", { name: "Simpan 2 Lowongan Pribadi" }).click();
    const notice = dialog.getByTestId("offportal-migration-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Kolom penyimpanan lowongan pribadi belum diaktifkan");
    expect(backend.callsTo("POST", "/api/jobs/off-portal/save")).toHaveLength(1);
  });

  test("simpan privat berhasil lalu buka modal Buat Draf & Persetujuan untuk lowongan tersimpan", async ({ app, backend }) => {
    backend.state.offPortalParse = {
      ...SAMPLE_PARSE_RESPONSE,
      jobs: [SAMPLE_PARSE_RESPONSE.jobs[0]],
    };
    backend.state.offPortalSave = {
      saved: true,
      migrationRequired: false,
      message: "1 lowongan pribadi berhasil disimpan.",
      jobs: [
        {
          id: "job-priv-1",
          title: "Frontend Engineer",
          company: "PT Nusantara Digital",
          location: "Jakarta Selatan",
          type: "full-time",
          workplace_type: "hybrid",
          description: "Lowongan Frontend Engineer via email HR hr@nusantara.co.id",
          platform_source: "off_portal_poster",
          external_url: "https://docs.google.com/forms/d/e/1FAIpQLSeDemo/viewform",
          status: "active",
          visibility: "private",
          source_type: "off_portal_poster",
          source_group_id: "grp-poster-e2e",
          publication_fingerprint: "fp-frontend-e2e-1",
          alreadySaved: false,
        },
      ],
    };

    await app.goto("/jobs");
    await app.getByTestId("open-offportal-modal").click();

    const dialog = app.getByRole("dialog");
    await dialog.locator("#offportal-url").fill("https://docs.google.com/forms/d/e/1FAIpQLSeDemo/viewform");
    await dialog.getByRole("button", { name: "Analisis & Pratinjau" }).click();

    await expect(dialog.getByText("Frontend Engineer")).toBeVisible();
    await dialog.getByRole("button", { name: "Simpan 1 Lowongan Pribadi" }).click();

    const savedPanel = dialog.getByTestId("offportal-saved-panel");
    await expect(savedPanel).toBeVisible();
    await expect(savedPanel).toContainText("1 lowongan pribadi berhasil disimpan.");

    await savedPanel.getByRole("button", { name: "Buat Draf & Persetujuan" }).click();

    // Modal AIApplyModal terbuka dengan judul lowongan privat yang baru disimpan.
    const applyDialog = app.getByRole("dialog");
    await expect(applyDialog).toBeVisible();
    await expect(applyDialog.getByText("Frontend Engineer")).toBeVisible();
    await expect(applyDialog.getByText("PT Nusantara Digital")).toBeVisible();
  });

  test("modal Impor tertutup lewat Escape dan tombol Tutup sesudah simpan, dan dibuka lagi dalam keadaan bersih", async ({ app, backend }) => {
    const parseOne = { ...SAMPLE_PARSE_RESPONSE, jobs: [SAMPLE_PARSE_RESPONSE.jobs[0]] };
    backend.state.offPortalParse = parseOne;
    backend.state.offPortalSave = {
      saved: true,
      migrationRequired: false,
      message: "1 lowongan pribadi berhasil disimpan.",
      jobs: [
        {
          id: "job-priv-close",
          title: "Frontend Engineer",
          company: "PT Nusantara Digital",
          location: "Jakarta Selatan",
          type: "full-time",
          workplace_type: "hybrid",
          description: "x",
          platform_source: "off_portal_caption",
          external_url: null,
          status: "active",
          visibility: "private",
          source_type: "off_portal_caption",
          source_group_id: "grp-poster-e2e",
          publication_fingerprint: "fp-frontend-e2e-1",
          alreadySaved: false,
        },
      ],
    };

    await app.goto("/jobs");
    for (const how of ["escape", "tutup", "x", "escape-from-textarea"] as const) {
      await app.getByTestId("open-offportal-modal").click();
      const dialog = app.getByRole("dialog");
      // Dibuka lagi: kolom dan hasil lama sudah bersih.
      await expect(dialog.locator("#offportal-caption")).toHaveValue("");
      await expect(dialog.getByTestId("offportal-preview")).toHaveCount(0);
      await dialog.locator("#offportal-caption").fill("Frontend Engineer di PT Nusantara Digital");
      await dialog.getByRole("button", { name: "Analisis & Pratinjau" }).click();
      await dialog.getByRole("button", { name: "Simpan 1 Lowongan Pribadi" }).click();
      await expect(dialog.getByTestId("offportal-saved-panel")).toBeVisible();

      if (how === "escape") await app.keyboard.press("Escape");
      else if (how === "tutup") await dialog.getByTestId("offportal-close").click();
      else if (how === "x") await dialog.locator("button:has(> span.sr-only)").click();
      else {
        await dialog.locator("#offportal-caption").focus();
        await app.keyboard.press("Escape");
      }
      await expect(app.getByRole("dialog")).toHaveCount(0);
    }
  });

  test("link postingan Instagram/X: petunjuk tempel caption langsung tampil, dan hasil needsCaption memberi panduan tanpa kandidat palsu", async ({ app, backend }) => {
    backend.state.offPortalParse = {
      sourceGroupId: "",
      sourceType: "off_portal_link",
      acceptedUrls: ["https://www.instagram.com/p/DgH95gJmZos/"],
      rejectedUrls: [],
      jobs: [],
      socialPosts: [{ url: "https://www.instagram.com/p/DgH95gJmZos/", platform: "instagram", label: "Instagram" }],
      needsCaption: true,
      warnings: ["Tautan postingan Instagram tidak bisa dibaca otomatis karena platform itu meminta login."],
    };
    await app.goto("/jobs");
    await app.getByTestId("open-offportal-modal").click();
    const dialog = app.getByRole("dialog");

    await dialog.locator("#offportal-url").fill("https://www.instagram.com/p/DgH95gJmZos/");
    await expect(dialog.getByTestId("offportal-social-hint")).toContainText("Instagram");
    await expect(dialog.getByTestId("offportal-social-hint")).toContainText("tempel di kolom caption");
    // Tautan biasa tidak memunculkan petunjuk itu.
    await dialog.locator("#offportal-url").fill("https://jobs.lever.co/acme/123");
    await expect(dialog.getByTestId("offportal-social-hint")).toHaveCount(0);

    await dialog.locator("#offportal-url").fill("https://www.instagram.com/p/DgH95gJmZos/");
    await dialog.getByRole("button", { name: "Analisis & Pratinjau" }).click();
    await expect(dialog.getByTestId("offportal-needs-caption")).toContainText("Tempel caption postingannya");
    await expect(dialog.getByRole("button", { name: /Simpan \d+ Lowongan Pribadi/ })).toHaveCount(0);
    await expect(dialog.getByTestId("offportal-preview").getByText(/meminta login/)).toBeVisible();
    // Fokus pindah ke kolom caption.
    await expect(dialog.locator("#offportal-caption")).toBeFocused();
  });

  test("kartu pratinjau: LinkedIn diberi peringatan lamar manual, dan bidang yang tidak terbaca ditandai", async ({ app, backend }) => {
    const base = SAMPLE_PARSE_RESPONSE.jobs[0];
    backend.state.offPortalParse = {
      ...SAMPLE_PARSE_RESPONSE,
      warnings: [],
      jobs: [
        {
          ...base,
          title: "Product Manager",
          company: "BitgetWallet",
          location: "Global",
          applyUrl: "https://www.linkedin.com/company/bitget-wallet/jobs/",
          applyEmail: null,
          formProvider: null,
          publicationFingerprint: "fp-linkedin-1",
          channel: { channel: "auth_portal", platform: "off_portal_caption", extensionSupported: false, manualOnly: true, reason: "LinkedIn manual" },
          unreadFields: [],
          warnings: ["Lowongan LinkedIn wajib dilamar manual di LinkedIn."],
        },
        {
          ...base,
          title: "Lowongan Off-Portal",
          company: "Perusahaan (Off-Portal)",
          location: "Indonesia",
          applyUrl: null,
          applyEmail: null,
          formProvider: null,
          publicationFingerprint: "fp-unread-2",
          channel: { channel: "external_web", platform: "off_portal_caption", extensionSupported: false, manualOnly: false, reason: "" },
          unreadFields: ["title", "company", "location"],
          warnings: [],
        },
      ],
    };
    await app.goto("/jobs");
    await app.getByTestId("open-offportal-modal").click();
    const dialog = app.getByRole("dialog");
    await dialog.locator("#offportal-caption").fill("Teks apa saja");
    await dialog.getByRole("button", { name: "Analisis & Pratinjau" }).click();

    const preview = dialog.getByTestId("offportal-preview");
    await expect(preview.getByText("LinkedIn · Lamar Manual")).toBeVisible();
    await expect(preview.getByTestId("offportal-job-warnings")).toContainText("wajib dilamar manual");
    await expect(preview.getByTestId("offportal-unread-note")).toContainText("Belum terbaca dari teks: posisi, perusahaan dan lokasi");
    await expect(preview.getByTestId("offportal-unread-note")).toHaveCount(1);
  });

  test("handoff Google Forms dari worker ke ekstensi menampilkan pertanyaan wajib tanpa blok izin ekstensi", async ({ app, backend }) => {
    const gfUrl = "https://docs.google.com/forms/d/e/1FAIpQLSeDemo/viewform";
    backend.state.jobs = [
      jobRow("job-gf-1", {
        title: "Product Engineer",
        company: "PT Form Publik",
        external_url: gfUrl,
        platform_source: "off_portal_poster",
      }),
    ];
    backend.state.history = [
      approval("apr-gf-1", {
        job_id: "job-gf-1",
        job_title: "Product Engineer",
        company: "PT Form Publik",
        platform: "google_forms",
        status: "approved",
        reviewed_at: isoAgo(1),
      }),
    ];
    backend.state.queue = [
      {
        id: "q-gf-1",
        job_type: "apply",
        status: "completed",
        created_at: isoAgo(1),
        payload: { approval_request_id: "apr-gf-1", job_id: "job-gf-1" },
      },
    ];
    backend.state.logs = [
      {
        id: "log-gf-1",
        action: "apply",
        job_id: "job-gf-1",
        status: "incomplete",
        created_at: isoAgo(1),
        details: {
          queue_job_id: "q-gf-1",
          approval_request_id: "apr-gf-1",
          reason: "google_forms_missing_required",
          extension_handoff: true,
          handoff_reason: "missing_required",
          fields_filled: 3,
          remaining_required: ["Ceritakan proyek sistem terdistribusi tersulitmu"],
          questions: [
            {
              key: "ceritakan proyek sistem terdistribusi tersulitmu",
              label: "Ceritakan proyek sistem terdistribusi tersulitmu",
              kind: "textarea",
            },
          ],
        },
      },
    ];

    await app.goto("/approvals");
    await expect(app.getByText("Product Engineer")).toBeVisible();
    await expect(app.getByText("Ceritakan proyek sistem terdistribusi tersulitmu", { exact: true })).toBeVisible();
    await expect(app.getByTestId("extension-consent")).toHaveCount(0);
    await expect(app.getByRole("button", { name: /Simpan jawaban dan jalankan agen lagi/ })).toBeVisible();
  });

  test("log ekstensi incomplete + partly_filled + questions_pending > 0 menampilkan pertanyaan dan Simpan jawaban tanpa blok izin ekstensi", async ({ app, backend }) => {
    backend.state.jobs = [
      jobRow("job-js-1", {
        title: "Fullstack Developer",
        company: "PT Portal Kerja",
        external_url: "https://id.jobstreet.com/id/job/123456",
        platform_source: "jobstreet",
      }),
    ];
    backend.state.history = [
      approval("apr-js-1", {
        job_id: "job-js-1",
        job_title: "Fullstack Developer",
        company: "PT Portal Kerja",
        platform: "jobstreet",
        status: "approved",
        reviewed_at: isoAgo(1),
      }),
    ];
    backend.state.queue = [
      {
        id: "q-ext-js-1",
        job_type: "extension_apply",
        status: "completed",
        created_at: isoAgo(1),
        payload: { approval_request_id: "apr-js-1", job_id: "job-js-1" },
      },
    ];
    backend.state.logs = [
      {
        id: "log-ext-js-1",
        action: "apply",
        job_id: "job-js-1",
        status: "incomplete",
        created_at: isoAgo(1),
        details: {
          channel: "extension",
          approval_request_id: "apr-js-1",
          reason: "partly_filled",
          fields_filled: 4,
          questions_pending: 1,
          questions: [
            {
              key: "bersedia kerja shift",
              label: "Bersedia kerja shift?",
              kind: "radio",
              options: ["Ya", "Tidak"],
            },
          ],
        },
      },
    ];

    await app.goto("/approvals");
    await expect(app.getByText("Fullstack Developer")).toBeVisible();
    await expect(app.getByText("Bersedia kerja shift?", { exact: true })).toBeVisible();
    await expect(app.getByTestId("extension-consent")).toHaveCount(0);
    await expect(app.getByRole("button", { name: /Simpan jawaban dan jalankan ekstensi lagi/ })).toBeVisible();
  });
});
