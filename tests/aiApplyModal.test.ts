import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Pemeriksaan kabel statis pada komponen React (suite ini tidak punya DOM): membaca teks sumbernya.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("tab CV tidak menampilkan optimizedCV.summary sebagai Ringkasan Profesional (isinya aiNotes, duplikat tab Strategi)", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  const edge = read("../supabase/functions/generate-application/index.ts");
  // Edge Function memang mengisi summary dengan aiNotes, jadi menampilkannya sebagai ringkasan profil menyesatkan.
  assert.match(edge, /optimizedCV: \{ summary: parsed\.aiNotes/);
  const cv = src.slice(src.indexOf('activeTab === "cv"'), src.indexOf('activeTab === "strategy"'));
  assert.doesNotMatch(cv, /Ringkasan Profesional/);
  assert.doesNotMatch(cv, /optimizedCV\?\.summary/);
  assert.match(cv, /Skill yang Disorot/);
});

test("pengajuan persetujuan yang gagal: galat tampil di footer dekat tombol dan lewat toast.error", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  const fn = src.slice(src.indexOf("const handleRequestApproval"), src.indexOf("// Fill-only run:"));
  // galat tidak lagi masuk ke setError (area isi yang bisa tergulir keluar layar)
  assert.doesNotMatch(fn, /setError\(`/);
  assert.match(fn, /setApprovalError\(message\)/);
  assert.match(fn, /toast\.error\(message\)/);
  assert.match(fn, /describeApprovalError\(err, "Draf belum bisa diajukan\."\)/);
  // dibersihkan saat mencoba lagi, supaya galat lama tidak menempel
  assert.match(fn.slice(0, fn.indexOf("await persistPendingEdit")), /setApprovalError\(""\)/);

  // kotak galat ada di footer (setelah komentar "Footer Actions"), role=alert, tepat sebelum baris tombol
  const footer = src.slice(src.indexOf("{/* Footer Actions */}"));
  const alertAt = footer.indexOf('id="apply-approval-error"');
  const buttonsAt = footer.indexOf("Ajukan ke Persetujuan");
  assert.ok(alertAt > 0 && alertAt < buttonsAt, "kotak galat berada di atas tombol Ajukan ke Persetujuan");
  assert.match(footer.slice(Math.max(0, alertAt - 60), alertAt + 80), /role="alert"/);
  assert.match(footer, /aria-describedby=\{approvalError \? "apply-approval-error" : undefined\}/);
});

test("temuan 32: draf baru membuat lencana kuota di halaman Lowongan dibaca ulang, draf ulang gratis tidak", () => {
  const modal = read("../src/components/AIApplyModal.tsx");
  assert.match(modal, /onDraftCreated\?: \(\) => void;/);
  assert.match(modal, /onSuccess, onDraftCreated \}: AIApplyModalProps/);
  const generate = modal.slice(modal.indexOf("const generate = async"), modal.indexOf("// Free preview-style regeneration"));
  assert.match(generate, /onDraftCreated\?\.\(\);/);
  // dipanggil sesudah draf berhasil dibuat, bukan sebelum atau saat gagal
  assert.ok(generate.indexOf("createDraftWithAnalysis") < generate.indexOf("onDraftCreated?.()"));
  assert.ok(generate.indexOf("onDraftCreated?.()") < generate.indexOf("} catch (err"));
  // menulis ulang surat (mode analyze) tidak memakai kuota, jadi tidak membaca ulang kuota
  const regenerate = modal.slice(modal.indexOf("const regenerate = async"), modal.indexOf("const regenerate = async") + 1500);
  assert.doesNotMatch(regenerate.slice(0, regenerate.indexOf("finally")), /onDraftCreated/);

  const jobs = read("../src/routes/jobs.tsx");
  assert.match(jobs, /const \{ quota: draftQuota, reload: reloadQuota \} = useSubscription\(\);/);
  assert.match(jobs, /onDraftCreated=\{reloadQuota\}/);
  assert.match(jobs, /\$\{draftQuota\.remaining\} draf AI tersisa bulan ini/);
});

test("temuan 30: jendela draf menyaring Skill yang Disorot dengan skill profil dari halaman Lowongan", () => {
  const modal = read("../src/components/AIApplyModal.tsx");
  const jobs = read("../src/routes/jobs.tsx");
  // halaman Lowongan memuat skill profil dengan pemuat yang sama seperti Lamaran Saya dan meneruskannya ke jendela
  assert.match(jobs, /profileSkillList\(await profileService\.getSkillSource\(userId\)\)/);
  assert.match(jobs, /<AIApplyModal[^>]*?profileSkills=\{profileSkills\}/s);
  assert.match(modal, /profileSkills\?: readonly string\[\] \| null;/);
  assert.match(modal, /match = null, profileSkills = null, onClose/);
  // daftar yang tampil dihitung saat render dari isi mentah draf, dengan skill profil
  assert.match(modal, /highlightedSkills\(rawSkills, profileSkills\)/);
  // ketiga jalur yang mengisi draf (draf lama, draf baru, tulis ulang) menyimpan isi mentahnya
  assert.equal(modal.split("setRawSkills(app.tailored_skills)").length - 1, 2, "draf lama dan draf baru");
  assert.match(modal, /setRawSkills\(insights\.tailoredSkills\)/);
  // tab CV dan hitungan "Skill disorot AI" memakai daftar yang sudah disaring, bukan isi mentah
  const cv = modal.slice(modal.indexOf('activeTab === "cv"'), modal.indexOf('activeTab === "strategy"'));
  assert.match(cv, /shownSkills\.map\(/);
  assert.match(modal, /\{shownSkills\.length\}/);
  assert.doesNotMatch(modal, /aiGenerated\.tailoredSkills/);
  // tidak ada pemanggilan tanpa skill profil yang tersisa di jendela ini
  assert.doesNotMatch(modal, /highlightedSkills\((?:app|insights)\./);
});

test("klik ganda: buat draf, ajukan persetujuan, dan isi formulir dijaga ref sinkron, bukan hanya state", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  assert.match(src, /useRef\(\{ generate: false, request: false, enqueue: false \}\)/);
  for (const [fn, key, end] of [
    ["const generate = async", "generate", "// Free preview-style regeneration"],
    ["const handleRequestApproval", "request", "// Fill-only run:"],
    ["const handleAutoApply", "enqueue", "const tabs = ["],
  ] as const) {
    const body = src.slice(src.indexOf(fn), src.indexOf(end));
    assert.match(body, new RegExp(`if \\(inFlight\\.current\\.${key}\\) return;`), `${key}: keluar bila sudah berjalan`);
    assert.ok(body.indexOf(`inFlight.current.${key} = true`) < body.indexOf("await "), `${key}: kunci dipasang sebelum await pertama`);
    assert.match(body, new RegExp(`finally \\{[^}]*inFlight\\.current\\.${key} = false`), `${key}: kunci dilepas di finally`);
  }
});

test("Isi Formulir Saja disembunyikan untuk portal login yang butuh ekstensi, dan peringatan ekstensi tampil", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  assert.match(src, /needsBrowserExtension\(channelInfo\)/);
  assert.match(src, /!channelInfo\.manualOnly && !needsExtension && \(/);
  assert.match(src, /<p id="apply-fill-hint"/);
  assert.match(src, /jobData\?\.external_url && !channelInfo\.manualOnly && !needsExtension && \(\s*<>\s*Tombol/);
  assert.match(src, /Portal ini butuh Ekstensi Browser/);
  assert.match(src, /lowongan berlabel \[UJI\]/);
});

test("tab CV menjelaskan bahwa isinya saran skill, bukan berkas PDF baru", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  const cv = src.slice(src.indexOf('activeTab === "cv"'), src.indexOf('activeTab === "strategy"'));
  assert.match(cv, /saran untuk CV/);
  assert.match(cv, /Bukan berkas PDF baru/);
});

test("UX AIApplyModal: tombol tandai kirim manual dihapus, Batal edit mereset surat, dan tulis ulang menjaga editan manual", () => {
  const src = read("../src/components/AIApplyModal.tsx");
  assert.doesNotMatch(src, /Sudah kukirim sendiri|handleMarkSentManually|submitApplication/);
  assert.match(src, /const handleCancelEdit = \(\) => \{\s*setEditedCoverLetter/);
  assert.match(src, /setConfirmRewrite\(true\)/);
});

test("sisa istilah Inggris di Persetujuan dan kartu profil sudah dirapikan", () => {
  const modal = read("../src/components/ApprovalReviewModal.tsx");
  assert.doesNotMatch(modal, /Gerbang Persetujuan<\/DialogTitle>/);
  assert.doesNotMatch(modal, /Belum ada cover letter/);
  const profile = read("../src/routes/profile.tsx");
  assert.match(profile, /id="resume-section"/);
  assert.match(profile, /Mulai dari sini/);
  assert.match(read("../src/components/profile/LinkedInImportCard.tsx"), /href="#resume-section"/);
});
