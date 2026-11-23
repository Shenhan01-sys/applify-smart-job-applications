import { expect, test } from "./helpers/test";

/**
 * Tes untuk harness itu sendiri: bila penjaga lalu lintas atau tiruan tidak bekerja, semua tes lain bisa lulus
 * tanpa bukti. Di sini ditunjukkan bahwa pelanggaran memang terdeteksi.
 */

test.describe("harness", () => {
  test("permintaan ke host luar dibatalkan di peramban dan tercatat sebagai pelanggaran", async ({ app, guard }) => {
    await app.goto("/approvals");
    const outcome = await app.evaluate(() =>
      fetch("https://api.example.test/leak", { method: "POST", body: "x" }).then(
        () => "lolos",
        () => "dibatalkan",
      ),
    );
    expect(outcome).toBe("dibatalkan");
    expect(guard.blocked).toEqual(["POST https://api.example.test/leak"]);
    // Pelanggaran ini disengaja: dikosongkan supaya pemeriksaan penutup fixture tidak ikut gagal.
    guard.blocked.length = 0;
  });

  test("hanya CSS dan berkas font dari Google Fonts (perilaku index.html) yang ditoleransi", async ({ app, guard }) => {
    await app.goto("/approvals");
    expect(guard.blocked).toEqual([]);
    for (const url of guard.tolerated) expect(new URL(url).hostname).toMatch(/^fonts\.(googleapis|gstatic)\.com$/);
  });

  test("panggilan API yang tidak ditiru dijawab 501 dan dicatat, bukan dijawab diam-diam", async ({ app, backend }) => {
    await app.goto("/approvals");
    const status = await app.evaluate(() => fetch("/mock-api/api/tidak-ada").then((r) => r.status));
    expect(status).toBe(501);
    expect(backend.unmocked).toEqual(["API GET /api/tidak-ada"]);
    backend.unmocked.length = 0;
  });

  test("tanpa sesi login, halaman Persetujuan mengalihkan ke /login (sesi palsu memang yang membuka halamannya)", async ({ app }) => {
    // Skrip awal dijalankan berurutan: yang ini mengosongkan sesi yang ditanam fixture.
    await app.addInitScript(() => window.localStorage.clear());
    await app.goto("/approvals");
    await expect(app).toHaveURL(/\/login$/);
  });
});
