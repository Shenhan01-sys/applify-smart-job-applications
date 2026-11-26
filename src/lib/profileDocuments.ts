/**
 * Dokumen tambahan opsional di Profil Saya: transkrip nilai dan berkas portofolio.
 * Berkasnya disimpan di bucket privat `resumes` yang sama dengan CV, di folder pengguna sendiri, dan path objeknya
 * di `profiles.transcript_url` dan `profiles.portfolio_file_url` (migrasi 2026-11-23_profile_optional_documents.sql).
 * Aturan berkasnya sengaja sama dengan CV (5 MB; PDF, DOC, DOCX) dan dengan worker yang mengunggahnya ke formulir.
 * Tanpa impor, supaya bisa dites dengan `node --test`.
 */

export type DocumentKind = "transcript" | "portfolio";

export const DOCUMENT_KINDS: readonly DocumentKind[] = ["transcript", "portfolio"];

export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

/** MIME yang diterima bucket `resumes`, dipetakan ke ekstensi berkas. */
export const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

/** Nilai atribut `accept` untuk input berkas dokumen tambahan. */
export const DOCUMENT_ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Kolom `profiles` yang menyimpan path objek tiap jenis dokumen. */
export const DOCUMENT_COLUMN: Record<DocumentKind, "transcript_url" | "portfolio_file_url"> = {
  transcript: "transcript_url",
  portfolio: "portfolio_file_url",
};

/** Nama slot di halaman profil. */
export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  transcript: "Transkrip nilai",
  portfolio: "Portofolio (berkas)",
};

/** Sebutan pendek di tengah kalimat galat. */
const DOCUMENT_NOUN: Record<DocumentKind, string> = {
  transcript: "transkrip",
  portfolio: "portofolio",
};

/** Pesan saat kolom baru belum ada di database (migrasi belum dijalankan). */
export const DOCUMENTS_UNAVAILABLE = "Dokumen tambahan belum tersedia.";

const FILE_EXT = /\.(pdf|doc|docx)$/;

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export interface DocumentFileInfo {
  name: string;
  size: number;
  type: string;
}

export type DocumentValidation = { ok: true; ext: string; contentType: string } | { ok: false; reason: string };

export interface DocumentRef {
  /** Path objek di bucket: `<user_id>/<jenis>-<waktu>.<ekstensi>`. */
  path: string;
  fileName: string;
}

export const documentReasonEmpty = (kind: DocumentKind): string => `Berkas ${DOCUMENT_NOUN[kind]} kosong. Pilih berkas lain.`;
export const documentReasonType = (kind: DocumentKind): string => `Format ${DOCUMENT_NOUN[kind]} harus PDF, DOC, atau DOCX.`;
export const documentReasonSize = (kind: DocumentKind): string => `Ukuran ${DOCUMENT_NOUN[kind]} terlalu besar, maksimal 5 MB.`;
export const documentReasonCorrupt = (kind: DocumentKind, ext: string): string =>
  `Isi berkas ${DOCUMENT_NOUN[kind]} tidak sesuai format ${ext.toUpperCase()} atau rusak. Pilih berkas ${ext.toUpperCase()} yang asli.`;

/**
 * Validasi magic bytes dokumen di browser sebelum dikirim ke Storage (audit 48.1 BS-U1-04).
 * PDF mengizinkan header `%PDF-` dalam 1024 byte pertama; DOCX = `PK\x03\x04`; DOC = `D0 CF 11 E0 A1 B1 1A E1`.
 */
export function hasDocumentMagicBytes(bytes: Uint8Array, ext: string): boolean {
  if (!bytes || bytes.length < 4) return false;
  const clean = String(ext ?? "").replace(/^\./, "").toLowerCase();
  if (clean === "pdf") {
    const limit = Math.min(bytes.length, 1024);
    for (let i = 0; i <= limit - 5; i++) {
      if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2d) {
        return true;
      }
    }
    return false;
  }
  if (clean === "docx") {
    return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  }
  if (clean === "doc") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0 &&
      bytes[4] === 0xa1 &&
      bytes[5] === 0xb1 &&
      bytes[6] === 0x1a &&
      bytes[7] === 0xe1
    );
  }
  return false;
}

/**
 * Memeriksa berkas pilihan pengguna. Berkas diterima bila MIME-nya salah satu dari DOCUMENT_TYPES, atau bila MIME
 * kosong atau `application/octet-stream` (sebagian browser dan sistem operasi tidak mengisinya) tetapi nama
 * berkasnya berakhiran .pdf, .doc, atau .docx tanpa membedakan huruf besar dan kecil.
 */
export function validateDocumentFile(kind: DocumentKind, file: DocumentFileInfo): DocumentValidation {
  const size = Number(file?.size);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, reason: documentReasonEmpty(kind) };

  const mime = String(file?.type ?? "").split(";")[0].trim().toLowerCase();
  let ext = "";
  let contentType = "";
  if (Object.prototype.hasOwnProperty.call(DOCUMENT_TYPES, mime)) {
    ext = DOCUMENT_TYPES[mime];
    contentType = mime;
  } else if (mime === "" || mime === "application/octet-stream") {
    const fromName = FILE_EXT.exec(String(file?.name ?? "").trim().toLowerCase());
    if (fromName) {
      ext = fromName[1];
      contentType = CONTENT_TYPE_BY_EXT[ext];
    }
  }
  if (!ext) return { ok: false, reason: documentReasonType(kind) };
  if (size > DOCUMENT_MAX_BYTES) return { ok: false, reason: documentReasonSize(kind) };
  return { ok: true, ext, contentType };
}

/** Path objek untuk dokumen baru. Nama memuat waktu unggah, jadi berkas baru tidak menimpa yang lama sebelum penggantian berhasil. */
export function documentObjectPath(kind: DocumentKind, userId: string, ext: string, now: number): string {
  const stamp = Math.max(0, Math.trunc(Number(now)) || 0);
  return `${userId}/${kind}-${stamp}.${String(ext).toLowerCase()}`;
}

/** Nama berkas yang sah untuk satu jenis: `transcript-<waktu>.<pdf|doc|docx>` atau `portfolio-<waktu>.<pdf|doc|docx>`. */
const fileNamePattern = (kind: DocumentKind): RegExp => new RegExp(`^${kind}-\\d{1,16}\\.(?:pdf|doc|docx)$`);

/**
 * Mengurai nilai kolom dokumen. Aturannya sama dengan worker: tepat dua segmen, segmen pertama adalah id pengguna,
 * nama berkas berbentuk `<jenis>-<waktu>.<ekstensi>` untuk jenis yang diminta. Nilai lain (URL, subfolder, milik
 * pengguna lain, jenis lain, kosong) menghasilkan null.
 */
export function parseDocumentPath(kind: DocumentKind, value: unknown, userId: string): DocumentRef | null {
  if (typeof value !== "string" || !userId) return null;
  const parts = value.split("/");
  if (parts.length !== 2) return null;
  const [folder, fileName] = parts;
  if (folder !== userId) return null;
  if (!fileNamePattern(kind).test(fileName)) return null;
  return { path: value, fileName };
}

/** Nama berkas untuk ditampilkan: segmen terakhir path. */
export function documentFileLabel(path: string): string {
  if (typeof path !== "string") return "";
  const parts = path.split("/");
  return parts[parts.length - 1] ?? "";
}

/**
 * Apakah galat Supabase berarti kolom dokumen belum ada di database: Postgres 42703 (undefined column, saat membaca)
 * atau PostgREST PGRST204 (kolom tidak ada di skema, saat menulis). Pesan yang menyebut kolomnya juga dikenali.
 */
export function isMissingDocumentColumn(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;
  const code = String((error as { code?: unknown }).code ?? "");
  if (code === "42703" || code === "PGRST204") return true;
  const message = String((error as { message?: unknown }).message ?? "");
  return /\b(?:transcript_url|portfolio_file_url)\b/.test(message) && /does not exist|schema cache|could not find/i.test(message);
}
