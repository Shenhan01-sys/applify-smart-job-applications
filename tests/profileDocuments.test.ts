import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_COLUMN,
  DOCUMENT_KINDS,
  DOCUMENT_LABEL,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TYPES,
  DOCUMENTS_UNAVAILABLE,
  documentFileLabel,
  documentObjectPath,
  isMissingDocumentColumn,
  parseDocumentPath,
  validateDocumentFile,
} from "../src/lib/profileDocuments.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const PDF = "application/pdf";
const DOC = "application/msword";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const UID = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";

test("batas, tipe, kolom, dan nama slot sama dengan migrasi dan bucket resumes", () => {
  assert.equal(DOCUMENT_MAX_BYTES, 5242880);
  assert.deepEqual(DOCUMENT_TYPES, { [PDF]: "pdf", [DOC]: "doc", [DOCX]: "docx" });
  assert.deepEqual([...DOCUMENT_KINDS], ["transcript", "portfolio"]);
  assert.deepEqual(DOCUMENT_COLUMN, { transcript: "transcript_url", portfolio: "portfolio_file_url" });
  assert.deepEqual(DOCUMENT_LABEL, { transcript: "Transkrip nilai", portfolio: "Portofolio (berkas)" });
  for (const ext of [".pdf", ".doc", ".docx"]) assert.ok(DOCUMENT_ACCEPT.includes(ext));
  assert.equal(DOCUMENTS_UNAVAILABLE, "Dokumen tambahan belum tersedia.");
});

test("path objek: <user_id>/<jenis>-<waktu>.<ext>, ekstensi huruf kecil", () => {
  assert.equal(documentObjectPath("transcript", UID, "pdf", 1700000000000), `${UID}/transcript-1700000000000.pdf`);
  assert.equal(documentObjectPath("portfolio", UID, "DOCX", 5), `${UID}/portfolio-5.docx`);
  // waktu rusak tidak menghasilkan "NaN" di nama berkas
  assert.equal(documentObjectPath("portfolio", UID, "pdf", NaN), `${UID}/portfolio-0.pdf`);
  assert.equal(documentObjectPath("portfolio", UID, "pdf", -9), `${UID}/portfolio-0.pdf`);
});

test("parseDocumentPath: path buatan documentObjectPath diterima untuk jenisnya", () => {
  for (const kind of DOCUMENT_KINDS) {
    for (const ext of ["pdf", "doc", "docx"]) {
      const path = documentObjectPath(kind, UID, ext, 1700000000123);
      assert.deepEqual(parseDocumentPath(kind, path, UID), { path, fileName: `${kind}-1700000000123.${ext}` }, `${kind}.${ext}`);
    }
  }
});

test("parseDocumentPath: jenis lain, milik pengguna lain, subfolder, URL, dan nilai bukan teks ditolak", () => {
  const tr = `${UID}/transcript-1.pdf`;
  assert.equal(parseDocumentPath("portfolio", tr, UID), null, "kolom portofolio tidak boleh menunjuk berkas transkrip");
  assert.equal(parseDocumentPath("transcript", `${UID}/cv-1.pdf`, UID), null, "CV bukan transkrip");
  assert.equal(parseDocumentPath("transcript", tr, OTHER), null, "folder pengguna lain");
  assert.equal(parseDocumentPath("transcript", `${OTHER}/transcript-1.pdf`, UID), null);
  assert.equal(parseDocumentPath("transcript", `${UID}/sub/transcript-1.pdf`, UID), null, "subfolder");
  assert.equal(parseDocumentPath("transcript", `${UID}/../${OTHER}/transcript-1.pdf`, UID), null, "lintas folder");
  assert.equal(parseDocumentPath("transcript", `${UID}/transcript-1.pdf/`, UID), null);
  assert.equal(parseDocumentPath("transcript", `https://x.test/${tr}`, UID), null);
  assert.equal(parseDocumentPath("transcript", `transcript-1.pdf`, UID), null, "tanpa folder");
  assert.equal(parseDocumentPath("transcript", `${UID}/transcript-1.exe`, UID), null, "ekstensi lain");
  assert.equal(parseDocumentPath("transcript", `${UID}/transcript-1.pdf.exe`, UID), null);
  assert.equal(parseDocumentPath("transcript", `${UID}/transcript-.pdf`, UID), null, "tanpa waktu");
  assert.equal(parseDocumentPath("transcript", `${UID}/transcript-1a.pdf`, UID), null);
  assert.equal(parseDocumentPath("transcript", `${UID}/transcript-1.PDF`, UID), null, "huruf besar tidak dibuat oleh unggahan");
  for (const bad of [null, undefined, 42, {}, [], "", true]) assert.equal(parseDocumentPath("transcript", bad, UID), null, String(bad));
  assert.equal(parseDocumentPath("transcript", tr, ""), null, "id pengguna kosong");
});

test("documentFileLabel: segmen terakhir path, aman untuk nilai rusak", () => {
  assert.equal(documentFileLabel(`${UID}/portfolio-9.pdf`), "portfolio-9.pdf");
  assert.equal(documentFileLabel("polos.pdf"), "polos.pdf");
  assert.equal(documentFileLabel(undefined as unknown as string), "");
});

test("validasi ukuran: tepat 5 MB lolos, 5 MB + 1 ditolak, 0 byte dan ukuran rusak ditolak", () => {
  assert.deepEqual(validateDocumentFile("transcript", { name: "t.pdf", size: DOCUMENT_MAX_BYTES, type: PDF }), { ok: true, ext: "pdf", contentType: PDF });

  const big = validateDocumentFile("transcript", { name: "t.pdf", size: DOCUMENT_MAX_BYTES + 1, type: PDF });
  assert.equal(big.ok, false);
  if (!big.ok) assert.equal(big.reason, "Ukuran transkrip terlalu besar, maksimal 5 MB.");

  const empty = validateDocumentFile("portfolio", { name: "p.pdf", size: 0, type: PDF });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.reason, "Berkas portofolio kosong. Pilih berkas lain.");

  for (const size of [-1, NaN, Infinity]) assert.equal(validateDocumentFile("portfolio", { name: "p.pdf", size, type: PDF }).ok, false, String(size));
});

test("validasi tipe: PDF, DOC, DOCX lolos; tipe lain ditolak dengan pesan per jenis", () => {
  assert.deepEqual(validateDocumentFile("portfolio", { name: "a", size: 10, type: DOC }), { ok: true, ext: "doc", contentType: DOC });
  assert.deepEqual(validateDocumentFile("portfolio", { name: "a", size: 10, type: `${DOCX}; charset=binary` }), { ok: true, ext: "docx", contentType: DOCX });
  assert.deepEqual(validateDocumentFile("transcript", { name: "a", size: 10, type: "APPLICATION/PDF" }), { ok: true, ext: "pdf", contentType: PDF });

  for (const type of ["image/png", "text/plain", "application/zip", "application/x-msdownload"]) {
    const r = validateDocumentFile("transcript", { name: "nilai.pdf", size: 10, type });
    assert.equal(r.ok, false, type);
    if (!r.ok) assert.equal(r.reason, "Format transkrip harus PDF, DOC, atau DOCX.");
  }
  const rp = validateDocumentFile("portfolio", { name: "p.png", size: 10, type: "image/png" });
  if (!rp.ok) assert.equal(rp.reason, "Format portofolio harus PDF, DOC, atau DOCX.");
  // Properti prototipe bukan MIME yang dikenal
  assert.equal(validateDocumentFile("transcript", { name: "x", size: 10, type: "constructor" }).ok, false);
  assert.equal(validateDocumentFile("transcript", { name: "x", size: 10, type: "__proto__" }).ok, false);
});

test("validasi: MIME kosong atau octet-stream jatuh ke ekstensi nama berkas", () => {
  for (const type of ["", "application/octet-stream"]) {
    assert.deepEqual(validateDocumentFile("transcript", { name: "Transkrip.PDF", size: 10, type }), { ok: true, ext: "pdf", contentType: PDF });
    assert.deepEqual(validateDocumentFile("transcript", { name: "nilai.docx", size: 10, type }), { ok: true, ext: "docx", contentType: DOCX });
    assert.equal(validateDocumentFile("transcript", { name: "nilai.txt", size: 10, type }).ok, false);
    assert.equal(validateDocumentFile("transcript", { name: "nilai", size: 10, type }).ok, false);
  }
  // MIME yang dikenal tetapi salah tidak diselamatkan oleh nama berkas
  assert.equal(validateDocumentFile("transcript", { name: "nilai.pdf", size: 10, type: "image/png" }).ok, false);
});

test("isMissingDocumentColumn: 42703, PGRST204, dan pesan yang menyebut kolomnya; galat lain tidak", () => {
  assert.equal(isMissingDocumentColumn({ code: "42703", message: "column profiles.transcript_url does not exist" }), true);
  assert.equal(isMissingDocumentColumn({ code: "PGRST204", message: "Could not find the 'portfolio_file_url' column of 'profiles' in the schema cache" }), true);
  assert.equal(isMissingDocumentColumn({ message: "column profiles.transcript_url does not exist" }), true);
  assert.equal(isMissingDocumentColumn({ message: "Could not find the 'portfolio_file_url' column of 'profiles' in the schema cache" }), true);

  assert.equal(isMissingDocumentColumn({ code: "23505", message: "duplicate key" }), false);
  assert.equal(isMissingDocumentColumn({ code: "42501", message: "permission denied for table profiles" }), false);
  assert.equal(isMissingDocumentColumn({ code: "PGRST116", message: "no rows" }), false);
  assert.equal(isMissingDocumentColumn({ message: "column profiles.other_thing does not exist" }), false, "kolom lain bukan urusan fitur ini");
  assert.equal(isMissingDocumentColumn({ message: "Failed to fetch" }), false);
  for (const bad of [null, undefined, "42703", 42703, true]) assert.equal(isMissingDocumentColumn(bad), false, String(bad));
});

test("profil dan layanan: kartu dipasang di profil, layanan membaca kolom yang benar dan menurunkan galat kolom hilang", () => {
  const profile = read("../src/routes/profile.tsx");
  assert.match(profile, /import ProfileDocumentsCard from "@\/components\/profile\/ProfileDocumentsCard"/);
  // Kartu CV kini paling atas (satu titik unggah); dokumen tambahan tetap di kolom kanan, sesudah pratinjau.
  assert.match(profile, /<ResumeCard userId=\{user\.id\} onUploaded=\{[^\n]*\} \/>/);
  assert.match(profile, /\{user && <ProfileDocumentsCard userId=\{user\.id\} \/>\}/);
  assert.ok(profile.indexOf("<ResumeCard userId=") < profile.indexOf("<ProfileDocumentsCard userId="), "kartu CV lebih dulu dari dokumen tambahan");

  const card = read("../src/components/profile/ProfileDocumentsCard.tsx");
  assert.ok(card.includes("Dokumen tambahan (opsional)"));
  assert.ok(card.includes("Opsional. Agen hanya melampirkannya bila formulir lowongan memintanya."));
  assert.ok(card.includes("DocumentsUnavailableError"), "kartu menangani kolom yang belum ada");

  const service = read("../src/services/profileDocumentService.ts");
  assert.ok(service.includes('select("transcript_url, portfolio_file_url")'));
  assert.ok(service.includes("isMissingDocumentColumn"));
  assert.ok(service.includes('const BUCKET = "resumes"'));
  // layanan CV tidak disentuh: masih membaca resume_url saja
  const resume = read("../src/services/resumeService.ts");
  assert.ok(resume.includes('select("resume_url")') && !resume.includes("transcript"));
});
