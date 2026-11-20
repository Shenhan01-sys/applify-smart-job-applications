/**
 * Kecocokan lowongan Karier Hijau dengan profil pengguna.
 *
 * Kartu Karier Hijau dulu menampilkan `jobs.match_score`, satu angka global untuk semua orang, sehingga peran yang
 * sangat berbeda semuanya tampil 90% dan label "Kecocokan dengan profilmu" menyiratkan personalisasi yang tidak
 * ada (temuan 4 uji klik UAT 20 November 2026). Kini angkanya dihitung dengan logika yang sama dengan halaman
 * Lowongan (computeMatch di lib/matchScore.ts): irisan skill profil dengan skill yang disebut lowongan.
 * Bila angka tidak bisa dihitung (profil tanpa skill, lowongan tanpa skill terbaca, skill belum termuat),
 * kartu menampilkan keadaan netral yang sama dengan halaman Lowongan, bukan angka.
 *
 * TypeScript murni, supaya jalan di bawah `node --test`.
 */

import {
  NO_JOB_SKILLS_TEXT,
  NO_PROFILE_SKILLS_TEXT,
  computeMatch,
  matchCaption,
  type MatchJobInput,
} from "./matchScore.ts";

export const GREEN_MATCH_LOADING_TEXT = "Menghitung kecocokan...";
export const GREEN_MATCH_UNAVAILABLE_TEXT = "Kecocokan belum bisa dihitung. Skill profilmu belum termuat.";

export type GreenMatchView =
  /** Skor per pengguna: persentase, dasarnya ("3 dari 5 skill cocok"), dan skill yang cocok. */
  | { kind: "score"; score: number; caption: string; matched: string[] }
  /** Profil belum punya skill yang bisa dipakai; kartu mengajak melengkapi Profil. */
  | { kind: "no-profile-skills"; text: string }
  /** Lowongan tidak menyebut skill yang terbaca, jadi tidak ada skor. */
  | { kind: "no-job-skills"; text: string }
  /** Skill profil sedang dimuat. */
  | { kind: "loading"; text: string }
  /** Skill profil gagal dimuat, jadi skor tidak dihitung. */
  | { kind: "unavailable"; text: string };

/**
 * Keadaan label kecocokan untuk satu kartu. `profileSkills` null berarti belum dimuat atau gagal dimuat
 * (dibedakan oleh `loadFailed`); daftar kosong berarti profil memang tanpa skill.
 */
export function greenMatchView(job: MatchJobInput, profileSkills: readonly string[] | null, loadFailed = false): GreenMatchView {
  if (profileSkills === null) {
    return loadFailed
      ? { kind: "unavailable", text: GREEN_MATCH_UNAVAILABLE_TEXT }
      : { kind: "loading", text: GREEN_MATCH_LOADING_TEXT };
  }
  const m = computeMatch(job, profileSkills);
  if (m.status === "ok" && m.score !== null) {
    return { kind: "score", score: m.score, caption: matchCaption(m), matched: m.matched };
  }
  if (m.status === "no-profile-skills") return { kind: "no-profile-skills", text: NO_PROFILE_SKILLS_TEXT };
  return { kind: "no-job-skills", text: NO_JOB_SKILLS_TEXT };
}

/** Skor 0..100 untuk mengurutkan kartu, atau null bila tidak bisa dihitung (diurutkan paling akhir). */
export function greenMatchScore(job: MatchJobInput, profileSkills: readonly string[] | null): number | null {
  const view = greenMatchView(job, profileSkills);
  return view.kind === "score" ? view.score : null;
}
