import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  EXTENSION_COPY_FAILED_TEXT,
  EXTENSION_DOWNLOAD_FILENAME,
  EXTENSION_DOWNLOAD_HREF,
  EXTENSION_DOWNLOAD_LABEL,
  EXTENSION_DOWNLOAD_SHA256,
  EXTENSION_DOWNLOAD_VERSION,
  EXTENSION_GUIDE_HREF,
  EXTENSION_INSTALL_STEPS,
  EXTENSION_TOKEN_TTL_LABEL,
  EXTENSION_TOKEN_TTL_SECONDS,
  copyToClipboard,
  describeTokenExpiry,
} from "../src/lib/extensionConnect.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("FE meminta token ekstensi 8 jam lewat konstanta bersama, tanpa sisa angka 4 jam (14400)", () => {
  const api = read("../src/services/automationApi.ts");
  const card = read("../src/components/ExtensionConnectCard.tsx");
  assert.match(api, /createExtensionToken\(ttlSeconds: number = EXTENSION_TOKEN_TTL_SECONDS\)/);
  assert.match(card, /createExtensionToken\(EXTENSION_TOKEN_TTL_SECONDS\)/);
  for (const src of [api, card]) assert.doesNotMatch(src, /14400/);
});

test("Pengaturan Ekstensi Chrome/Edge tersambung ke /api/extension/token dan menjaga aturan Firefox + tanpa teks terlarang", () => {
  const settings = read("../src/routes/settings.tsx");
  assert.match(settings, /ExtensionConnectCard/);
  assert.match(settings, /Pasang untuk Firefox/);
  assert.doesNotMatch(settings, /Install untuk Chrome/);

  const card = read("../src/components/ExtensionConnectCard.tsx");
  assert.match(card, /createExtensionToken/);
  assert.match(card, /LinkedIn tetap harus dilamar manual/);
  assert.doesNotMatch(card, /manual-only|\(scope:/);

  const api = read("../src/services/automationApi.ts");
  assert.match(api, /\/api\/extension\/token/);
});

test("JobCard dan AIApplyModal menampilkan klasifikasi kanal dan mematikan isi otomatis di LinkedIn", () => {
  const jobCard = read("../src/components/JobCard.tsx");
  assert.match(jobCard, /classifyJobChannel\(job\)/);

  const modal = read("../src/components/AIApplyModal.tsx");
  assert.match(modal, /classifyJobChannel/);
  assert.match(modal, /!channelInfo\.manualOnly/);
});

test("kartu ekstensi: langkah pasang, salin dengan cadangan, dan masa berlaku dalam kata biasa", () => {
  const card = read("../src/components/ExtensionConnectCard.tsx");
  assert.match(card, /EXTENSION_INSTALL_STEPS\.map/);
  assert.match(card, /data-testid="extension-install-steps"/);
  assert.match(card, /copyToClipboard\(text, typeof navigator === "undefined" \? null : navigator\)/);
  assert.doesNotMatch(card, /await navigator\.clipboard\.writeText/);
  // Cadangan: token utuh di kotak yang bisa dipilih bila menyalin gagal.
  assert.match(card, /data-testid="extension-token-fallback"/);
  assert.match(card, /readOnly\s+value=\{issued\.token\}/);
  assert.match(card, /e\.currentTarget\.select\(\)/);
  assert.match(card, /describeTokenExpiry\(issued\.expiresAt\)/);
});

test("langkah pasang menegaskan khusus laptop, menaut ke panduan nyata, dan tidak memuat istilah pengembang", () => {
  assert.equal(EXTENSION_INSTALL_STEPS.length, 3);
  assert.match(EXTENSION_INSTALL_STEPS[0], /Pasang ekstensi Applify khusus laptop \(Chrome atau Edge\)/);
  assert.match(EXTENSION_INSTALL_STEPS[0], /tidak bisa dipasang di HP/i);
  assert.doesNotMatch(EXTENSION_INSTALL_STEPS[0], /\(lihat panduan\)/);
  assert.equal(EXTENSION_GUIDE_HREF, "/bantuan#ekstensi");
  const card = read("../src/components/ExtensionConnectCard.tsx");
  assert.match(card, /href=\{EXTENSION_GUIDE_HREF\}/);
  assert.doesNotMatch(EXTENSION_INSTALL_STEPS.join(" ") + EXTENSION_COPY_FAILED_TEXT, /administrator|env|localhost|scope|manifest/i);
});

test("salin ke papan klip: berhasil, ditolak, atau tidak ada Clipboard API", async () => {
  const written: string[] = [];
  assert.equal(await copyToClipboard("abc", { clipboard: { writeText: async (t) => { written.push(t); } } }), true);
  assert.deepEqual(written, ["abc"]);
  assert.equal(await copyToClipboard("abc", { clipboard: { writeText: async () => { throw new Error("NotAllowedError"); } } }), false);
  assert.equal(await copyToClipboard("abc", { clipboard: null }), false);
  assert.equal(await copyToClipboard("abc", {}), false);
  assert.equal(await copyToClipboard("abc", null), false);
});

test("masa berlaku token dalam kata biasa: jam, sisa waktu, sudah lewat, dan tidak terbaca", () => {
  const now = Date.parse("2026-11-24T06:00:00Z");
  const fourHours = describeTokenExpiry("2026-11-24T14:00:00Z", now, "UTC");
  assert.match(fourHours, /^Berlaku sampai pukul 14[.:]00 \(sekitar 8 jam lagi\)\. Sesudah itu, buat token baru\.$/);
  // Token baru diminta 8 jam, sama dengan DEFAULT_EXTENSION_TTL_SEC dan batas MAX di backend (keputusan Hans 26 Nov).
  assert.equal(EXTENSION_TOKEN_TTL_SECONDS, 28_800);
  assert.equal(EXTENSION_TOKEN_TTL_LABEL, "8 jam");
  assert.match(describeTokenExpiry("2026-11-24T06:20:00Z", now, "UTC"), /\(20 menit lagi\)/);
  assert.match(describeTokenExpiry("2026-11-24T05:00:00Z", now, "UTC"), /sudah tidak berlaku/);
  assert.equal(describeTokenExpiry("bukan tanggal", now), "");
  assert.equal(describeTokenExpiry(undefined, now), "");
  assert.doesNotMatch(fourHours, /scope|extension:apply|ISO|T\d\d:/);
});

test("unduhan zip ekstensi: tombol di kartu, berkas ada di public/downloads, dan rewrite SPA tidak menelan /downloads", () => {
  assert.equal(EXTENSION_DOWNLOAD_HREF, `/downloads/${EXTENSION_DOWNLOAD_FILENAME}`);
  assert.equal(EXTENSION_DOWNLOAD_LABEL, "Unduh ekstensi (zip)");
  assert.match(EXTENSION_DOWNLOAD_VERSION, /^\d+\.\d+\.\d+$/);

  const card = read("../src/components/ExtensionConnectCard.tsx");
  assert.match(card, /href=\{EXTENSION_DOWNLOAD_HREF\}/);
  assert.match(card, /data-testid="extension-download-link"/);
  assert.match(card, /\{EXTENSION_DOWNLOAD_LABEL\}/);
  assert.match(card, /href=\{EXTENSION_GUIDE_HREF\}/);

  // Berkas statis: zip sungguhan, berisi manifest.json, dan sama dengan SHA256 yang tercatat di konstanta.
  const zip = readFileSync(new URL(`../public/downloads/${EXTENSION_DOWNLOAD_FILENAME}`, import.meta.url));
  assert.equal(zip.subarray(0, 4).toString("hex"), "504b0304", "bukan berkas zip");
  assert.ok(zip.length > 10_000, "zip terlalu kecil");
  assert.ok(zip.includes(Buffer.from("manifest.json")), "manifest.json tidak ada di zip");
  assert.equal(createHash("sha256").update(zip).digest("hex"), EXTENSION_DOWNLOAD_SHA256);

  // Rewrite SPA di vercel.json: semua rute aplikasi tetap ke index.html, /downloads/* tidak.
  const vercel = JSON.parse(read("../vercel.json")) as {
    rewrites: { source: string; destination: string }[];
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const spa = vercel.rewrites.find((r) => r.destination === "/index.html");
  assert.ok(spa, "rewrite SPA tidak ada");
  const spaRegex = new RegExp(`^${spa.source}$`);
  for (const path of ["/", "/bantuan", "/settings", "/approvals", "/downloadsaya"]) assert.ok(spaRegex.test(path), `rute aplikasi harus ke index.html: ${path}`);
  assert.ok(!spaRegex.test(EXTENSION_DOWNLOAD_HREF), "rewrite SPA menelan /downloads");
  assert.ok(!spaRegex.test("/downloads/apa-saja.zip"), "rewrite SPA menelan /downloads/*");

  const dlHeaders = vercel.headers.find((h) => h.source === EXTENSION_DOWNLOAD_HREF)?.headers ?? [];
  assert.equal(dlHeaders.find((h) => h.key === "Content-Type")?.value, "application/zip");
  assert.match(dlHeaders.find((h) => h.key === "Content-Disposition")?.value ?? "", /^attachment; filename="applify-extension-uat\.zip"$/);
});
