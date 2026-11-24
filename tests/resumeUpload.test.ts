import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RESUME_ACCEPT,
  RESUME_MAX_BYTES,
  RESUME_TYPES,
  parseResumePath,
  resumeFileLabel,
  resumeObjectPath,
  validateResumeFile,
} from "../src/lib/resumeUpload.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const PDF = "application/pdf";
const DOC = "application/msword";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const UID = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";

test("batas dan peta tipe CV sama dengan bucket resumes", () => {
  assert.equal(RESUME_MAX_BYTES, 5242880);
  assert.deepEqual(RESUME_TYPES, { [PDF]: "pdf", [DOC]: "doc", [DOCX]: "docx" });
});

test("ukuran: tepat 5 MB lolos, 5 MB + 1 byte ditolak, 0 byte dan ukuran rusak ditolak", () => {
  assert.deepEqual(validateResumeFile({ name: "cv.pdf", size: RESUME_MAX_BYTES, type: PDF }), { ok: true, ext: "pdf", contentType: PDF });

  const big = validateResumeFile({ name: "cv.pdf", size: RESUME_MAX_BYTES + 1, type: PDF });
  assert.equal(big.ok, false);
  if (!big.ok) assert.match(big.reason, /maksimal 5 MB/);

  const empty = validateResumeFile({ name: "cv.pdf", size: 0, type: PDF });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.match(empty.reason, /kosong/);

  for (const size of [-1, NaN, Infinity]) assert.equal(validateResumeFile({ name: "cv.pdf", size, type: PDF }).ok, false, String(size));
});

test("tipe: PDF, DOC, dan DOCX lolos menurut MIME; format lain ditolak dengan alasan format", () => {
  assert.deepEqual(validateResumeFile({ name: "a.pdf", size: 10, type: PDF }), { ok: true, ext: "pdf", contentType: PDF });
  assert.deepEqual(validateResumeFile({ name: "a.doc", size: 10, type: DOC }), { ok: true, ext: "doc", contentType: DOC });
  assert.deepEqual(validateResumeFile({ name: "a.docx", size: 10, type: DOCX }), { ok: true, ext: "docx", contentType: DOCX });
  // MIME dengan parameter dan huruf besar tetap dikenali
  assert.equal(validateResumeFile({ name: "a.pdf", size: 10, type: "Application/PDF; charset=binary" }).ok, true);

  for (const type of ["image/png", "text/plain", "application/zip", "application/x-msdownload"]) {
    const r = validateResumeFile({ name: "cv.pdf", size: 10, type });
    assert.equal(r.ok, false, type);
    if (!r.ok) assert.equal(r.reason, "Format CV harus PDF, DOC, atau DOCX.");
  }
});

test("MIME kosong atau octet-stream: ekstensi nama berkas menentukan, tanpa membedakan huruf besar", () => {
  for (const type of ["", "application/octet-stream"]) {
    assert.deepEqual(validateResumeFile({ name: "CV Saya.pdf", size: 10, type }), { ok: true, ext: "pdf", contentType: PDF });
    assert.deepEqual(validateResumeFile({ name: "cv.doc", size: 10, type }), { ok: true, ext: "doc", contentType: DOC });
    assert.deepEqual(validateResumeFile({ name: "cv.docx", size: 10, type }), { ok: true, ext: "docx", contentType: DOCX });
    assert.deepEqual(validateResumeFile({ name: "CV-HANS.PDF", size: 10, type }), { ok: true, ext: "pdf", contentType: PDF });
    assert.deepEqual(validateResumeFile({ name: "CV.DocX", size: 10, type }), { ok: true, ext: "docx", contentType: DOCX });
    for (const name of ["cv.txt", "cv.exe", "cv", "cv.pdf.exe", "pdf", ".pdfx", ""]) {
      assert.equal(validateResumeFile({ name, size: 10, type }).ok, false, `${type || "(kosong)"} ${name}`);
    }
  }
  // MIME yang jelas salah tidak diselamatkan oleh nama berkas
  assert.equal(validateResumeFile({ name: "cv.pdf", size: 10, type: "text/plain" }).ok, false);
});

test("tipe diperiksa sebelum ukuran: berkas besar berformat salah dijelaskan sebagai format salah", () => {
  const r = validateResumeFile({ name: "video.mp4", size: RESUME_MAX_BYTES * 4, type: "video/mp4" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.reason, /Format CV/);
});

test("resumeObjectPath membentuk <user_id>/cv-<waktu>.<ext> dengan ekstensi huruf kecil", () => {
  assert.equal(resumeObjectPath(UID, "pdf", 1763600000000), `${UID}/cv-1763600000000.pdf`);
  assert.equal(resumeObjectPath(UID, "DOCX", 5), `${UID}/cv-5.docx`);
});

test("path yang dibentuk resumeObjectPath selalu lolos parseResumePath", () => {
  for (const ext of ["pdf", "doc", "docx"]) {
    const path = resumeObjectPath(UID, ext, Date.now());
    assert.deepEqual(parseResumePath(path, UID), { path, fileName: `cv-${path.split("cv-")[1]}` });
  }
});

test("parseResumePath menerima path milik pengguna dan menolak yang lain", () => {
  const ok = `${UID}/cv-1763600000000.pdf`;
  assert.deepEqual(parseResumePath(ok, UID), { path: ok, fileName: "cv-1763600000000.pdf" });
  assert.equal(parseResumePath(`${UID}/Hans_CV-2026.v2.docx`, UID)?.fileName, "Hans_CV-2026.v2.docx");

  const bad: unknown[] = [
    `${OTHER}/cv-1.pdf`, // milik pengguna lain
    `${UID}/sub/cv-1.pdf`, // subfolder
    `${UID}/../${OTHER}/cv-1.pdf`, // keluar folder
    `${UID}/cv-1.pdf/`, // segmen kosong di belakang
    `/${UID}/cv-1.pdf`, // diawali garis miring
    `cv-1.pdf`, // tanpa folder
    `${UID}/`, // tanpa nama berkas
    `${UID}/..`, // titik ganda
    `${UID}/cv..1.pdf`, // ".." di dalam nama
    `${UID}/.cv-1.pdf`, // diawali titik
    `${UID}/cv 1.pdf`, // spasi
    `${UID}/cv-1.PDF`, // ekstensi huruf besar: backend hanya menerima huruf kecil
    `${UID}/cv-1.txt`, // ekstensi salah
    `${UID}/cv-1.pdf.exe`,
    `${UID}/cv-1`,
    `${UID}/${"a".repeat(117)}.pdf`, // 121 karakter
    `https://x.supabase.co/storage/v1/object/sign/resumes/${UID}/cv-1.pdf?token=abc`, // URL
    `http://localhost/${UID}/cv-1.pdf`,
    "",
    null,
    undefined,
    42,
    {},
    [`${UID}/cv-1.pdf`],
  ];
  for (const v of bad) assert.equal(parseResumePath(v, UID), null, JSON.stringify(v));
  assert.equal(parseResumePath(ok, ""), null);
  // batas panjang nama: 120 karakter lolos
  assert.notEqual(parseResumePath(`${UID}/${"a".repeat(116)}.pdf`, UID), null);
});

test("resumeFileLabel mengambil segmen terakhir path", () => {
  assert.equal(resumeFileLabel(`${UID}/cv-1763600000000.pdf`), "cv-1763600000000.pdf");
  assert.equal(resumeFileLabel("cv.pdf"), "cv.pdf");
  assert.equal(resumeFileLabel(""), "");
  assert.equal(resumeFileLabel(undefined as unknown as string), "");
});

test("RESUME_ACCEPT memuat ekstensi dan ketiga MIME", () => {
  assert.equal(RESUME_ACCEPT, `.pdf,.doc,.docx,${PDF},${DOC},${DOCX}`);
});

// ---- Pengait layanan: dicek lewat teks sumber, sama seperti tes draftApproval ----

test("resumeService: bucket resumes, unggah dengan contentType dan upsert false, path disimpan di profiles.resume_url", () => {
  const svc = read("../src/services/resumeService.ts");
  assert.match(svc, /const BUCKET = "resumes"/);
  assert.match(svc, /from\("profiles"\)\.select\("resume_url"\)\.eq\("id", userId\)\.maybeSingle\(\)/);
  assert.match(svc, /storage\.from\(BUCKET\)\.upload\(path, file, \{ contentType: check\.contentType, upsert: false \}\)/);
  assert.match(svc, /from\("profiles"\)\.update\(\{ resume_url: path \}\)\.eq\("id", userId\)/);
  assert.match(svc, /validateResumeFile\(file\)/);
  assert.match(svc, /resumeObjectPath\(userId, check\.ext, Date\.now\(\)\)/);
});

test("resumeService: unggahan dihapus lagi bila simpan ke profil gagal; CV lama dihapus setelah yang baru tersimpan", () => {
  const svc = read("../src/services/resumeService.ts");
  const saveAt = svc.indexOf('update({ resume_url: path })');
  const cleanupAt = svc.indexOf("await removeObjectQuietly(path)", saveAt);
  const throwAt = svc.indexOf("throw fail(", cleanupAt);
  assert.ok(saveAt > 0 && cleanupAt > saveAt, "pembersihan harus sesudah update profil");
  assert.ok(throwAt > cleanupAt, "galat dilempar sesudah pembersihan");
  const oldAt = svc.indexOf("previous.path");
  assert.ok(oldAt > throwAt, "CV lama baru dihapus setelah update profil berhasil");
  assert.match(svc, /previous && previous\.path !== path/);
  // pembersihan tidak boleh melempar
  assert.match(svc, /async function removeObjectQuietly[\s\S]*?try \{[\s\S]*?\.remove\(\[path\]\)[\s\S]*?\} catch/);
});

test("resumeService.removeResume: kolom dikosongkan dulu, baru objek dihapus; galat DB menghentikan proses", () => {
  const svc = read("../src/services/resumeService.ts");
  const body = svc.slice(svc.indexOf("export async function removeResume"), svc.indexOf("export async function openResume"));
  const clearAt = body.indexOf("update({ resume_url: null })");
  const guardAt = body.indexOf("throw fail(", clearAt);
  const removeAt = body.indexOf("removeObjectQuietly(current.path)");
  assert.ok(clearAt > 0, "kolom dikosongkan");
  assert.ok(guardAt > clearAt && removeAt > guardAt, "objek dihapus hanya setelah kolom berhasil dikosongkan");
});

test("resumeService.openResume: signed URL berlaku 60 detik", () => {
  const svc = read("../src/services/resumeService.ts");
  assert.match(svc, /createSignedUrl\(path, 60\)/);
  assert.match(svc, /return data\.signedUrl/);
});

test("resumeService: mode demo tidak menyentuh Supabase dan galat berbahasa Indonesia", () => {
  const svc = read("../src/services/resumeService.ts");
  assert.match(svc, /import \{ isMockMode \} from "@\/lib\/appConfig"/);
  assert.match(svc, /import \{ describeError \} from "@\/lib\/authErrors"/);
  assert.match(svc, /tidak tersedia di mode demo/);
  for (const fn of ["getResume", "uploadResume", "removeResume", "openResume"]) {
    const start = svc.indexOf(`export async function ${fn}`);
    assert.ok(start > 0, fn);
    assert.match(svc.slice(start, start + 600), /isMockMode\(\)/, `${fn} menangani mode demo`);
  }
});

// ---- Pengait UI: kartu "CV untuk Dilampirkan" di Profil Saya ----

test("profile.tsx: kartu CV ada di luar stepper dan memakai layanan yang sama", () => {
  const src = read("../src/routes/profile.tsx");
  assert.match(src, /from "@\/services\/resumeService"/);
  assert.match(src, /<ResumeCard userId=\{user\.id\} onUploaded=\{/);
  assert.ok(src.indexOf("<ResumeCard") < src.indexOf("// ===== STEP COMPONENTS ====="), "dipasang di halaman, bukan di dalam komponen langkah");
  assert.ok(!/step === \d && <ResumeCard/.test(src), "tidak bergantung pada langkah wizard");
  for (const fn of ["getResume(userId)", "uploadResume(userId, file)", "removeResume(userId)", "openResume(resume.path)"]) {
    assert.ok(src.includes(fn), fn);
  }
  // Lihat: tab dibuka sebelum await (Safari memblokir popup sesudah await), opener diputus, tab ditutup bila gagal
  const view = src.slice(src.indexOf("const onView"), src.indexOf("const onRemove"));
  assert.ok(view.indexOf('window.open("", "_blank")') < view.indexOf("await openResume("), "tab dibuka sebelum await");
  assert.match(view, /tab\.opener = null/);
  assert.match(view, /tab\.location\.href = url/);
  assert.match(view, /tab\?\.close\(\)/);
});

test("profile.tsx: tombol Unggah CV, Lihat, Ganti, Hapus dan teks petunjuk tampil", () => {
  const src = read("../src/routes/profile.tsx");
  assert.match(src, /CV untuk Dilampirkan/);
  assert.match(src, /Agen melampirkan berkas ini saat mengisi formulir lamaran\. PDF, DOC, atau DOCX, maksimal 5 MB\./);
  assert.match(src, /"Unggah CV"/);
  for (const label of ["Lihat", "Ganti", "Hapus"]) {
    assert.match(src, new RegExp(`\\} ${label}\\s*</button>`), label);
  }
  assert.match(src, /toast\.success\("CV tersimpan"\)/);
  assert.match(src, /toast\.success\("CV dihapus"\)/);
  assert.match(src, /toast\.error\(message\)/);
});

test("profile.tsx: input berkas memakai accept CV, label terhubung, dan galat tampil di role=alert yang dirujuk aria-describedby", () => {
  const src = read("../src/routes/profile.tsx");
  assert.match(src, /accept=\{RESUME_ACCEPT\}/);
  assert.match(src, /import \{[^}]*RESUME_ACCEPT[^}]*\} from "@\/lib\/resumeUpload"/);
  assert.match(src, /id="resume-file"/);
  assert.match(src, /htmlFor="resume-file"/);
  assert.match(src, /aria-describedby=\{error \? "resume-hint resume-import-hint resume-error" : "resume-hint resume-import-hint"\}/);
  assert.match(src, /id="resume-error"[^>]*role="alert"/);
  assert.doesNotMatch(src, /window\.(confirm|alert)\(/);
});

test("profile.tsx: selama proses berjalan tombol dan input dinonaktifkan", () => {
  const src = read("../src/routes/profile.tsx");
  assert.match(src, /const working = busy !== ""/);
  // input, Lihat, Ganti, Hapus
  assert.ok((src.match(/disabled=\{working\}/g) ?? []).length >= 4);
});

test("profile.tsx: tombol Unduh PDF dan Cek ATS yang belum berfungsi tidak diubah", () => {
  const src = read("../src/routes/profile.tsx");
  assert.match(src, /Unduh PDF <span className="text-xs">\(segera hadir\)<\/span>/);
  assert.match(src, /Cek ATS <span className="text-xs font-normal">\(segera hadir\)<\/span>/);
});
