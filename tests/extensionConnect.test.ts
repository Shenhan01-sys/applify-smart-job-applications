import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("Pengaturan Ekstensi Chrome/Edge tersambung ke /api/extension/token dan menjaga aturan Firefox + tanpa teks terlarang", () => {
  const settings = read("../src/routes/settings.tsx");
  assert.match(settings, /ExtensionConnectCard/);
  assert.match(settings, /Pasang untuk Firefox/);
  assert.doesNotMatch(settings, /Install untuk Chrome/);

  const card = read("../src/components/ExtensionConnectCard.tsx");
  assert.match(card, /createExtensionToken/);
  assert.match(card, /LinkedIn tetap manual-only/);

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
