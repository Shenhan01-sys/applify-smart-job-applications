/**
 * Aturan onboarding: kapan pengguna diarahkan ke halaman Profil, dan kapan AI Apply ditahan karena profil
 * belum lengkap. Satu sumber kebenaran dengan langkah Review di halaman Profil (`profileGaps`).
 */
import { profileGaps, type ProfileGapsInput } from "./profileForms.ts";

/** Ringkasan isi profil: sama dengan masukan `profileGaps` (nama, jabatan, jumlah skill, pengalaman, pendidikan). */
export type ProfileSummary = ProfileGapsInput;

export const EMPTY_PROFILE_SUMMARY: ProfileSummary = { full_name: "", current_title: "", skills: 0, experiences: 0, education: 0 };

/**
 * Pengguna perlu diarahkan ke Profil bila kolom wajib kosong (nama, jabatan, skill) atau belum ada riwayat
 * apa pun (pengalaman dan pendidikan sama-sama kosong). Lulusan baru yang sudah mengisi pendidikan tidak
 * dipaksa kembali ke Profil setiap masuk.
 */
export function needsOnboarding(p: ProfileSummary): boolean {
  if (profileGaps(p).missing.length > 0) return true;
  return p.experiences === 0 && p.education === 0;
}

/** Tujuan setelah daftar atau masuk. Ringkasan null (gagal dibaca) tidak boleh mengunci pengguna di luar dashboard. */
export type PostLoginTarget = { to: "/profile"; search: { welcome: 1 } } | { to: "/dashboard" };

export function postLoginTarget(summary: ProfileSummary | null): PostLoginTarget {
  if (summary && needsOnboarding(summary)) return { to: "/profile", search: { welcome: 1 } };
  return { to: "/dashboard" };
}

/** Hal wajib yang belum ada untuk AI Apply. Kosong berarti boleh memakai kuota. Pengalaman tidak wajib. */
export function applyBlockers(p: ProfileSummary): string[] {
  return profileGaps(p).missing;
}

/** Tiga langkah yang dijelaskan di banner sambutan halaman Profil. */
export const WELCOME_STEPS = [
  "Isi data dasar: nama lengkap dan jabatan atau bidang yang kamu tuju.",
  "Tambahkan pengalaman, pendidikan, dan skill. Setiap perubahan langsung tersimpan.",
  "Tekan Simpan & Selesai di langkah terakhir, lalu cari lowongan.",
] as const;
