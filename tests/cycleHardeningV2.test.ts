import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeAnswers } from "../src/lib/answerReview.ts";
import { describeAgentApply } from "../src/lib/agentApplyStatus.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("answerReview: normalizeAnswers mempertahankan source 'profile'", () => {
  const [entry] = normalizeAnswers([
    { question: "Nomor telepon", answer: "+628123456789", confidence: 0.95, needs_review: false, source: "profile" },
  ]);
  assert.ok(entry);
  assert.equal(entry.source, "profile");
  assert.equal(entry.answer, "+628123456789");
});

test("agentApplyStatus: claim_state locked_stuck menampilkan peringatan pemeriksaan manual tanpa menimpa log terminal", () => {
  const locked = describeAgentApply({
    status: "processing",
    claim_state: "locked_stuck",
    claim_channel: "worker",
  });
  assert.equal(locked.label, "Pengiriman terkunci — perlu pemeriksaan manual");
  assert.equal(locked.tone, "unverified");

  const alreadySent = describeAgentApply({
    status: "completed",
    log_status: "success",
    claim_state: "locked_stuck",
    claim_channel: "worker",
  });
  assert.notEqual(alreadySent.label, "Pengiriman terkunci — perlu pemeriksaan manual");
  assert.equal(alreadySent.tone, "sent");

  const priorUnverified = describeAgentApply({
    status: "completed",
    log_status: "submit_unverified",
    claim_state: "locked_stuck",
    claim_channel: "extension",
  });
  assert.notEqual(priorUnverified.label, "Pengiriman terkunci — perlu pemeriksaan manual");
  assert.equal(priorUnverified.tone, "unverified");
});

test("wiring keamanan & fitur v2: Gmail OAuth aman, revokasi ekstensi, LockedClaimBanner, dan Notifikasi WhatsApp", () => {
  const emailPanel = read("../src/components/EmailApplyPanel.tsx");
  assert.match(emailPanel, /startGmailOAuth/);
  assert.doesNotMatch(emailPanel, /\/api\/oauth\/google\?uid=/);
  assert.doesNotMatch(emailPanel, /getGmailConnectUrl/);

  const apiClient = read("../src/services/automationApi.ts");
  const oauthInitSlice = apiClient.slice(apiClient.indexOf("async startGmailOAuth"), apiClient.indexOf("async addToQueue"));
  assert.match(oauthInitSlice, /credentials:\s*['"]include['"]/);

  const extCard = read("../src/components/ExtensionConnectCard.tsx");
  assert.match(extCard, /Putuskan semua perangkat/);
  assert.match(extCard, /revokeAllExtensionTokens/);

  const approvals = read("../src/routes/approvals.tsx");
  assert.match(approvals, /import LockedClaimBanner from "@\/components\/LockedClaimBanner"/);
  assert.match(approvals, /<LockedClaimBanner\b/);

  const settings = read("../src/routes/settings.tsx");
  assert.match(settings, /import \{ NotificationSettingsCard \} from "@\/components\/NotificationSettingsCard"/);
  assert.match(settings, /<NotificationSettingsCard\b/);
});
