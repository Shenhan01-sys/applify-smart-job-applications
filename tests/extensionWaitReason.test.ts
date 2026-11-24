import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_EXTENSION_SEEN_AFTER_MS,
  NO_EXTENSION_SEEN_HINT,
  describeExtensionWait,
  extensionWaitHint,
  parsePermissionRequired,
  permissionRequiredHint,
} from "../src/lib/extensionWaitReason.ts";
import { describeAgentApply } from "../src/lib/agentApplyStatus.ts";
import { buildAgentApplyRows } from "../src/lib/agentApplyRows.ts";
import { queueStatusHint } from "../src/lib/statusLabels.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const NOW = Date.parse("2026-11-24T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const PERMISSION_ERROR = "permission_required:dealls.com — Izin situs ATS belum diberikan di ekstensi.";
const LEGACY_ERROR = "Izin situs ATS belum diberikan di ekstensi.";
const PENDING_EXT = { job_type: "extension_apply", status: "pending", scheduled_at: iso(NOW + 30_000) };

test("parsePermissionRequired: kode dengan host, baris lama tanpa kode, host rusak, dan pesan lain", () => {
  assert.deepEqual(parsePermissionRequired(PERMISSION_ERROR), { host: "dealls.com" });
  assert.deepEqual(parsePermissionRequired("permission_required:www.dealls.com"), { host: "www.dealls.com" });
  assert.deepEqual(parsePermissionRequired("permission_required:Dealls.COM — x"), { host: "dealls.com" });
  assert.deepEqual(parsePermissionRequired(LEGACY_ERROR), { host: null });
  for (const bad of ["permission_required:", "permission_required:<b>x</b>", "permission_required:dealls.com/path", "permission_required:localhost"]) {
    assert.deepEqual(parsePermissionRequired(bad), { host: null }, bad);
  }
  for (const other of ["Tab lowongan ditutup sebelum pengisian selesai.", "service_worker_restarted", "", null, undefined, 7]) {
    assert.equal(parsePermissionRequired(other), null, String(other));
  }
});

test("describeExtensionWait: izin, ekstensi tidak aktif (jatuh tempo terlewat 5 menit), dan keadaan lain kosong", () => {
  assert.deepEqual(describeExtensionWait({ ...PENDING_EXT, error_message: PERMISSION_ERROR }, NOW), {
    extension_wait_reason: "permission_required",
    extension_wait_host: "dealls.com",
  });
  assert.deepEqual(describeExtensionWait({ ...PENDING_EXT, error_message: LEGACY_ERROR }, NOW), {
    extension_wait_reason: "permission_required",
    extension_wait_host: null,
  });
  const none = { extension_wait_reason: null, extension_wait_host: null };
  assert.deepEqual(describeExtensionWait({ ...PENDING_EXT, error_message: null }, NOW), none);
  assert.deepEqual(describeExtensionWait({ ...PENDING_EXT, error_message: "Tab ditutup." }, NOW), none);

  const overdue = iso(NOW - NO_EXTENSION_SEEN_AFTER_MS);
  assert.equal(describeExtensionWait({ ...PENDING_EXT, scheduled_at: overdue, error_message: null }, NOW).extension_wait_reason, "no_extension_seen");
  // Pesan izin yang sudah basi tidak menang atas "tidak ada ekstensi aktif".
  assert.equal(describeExtensionWait({ ...PENDING_EXT, scheduled_at: overdue, error_message: PERMISSION_ERROR }, NOW).extension_wait_reason, "no_extension_seen");
  assert.equal(describeExtensionWait({ ...PENDING_EXT, scheduled_at: iso(NOW - NO_EXTENSION_SEEN_AFTER_MS + 1000), error_message: null }, NOW).extension_wait_reason, null);

  // Tanpa scheduled_at (baris lama yang dibaca tanpa kolom itu): tidak menebak.
  assert.equal(describeExtensionWait({ job_type: "extension_apply", status: "pending", error_message: null }, NOW).extension_wait_reason, null);
  assert.deepEqual(describeExtensionWait({ ...PENDING_EXT, job_type: "apply", error_message: PERMISSION_ERROR }, NOW), none);
  assert.deepEqual(describeExtensionWait({ ...PENDING_EXT, status: "processing", error_message: PERMISSION_ERROR }, NOW), none);
  assert.deepEqual(describeExtensionWait(null, NOW), none);
});

test("teks petunjuk: bahasa awam, menyebut host dan langkah, tanpa istilah teknis", () => {
  assert.equal(permissionRequiredHint("dealls.com"), "Ekstensi perlu izin untuk membuka dealls.com. Buka panel ekstensi Applify lalu klik Izinkan dealls.com.");
  assert.match(permissionRequiredHint(null), /^Ekstensi perlu izin untuk membuka situs lowongan ini\. Buka panel ekstensi Applify lalu klik tombol Izinkan\.$/);
  for (const text of [permissionRequiredHint("dealls.com"), permissionRequiredHint(null), NO_EXTENSION_SEEN_HINT]) {
    assert.doesNotMatch(text, /permission|chrome\.|host permission|origin|manifest|service worker|token|—/i);
  }
  assert.equal(extensionWaitHint({ extension_wait_reason: null, extension_wait_host: null }), null);
  assert.equal(extensionWaitHint({ extension_wait_reason: "no_extension_seen", extension_wait_host: null }), NO_EXTENSION_SEEN_HINT);
});

test("kartu agen: pending ekstensi tertahan izin menyebut host dan diberi sorotan; label tetap Menunggu Ekstensi Browser", () => {
  const view = describeAgentApply({ status: "pending", job_type: "extension_apply", error_message: PERMISSION_ERROR, scheduled_at: iso(NOW + 30_000) }, NOW);
  assert.equal(view.label, "Menunggu Ekstensi Browser");
  assert.equal(view.tone, "waiting");
  assert.equal(view.suggestEmail, false);
  assert.equal(view.waitReason, "permission_required");
  assert.equal(view.hint, "Ekstensi perlu izin untuk membuka dealls.com. Buka panel ekstensi Applify lalu klik Izinkan dealls.com.");

  const legacy = describeAgentApply({ status: "pending", job_type: "extension_apply", error_message: LEGACY_ERROR }, NOW);
  assert.equal(legacy.waitReason, "permission_required");
  assert.match(legacy.hint, /membuka situs lowongan ini/);

  const stale = describeAgentApply({ status: "pending", job_type: "extension_apply", error_message: null, scheduled_at: iso(NOW - 10 * 60_000) }, NOW);
  assert.equal(stale.waitReason, "no_extension_seen");
  assert.equal(stale.hint, NO_EXTENSION_SEEN_HINT);
  assert.equal(stale.label, "Menunggu Ekstensi Browser");
});

test("kartu agen: menunggu biasa dan tugas worker tidak berubah", () => {
  const plain = describeAgentApply({ status: "pending", job_type: "extension_apply", scheduled_at: iso(NOW - 30_000) }, NOW);
  assert.equal(plain.waitReason, undefined);
  assert.match(plain.hint, /Ekstensi akan membuka tab latar belakang dan mengisi formulir saat aktif/);

  // Tugas worker (bukan ekstensi) dengan pesan serupa tidak diperlakukan sebagai izin ekstensi.
  const worker = describeAgentApply({ status: "pending", job_type: "apply", error_message: PERMISSION_ERROR, scheduled_at: iso(NOW - 60 * 60_000) }, NOW);
  assert.equal(worker.waitReason, undefined);
  assert.equal(worker.label, "Menunggu agen");

  // Status lain tidak memakai alasan menunggu.
  assert.equal(describeAgentApply({ status: "processing", job_type: "extension_apply", error_message: PERMISSION_ERROR }, NOW).waitReason, undefined);
  assert.equal(describeAgentApply({ status: "failed", job_type: "extension_apply", error_message: PERMISSION_ERROR }, NOW).waitReason, undefined);
});

test("queueStatusHint (panel antrean): pesan izin ikut tampil lewat error_message, tanpa mengubah tanda tangan lama", () => {
  assert.equal(
    queueStatusHint("pending", "extension_apply", PERMISSION_ERROR),
    "Ekstensi perlu izin untuk membuka dealls.com. Buka panel ekstensi Applify lalu klik Izinkan dealls.com.",
  );
  assert.match(queueStatusHint("pending", "extension_apply", null), /Ekstensi akan membuka tab latar belakang/);
  assert.match(queueStatusHint("pending", "extension_apply", null, null, null, { scheduledAt: iso(NOW - 20 * 60_000), now: NOW }), /Belum ada ekstensi Applify yang aktif/);
  assert.match(queueStatusHint("pending", "apply", PERMISSION_ERROR), /Agen akan mengerjakannya/);
});

test("buildAgentApplyRows meneruskan scheduled_at tugas antrean, dan layanan membacanya dari database", () => {
  const rows = buildAgentApplyRows(
    [
      {
        id: "q1",
        job_type: "extension_apply",
        status: "pending",
        error_message: PERMISSION_ERROR,
        scheduled_at: "2026-11-24T12:00:30Z",
        created_at: "2026-11-24T11:50:00Z",
        payload: { approval_request_id: "a1" },
      },
      { id: "q2", job_type: "apply", status: "pending", error_message: null, created_at: "2026-11-24T11:50:00Z", payload: { approval_request_id: "a2" } },
    ],
    [],
    []
  );
  assert.equal(rows.a1.scheduled_at, "2026-11-24T12:00:30Z");
  assert.equal("scheduled_at" in rows.a2, false);
  assert.match(read("../src/services/emailApplyService.ts"), /\.select\("id, job_type, status, error_message, scheduled_at, created_at, payload"\)/);
});

test("komponen kartu menyorot petunjuk alasan tanpa innerHTML", () => {
  const card = read("../src/components/AgentApplyStatus.tsx");
  assert.match(card, /data-testid="extension-wait-hint"/);
  assert.match(card, /view\.waitReason/);
  assert.doesNotMatch(card, /dangerouslySetInnerHTML/);
});
