import { supabase } from "@/lib/supabase";
import { isMockMode } from "@/lib/appConfig";
import { describeError } from "@/lib/authErrors";
import {
  DOCUMENT_COLUMN,
  DOCUMENT_KINDS,
  DOCUMENT_LABEL,
  DOCUMENTS_UNAVAILABLE,
  documentObjectPath,
  documentReasonCorrupt,
  hasDocumentMagicBytes,
  isMissingDocumentColumn,
  parseDocumentPath,
  validateDocumentFile,
  type DocumentKind,
  type DocumentRef,
} from "@/lib/profileDocuments";

/** Bucket privat yang sama dengan CV. Path objek `<user_id>/<jenis>-<waktu>.<ekstensi>` disimpan di kolom profil per jenis. */
const BUCKET = "resumes";

/** Galat dengan pesan berbahasa Indonesia yang siap dibaca pengguna. */
export class ProfileDocumentError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "ProfileDocumentError";
  }
}

/** Kolom `transcript_url` / `portfolio_file_url` belum ada: migrasinya belum dijalankan. Halaman profil tetap jalan. */
export class DocumentsUnavailableError extends ProfileDocumentError {
  constructor(cause?: unknown) {
    super(DOCUMENTS_UNAVAILABLE, cause);
    this.name = "DocumentsUnavailableError";
  }
}

export type ProfileDocuments = Record<DocumentKind, DocumentRef | null>;

const emptyDocuments = (): ProfileDocuments => ({ transcript: null, portfolio: null });

/** Galat dasar: kolom yang belum ada menjadi DocumentsUnavailableError, yang lain berpesan Indonesia dengan awalan. */
const fail = (prefix: string, err: unknown): ProfileDocumentError =>
  isMissingDocumentColumn(err) ? new DocumentsUnavailableError(err) : new ProfileDocumentError(`${prefix} ${describeError(err, "Coba lagi.")}`, err);

// Mode demo tidak punya Storage: dokumen disimpan di memori saja selama halaman terbuka.
let demoDocuments: ProfileDocuments = emptyDocuments();

/** Menghapus objek di Storage tanpa melempar: dipakai untuk bersih-bersih yang tidak boleh menggagalkan proses utama. */
async function removeObjectQuietly(path: string): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // dibiarkan: objek yatim paling buruk menyisakan satu berkas di folder pengguna sendiri
  }
}

/**
 * Kedua dokumen yang tersimpan di profil (null untuk yang belum ada atau yang nilainya bukan path sah).
 * Melempar DocumentsUnavailableError bila kolomnya belum ada di database.
 */
export async function getProfileDocuments(userId: string): Promise<ProfileDocuments> {
  if (isMockMode()) return { ...demoDocuments };
  const { data, error } = await supabase.from("profiles").select("transcript_url, portfolio_file_url").eq("id", userId).maybeSingle();
  if (error) throw fail("Dokumen tambahan belum bisa dimuat.", error);
  const row = (data ?? {}) as Record<string, unknown>;
  const out = emptyDocuments();
  for (const kind of DOCUMENT_KINDS) out[kind] = parseDocumentPath(kind, row[DOCUMENT_COLUMN[kind]], userId);
  return out;
}

/**
 * Mengunggah dokumen baru, menyimpan path-nya di profil, lalu menghapus dokumen lama jenis yang sama. Bila penyimpanan
 * di profil gagal, berkas yang baru diunggah dihapus lagi supaya tidak ada berkas yatim. Kolom yang belum ada
 * diperiksa lebih dulu, jadi tidak ada berkas yang diunggah selama fitur belum aktif.
 */
export async function uploadProfileDocument(userId: string, kind: DocumentKind, file: File): Promise<DocumentRef> {
  const label = DOCUMENT_LABEL[kind];
  const check = validateDocumentFile(kind, file);
  if (!check.ok) throw new ProfileDocumentError(check.reason);
  if (typeof file?.slice === "function") {
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    if (!hasDocumentMagicBytes(head, check.ext)) {
      throw new ProfileDocumentError(documentReasonCorrupt(kind, check.ext));
    }
  }
  const path = documentObjectPath(kind, userId, check.ext, Date.now());

  if (isMockMode()) {
    const ref = parseDocumentPath(kind, path, userId) as DocumentRef;
    demoDocuments = { ...demoDocuments, [kind]: ref };
    return ref;
  }

  // Dokumen lama dibaca lebih dulu supaya bisa dihapus setelah yang baru tersimpan. Kolom belum ada: berhenti di sini.
  let previous: DocumentRef | null = null;
  try {
    previous = (await getProfileDocuments(userId))[kind];
  } catch (err) {
    if (err instanceof DocumentsUnavailableError) throw err;
  }

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: check.contentType, upsert: false });
  if (uploadError) throw fail(`${label} belum terunggah.`, uploadError);

  const { data, error: saveError } = await supabase.from("profiles").update({ [DOCUMENT_COLUMN[kind]]: path }).eq("id", userId).select("id");
  if (saveError || !data || data.length === 0) {
    await removeObjectQuietly(path);
    if (saveError) throw fail(`${label} terunggah tetapi belum tersimpan di profil.`, saveError);
    throw new ProfileDocumentError(`${label} belum tersimpan karena profilmu belum ditemukan. Simpan profil dulu, lalu unggah lagi.`);
  }

  if (previous && previous.path !== path) await removeObjectQuietly(previous.path);
  return { path, fileName: path.slice(path.lastIndexOf("/") + 1) };
}

/** Mengosongkan kolom dokumen lebih dulu, baru menghapus objeknya. Gagal menghapus objek tidak dianggap galat. */
export async function removeProfileDocument(userId: string, kind: DocumentKind): Promise<void> {
  if (isMockMode()) {
    demoDocuments = { ...demoDocuments, [kind]: null };
    return;
  }
  const current = (await getProfileDocuments(userId))[kind];
  const { error } = await supabase.from("profiles").update({ [DOCUMENT_COLUMN[kind]]: null }).eq("id", userId);
  if (error) throw fail(`${DOCUMENT_LABEL[kind]} belum terhapus.`, error);
  if (current) await removeObjectQuietly(current.path);
}

/** URL bertanda tangan yang berlaku 60 detik. Pemanggil membukanya di tab baru dengan `window.open(url, "_blank", "noopener")`. */
export async function openProfileDocument(kind: DocumentKind, path: string): Promise<string> {
  if (isMockMode()) throw new ProfileDocumentError(`Melihat ${DOCUMENT_LABEL[kind].toLowerCase()} tidak tersedia di mode demo.`);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) throw fail(`${DOCUMENT_LABEL[kind]} belum bisa dibuka.`, error);
  return data.signedUrl;
}
