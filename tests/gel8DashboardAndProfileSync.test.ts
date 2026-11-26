import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAgentApplyRows } from "../src/lib/agentApplyRows.ts";
import { emptyPlacementData } from "../src/lib/approvalTabs.ts";
import { summarizeUrgentActions } from "../src/lib/dashboardUrgent.ts";
import { mergeIdentityFromProfile } from "../src/lib/settingsProfileFallback.ts";

test("E2E-06: summarizeUrgentActions menghitung persetujuan pending aktif, OTP menunggu kode, dan pertanyaan agen", () => {
  const now = Date.parse("2026-11-26T10:00:00Z");
  const queueRows = [
    { id: "q-otp", job_type: "apply", status: "processing", created_at: "2026-11-26T09:58:00Z", payload: { approval_request_id: "apr-otp" } },
    { id: "q-ask", job_type: "apply", status: "completed", created_at: "2026-11-26T09:50:00Z", payload: { approval_request_id: "apr-ask" } },
  ];
  const applyLogs = [
    {
      status: "awaiting_code",
      created_at: "2026-11-26T09:59:00Z",
      details: { queue_job_id: "q-otp", awaiting_until: "2026-11-26T10:05:00Z", code_length: 6 },
    },
    {
      status: "ready",
      created_at: "2026-11-26T09:51:00Z",
      details: {
        queue_job_id: "q-ask",
        questions: [{ key: "q1", label: "Ekspektasi gaji?", kind: "text", required: true }],
      },
    },
  ];
  const summary = summarizeUrgentActions({
    now,
    pendingApprovals: [
      { id: "p-active", status: "pending", expires_at: "2026-11-26T12:00:00Z" },
      { id: "p-expired", status: "pending", expires_at: "2026-11-26T09:00:00Z" },
      { id: "p-approved", status: "approved", expires_at: "2026-11-26T12:00:00Z" },
    ],
    history: [
      { id: "apr-otp", status: "approved", expires_at: "2026-11-26T12:00:00Z" },
      { id: "apr-ask", status: "approved", expires_at: "2026-11-26T12:00:00Z" },
    ],
    data: { ...emptyPlacementData(), agentKnown: true, agent: buildAgentApplyRows(queueRows, applyLogs, []) },
  });

  assert.equal(summary.pendingApprovalsCount, 1);
  assert.equal(summary.awaitingCodeCount, 1);
  assert.equal(summary.pendingQuestionsCount, 1);
  assert.equal(summary.unverifiedCount, 0);
  assert.equal(summary.total, 3);
});

test("E2E-06: mergeIdentityFromProfile melengkapi kolom identitas kosong dari Profil tanpa menimpa pengaturan agen atau kolom gaji", () => {
  const { settings, syncedFields } = mergeIdentityFromProfile(
    {
      first_name: "SudahDiisi",
      desired_salary: null,
      notice_period: null,
    },
    {
      full_name: "Budi Santoso",
      phone: "08123456789",
      location: "Jakarta Selatan, Indonesia",
      linkedin_url: "https://linkedin.com/in/budi",
      portfolio_url: "https://budi.dev",
    },
  );

  // first_name sudah diisi tidak tertimpa oleh full_name
  assert.equal(settings.first_name, "SudahDiisi");
  assert.equal(settings.phone_number, "08123456789");
  assert.equal(settings.current_city, "Jakarta Selatan");
  assert.equal(settings.linkedin_url, "https://linkedin.com/in/budi");
  assert.equal(settings.website, "https://budi.dev");
  assert.equal(settings.desired_salary, null);
  assert.equal(settings.notice_period, null);
  assert.deepEqual(syncedFields, ["phone_number", "current_city", "linkedin_url", "website"]);

  // Jika first_name dan last_name kosong semua, full_name dipecah bersih
  const fresh = mergeIdentityFromProfile({}, { full_name: "Siti Aminah Putri" });
  assert.equal(fresh.settings.first_name, "Siti");
  assert.equal(fresh.settings.last_name, "Aminah Putri");
});

test("E2E-06: dashboard.tsx merender banner tindakan mendesak dan automation-settings memuat fallback profil", () => {
  const dash = readFileSync(new URL("../src/routes/dashboard.tsx", import.meta.url), "utf8");
  const auto = readFileSync(new URL("../src/routes/automation-settings.tsx", import.meta.url), "utf8");
  assert.match(dash, /data-testid="dashboard-urgent-actions"/);
  assert.match(dash, /summarizeUrgentActions/);
  assert.match(dash, /urgentLines\(urgent\)/);
  assert.match(auto, /mergeIdentityFromProfile/);
  assert.match(auto, /profile-identity-sync-note/);
});
