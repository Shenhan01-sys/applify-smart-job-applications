import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyJobChannel } from "../src/lib/applyChannel.ts";
import {
  EXTENSION_GUIDE_HREF,
  EXTENSION_GUIDE_LINK_LABEL,
  EXTENSION_INSTALL_STEPS,
  EXTENSION_LAPTOP_ONLY_NOTE,
  EXTENSION_TOKEN_PASTE_WARNING,
} from "../src/lib/extensionConnect.ts";
import {
  EXTENSION_BANNER_DISMISSED_KEY,
  SCANNER_BUTTON_LABEL,
  dismissExtensionBanner,
  isExtensionBannerDismissed,
  isTestListingQuery,
  jobsEmptyState,
  matchesJobSearch,
} from "../src/lib/jobFilters.ts";
import { describeQueueError } from "../src/lib/emailApply.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const stripComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

test("ON-05: panduan ekstensi punya tautan nyata /bantuan#ekstensi, anchor #ekstensi di Pengaturan, dan keterangan khusus laptop", () => {
  assert.equal(EXTENSION_GUIDE_HREF, "/bantuan#ekstensi");
  assert.ok(EXTENSION_GUIDE_LINK_LABEL.length > 0);
  assert.match(EXTENSION_LAPTOP_ONLY_NOTE, /khusus laptop \(Chrome atau Edge\)/);
  assert.match(EXTENSION_LAPTOP_ONLY_NOTE, /tidak bisa dipasang di HP/i);
  assert.match(EXTENSION_TOKEN_PASTE_WARNING, /khusus laptop \(Chrome atau Edge\)/);
  assert.doesNotMatch(EXTENSION_INSTALL_STEPS.join("\n"), /lihat panduan/i);

  const settings = read("../src/routes/settings.tsx");
  assert.match(settings, /<Card\s+id="ekstensi"/);
  assert.match(settings, /Khusus laptop \(Chrome atau Edge\), tidak bisa dipasang di HP/);

  const extCard = read("../src/components/ExtensionConnectCard.tsx");
  assert.match(extCard, /href=\{EXTENSION_GUIDE_HREF\}/);
  assert.match(extCard, /khusus laptop \(Chrome atau Edge\)/);
  assert.match(extCard, /tidak bisa dipasang di HP/);
  assert.match(extCard, /berhenti sebelum kirim sehingga kamu yang menekan Kirim sendiri/);
});

test("ON-05: alasan kanal di applyChannel mengikuti perilaku nyata tanpa jargon ATS publik atau [UJI]", () => {
  const ats = classifyJobChannel({ platform_source: "greenhouse", external_url: "https://boards.greenhouse.io/acme/jobs/1" });
  assert.match(ats.reason, /Situs karier perusahaan/);
  assert.match(ats.reason, /Agen server mengisi dan mengirimnya setelah kamu menekan Setujui/);

  const email = classifyJobChannel({ platform_source: "dealls", external_url: "https://dealls.com/loker/1", description: "Kirim ke hr@acme.id" });
  assert.match(email.reason, /Gmail kamu setelah kamu menekan Setujui/);

  const portal = classifyJobChannel({ platform_source: "jobstreet", external_url: "https://id.jobstreet.com/id/job/1" });
  assert.match(portal.reason, /khusus laptop \(Chrome atau Edge/);
  assert.match(portal.reason, /tidak bisa dipasang di HP/);
  assert.match(portal.reason, /berhenti sebelum kirim sehingga kamu yang menekan Kirim sendiri/);

  const web = classifyJobChannel({ platform_source: "other", external_url: "https://karier.contoh.id/loker/1" });
  assert.match(web.reason, /khusus laptop \(Chrome atau Edge/);

  for (const r of [ats.reason, email.reason, portal.reason, web.reason]) {
    assert.doesNotMatch(r, /\[UJI\]|ATS publik|—|!/);
  }
});

test("ON-13: simpan dan baca status tutup banner ekstensi dengan try/catch yang aman", () => {
  const store = new Map<string, string>();
  const memoryStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  assert.equal(isExtensionBannerDismissed(memoryStorage), false);
  assert.equal(dismissExtensionBanner(memoryStorage), true);
  assert.equal(store.get(EXTENSION_BANNER_DISMISSED_KEY), "1");
  assert.equal(isExtensionBannerDismissed(memoryStorage), true);

  const throwingStorage = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.equal(isExtensionBannerDismissed(throwingStorage), false);
  assert.equal(dismissExtensionBanner(throwingStorage), false);
  assert.equal(isExtensionBannerDismissed(null), false);
  assert.equal(dismissExtensionBanner(null), false);
});

test("ON-13: halaman Lowongan menyembunyikan [UJI] dan ATS publik dari pengguna biasa, sementara pencarian manual [UJI] tetap jalan", () => {
  const jobsSrc = stripComments(read("../src/routes/jobs.tsx"));
  assert.doesNotMatch(jobsSrc, /\[UJI\]|ATS publik/);
  assert.match(jobsSrc, /!loading && hasPortalJobs && !extensionBannerDismissed/);
  assert.match(jobsSrc, /data-testid="jobs-extension-banner"/);
  assert.match(jobsSrc, /aria-label="Tutup panduan ekstensi"/);
  assert.match(jobsSrc, /to="\/settings"[\s\S]*?hash="ekstensi"/);
  assert.match(jobsSrc, /href=\{EXTENSION_GUIDE_HREF\}/);

  // Pencarian manual [UJI] oleh peneliti/penguji tetap berfungsi di jobFilters.ts.
  assert.equal(isTestListingQuery("[UJI]"), true);
  assert.equal(matchesJobSearch({ title: "[UJI] Staf Uji Coba", company: "Applify", location: "Yogyakarta" }, "[UJI]"), true);
});

test("ON-20: tidak ada pesan galat cadangan polos 'Gagal ...' pada berkas yang ditugaskan", () => {
  const files = [
    "../src/components/ExtensionConnectCard.tsx",
    "../src/components/EmailApplyPanel.tsx",
    "../src/components/LockedClaimBanner.tsx",
    "../src/components/NotificationSettingsCard.tsx",
    "../src/lib/emailApply.ts",
  ];
  for (const rel of files) {
    const visible = stripComments(read(rel));
    assert.doesNotMatch(visible, /describeApiError\([^,]+,\s*["']Gagal\b/, `${rel} masih memakai fallback 'Gagal ...'`);
    assert.doesNotMatch(visible, /classifyClaimResolveError\([^,]+,\s*["']Gagal\b/, `${rel} masih memakai fallback 'Gagal ...'`);
  }

  const queueErr = describeQueueError(new Error("boom"));
  assert.match(queueErr, /Periksa koneksi internetmu/);
  assert.match(queueErr, /tidak hilang/);
  assert.doesNotMatch(queueErr, /^Gagal |—|!/);
});

test("ON-21: judul halaman Lowongan dan empty state konsisten dengan nama tombol pemindai", () => {
  const jobsSrc = stripComments(read("../src/routes/jobs.tsx"));
  assert.match(jobsSrc, /<h1[^>]*>Lowongan<\/h1>/);
  assert.doesNotMatch(jobsSrc, /Cari lowongan sekarang/);
  assert.match(jobsSrc, /\{SCANNER_BUTTON_LABEL\}/);

  const empty = jobsEmptyState({
    filter: "all",
    searchQuery: "",
    loadedCount: 0,
    savedCount: 0,
    savedLoadFailed: false,
    profileHasSkills: true,
    skillsError: "",
    scoredCount: 0,
    topScore: null,
  });
  assert.doesNotMatch(empty.text, /tombol biru/i);
  assert.ok(empty.text.includes(SCANNER_BUTTON_LABEL));
  assert.doesNotMatch(empty.text, /—|!/);
});
