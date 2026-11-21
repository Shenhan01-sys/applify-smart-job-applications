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
  const fn = src.slice(src.indexOf("const handleRequestApproval"), src.indexOf("// The user sent this application outside Applify"));
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
