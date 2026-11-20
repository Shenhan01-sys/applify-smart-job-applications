import { supabase } from "@/lib/supabase";
import { isMockMode } from "@/lib/appConfig";
import { describeError } from "@/lib/authErrors";
import { parseResumePath, resumeObjectPath, validateResumeFile, type ResumeRef } from "@/lib/resumeUpload";

/** Bucket privat. Path objek `<user_id>/<nama-berkas>` disimpan di `profiles.resume_url`. */
const BUCKET = "resumes";

/** Galat dengan pesan berbahasa Indonesia yang siap dibaca pengguna. */
export class ResumeError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "ResumeError";
  }
}

const fail = (prefix: string, err: unknown) => new ResumeError(`${prefix} ${describeError(err, "Coba lagi.")}`, err);

// Mode demo tidak punya Storage: CV disimpan di memori saja selama halaman terbuka.
let demoResume: ResumeRef | null = null;

/** Menghapus objek di Storage tanpa melempar: dipakai untuk bersih-bersih yang tidak boleh menggagalkan proses utama. */
async function removeObjectQuietly(path: string): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // dibiarkan: objek yatim paling buruk menyisakan satu berkas di folder pengguna sendiri
  }
}

/** CV yang tersimpan di profil, atau null bila belum ada (atau nilainya bukan path CV yang sah). */
export async function getResume(userId: string): Promise<ResumeRef | null> {
  if (isMockMode()) return demoResume;
  const { data, error } = await supabase.from("profiles").select("resume_url").eq("id", userId).maybeSingle();
  if (error) throw fail("CV belum bisa dimuat.", error);
  return parseResumePath((data as { resume_url?: unknown } | null)?.resume_url, userId);
}

/**
 * Mengunggah CV baru, menyimpan path-nya di profil, lalu menghapus CV lama. Bila penyimpanan di profil gagal,
 * berkas yang baru diunggah dihapus lagi supaya tidak ada berkas yatim.
 */
export async function uploadResume(userId: string, file: File): Promise<ResumeRef> {
  const check = validateResumeFile(file);
  if (!check.ok) throw new ResumeError(check.reason);
  const path = resumeObjectPath(userId, check.ext, Date.now());

  if (isMockMode()) {
    demoResume = parseResumePath(path, userId);
    return demoResume as ResumeRef;
  }

  // CV lama dibaca lebih dulu supaya bisa dihapus setelah yang baru tersimpan. Gagal membaca tidak menahan unggahan.
  const previous = await getResume(userId).catch(() => null);

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: check.contentType, upsert: false });
  if (uploadError) throw fail("CV belum terunggah.", uploadError);

  const { data, error: saveError } = await supabase.from("profiles").update({ resume_url: path }).eq("id", userId).select("id");
  if (saveError || !data || data.length === 0) {
    await removeObjectQuietly(path);
    if (saveError) throw fail("CV terunggah tetapi belum tersimpan di profil.", saveError);
    throw new ResumeError("CV belum tersimpan karena profilmu belum ditemukan. Simpan profil dulu, lalu unggah CV lagi.");
  }

  if (previous && previous.path !== path) await removeObjectQuietly(previous.path);
  return { path, fileName: path.slice(path.lastIndexOf("/") + 1) };
}

/** Mengosongkan `profiles.resume_url` lebih dulu, baru menghapus objeknya. Gagal menghapus objek tidak dianggap galat. */
export async function removeResume(userId: string): Promise<void> {
  if (isMockMode()) {
    demoResume = null;
    return;
  }
  const current = await getResume(userId);
  const { error } = await supabase.from("profiles").update({ resume_url: null }).eq("id", userId);
  if (error) throw fail("CV belum terhapus.", error);
  if (current) await removeObjectQuietly(current.path);
}

/** URL bertanda tangan yang berlaku 60 detik. Pemanggil membukanya di tab baru dengan `window.open(url, "_blank", "noopener")`. */
export async function openResume(path: string): Promise<string> {
  if (isMockMode()) throw new ResumeError("Melihat CV tidak tersedia di mode demo.");
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) throw fail("CV belum bisa dibuka.", error);
  return data.signedUrl;
}
