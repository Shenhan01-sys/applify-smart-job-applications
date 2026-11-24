/**
 * Lampiran email "Kirim lewat Email": apa yang akan dikirim worker, dan apa yang tercatat sudah terkirim.
 *
 * Fungsi `planEmailAttachments` adalah cermin dari worker (worker/src/lib/emailAttachments.ts dan documentKeywords.ts):
 *   - CV: selalu bila persetujuan punya `resume_url` (tautan bertanda tangan yang ditulis server saat draf diajukan);
 *   - surat lamaran: selalu, sebagai PDF dari teks yang disetujui;
 *   - transkrip nilai atau portofolio: hanya bila teks lowongan memintanya DAN berkasnya ada di profil.
 * Pratinjau ini hanya informasi. Worker tetap penentu: ia membaca ulang lowongan dan berkasnya saat mengirim, dan log
 * `details.attachments` / `details.dropped` pada baris email_apply mencatat apa yang benar-benar terlampir.
 * Daftar kata kunci dan penamaan berkas sama dengan worker, dan kedua repo menjalankan vektor tes yang sama
 * (tests/emailAttachments.test.ts di sini, tests/document-keywords.test.ts di worker). Ubah satu, ubah keduanya.
 *
 * TypeScript polos (hanya impor tipe), jalan di bawah `node --test` tanpa bundler.
 */

import type { DocumentKind } from "./profileDocuments.ts";

export type AttachmentKind = "cv" | "cover_letter" | DocumentKind;

export interface PlannedAttachment {
  kind: AttachmentKind;
  /** Teks untuk pengguna, mis. "CV (CV-Budi-Uji.pdf)" atau "Cover letter (PDF)". */
  label: string;
  /** Nama berkas yang dilihat rekruter. */
  filename: string;
}

export type AttachmentWarningCode = "no_cv" | "cv_not_on_approval" | "document_missing";

export interface AttachmentWarning {
  code: AttachmentWarningCode;
  kind: AttachmentKind;
  message: string;
}

export interface AttachmentPlan {
  items: PlannedAttachment[];
  warnings: AttachmentWarning[];
  /** Email akan terkirim tanpa CV. */
  noCv: boolean;
}

// ---------------------------------------------------------------------------------------------
// Kata kunci lowongan (cermin worker/src/lib/documentKeywords.ts)
// ---------------------------------------------------------------------------------------------

const TRANSCRIPT_TERMS =
  String.raw`transcripts?(?![a-z])|transkrip(?![a-z])|academic\s+records?|grade\s+reports?|rekap(?:itulasi)?\s+nilai|kartu\s+hasil\s+studi|\bkhs\b`;
const PORTFOLIO_TERMS = String.raw`porto?folio|work\s+samples?|contoh\s+karya`;
/** "Portfolio Manager", "investment portfolio", "manajemen portofolio": bukan permintaan berkas portofolio pelamar. */
const PORTFOLIO_OTHER_SENSE = new RegExp(
  String.raw`(?:investment|project|product|loan|credit|client|fund|asset|equity|risk|bond|insurance)\s+porto?folios?` +
    String.raw`|porto?folios?\s+(?:manage\w*|analy\w+|compan\w+|risk|construction|optimi\w+|holdings?)` +
    String.raw`|(?:manajemen|manajer|analis|pengelola)\s+porto?folio`,
  "gi"
);
const TRANSCRIPT_RE = new RegExp(TRANSCRIPT_TERMS, "i");
const PORTFOLIO_RE = new RegExp(PORTFOLIO_TERMS, "i");
const MAX_TEXT_CHARS = 30_000;

/** Teks satu baris lowongan (string, larik, atau objek) digabung untuk dicocokkan. */
export function postingText(...parts: unknown[]): string {
  const out: string[] = [];
  const visit = (v: unknown, depth: number) => {
    if (v == null || depth > 3) return;
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => visit(x, depth + 1));
    else if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach((x) => visit(x, depth + 1));
  };
  parts.forEach((p) => visit(p, 0));
  return out.join("\n").slice(0, MAX_TEXT_CHARS);
}

/** Judul, deskripsi, persyaratan, dan tanggung jawab lowongan. */
export function jobPostingText(job: Record<string, unknown> | null | undefined): string {
  return postingText(job?.title, job?.description, job?.requirements, job?.responsibilities);
}

/** Dokumen opsional yang diminta teks lowongan, urutan tetap: transkrip, portofolio. */
export function documentsAskedFor(text: unknown): DocumentKind[] {
  const t = typeof text === "string" ? text.slice(0, MAX_TEXT_CHARS) : "";
  const asked: DocumentKind[] = [];
  if (TRANSCRIPT_RE.test(t)) asked.push("transcript");
  if (PORTFOLIO_RE.test(t.replace(PORTFOLIO_OTHER_SENSE, " "))) asked.push("portfolio");
  return asked;
}

// ---------------------------------------------------------------------------------------------
// Nama berkas (cermin worker/src/lib/fileNames.ts, resumeFile.ts, coverLetterFile.ts, profileDocuments.ts)
// ---------------------------------------------------------------------------------------------

/** "Budi Santoso" -> "Budi-Santoso": hanya huruf dan angka ASCII, paling banyak 40 karakter. Kosong bila tak ada yang terpakai. */
export function applicantSlug(name: unknown): string {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export const cvFileName = (name: unknown, ext: string): string => `${applicantSlug(name) ? `CV-${applicantSlug(name)}` : "CV"}.${ext.toLowerCase()}`;
export const coverLetterFileName = (name: unknown): string => (applicantSlug(name) ? `${applicantSlug(name)}-Cover-Letter.pdf` : "Cover-Letter.pdf");
export const documentFileName = (kind: DocumentKind, name: unknown, ext: string): string =>
  `${applicantSlug(name) ? `${applicantSlug(name)}-` : ""}${kind === "transcript" ? "Transcript" : "Portfolio"}.${ext.toLowerCase()}`;

/** Ekstensi CV dari tautan bertanda tangan; "pdf" bila tautan tak menyebutnya (worker memakai tipe isi berkas). Null: bukan tautan https. */
export function resumeExtFromUrl(url: unknown): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  return /\.(pdf|docx?)$/i.exec(parsed.pathname)?.[1].toLowerCase() ?? "pdf";
}

const DOC_NOUN: Record<DocumentKind, string> = { transcript: "transkrip nilai", portfolio: "portofolio" };
const DOC_LABEL: Record<DocumentKind, string> = { transcript: "Transkrip nilai", portfolio: "Portofolio" };
const KIND_LABEL: Record<AttachmentKind, string> = { cv: "CV", cover_letter: "Cover letter (PDF)", transcript: DOC_LABEL.transcript, portfolio: DOC_LABEL.portfolio };

export const NO_CV_WARNING = "Kamu belum mengunggah CV; email terkirim tanpa CV.";
export const CV_NOT_ON_APPROVAL_WARNING =
  "CV di profilmu belum ikut di persetujuan ini (diunggah sesudah draf diajukan), jadi email terkirim tanpa CV. Ajukan draf lagi dari halaman Lowongan agar CV terlampir.";

const labelOf = (kind: AttachmentKind, filename: string): string => (kind === "cover_letter" ? KIND_LABEL.cover_letter : `${KIND_LABEL[kind]} (${filename})`);

export interface PlanInput {
  /** `approval_requests.resume_url` (tautan bertanda tangan). Kosong: persetujuan tidak punya CV. */
  resumeUrl?: string | null;
  /** Profil punya CV (`profiles.resume_url` sah). Dipakai hanya untuk memilih pesan peringatan. */
  profileHasCv?: boolean;
  /** Surat yang disetujui: tanpa isi, tidak ada email (worker menolak), jadi tidak ada PDF surat. */
  coverLetter?: string | null;
  applicantName?: string | null;
  /** Judul, deskripsi, dan persyaratan lowongan (jobPostingText). */
  jobText: string;
  /** Ekstensi dokumen profil yang tersimpan (pdf, doc, docx), atau null bila tidak ada. */
  documents: Partial<Record<DocumentKind, string | null>>;
}

/** Daftar lampiran yang direncanakan untuk satu persetujuan, urutan sama dengan pesan: CV, surat, transkrip, portofolio. */
export function planEmailAttachments(input: PlanInput): AttachmentPlan {
  const items: PlannedAttachment[] = [];
  const warnings: AttachmentWarning[] = [];

  const cvExt = resumeExtFromUrl(input.resumeUrl);
  if (cvExt) {
    const filename = cvFileName(input.applicantName, cvExt);
    items.push({ kind: "cv", filename, label: labelOf("cv", filename) });
  } else if (input.profileHasCv) {
    warnings.push({ code: "cv_not_on_approval", kind: "cv", message: CV_NOT_ON_APPROVAL_WARNING });
  } else {
    warnings.push({ code: "no_cv", kind: "cv", message: NO_CV_WARNING });
  }

  if (typeof input.coverLetter === "string" && input.coverLetter.trim() !== "") {
    const filename = coverLetterFileName(input.applicantName);
    items.push({ kind: "cover_letter", filename, label: labelOf("cover_letter", filename) });
  }

  for (const kind of documentsAskedFor(input.jobText)) {
    const ext = input.documents[kind];
    if (ext) {
      const filename = documentFileName(kind, input.applicantName, ext);
      items.push({ kind, filename, label: labelOf(kind, filename) });
    } else {
      warnings.push({
        code: "document_missing",
        kind,
        message: `Lowongan ini tampaknya meminta ${DOC_NOUN[kind]}, tetapi belum ada di profilmu; email terkirim tanpa ${DOC_NOUN[kind]}.`,
      });
    }
  }

  return { items, warnings, noCv: !cvExt };
}

// ---------------------------------------------------------------------------------------------
// Yang tercatat sesudah kirim (application_logs.details.attachments / dropped, ditulis worker)
// ---------------------------------------------------------------------------------------------

export interface SentAttachment {
  kind: AttachmentKind;
  filename: string;
}

export interface NotSentAttachment {
  kind: AttachmentKind;
  reason: "no_cv" | "unavailable" | "size_cap";
}

export interface SentAttachments {
  attached: SentAttachment[];
  notAttached: NotSentAttachment[];
}

const KINDS: readonly AttachmentKind[] = ["cv", "cover_letter", "transcript", "portfolio"];
const REASONS: readonly NotSentAttachment["reason"][] = ["no_cv", "unavailable", "size_cap"];

/** Nama berkas dari log ditampilkan sebagai teks: karakter kontrol dibuang, panjang dibatasi. */
const safeName = (v: unknown): string => String(v ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").trim().slice(0, 120);

/**
 * Membaca `details` baris log email_apply yang sukses. Null bila log tidak memuat daftar lampiran (email lama,
 * sebelum fitur lampiran). Isi yang bentuknya salah diabaikan, tidak pernah melempar.
 */
export function parseSentAttachments(details: unknown): SentAttachments | null {
  const d = details && typeof details === "object" ? (details as Record<string, unknown>) : null;
  if (!d || !Array.isArray(d.attachments)) return null;
  const attached: SentAttachment[] = [];
  for (const a of d.attachments) {
    const kind = (a as any)?.kind;
    const filename = safeName((a as any)?.filename);
    if (KINDS.includes(kind) && filename) attached.push({ kind, filename });
  }
  const notAttached: NotSentAttachment[] = [];
  if (Array.isArray(d.dropped)) {
    for (const x of d.dropped) {
      const kind = (x as any)?.kind;
      const reason = (x as any)?.reason;
      if (KINDS.includes(kind) && REASONS.includes(reason)) notAttached.push({ kind, reason });
    }
  }
  return { attached, notAttached };
}

/** "CV (CV-Budi-Uji.pdf), Cover letter (PDF), ..." untuk satu baris status. */
export function describeSentAttachments(sent: SentAttachments): string {
  return sent.attached.map((a) => labelOf(a.kind, a.filename)).join(", ");
}

const REASON_TEXT: Record<NotSentAttachment["reason"], string> = {
  no_cv: "belum diunggah",
  unavailable: "tidak bisa diambil",
  size_cap: "terlalu besar",
};

const SHORT_LABEL: Record<AttachmentKind, string> = { cv: "CV", cover_letter: "Cover letter", transcript: DOC_LABEL.transcript, portfolio: DOC_LABEL.portfolio };

/** "CV (belum diunggah), Transkrip nilai (tidak bisa diambil)". Kosong bila semuanya terlampir. */
export function describeNotAttached(sent: SentAttachments): string {
  return sent.notAttached.map((n) => `${SHORT_LABEL[n.kind]} (${REASON_TEXT[n.reason]})`).join(", ");
}
