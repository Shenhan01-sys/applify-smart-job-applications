import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError, describeApiError } from "../src/lib/apiErrors.ts";
import { classifyClaimResolveError, shouldShowLockedClaimBanner } from "../src/lib/claimResolution.ts";
import { AGENT_ABANDONED_LABEL, describeAgentApply } from "../src/lib/agentApplyStatus.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const body = (o: unknown) => JSON.stringify(o);

test("OTP: batas harian, cooldown, dan batas percobaan punya pesan sendiri dan tidak mengulang teks server", () => {
  const daily = describeApiError(new ApiError(429, body({ error: "teks server apa pun", code: "otp_daily_limit" })), "Gagal mengirim OTP.");
  assert.match(daily, /5 permintaan per akun dan 5 per nomor dalam 24 jam/);
  assert.doesNotMatch(daily, /teks server apa pun/);

  const cooldown = describeApiError(new ApiError(429, body({ error: "x", code: "otp_cooldown" })));
  assert.match(cooldown, /sekitar satu menit/);
  const attempts = describeApiError(new ApiError(429, body({ error: "x", code: "otp_too_many_attempts" })));
  assert.match(attempts, /Batas percobaan kode OTP tercapai/);
  assert.notEqual(daily, cooldown);
  assert.notEqual(cooldown, attempts);
  // Tanpa kode khusus, 429 tetap memakai pesan umum
  assert.match(describeApiError(new ApiError(429, body({ error: "x" }))), /Terlalu banyak permintaan\./);
});

test("OTP: kode salah, kedaluwarsa, tidak ada, dan nomor tidak valid terbaca jelas", () => {
  assert.match(describeApiError(new ApiError(400, body({ error: "x", code: "otp_mismatch" }))), /Kode OTP salah/);
  assert.match(describeApiError(new ApiError(400, body({ error: "x", code: "otp_expired" }))), /kedaluwarsa/);
  assert.match(describeApiError(new ApiError(400, body({ error: "x", code: "otp_not_found" }))), /Minta kode baru/);
  assert.match(describeApiError(new ApiError(400, body({ error: "x", code: "invalid_whatsapp_phone" }))), /\+628/);
});

test("galat generik: kirim gagal, sakelar mati, dan server belum siap tidak menampilkan teks penyedia", () => {
  const send = describeApiError(new ApiError(502, body({ error: "Kapso 131030 token abc", code: "whatsapp_send_failed" })));
  assert.match(send, /gagal dikirim ke WhatsApp/);
  assert.doesNotMatch(send, /Kapso|131030|abc/);
  assert.match(describeApiError(new ApiError(503, body({ error: "x", code: "notifications_disabled" }))), /Notifikasi WhatsApp belum tersedia/);
  for (const code of ["otp_not_configured", "otp_attempts_unavailable", "kapso_not_configured", "notification_tables_unavailable"]) {
    assert.match(describeApiError(new ApiError(503, body({ error: "x", code }))), /Notifikasi WhatsApp belum tersedia/, code);
  }
});

test("jawaban 500 generik server: pengguna melihat pesan layar sendiri, bukan teks server", () => {
  for (const code of ["internal_error", "otp_request_failed", "preferences_failed", "rerun_failed", "mark_failed", "claim_resolve_failed"]) {
    const msg = describeApiError(new ApiError(500, body({ error: "Terjadi kesalahan pada server", code })), "Gagal menyimpan preferensi notifikasi.");
    assert.match(msg, /^Gagal menyimpan preferensi notifikasi\. Server sedang bermasalah/, code);
    assert.doesNotMatch(msg, /Terjadi kesalahan pada server/, code);
  }
  assert.match(describeApiError(new ApiError(400, body({ error: "x", code: "invalid_id" }))), /ID tidak valid/);
  assert.match(describeApiError(new ApiError(400, body({ error: "x", code: "account_email_unavailable" }))), /Email akunmu belum terkonfirmasi/);
});

test("klaim terkunci: 409 claim_in_progress, already_resolved, dan already_logged dipilah dari galat biasa", () => {
  const inProgress = classifyClaimResolveError(new ApiError(409, body({ error: "x", code: "claim_in_progress" })), "gagal");
  assert.equal(inProgress.kind, "in_progress");
  assert.match(inProgress.message, /masih berjalan/);

  for (const code of ["already_resolved", "already_logged", "claim_not_found"]) {
    const done = classifyClaimResolveError(new ApiError(409, body({ error: "x", code })), "gagal");
    assert.equal(done.kind, "already_done", code);
  }
  assert.match(classifyClaimResolveError(new ApiError(409, body({ error: "x", code: "already_resolved" })), "gagal").message, /sudah diselesaikan/);

  // Kode yang sama dengan status lain, 409 tanpa kode dikenal, dan 500 tetap galat biasa (pesan tampil di banner).
  assert.equal(classifyClaimResolveError(new ApiError(500, body({ error: "x", code: "claim_in_progress" })), "gagal").kind, "other");
  assert.equal(classifyClaimResolveError(new ApiError(409, body({ error: "x", code: "lainnya" })), "gagal").kind, "other");
  assert.equal(classifyClaimResolveError(new ApiError(500, body({ error: "Terjadi kesalahan pada server", code: "claim_resolve_failed" })), "Gagal menyelesaikan.").kind, "other");
  assert.equal(classifyClaimResolveError(new Error("Failed to fetch"), "gagal").kind, "other");
});

test("banner klaim terkunci hanya untuk locked_stuck tanpa log kirim; selesai (abandoned) atau terkirim menyembunyikannya", () => {
  assert.equal(shouldShowLockedClaimBanner("locked_stuck", undefined), true);
  assert.equal(shouldShowLockedClaimBanner("locked_stuck", "incomplete"), true);
  assert.equal(shouldShowLockedClaimBanner("locked_stuck", "success"), false);
  assert.equal(shouldShowLockedClaimBanner("locked_stuck", "submit_unverified"), false);
  for (const state of ["abandoned", "in_progress", "submitted", "none", undefined, null]) {
    assert.equal(shouldShowLockedClaimBanner(state, undefined), false, String(state));
  }
});

test("kartu riwayat: klaim abandoned tidak lagi 'terkunci' dan tidak menawarkan email atau pemulihan", () => {
  const view = describeAgentApply({ status: "processing", claim_state: "abandoned", claim_channel: "worker" });
  assert.equal(view.label, AGENT_ABANDONED_LABEL);
  assert.equal(view.suggestEmail, false);
  assert.notEqual(view.label, "Pengiriman terkunci — perlu pemeriksaan manual");
  // Bila lamaran ternyata tercatat terkirim, log kirim tetap menang.
  assert.equal(describeAgentApply({ status: "completed", log_status: "success", claim_state: "abandoned" }).tone, "sent");
});

test("wiring: kartu notifikasi tidak mengirim emailAddress/Telegram dan menampilkan email akun read-only", () => {
  const card = read("../src/components/NotificationSettingsCard.tsx");
  assert.doesNotMatch(card, /emailAddress:/);
  assert.doesNotMatch(card, /telegramChatId|telegramEnabled/);
  assert.match(card, /readOnly/);
  assert.match(card, /tidak bisa diubah/i);
  assert.match(card, /notificationsUnavailable\(/);

  const api = read("../src/services/automationApi.ts");
  assert.doesNotMatch(api, /telegramChatId|telegramEnabled/);
  assert.match(api, /'abandoned'/);

  const banner = read("../src/components/LockedClaimBanner.tsx");
  assert.match(banner, /classifyClaimResolveError/);
  assert.match(banner, /shouldShowLockedClaimBanner/);
  assert.match(banner, /setDone\(true\)/);
});
