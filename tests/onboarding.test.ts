import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyBlockers, needsOnboarding, postLoginTarget, EMPTY_PROFILE_SUMMARY } from "../src/lib/onboarding.ts";
import {
  EMPTY_PREFERENCES,
  preferencesFromSettings,
  preferencesToSettings,
  toggleInList,
  validatePreferences,
} from "../src/lib/profilePreferences.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const complete = { full_name: "Rina Putri", current_title: "Analis Data", skills: 4, experiences: 1, education: 1 };

test("profil kosong atau kurang nama, jabatan, skill diarahkan ke Profil dengan banner sambutan", () => {
  assert.equal(needsOnboarding(EMPTY_PROFILE_SUMMARY), true);
  assert.equal(needsOnboarding({ ...complete, full_name: "  " }), true);
  assert.equal(needsOnboarding({ ...complete, skills: 0 }), true);
  assert.deepEqual(postLoginTarget(EMPTY_PROFILE_SUMMARY), { to: "/profile", search: { welcome: 1 } });
});

test("belum ada pengalaman dan pendidikan sama sekali juga memicu onboarding; lulusan baru dengan pendidikan tidak", () => {
  assert.equal(needsOnboarding({ ...complete, experiences: 0, education: 0 }), true);
  assert.equal(needsOnboarding({ ...complete, experiences: 0, education: 1 }), false);
  assert.equal(needsOnboarding(complete), false);
  assert.deepEqual(postLoginTarget(complete), { to: "/dashboard" });
});

test("ringkasan profil gagal dibaca (null) tidak mengunci pengguna: tetap ke dashboard", () => {
  assert.deepEqual(postLoginTarget(null), { to: "/dashboard" });
});

test("AI Apply ditahan hanya untuk kolom wajib; pengalaman bukan penghalang", () => {
  assert.deepEqual(applyBlockers(complete), []);
  assert.deepEqual(applyBlockers({ ...complete, experiences: 0, education: 0 }), []);
  const blockers = applyBlockers(EMPTY_PROFILE_SUMMARY);
  assert.equal(blockers.length, 3);
  assert.match(blockers.join(" "), /Nama lengkap/);
  assert.match(blockers.join(" "), /skill/i);
});

test("login dan callback memakai tujuan onboarding, bukan langsung /dashboard", () => {
  const login = read("../src/routes/login.tsx");
  const cb = read("../src/routes/auth.callback.tsx");
  for (const src of [login, cb]) {
    assert.match(src, /resolvePostLoginTarget/);
    assert.match(src, /navigate\(\{ to: "\/profile", search: \{ welcome: 1 \} \}\)/);
  }
  // masuk berhasil tidak lagi langsung ke /dashboard: pilihan ada di tujuan hasil resolvePostLoginTarget
  assert.doesNotMatch(login, /signInWithPassword[\s\S]{0,200}navigate\(\{ to: "\/dashboard" \}\)/);
});

test("halaman Profil: banner sambutan, langkah lanjut setelah Simpan & Selesai, preferensi disimpan", () => {
  const src = read("../src/routes/profile.tsx");
  assert.match(src, /validateSearch/);
  assert.match(src, /WELCOME_STEPS/);
  assert.match(src, /Cari lowongan/);
  assert.match(src, /to="\/jobs"/);
  assert.match(src, /updateSettings\(/);
  assert.doesNotMatch(src, /belum disimpan ke server/);
});

test("AIApplyModal menahan profil kosong sebelum memakai kuota dan menautkan ke /profile", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  assert.match(src, /applyBlockers/);
  assert.match(src, /to="\/profile"/);
  assert.match(src, /Lengkapi profil/);
  // tombol generate dikunci oleh blokir profil
  assert.match(src, /canApply = !quotaExhausted && profileOk/);
});

test("preferensi: tanpa pilihan bawaan; kosong berarti tidak menyaring", () => {
  assert.deepEqual(EMPTY_PREFERENCES.work_types, []);
  assert.deepEqual(preferencesToSettings(EMPTY_PREFERENCES), {
    desired_salary: null, current_ctc: null, notice_period: null, search_location: null, job_type_filter: [], work_type_filter: [],
  });
});

test("preferensi: nilai kolom dibaca dan ditulis, nilai asing dibuang, angka tidak valid jadi 0", () => {
  const form = preferencesFromSettings({
    desired_salary: "8000000", current_ctc: -5, notice_period: 14, search_location: "Yogyakarta",
    job_type_filter: ["full-time", "freelance"], work_type_filter: ["remote", "on-site", "x"],
  });
  assert.deepEqual(form, {
    desired_salary: 8000000, current_ctc: 0, notice_period: 14, job_types: ["full-time"], work_types: ["remote", "on-site"], search_location: "Yogyakarta",
  });
  const out = preferencesToSettings({ ...form, search_location: "  Sleman  " });
  assert.equal(out.search_location, "Sleman");
  assert.equal(out.desired_salary, 8000000);
  assert.equal(out.current_ctc, null);
  assert.deepEqual(preferencesFromSettings(null), EMPTY_PREFERENCES);
});

test("preferensi: validasi batas dan toggle daftar", () => {
  assert.deepEqual(validatePreferences(EMPTY_PREFERENCES), {});
  const errs = validatePreferences({ ...EMPTY_PREFERENCES, notice_period: 400, desired_salary: 2e10 });
  assert.ok(errs.notice_period && errs.desired_salary);
  assert.deepEqual(toggleInList(["a"], "b"), ["a", "b"]);
  assert.deepEqual(toggleInList(["a", "b"], "a"), ["b"]);
});
