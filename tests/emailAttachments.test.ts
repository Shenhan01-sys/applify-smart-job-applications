import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CV_NOT_ON_APPROVAL_WARNING,
  NO_CV_WARNING,
  applicantSlug,
  cvFileName,
  describeNotAttached,
  describeSentAttachments,
  documentsAskedFor,
  jobPostingText,
  parseSentAttachments,
  planEmailAttachments,
  postingText,
  resumeExtFromUrl,
} from "../src/lib/emailAttachments.ts";
import { EMAIL_APPLY_EXPLANATION } from "../src/lib/emailApply.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// ---------------------------------------------------------------------------------------------
// Vektor kata kunci: SAMA dengan worker/tests/helpers/documentKeywordVectors.ts. Ubah satu, ubah keduanya.
// Tiap baris: [nama, teks lowongan, dokumen yang diminta dengan urutan tetap transkrip, portofolio].
// ---------------------------------------------------------------------------------------------

export const DOCUMENT_VECTORS: Array<[string, string, Array<"transcript" | "portfolio">]> = [
  ["id: CV, transkrip nilai, portofolio", "Mohon lampirkan CV, transkrip nilai, dan portofolio Anda.", ["transcript", "portfolio"]],
  ["en: resume and portfolio", "Please attach your resume and a portfolio of recent work.", ["portfolio"]],
  ["en: academic transcript", "Send your CV and academic transcript to hr@contoh.test", ["transcript"]],
  ["id: transkrip nilai terakhir", "Kirim CV beserta transkrip nilai terakhir.", ["transcript"]],
  ["id: Kartu Hasil Studi", "Kartu Hasil Studi wajib dilampirkan.", ["transcript"]],
  ["id: KHS", "Lampirkan KHS terbaru", ["transcript"]],
  ["id: rekap nilai", "Sertakan rekap nilai semester terakhir", ["transcript"]],
  ["en: academic records", "Include your academic records", ["transcript"]],
  ["en: work samples", "Work samples are a plus", ["portfolio"]],
  ["id: contoh karya", "Sertakan contoh karya desain Anda", ["portfolio"]],
  ["upper case", "TRANSCRIPT AND PORTFOLIO REQUIRED", ["transcript", "portfolio"]],
  ["fixed order whatever the text order", "Portofolio dulu, lalu transkrip.", ["transcript", "portfolio"]],
  ["portfolio of designs next to portfolio management", "Portfolio management experience and a portfolio of designs", ["portfolio"]],
  ["empty text", "", []],
  ["nothing asked", "Kami mencari Backend Engineer dengan pengalaman Node.js. Kirim CV ke hr@contoh.test.", []],
  ["Portfolio Manager is a job title, not a request", "Portfolio Manager at an investment fund", []],
  ["investment portfolio", "You will manage an investment portfolio and its risk.", []],
  ["manajemen portofolio", "Pengalaman manajemen portofolio kredit", []],
  ["transcription is not a transcript", "Audio transcription specialist, fast typing", []],
  ["transkripsi is not a transcript", "Staf transkripsi rapat dan notulen", []],
  ["nilai alone is not a transcript", "Kami menjunjung nilai-nilai perusahaan dan memberi nilai tambah.", []],
  ["kinds the project does not store", "Lampirkan ijazah dan sertifikat keahlian (certificate).", []],
];

test("documentsAskedFor: vektor yang sama dengan worker (Indonesia dan Inggris, tanpa salah kenal)", () => {
  const wrong = DOCUMENT_VECTORS.filter(([, text, expected]) => JSON.stringify(documentsAskedFor(text)) !== JSON.stringify(expected)).map(([n]) => n);
  assert.deepEqual(wrong, []);
  assert.ok(DOCUMENT_VECTORS.length >= 20);
});

test("vektor di frontend dan worker memang identik (berkas worker dibaca, bila ada di sebelah repo ini)", () => {
  let worker = "";
  try {
    worker = read("../../worker/tests/helpers/documentKeywordVectors.ts");
  } catch {
    return; // repo worker tidak ada di sebelah: dilewati
  }
  const mine = read("./emailAttachments.test.ts");
  const block = (src: string) => src.slice(src.indexOf("export const DOCUMENT_VECTORS"), src.indexOf("\n];", src.indexOf("export const DOCUMENT_VECTORS")));
  assert.equal(block(mine), block(worker));
});

test("documentsAskedFor dan jobPostingText: bukan string atau teks panjang sekali tidak melempar dan tidak lambat", () => {
  assert.deepEqual(documentsAskedFor(undefined), []);
  assert.deepEqual(documentsAskedFor(42), []);
  const t0 = Date.now();
  assert.deepEqual(documentsAskedFor("portfolio ".repeat(200_000) + "x".repeat(1_000_000)), ["portfolio"]);
  assert.ok(Date.now() - t0 < 1000);
  const text = jobPostingText({ title: "UI Designer", description: "Desain.", requirements: ["Portofolio wajib", { note: "transkrip nilai" }], ai_strategy: "portfolio" });
  assert.deepEqual(documentsAskedFor(text), ["transcript", "portfolio"]);
  assert.equal(postingText(null, undefined, 5, [null, ["a"]]), "a");
  assert.deepEqual(documentsAskedFor(jobPostingText(null)), []);
});

// ---------------------------------------------------------------------------------------------
// Pratinjau lampiran (cermin worker)
// ---------------------------------------------------------------------------------------------

const CV_URL = "https://proyek.supabase.co/storage/v1/object/sign/resumes/u1/cv-1.pdf?token=RAHASIA";
const LETTER = "Yth. Tim Rekrutmen, saya melamar.";
const input = (over: Record<string, unknown> = {}) => ({
  resumeUrl: CV_URL,
  profileHasCv: true,
  coverLetter: LETTER,
  applicantName: "Budi Uji",
  jobText: "Kirim CV, transkrip nilai, dan portofolio.",
  documents: { transcript: "pdf", portfolio: "docx" },
  ...over,
});

test("rencana lengkap: CV, Cover letter (PDF), transkrip dan portofolio dengan nama yang sama dengan worker", () => {
  const plan = planEmailAttachments(input());
  assert.deepEqual(plan.items.map((i) => i.kind), ["cv", "cover_letter", "transcript", "portfolio"]);
  assert.deepEqual(plan.items.map((i) => i.label), [
    "CV (CV-Budi-Uji.pdf)",
    "Cover letter (PDF)",
    "Transkrip nilai (Budi-Uji-Transcript.pdf)",
    "Portofolio (Budi-Uji-Portfolio.docx)",
  ]);
  assert.deepEqual(plan.items.map((i) => i.filename), ["CV-Budi-Uji.pdf", "Budi-Uji-Cover-Letter.pdf", "Budi-Uji-Transcript.pdf", "Budi-Uji-Portfolio.docx"]);
  assert.deepEqual(plan.warnings, []);
  assert.equal(plan.noCv, false);
  assert.ok(!JSON.stringify(plan).includes("RAHASIA"), "tautan CV tidak bocor ke rencana");
});

test("dokumen opsional hanya bila lowongan memintanya", () => {
  const plan = planEmailAttachments(input({ jobText: "Backend Engineer, Node.js." }));
  assert.deepEqual(plan.items.map((i) => i.kind), ["cv", "cover_letter"]);
  assert.deepEqual(plan.warnings, []);
  const onlyTranscript = planEmailAttachments(input({ jobText: "Lampirkan transkrip." }));
  assert.deepEqual(onlyTranscript.items.map((i) => i.kind), ["cv", "cover_letter", "transcript"]);
});

test("tanpa CV: peringatan 'Kamu belum mengunggah CV; email terkirim tanpa CV', email tetap bisa dikirim dengan surat PDF", () => {
  for (const resumeUrl of [null, undefined, "", "   ", "http://tidak-aman.test/cv.pdf", "bukan tautan"]) {
    const plan = planEmailAttachments(input({ resumeUrl, profileHasCv: false, jobText: "" }));
    assert.equal(plan.noCv, true, String(resumeUrl));
    assert.deepEqual(plan.items.map((i) => i.kind), ["cover_letter"]);
    assert.deepEqual(plan.warnings.map((w) => [w.code, w.message]), [["no_cv", NO_CV_WARNING]]);
  }
  assert.equal(NO_CV_WARNING, "Kamu belum mengunggah CV; email terkirim tanpa CV.");
});

test("CV ada di profil tetapi tidak ikut di persetujuan (diunggah sesudah draf): peringatan lain yang menunjuk ke pengajuan ulang", () => {
  const plan = planEmailAttachments(input({ resumeUrl: null, profileHasCv: true, jobText: "" }));
  assert.equal(plan.noCv, true);
  assert.deepEqual(plan.warnings.map((w) => w.code), ["cv_not_on_approval"]);
  assert.equal(plan.warnings[0].message, CV_NOT_ON_APPROVAL_WARNING);
  assert.match(CV_NOT_ON_APPROVAL_WARNING, /Ajukan draf lagi/);
});

test("dokumen diminta tetapi belum ada di profil: peringatan per dokumen, tidak masuk daftar lampiran", () => {
  const plan = planEmailAttachments(input({ documents: { transcript: null, portfolio: "pdf" } }));
  assert.deepEqual(plan.items.map((i) => i.kind), ["cv", "cover_letter", "portfolio"]);
  assert.deepEqual(plan.warnings.map((w) => [w.code, w.kind]), [["document_missing", "transcript"]]);
  assert.match(plan.warnings[0].message, /meminta transkrip nilai.*belum ada di profilmu/);
});

test("surat kosong: tidak ada PDF surat dalam rencana (worker juga menolak email tanpa surat)", () => {
  for (const coverLetter of [null, undefined, "", "  \n "]) {
    assert.deepEqual(planEmailAttachments(input({ coverLetter, jobText: "" })).items.map((i) => i.kind), ["cv"]);
  }
});

test("nama pelamar: aksen dan karakter jalur dibersihkan, tanpa nama dipakai nama polos; ekstensi CV dari tautan", () => {
  assert.equal(applicantSlug("Ñandú ../Évé"), "Nandu-Eve");
  assert.equal(applicantSlug("  "), "");
  assert.equal(applicantSlug("a".repeat(100)).length, 40);
  assert.equal(cvFileName("Budi Santoso", "PDF"), "CV-Budi-Santoso.pdf");
  assert.equal(cvFileName(null, "docx"), "CV.docx");
  assert.deepEqual(planEmailAttachments(input({ applicantName: null, jobText: "" })).items.map((i) => i.filename), ["CV.pdf", "Cover-Letter.pdf"]);
  assert.equal(resumeExtFromUrl("https://x.supabase.co/storage/v1/object/sign/resumes/u1/cv-2.DOCX?token=a"), "docx");
  assert.equal(resumeExtFromUrl("https://x.supabase.co/storage/v1/object/sign/resumes/u1/cv-2?token=a"), "pdf");
  assert.equal(resumeExtFromUrl("http://x.test/cv.pdf"), null);
  assert.equal(resumeExtFromUrl(undefined), null);
});

// ---------------------------------------------------------------------------------------------
// Sesudah kirim: yang dicatat worker di details
// ---------------------------------------------------------------------------------------------

test("parseSentAttachments: nama berkas yang terlampir dan yang tidak, dari details log email_apply", () => {
  const sent = parseSentAttachments({
    to: "hrd@contoh.test",
    attachments: [
      { kind: "cv", filename: "CV-Budi-Uji.pdf", bytes: 4017 },
      { kind: "cover_letter", filename: "Budi-Uji-Cover-Letter.pdf", bytes: 1200 },
    ],
    dropped: [{ kind: "transcript", reason: "unavailable", note: "tidak ada berkas di profil" }, { kind: "portfolio", reason: "size_cap", filename: "x.pdf", bytes: 9 }],
  })!;
  assert.equal(describeSentAttachments(sent), "CV (CV-Budi-Uji.pdf), Cover letter (PDF)");
  assert.equal(describeNotAttached(sent), "Transkrip nilai (tidak bisa diambil), Portofolio (terlalu besar)");
  const noCv = parseSentAttachments({ attachments: [{ kind: "cover_letter", filename: "A-Cover-Letter.pdf", bytes: 1 }], dropped: [{ kind: "cv", reason: "no_cv" }] })!;
  assert.equal(describeNotAttached(noCv), "CV (belum diunggah)");
});

test("parseSentAttachments: log lama tanpa daftar, bentuk salah, jenis asing, dan karakter kontrol tidak melempar", () => {
  assert.equal(parseSentAttachments(undefined), null);
  assert.equal(parseSentAttachments(null), null);
  assert.equal(parseSentAttachments({ to: "a@b.test", note: "email sent" }), null);
  assert.equal(parseSentAttachments({ attachments: "bukan larik" }), null);
  const messy = parseSentAttachments({
    attachments: [null, 5, { kind: "virus", filename: "x.exe" }, { kind: "cv" }, { kind: "cv", filename: "CV\r\nBcc: x.pdf" }],
    dropped: [{ kind: "cv", reason: "aneh" }, "x"],
  })!;
  assert.deepEqual(messy.attached, [{ kind: "cv", filename: "CV  Bcc: x.pdf" }]);
  assert.deepEqual(messy.notAttached, []);
  assert.equal(describeSentAttachments({ attached: [], notAttached: [] }), "");
});

// ---------------------------------------------------------------------------------------------
// Kabel layar dan layanan, dan kontrak dengan worker
// ---------------------------------------------------------------------------------------------

test("penjelasan di layar tidak lagi berkata tanpa lampiran, dan menyebut lampiran yang dikirim", () => {
  assert.doesNotMatch(EMAIL_APPLY_EXPLANATION, /tanpa lampiran|teks polos/i);
  assert.match(EMAIL_APPLY_EXPLANATION, /lampiran CV serta surat lamaran \(PDF\)/);
  assert.match(EMAIL_APPLY_EXPLANATION, /Transkrip nilai atau portofolio dilampirkan hanya bila lowongan memintanya/);
  assert.match(EMAIL_APPLY_EXPLANATION, /satu pengiriman/);
});

test("kabel: panel menampilkan daftar lampiran sebelum konfirmasi, peringatan tanpa CV dengan tautan ke Profil, dan lampiran terkirim", () => {
  const panel = read("../src/components/EmailApplyPanel.tsx");
  assert.match(panel, /data-testid="email-attachments"/);
  assert.match(panel, /Lampiran yang akan dikirim/);
  assert.match(panel, /data-testid=\{`email-attachment-warning-\$\{w\.code\}`\}/);
  assert.match(panel, /<Link to="\/profile"/);
  assert.match(panel, /data-testid="email-confirm-attachments"/);
  assert.match(panel, /data-testid="email-sent-attachments"/);
  assert.match(panel, /Terkirim dengan lampiran/);
  assert.doesNotMatch(panel, /tanpa lampiran/i);
  const page = read("../src/routes/approvals.tsx");
  assert.match(page, /plan=\{emailData\.attachmentPlans\[request\.id\]\}/);
  assert.match(page, /sent=\{emailData\.sentAttachments\[request\.id\]\}/);
});

test("kabel: layanan membaca profil dan lowongan dengan sesi pengguna sendiri dan tidak menulis apa pun", () => {
  const svc = read("../src/services/emailApplyService.ts");
  assert.match(svc, /planEmailAttachments\(/);
  assert.match(svc, /parseSentAttachments\(/);
  assert.match(svc, /\.select\("full_name, resume_url, transcript_url, portfolio_file_url"\)/);
  assert.match(svc, /isMissingDocumentColumn\(res\.error\)/);
  assert.doesNotMatch(svc, /\.(insert|update|upsert|delete)\(/);
  assert.doesNotMatch(svc, /createSignedUrl|storage\.from/);
});

test("kontrak dengan worker: sumber CV, endpoint upload Gmail, bentuk log attachments dan dropped", () => {
  const handler = read("../../worker/src/handlers/emailApply.ts");
  // BS-U4-01: CV = CV profil saat ini (resolveCurrentResumeUrl), dengan resume_url persetujuan sebagai pembanding dan cadangan.
  assert.match(handler, /approvalUrl: \(verdict\.row as any\)\.resume_url/);
  assert.match(handler, /const resumeUrl = currentResume\.url \?\? ""/);
  assert.match(handler, /resumeUrl,\n\s+profile,/);
  assert.match(handler, /upload\/gmail\/v1\/users\/me\/messages\/send\?uploadType=media/);
  assert.match(handler, /"Content-Type": "message\/rfc822"/);
  assert.match(handler, /attachments: files\.attachments, dropped: files\.dropped/);
  const attachments = read("../../worker/src/lib/emailAttachments.ts");
  assert.match(attachments, /export type DropReason = "no_cv" \| "unavailable" \| "size_cap"/);
  assert.match(attachments, /export type AttachmentKind = "cv" \| "cover_letter" \| DocumentKind/);
  assert.match(attachments, /ATTACHMENT_TOTAL_MAX_BYTES = 20 \* 1024 \* 1024/);
  // Nama berkas yang dipratinjau sama dengan yang dibuat worker.
  assert.match(read("../../worker/src/lib/resumeFile.ts"), /`\$\{slug \? `CV-\$\{slug\}` : "CV"\}\.\$\{ext/);
  assert.match(read("../../worker/src/lib/coverLetterFile.ts"), /name \? `\$\{name\}-Cover-Letter\.pdf` : "Cover-Letter\.pdf"/);
  assert.match(read("../../worker/src/lib/profileDocuments.ts"), /suffix = kind === "transcript" \? "Transcript" : "Portfolio"/);
});
