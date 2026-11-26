import { expect, test } from "./helpers/test";
import { jobRow } from "./helpers/fixtures";

/**
 * Polesan halaman Lowongan dari uji E2E production 26 November 2026 (Gemini di Brave): chip "Semua" harus melepas
 * penyaring tempat kerja (di sini "Di kantor", yang memakai saringan server yang sama dengan "Remote" dan "Hybrid"),
 * dan layar tidak boleh tampak macet di keadaan kosong milik penyaring sebelumnya sementara jawaban baru belum datang.
 */

test.describe("Lowongan: penyaring tempat kerja", () => {
  test("klik Semua melepas penyaring tempat kerja: tombolnya tidak lagi aktif dan daftar lowongan kembali", async ({ app, backend }) => {
    backend.state.jobs = [
      jobRow("job-a", { title: "Staff Finance", company: "PT Alfa", location: "Surabaya", workplace_type: "on-site", status: "active", platform_source: "jobstreet", external_url: "https://id.jobstreet.com/id/job/1001" }),
      jobRow("job-b", { title: "Remote Engineer", company: "PT Beta", location: "Remote", workplace_type: "remote", status: "active", platform_source: "jobstreet", external_url: "https://id.jobstreet.com/id/job/1002" }),
    ];
    await app.goto("/jobs");
    const group = app.getByRole("group", { name: "Saring lowongan" });
    const onsite = group.getByRole("button", { name: "Di kantor", exact: true });
    const all = group.getByRole("button", { name: "Semua", exact: true });

    await onsite.click();
    await expect(onsite).toHaveAttribute("aria-pressed", "true");
    await expect(all).toHaveAttribute("aria-pressed", "false");

    await all.click();
    await expect(all).toHaveAttribute("aria-pressed", "true");
    await expect(onsite).toHaveAttribute("aria-pressed", "false");
    // Sesudah jawaban baru datang, kedua lowongan tampil lagi.
    await expect(app.getByRole("list", { name: "Daftar lowongan" })).toBeVisible();
    await expect(app.getByText("Staff Finance")).toBeVisible();
    await expect(app.getByText("Remote Engineer")).toBeVisible();
  });
});
