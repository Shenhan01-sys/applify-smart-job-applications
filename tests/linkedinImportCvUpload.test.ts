import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CV_IMPORT_DIALOG_HINT,
  CV_IMPORT_DIALOG_TITLE,
  CV_IMPORT_SKIPPED_NOT_PDF,
  CV_IMPORT_FAILED_PREFIX,
  LINKEDIN_PDF_CV_NOTE,
  RESUME_IMPORT_HINT,
  cvImportEligibility,
  describeCvImportFailure,
  describeLinkedInImportError,
} from "../src/lib/linkedinImport.ts";

// Laporan produksi: pemilik mengunggah ulang CV di halaman Profil dan Pendidikan tetap kosong. Unggahan CV hanya
// menyimpan berkas; impor ada di kartu "Impor dari PDF" yang tidak disadari pengguna. Kini unggahan CV (PDF) menjalankan
// alur impor yang sama dengan berkas itu: pratinjau "Isi profil dari CV ini?", pengguna menyetujui, baru ada yang ditulis.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const PROFILE = "../src/routes/profile.tsx";
const CARD = "../src/components/profile/LinkedInImportCard.tsx";

test("cvImportEligibility: hanya PDF yang dibaca (MIME atau nama); DOC, DOCX, dan gambar tersimpan sebagai CV tanpa dibaca", () => {
  assert.deepEqual(cvImportEligibility({ name: "cv.pdf", size: 10, type: "application/pdf" }), { eligible: true });
  assert.deepEqual(cvImportEligibility({ name: "CV-Dewi.PDF", size: 10, type: "" }), { eligible: true });
  assert.deepEqual(cvImportEligibility({ name: "cv.pdf", size: 10, type: "application/octet-stream" }), { eligible: true });
  for (const f of [
    { name: "cv.docx", size: 10, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    { name: "cv.doc", size: 10, type: "application/msword" },
    { name: "cv.docx", size: 10, type: "" },
    { name: "cv.png", size: 10, type: "image/png" },
  ]) {
    assert.deepEqual(cvImportEligibility(f), { eligible: false, message: CV_IMPORT_SKIPPED_NOT_PDF }, f.name);
  }
  assert.match(CV_IMPORT_SKIPPED_NOT_PDF, /^CV tersimpan\./, "unggahan tidak dibatalkan");
});

test("pesan gagal impor CV: mengatakan CV sudah tersimpan, lalu alasan singkat berbahasa Indonesia", () => {
  const msg = describeCvImportFailure(describeLinkedInImportError({ status: 422, message: JSON.stringify({ success: false, code: "pdf_no_text", error: "x" }) }));
  assert.ok(msg.startsWith(CV_IMPORT_FAILED_PREFIX));
  assert.match(CV_IMPORT_FAILED_PREFIX, /CV tersimpan/);
  assert.ok(msg.length <= 400, "tetap pendek");
  assert.equal(describeCvImportFailure(""), CV_IMPORT_FAILED_PREFIX);
});

test("teks kartu: satu unggahan melakukan dua hal dan pengguna diberi tahu sebelum AI membaca CV", () => {
  assert.equal(CV_IMPORT_DIALOG_TITLE, "Isi profil dari CV ini?");
  assert.match(CV_IMPORT_DIALOG_HINT, /tidak ditimpa/);
  assert.match(CV_IMPORT_DIALOG_HINT, /belum ada yang tersimpan sampai kamu menekan Tambahkan ke profil/);
  assert.match(RESUME_IMPORT_HINT, /PDF/);
  assert.match(RESUME_IMPORT_HINT, /AI/);
  assert.match(RESUME_IMPORT_HINT, /periksa dulu/);
  assert.match(LINKEDIN_PDF_CV_NOTE, /Tidak perlu mengunggah dua kali/);
  const profile = read(PROFILE);
  assert.ok(profile.includes("{RESUME_IMPORT_HINT}"), "kartu CV untuk Dilampirkan menampilkan petunjuk impor");
  assert.ok(read(CARD).includes("{LINKEDIN_PDF_CV_NOTE}"), "kartu impor menjelaskan bahwa unggahan CV sudah mencakup impor");
});

test("kartu CV: impor dipicu hanya sesudah CV berhasil tersimpan, hanya untuk PDF, sekali per unggahan; non-PDF mendapat catatan", () => {
  const src = read(PROFILE);
  const card = src.slice(src.indexOf("function ResumeCard"), src.indexOf("// ===== STEP COMPONENTS ====="));
  const pick = card.slice(card.indexOf("const onPick"), card.indexOf("const onView"));
  // pemicu berada sesudah uploadResume berhasil, bukan di dalam blok try yang bisa gagal sebelum tersimpan
  assert.ok(pick.indexOf("uploadResume(userId, file)") < pick.indexOf("saved = true"));
  assert.ok(pick.indexOf("saved = true") < pick.indexOf("onUploaded?.(file)"));
  assert.equal(pick.match(/onUploaded\?\.\(file\)/g)?.length, 1, "satu unggahan, satu pemicu");
  assert.match(pick, /if \(saved\) \{[\s\S]*cvImportEligibility\(file\)[\s\S]*onUploaded\?\.\(file\)[\s\S]*setNote\(eligible\.message\)/);
  assert.match(pick, /fail\(err, "CV belum terunggah\. Coba lagi\."\)/, "gagal unggah tetap dilaporkan seperti semula");
  // catatan non-PDF bukan galat: role=status, bukan alert
  assert.match(src, /role="status" data-testid="resume-note"/);
  // kartu dokumen tambahan (transkrip, portofolio) tidak memicu impor
  assert.doesNotMatch(read("../src/components/profile/ProfileDocumentsCard.tsx"), /startFromCv|importLinkedInPdf|LinkedInImport/);
});

test("halaman Profil: kartu impor dipegang lewat ref dan dipicu dari kartu CV; tidak ada pemanggil AI kedua", () => {
  const src = read(PROFILE);
  assert.match(src, /const importRef = useRef<LinkedInImportHandle>\(null\)/);
  assert.match(src, /<LinkedInImportCard\s+ref=\{importRef\}/);
  assert.match(src, /<ResumeCard userId=\{user\.id\} onUploaded=\{\(file\) => \{ void importRef\.current\?\.startFromCv\(file\); \}\} \/>/);
  assert.doesNotMatch(src, /importLinkedInPdf/, "halaman tidak memanggil layanan impor sendiri");
  assert.equal(read(CARD).match(/automationApi\.importLinkedInPdf\(/g)?.length, 1, "satu pintu ke AI");
});

test("kartu impor: startFromCv memakai alur yang sama (runImport), dengan penjaga satu impor pada satu waktu dan pratinjau yang harus disetujui", () => {
  const src = read(CARD);
  assert.match(src, /forwardRef<LinkedInImportHandle, Props>/);
  assert.match(src, /useImperativeHandle\(/);
  const handle = src.slice(src.indexOf("async startFromCv"), src.indexOf("const onConfirm"));
  assert.match(handle, /cvImportEligibility\(file\)\.eligible/);
  assert.match(handle, /blockedRef\.current/, "profil belum termuat penuh: duplikat tidak bisa dicek, jadi dilewati");
  assert.match(handle, /active\.current/, "impor lain sedang berjalan: tidak ada panggilan AI kedua");
  assert.match(handle, /await runImport\(file, "cv"\)/);
  // semua jalur impor lewat runImport; pemilih berkas juga menjaga active
  const run = src.slice(src.indexOf("const runImport"), src.indexOf("const onPick"));
  assert.match(run, /active\.current = true/);
  assert.match(run, /buildImportPlan\(result, existingRef\.current\)/, "duplikat dicek terhadap profil terbaru");
  assert.match(run, /setPhase\("review"\)/, "berhenti di pratinjau; penulisan hanya dari onConfirm");
  assert.doesNotMatch(run, /commitLinkedInImport|profileService|upsert|onImported/);
  assert.match(src, /if \(!file \|\| active\.current\) return/);
  // menutup dialog (Lewati) melepas penjaga dan tidak menulis apa pun
  const close = src.slice(src.indexOf("const close = () =>"), src.indexOf("const fail ="));
  assert.match(close, /active\.current = false/);
  assert.doesNotMatch(close, /commitLinkedInImport|onImported/);
  // judul dan tombol khusus CV
  assert.match(src, /source === "cv" \? CV_IMPORT_DIALOG_TITLE/);
  assert.match(src, /source === "cv" \? "Lewati" : "Batal"/);
  // galat membaca CV memakai awalan "CV tersimpan"
  assert.match(run, /from === "cv" \? describeCvImportFailure\(message\) : message/);
  assert.equal(src.match(/commitLinkedInImport\(/g)?.length, 1);
});
