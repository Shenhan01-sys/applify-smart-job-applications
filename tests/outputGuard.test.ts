import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  acceptCoverLetter,
  checkGrounding,
  formatWarningsText,
  selectLanguage,
  stripReasoning,
  validateCoverLetter,
} from "../supabase/functions/_shared/output-guard.ts";

// Penjaga mutu keluaran AI untuk Edge Function generate-application. Berkas ini salinan identik dari
// project/backend/services/ai-output-guard.ts (backend memeriksa kesamaannya; uji lengkapnya ada di sana).
// Di sini hanya perilaku yang dipakai Edge Function: pembersih, validator surat, bahasa, dan dasar fakta.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const LETTER =
  "Dengan hormat,\n\nSaya melamar posisi Akuntan di Deloitte Indonesia. Selama lebih dari satu dekade bekerja di industri akuntansi di Bandung, " +
  "saya menyusun laporan keuangan dan melakukan audit internal untuk klien yang beragam.\n\n" +
  "Saya terbiasa bekerja dalam tim, menjaga ketelitian data, dan menyampaikan temuan dengan jelas kepada pimpinan. " +
  "Saya ingin berkontribusi pada pekerjaan audit yang dilakukan perusahaan Anda dan belajar dari rekan kerja yang berpengalaman.\n\n" +
  "Terima kasih atas perhatian Anda. Saya siap berdiskusi lebih lanjut kapan pun diperlukan.\n\nHormat saya,\nEko Dimas";

test("pembersih: <think> tanpa penutup menjadi kosong; <think>...</think> dibuang dan jawabannya tetap", () => {
  assert.equal(stripReasoning("<think>\nThinking Process:\n1. Analisis ...").text, "");
  assert.equal(stripReasoning('<think>pikir</think>{"coverLetter":"x"}').text, '{"coverLetter":"x"}');
});

test("surat dari Edge Function: huruf non-Latin ditolak tanpa cadangan; surat Indonesia sah diterima", () => {
  const stray = LETTER.replace("laporan keuangan", "laporan خوبی keuangan");
  const bad = acceptCoverLetter(stray, { language: "id" });
  assert.equal(bad.ok, false);
  if (bad.ok === false) assert.deepEqual(bad.reasons, ["stray_script"]);
  assert.equal(acceptCoverLetter(LETTER, { language: "id" }).ok, true);
});

test("surat berbahasa Inggris untuk permintaan Indonesia = penolakan lunak dengan teks cadangan (model berikutnya dicoba)", () => {
  const english =
    "I am excited to apply for the accountant position at your firm. Over the last ten years I have prepared financial reports and led internal audits for our clients. " +
    "I work well with a team, keep my data accurate, and explain the findings clearly to the people who rely on them. " +
    "I would be glad to talk about how I can contribute to the work that your team does, and I am ready to learn from the people I will work with. Thank you for your time.";
  const out = acceptCoverLetter(english, { language: "id" });
  assert.equal(out.ok, false);
  if (out.ok === false) {
    assert.deepEqual(out.reasons, ["language_mismatch"]);
    assert.ok(out.fallbackText);
  }
  assert.equal(validateCoverLetter(english, { language: "en" }).warnings.length, 0);
});

test("bahasa: bawaan Indonesia, Inggris hanya bila lowongan jelas berbahasa Inggris atau diminta", () => {
  assert.equal(selectLanguage({ jobText: "Membangun antarmuka web berperforma tinggi untuk jutaan pengguna menggunakan React." }), "id");
  assert.equal(selectLanguage({}), "id");
  assert.equal(
    selectLanguage({ jobText: "We are looking for an engineer with experience in building services. You will work with our team on the platform that our customers use." }),
    "en"
  );
  assert.equal(selectLanguage({ requested: "en" }), "en");
});

test("dasar fakta: persen yang tidak ada di profil menjadi peringatan dan masuk ke teks catatan draf", () => {
  const warnings = checkGrounding("Saya menurunkan biaya audit 35 % dan memimpin 8 orang.", {
    text: "Eko Dimas, akuntan 11 tahun di Bandung.",
  });
  assert.deepEqual(warnings.map((w) => w.kind), ["unsupported_percentage", "unsupported_number"]);
  const notes = formatWarningsText(warnings);
  assert.match(notes, /^Periksa sebelum dikirim:/);
  assert.match(notes, /35%/);
  assert.equal(formatWarningsText([]), "");
});

test("Edge Function memakai penjaga: bersihkan <think>, validasi surat, bahasa, peringatan di ai_notes, dan galat 502 bila semua ditolak", () => {
  const fn = read("../supabase/functions/generate-application/index.ts");
  assert.match(fn, /from "\.\.\/_shared\/output-guard\.ts"/);
  assert.match(fn, /stripReasoning\(raw\)/);
  assert.match(fn, /acceptCoverLetter\(/);
  assert.match(fn, /selectLanguage\(\{ requested: requestedLanguage/);
  assert.match(fn, /languageInstruction\(language\)/);
  assert.match(fn, /GROUNDING_RULES/);
  assert.match(fn, /checkGrounding\(/);
  assert.match(fn, /aiNotes,\s*\n\s*matchScore/, "result.aiNotes memuat peringatan, dan itulah yang disimpan ke ai_notes");
  assert.match(fn, /ai_notes: result\.aiNotes/);
  assert.match(fn, /"AI generation failed", detail: lastDetail, rejected:/);
  // kuota baru dipakai setelah ada surat yang lolos
  assert.ok(fn.indexOf("if (!parsed)") < fn.indexOf('rpc("consume_monthly_apply"'));
});
