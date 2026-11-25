import { supabase } from "@/lib/supabase";
import { isMockMode } from "@/lib/appConfig";
import { describeError } from "@/lib/authErrors";
import { applyImport, type CommitResult, type ImportSelection, type ImportWriter } from "@/lib/linkedinImport";
import { profileService } from "@/services/profileService";

/**
 * Menulis pilihan impor PDF LinkedIn ke profil. Semua penulisan lewat fungsi yang sudah dipakai halaman Profil:
 * `profileService.create*` untuk pengalaman, pendidikan, sertifikasi, penghargaan dan publikasi (tabel
 * `achievements`), dan skill, serta upsert `profiles` yang
 * sama dengan tombol Simpan (jadi pengguna tanpa baris `profiles` mendapat satu). Logika memilih dan melaporkan
 * ada di lib/linkedinImport.ts (applyImport) supaya bisa dites tanpa Supabase.
 */

/** Hasil `profileService.create*` berbentuk { data, error }. Galat dijadikan pesan Indonesia, data dikembalikan. */
async function unwrap(request: PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<unknown> {
  const res = await request;
  if (res.error) throw new Error(describeError(res.error, "Data dari PDF belum tersimpan. Coba simpan lagi. Bila tetap gagal, muat ulang halaman Profil lalu impor ulang PDF LinkedIn."));
  return res.data;
}

function supabaseWriter(userId: string): ImportWriter {
  return {
    async upsertProfile(patch) {
      // Hanya kolom yang diimpor: kolom lain di baris yang sama tidak disentuh.
      const { error } = await supabase.from("profiles").upsert({ id: userId, ...patch, updated_at: new Date().toISOString() });
      if (error) throw new Error(describeError(error, "Profil dasar belum tersimpan."));
    },
    createExperience: (row) => unwrap(profileService.createWorkExperience(row)),
    createEducation: (row) => unwrap(profileService.createEducation(row)),
    createCertification: (row) => unwrap(profileService.createCertification(row)),
    createAchievement: (row) => unwrap(profileService.createAchievement(row)),
    // Hanya kolom kosong yang masuk ke `patch` (lihat buildImportPlan), jadi pembaruan ini tidak menimpa isi yang ada.
    updateAchievement: (id, patch) => unwrap(profileService.updateAchievement(id, patch)),
    createSkill: (row) => unwrap(profileService.createSkill(row)),
  };
}

/** Mode demo tidak punya database: baris dibuat di memori dengan id sementara. */
function demoWriter(userId: string): ImportWriter {
  const made = <R extends object>(prefix: string, row: R) => ({ ...row, id: `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`, user_id: userId });
  return {
    upsertProfile: async () => {},
    createExperience: async (row) => made("exp", row),
    createEducation: async (row) => made("edu", row),
    createCertification: async (row) => made("cert", row),
    createAchievement: async (row) => made("ach", row),
    updateAchievement: async (id, patch) => ({ id, ...patch }),
    createSkill: async (row) => made("sk", row),
  };
}

export function commitLinkedInImport(userId: string, selection: ImportSelection): Promise<CommitResult> {
  return applyImport(selection, isMockMode() ? demoWriter(userId) : supabaseWriter(userId));
}
