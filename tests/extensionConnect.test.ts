import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EXTENSION_COPY_FAILED_TEXT,
  EXTENSION_INSTALL_STEPS,
  copyToClipboard,
  describeTokenExpiry,
} from "../src/lib/extensionConnect.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

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

test("langkah pasang menyebut panduan dan tidak memuat istilah pengembang", () => {
  assert.equal(EXTENSION_INSTALL_STEPS.length, 3);
  assert.match(EXTENSION_INSTALL_STEPS[0], /Pasang ekstensi Applify .*\(lihat panduan\)/);
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
  const fourHours = describeTokenExpiry("2026-11-24T10:00:00Z", now, "UTC");
  assert.match(fourHours, /^Berlaku sampai pukul 10[.:]00 \(sekitar 4 jam lagi\)\. Sesudah itu, buat token baru\.$/);
  assert.match(describeTokenExpiry("2026-11-24T06:20:00Z", now, "UTC"), /\(20 menit lagi\)/);
  assert.match(describeTokenExpiry("2026-11-24T05:00:00Z", now, "UTC"), /sudah tidak berlaku/);
  assert.equal(describeTokenExpiry("bukan tanggal", now), "");
  assert.equal(describeTokenExpiry(undefined, now), "");
  assert.doesNotMatch(fourHours, /scope|extension:apply|ISO|T\d\d:/);
});
