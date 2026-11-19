import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiError, describeApiError, parseApiError } from "../src/lib/apiErrors.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const body = (o: unknown) => JSON.stringify(o);

test("429 quota_exhausted: pesan kuota habis dengan hitungan terpakai dari field quota", () => {
  const err = new ApiError(429, body({ success: false, error: "Kuota bulanan habis", code: "quota_exhausted", quota: { quota: 10, used: 10, remaining: 0, allowed: false } }));
  const msg = describeApiError(err, "Gagal membuat surat.");
  assert.match(msg, /Kuota draf AI bulan ini sudah habis/);
  assert.match(msg, /10 dari 10 terpakai/);
  // langganan disembunyikan dari UAT: pesan menjelaskan reset bulan depan, bukan menyuruh membeli paket
  assert.match(msg, /direset bulan depan/);
  assert.doesNotMatch(msg, /Pro|paket|upgrade/i);
});

test("429 quota_exhausted tanpa field quota tetap menghasilkan pesan yang jelas", () => {
  const msg = describeApiError(new ApiError(429, body({ success: false, error: "x", code: "quota_exhausted" })));
  assert.match(msg, /sudah habis\./);
  assert.doesNotMatch(msg, /undefined|NaN/);
});

test("429 rate_limited: menyebut waktu tunggu dari retryAfterSec, dari header Retry-After, atau bawaan", () => {
  const fromBody = describeApiError(new ApiError(429, body({ success: false, error: "x", code: "rate_limited", retryAfterSec: 42 })));
  assert.match(fromBody, /Terlalu banyak permintaan AI/);
  assert.match(fromBody, /42 detik/);
  const fromHeader = describeApiError(new ApiError(429, body({ success: false, error: "x", code: "rate_limited" }), 30));
  assert.match(fromHeader, /30 detik/);
  const minutes = describeApiError(new ApiError(429, body({ code: "rate_limited", retryAfterSec: 600 })));
  assert.match(minutes, /10 menit/);
  const none = describeApiError(new ApiError(429, body({ code: "rate_limited" })));
  assert.match(none, /beberapa saat lagi/);
  // kuota habis dan batas laju harus terbaca berbeda
  assert.notEqual(fromBody, describeApiError(new ApiError(429, body({ code: "quota_exhausted" }))));
});

test("503 quota_check_failed dan rate_limit_check_failed: ditolak demi keamanan, bukan 'gagal' biasa", () => {
  const q = describeApiError(new ApiError(503, body({ success: false, error: "x", code: "quota_check_failed" })));
  const r = describeApiError(new ApiError(503, body({ success: false, error: "x", code: "rate_limit_check_failed" })));
  assert.match(q, /Kuota AI tidak dapat diperiksa/);
  assert.match(r, /Batas permintaan AI tidak dapat diperiksa/);
  assert.notEqual(q, r);
});

test("401: meminta masuk lagi", () => {
  const msg = describeApiError(new ApiError(401, body({ success: false, error: "Unauthorized" })), "Gagal");
  assert.match(msg, /masuk lagi/i);
});

test("sesi: 503 session_encryption_not_configured jujur soal konfigurasi server; 422 session_undecryptable meminta impor ulang", () => {
  const cfg = describeApiError(new ApiError(503, body({ error: "SESSION_ENCRYPTION_KEY belum diisi", code: "session_encryption_not_configured" })), "Gagal mengimpor");
  assert.match(cfg, /belum dikonfigurasi/);
  assert.match(cfg, /bukan kesalahan pada cookie/);
  assert.match(cfg, /administrator/);
  const dec = describeApiError(new ApiError(422, body({ error: "x", code: "session_undecryptable" })), "Gagal memverifikasi");
  assert.match(dec, /tidak dapat dibaca/);
  assert.match(dec, /Impor ulang/);
  assert.notEqual(cfg, dec);
});

test("approval_required (403) menyebut galat server", () => {
  const msg = describeApiError(new ApiError(403, body({ error: "approval request has expired", code: "approval_required" })));
  assert.match(msg, /kedaluwarsa/);
  assert.match(msg, /approval request has expired/);
});

test("galat tanpa kode: memakai teks cadangan layar dan menambahkan pesan server bila ada", () => {
  assert.equal(describeApiError(new ApiError(500, body({ error: "boom" })), "Gagal membuat surat"), "Gagal membuat surat (boom)");
  assert.match(describeApiError(new ApiError(500, "<html>bad gateway</html>"), "Gagal membuat surat."), /^Gagal membuat surat\. Server sedang bermasalah/);
  const offline = describeApiError(new TypeError("Failed to fetch"), "Gagal");
  assert.match(offline, /tidak dapat dihubungi/);
  assert.match(offline, /Periksa koneksi internetmu/);
  assert.equal(describeApiError(undefined, "Gagal"), "Gagal");
  assert.equal(describeApiError(null), "Terjadi kesalahan. Coba lagi.");
});

test("429 tanpa kode dikenali dari status, dan Error biasa berisi JSON (kode lama) tetap terbaca", () => {
  assert.match(describeApiError(new ApiError(429, "slow down", 12)), /12 detik/);
  const plain = new Error(body({ success: false, error: "x", code: "quota_exhausted", quota: { quota: 5, used: 5 } }));
  assert.match(describeApiError(plain), /5 dari 5 terpakai/);
});

test("parseApiError: ApiError membawa status dan header; pesan tetap teks respons agar parser lama jalan", () => {
  const e = new ApiError(429, body({ code: "rate_limited", retryAfterSec: 9 }), 9);
  assert.equal(e.message, body({ code: "rate_limited", retryAfterSec: 9 }));
  assert.deepEqual(parseApiError(e), { status: 429, code: "rate_limited", retryAfterSec: 9 });
  assert.equal(e instanceof Error, true);
  assert.equal(e.name, "ApiError");
  // angka negatif atau teks bukan waktu tunggu
  assert.equal(parseApiError(new ApiError(429, body({ code: "rate_limited", retryAfterSec: -5 }))).retryAfterSec, undefined);
});

// ---- kabel ----

test("apiFetch melempar ApiError dengan status dan Retry-After; hook dan modal memakai describeApiError", () => {
  const api = read("../src/services/automationApi.ts");
  assert.match(api, /throw new ApiError\(res\.status, await res\.text\(\)/);
  assert.match(api, /res\.headers\.get\('Retry-After'\)/);
  const hooks = read("../src/hooks/useAutomation.ts");
  for (const text of ["Gagal membuat surat lamaran.", "Gagal menganalisis kecocokan lowongan.", "Gagal mengambil daftar skill dari lowongan.", "Gagal mengimpor sesi LinkedIn.", "Gagal memverifikasi sesi."]) {
    assert.match(hooks, new RegExp(`describeApiError\\(error, '${text.replace(/\./g, "\\.")}'\\)`));
  }
  assert.doesNotMatch(hooks, /toast\.error\('Failed to (search jobs|generate cover letter|analyze job match|extract skills|import LinkedIn session|verify session|regenerate cover letter)'\)/);
  const modal = read("../src/components/ApprovalReviewModal.tsx");
  assert.doesNotMatch(modal, /\$\{error\.message\}/);
  assert.match(modal, /describeApiError\(error, 'Gagal menyetujui'\)/);
});

test("halaman sesi LinkedIn menampilkan galat konfigurasi di layar dan tidak mengosongkan cookie yang gagal diimpor", () => {
  const page = read("../src/routes/linkedin-session.tsx");
  assert.match(page, /sessionError &&/);
  assert.match(page, /const imported = await importSession\(parsed\.cookies\);\s*\n\s*if \(imported\) setCookiesText\(""\);/);
});

test("kontrak backend yang dipakai pesan ini memang ada di kode backend (dibaca, tidak diubah)", () => {
  const ai = read("../../backend/api/routes/ai.ts");
  assert.match(ai, /code: error\.code/);
  assert.match(ai, /reply\.header\('Retry-After'/);
  const guard = read("../../backend/services/ai-guard.service.ts");
  for (const c of ["rate_limited", "quota_exhausted", "quota_check_failed", "rate_limit_check_failed"]) assert.match(guard, new RegExp(`'${c}'`));
  const sessions = read("../../backend/api/routes/sessions.ts");
  assert.match(sessions, /code: 'session_encryption_not_configured'/);
  assert.match(sessions, /code: err\.code/);
  assert.match(read("../../backend/services/session-crypto.ts"), /code = 'session_undecryptable'/);
});
