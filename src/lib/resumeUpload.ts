/**
 * Aturan unggah CV: validasi berkas di browser dan bentuk path objek di bucket Storage `resumes`.
 * Aturannya sengaja sama dengan backend dan worker (5 MB; PDF, DOC, DOCX; path `<user_id>/<nama-berkas>`),
 * supaya berkas yang lolos di sini juga diterima saat draf diajukan dan saat worker mengunggahnya ke formulir.
 * Tanpa impor, supaya bisa dites dengan `node --test`.
 */

export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

/** MIME yang diterima bucket `resumes`, dipetakan ke ekstensi berkas. */
export const RESUME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** Nilai atribut `accept` untuk input berkas CV. */
export const RESUME_ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Nama berkas yang diterima backend: huruf atau angka di depan, lalu huruf, angka, titik, garis bawah, strip; maksimal 120 karakter. */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const FILE_EXT = /\.(pdf|doc|docx)$/;

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export interface ResumeFileInfo {
  name: string;
  size: number;
  type: string;
}

export type ResumeValidation = { ok: true; ext: string; contentType: string } | { ok: false; reason: string };

export interface ResumeRef {
  /** Path objek di bucket: `<user_id>/<nama-berkas>`. */
  path: string;
  fileName: string;
}

export const RESUME_REASON_EMPTY = "Berkas CV kosong. Pilih berkas lain.";
export const RESUME_REASON_TYPE = "Format CV harus PDF, DOC, atau DOCX.";
export const RESUME_REASON_SIZE = "Ukuran CV terlalu besar, maksimal 5 MB.";

/**
 * Memeriksa berkas pilihan pengguna. Berkas diterima bila MIME-nya salah satu dari RESUME_TYPES, atau bila MIME
 * kosong atau `application/octet-stream` (sebagian browser dan sistem operasi tidak mengisinya) tetapi nama
 * berkasnya berakhiran .pdf, .doc, atau .docx tanpa membedakan huruf besar dan kecil.
 */
export function validateResumeFile(file: ResumeFileInfo): ResumeValidation {
  const size = Number(file?.size);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, reason: RESUME_REASON_EMPTY };

  const mime = String(file?.type ?? "").split(";")[0].trim().toLowerCase();
  let ext = "";
  let contentType = "";
  if (Object.prototype.hasOwnProperty.call(RESUME_TYPES, mime)) {
    ext = RESUME_TYPES[mime];
    contentType = mime;
  } else if (mime === "" || mime === "application/octet-stream") {
    const fromName = FILE_EXT.exec(String(file?.name ?? "").trim().toLowerCase());
    if (fromName) {
      ext = fromName[1];
      contentType = CONTENT_TYPE_BY_EXT[ext];
    }
  }
  if (!ext) return { ok: false, reason: RESUME_REASON_TYPE };
  if (size > RESUME_MAX_BYTES) return { ok: false, reason: RESUME_REASON_SIZE };
  return { ok: true, ext, contentType };
}

/** Banyak byte awal berkas yang dibaca untuk memeriksa tanda pengenal isinya. */
export const RESUME_HEAD_BYTES = 5;

export const RESUME_REASON_NOT_PDF =
  "Isi berkas ini bukan PDF yang sah (tidak diawali tanda %PDF-), jadi tidak diunggah dan CV yang sudah tersimpan tidak diubah. " +
  "Pilih berkas PDF lain, atau ekspor ulang CV dari aplikasi tempat kamu membuatnya.";
export const RESUME_REASON_UNREADABLE = "Berkas CV tidak bisa dibaca. Pilih berkas lain atau coba lagi.";

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** True bila byte awal berkas adalah `%PDF-`. */
export function hasPdfSignature(head: ArrayLike<number> | null | undefined): boolean {
  if (!head || head.length < PDF_SIGNATURE.length) return false;
  return PDF_SIGNATURE.every((byte, i) => head[i] === byte);
}

/**
 * Memeriksa isi berkas dari byte awalnya, setelah `validateResumeFile` lolos dan sebelum apa pun diunggah. Berkas berekstensi
 * atau bertipe PDF yang isinya bukan PDF (rusak, atau DOCX yang diganti nama) ditolak di sini, jadi CV lama tidak
 * tergantikan berkas yang tidak sah. DOC dan DOCX tidak diperiksa isinya.
 */
export function validateResumeContent(ext: string, head: ArrayLike<number> | null | undefined): { ok: true } | { ok: false; reason: string } {
  if (String(ext).toLowerCase() !== "pdf") return { ok: true };
  return hasPdfSignature(head) ? { ok: true } : { ok: false, reason: RESUME_REASON_NOT_PDF };
}

/** Path objek untuk CV baru. Nama memuat waktu unggah, jadi CV baru tidak menimpa yang lama sebelum penggantian berhasil. */
export function resumeObjectPath(userId: string, ext: string, now: number): string {
  return `${userId}/cv-${now}.${ext.toLowerCase()}`;
}

/**
 * Mengurai nilai `profiles.resume_url`. Aturannya sama dengan backend: tepat dua segmen, segmen pertama adalah
 * id pengguna, nama berkas lolos pola di atas tanpa "..", dan ekstensinya pdf, doc, atau docx.
 * Nilai lain (URL, subfolder, milik pengguna lain, kosong) menghasilkan null.
 */
export function parseResumePath(value: unknown, userId: string): ResumeRef | null {
  if (typeof value !== "string" || !userId) return null;
  const parts = value.split("/");
  if (parts.length !== 2) return null;
  const [folder, fileName] = parts;
  if (folder !== userId) return null;
  if (!FILE_NAME.test(fileName) || fileName.includes("..") || !FILE_EXT.test(fileName)) return null;
  return { path: value, fileName };
}

/** Nama berkas untuk ditampilkan: segmen terakhir path. */
export function resumeFileLabel(path: string): string {
  if (typeof path !== "string") return "";
  const parts = path.split("/");
  return parts[parts.length - 1] ?? "";
}
