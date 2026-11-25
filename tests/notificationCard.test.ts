import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  NOTIFICATIONS_UNAVAILABLE_TEXT,
  NOTIFICATIONS_UNAVAILABLE_TITLE,
  notificationsUnavailable,
  whatsappStatusLabel,
  whatsappUnavailable,
} from "../src/lib/notificationCard.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const TECHNICAL = /administrator|kapso|migrasi|migration|production|database|skema|user_notification_settings|server/i;

test("kartu notifikasi tidak tersedia bila saklar server mati atau tabel belum siap", () => {
  assert.equal(notificationsUnavailable({ notificationsEnabled: false }), true);
  assert.equal(notificationsUnavailable({ migrationPending: true }), true);
  assert.equal(notificationsUnavailable({ notificationsEnabled: true, migrationPending: false }), false);
  // status tidak terbaca: jangan menyembunyikan kartu, pengguna masih bisa mencoba
  assert.equal(notificationsUnavailable({}), false);
});

test("WhatsApp belum tersedia hanya bila penyedia jelas belum disiapkan; status tak terbaca tidak dihitung", () => {
  assert.equal(whatsappUnavailable({ whatsappKapso: false }), true);
  assert.equal(whatsappUnavailable({ whatsappKapso: true }), false);
  assert.equal(whatsappUnavailable({}), false);
  assert.equal(whatsappStatusLabel({ whatsappKapso: false }), "Belum tersedia");
  assert.equal(whatsappStatusLabel({ whatsappKapso: true }), "Menunggu verifikasi nomor");
});

test("teks untuk pengguna netral: tanpa istilah pengembang, nama penyedia, atau perintah menghubungi administrator", () => {
  assert.equal(NOTIFICATIONS_UNAVAILABLE_TITLE, "Belum tersedia");
  assert.doesNotMatch(NOTIFICATIONS_UNAVAILABLE_TEXT, TECHNICAL);
  const card = read("../src/components/NotificationSettingsCard.tsx");
  const settings = read("../src/routes/settings.tsx");
  const visibleCard = card.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const word of ["administrator", "Kapso Cloud API", "belum dijalankan di database", "user_notification_settings", "melalui Kapso"]) {
    assert.ok(!visibleCard.includes(word), `kartu masih memuat: ${word}`);
  }
  assert.match(settings, /title="Notifikasi WhatsApp"/);
  assert.doesNotMatch(settings, /Kapso/);
});

test("kartu memakai keadaan Belum tersedia dan tidak menawarkan formulir saat fitur mati", () => {
  const card = read("../src/components/NotificationSettingsCard.tsx");
  assert.match(card, /data-testid="notifications-unavailable"/);
  const unavailableAt = card.indexOf("notificationsUnavailable(");
  const formAt = card.indexOf('aria-label="Nomor WhatsApp"');
  assert.ok(unavailableAt > 0 && formAt > unavailableAt, "keadaan Belum tersedia harus dicek sebelum formulir");
});

test("pengingat tindak lanjut tidak dijanjikan ke pengguna selama worker hanya mengirimnya ke satu chat operator (U5-P2-07, BS-03, UX-P7-08)", () => {
  const settings = read("../src/routes/settings.tsx");
  const card = read("../src/components/NotificationSettingsCard.tsx");
  assert.doesNotMatch(settings, /pengingat tindak lanjut lewat WhatsApp/i);
  assert.match(settings, /Pengingat tindak lanjut ke akunmu belum aktif/);
  assert.match(card, /label: "Pengingat follow-up 4 hari \(belum aktif\)"/);
});

test("kata 'belum aktif di database' hilang dari jawaban tersimpan dan dokumen tambahan", () => {
  for (const file of ["../src/lib/formQuestions.ts", "../src/lib/profileDocuments.ts"]) {
    assert.doesNotMatch(read(file), /belum aktif di database/);
  }
});
