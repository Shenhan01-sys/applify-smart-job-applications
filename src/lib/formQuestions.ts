/**
 * Pertanyaan wajib yang tidak bisa dijawab agen dari profil pengguna.
 *
 * Sesudah pengguna menyetujui lamaran, worker mengisi formulir lowongan. Bila ada isian wajib yang tidak bisa
 * dijawab dari profil, agen berhenti sebelum kirim dan mencatat pertanyaannya di `application_logs.details.questions`
 * (baris action "apply"). Pengguna menjawab di halaman Persetujuan, jawabannya disimpan di tabel
 * `user_form_answers` (bank jawaban yang dipakai lagi untuk lowongan lain), lalu tugas apply yang sama diantrekan
 * ulang dan agen berjalan lagi dengan jawaban itu.
 *
 * Fungsi murni tanpa impor, supaya bisa dites dengan `node --test`. Masukan dari database tidak dipercaya:
 * bentuk yang rusak diabaikan dan tidak pernah melempar galat. `questionKey` harus identik dengan fungsi yang sama
 * di worker, karena kunci inilah yang mencocokkan jawaban tersimpan dengan pertanyaan di formulir lain.
 */

/**
 * `secret_skip` hanya dilaporkan Ekstensi Browser: kolom yang berisi data rahasia (kata sandi, PIN, kode, nomor
 * kartu). Kolom itu tidak diisi dan tidak dikirim ke AI, jadi tidak ada jawaban yang disimpan: pengguna mengisinya
 * sendiri di halaman lowongan.
 *
 * `file` juga hanya dilaporkan Ekstensi Browser: berkas (mis. CV) yang tidak terpasang atau tidak terbukti masuk di
 * antarmuka halaman, dengan label seperti "Unggah CV secara manual". Tidak ada yang diketik dan tidak ada jawaban
 * yang disimpan: pengguna mengunggahnya sendiri di tab lowongan yang dibuka ekstensi.
 */
export type QuestionKind = "text" | "textarea" | "select" | "check" | "radio" | "file" | "secret_skip";

export type PendingQuestion = {
  /** Hasil questionKey(label) yang dihitung worker; kunci jawaban tersimpan. */
  key: string;
  /** Label isian apa adanya dari formulir (sering bahasa Inggris). */
  label: string;
  kind: QuestionKind;
  /** Pilihan pada formulir untuk select dan radio; tidak ada bila formulir tidak mencantumkannya. */
  options?: string[];
  /**
   * Hanya pada log ekstensi: true bila isian wajib di formulir, false bila opsional. Tidak ada pada log worker
   * (worker hanya menanyakan isian wajib), dan tanpa kunci ini pertanyaan dianggap wajib dijawab.
   */
  required?: boolean;
};

export const MAX_QUESTIONS = 20;
export const MAX_KEY_LENGTH = 200;
export const MAX_LABEL_LENGTH = 400;
export const MAX_OPTIONS = 30;
export const MAX_OPTION_LENGTH = 120;
export const MAX_ANSWER_LENGTH = 2000;

export const ANSWER_YES = "Yes";
export const ANSWER_NO = "No";

const KINDS: ReadonlySet<string> = new Set(["text", "textarea", "select", "check", "radio", "file", "secret_skip"]);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Kunci jawaban dari label isian: huruf kecil tanpa aksen, tanpa "(required)", "(wajib)", "(wajib diisi)" dan
 * tanda bintang, setiap rangkaian karakter selain a-z dan 0-9 menjadi satu spasi. Dua label yang sama selain
 * penulisannya ("Kota Domisili (wajib)" dan "kota domisili") menghasilkan kunci yang sama.
 */
export function questionKey(label: unknown): string {
  return String(label ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\((?:required|wajib diisi|wajib)\)/g, "")
    .replace(/\*/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, MAX_KEY_LENGTH)
    .trim();
}

function cleanOptions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    // Pilihan yang terlalu panjang dibuang, bukan dipotong: jawaban terpotong tidak akan cocok dengan formulir.
    if (!text || text.length > MAX_OPTION_LENGTH || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= MAX_OPTIONS) break;
  }
  return out.length > 0 ? out : undefined;
}

const DIAL_OPTION_RE = /\+\s?\d{1,4}\b/;
const COUNTRY_CODE_LABEL_RE =
  /\b(?:kode\s+(?:negara|telepon|telp|area|panggilan)|country\s+code|dial(?:ing)?\s+code|calling\s+code|phone\s+(?:code|prefix|country))\b/i;
const BARE_INDONESIA_CODE_RE = /^\s*(?:\+\s?62|IDN|INA)\s*(?:\(\s*opsional\s*\))?\s*$/i;
const FILE_LABEL_RE = /\b(?:file|berkas|pdf|docx?|unggah|upload|lampiran|lampirkan|attach(?:ment)?)\b/i;
const FILE_OPTION_RE = /\b(?:file|berkas|pdf|docx?|unggah|upload|lampiran|lampirkan|attach(?:ment)?|browse|choose|pilih)\b/i;

/**
 * Log lama (sebelum ekstensi memperbaikinya) menyimpan pemilih kode negara telepon ("IDN (opsional)") dan sakelar
 * unggah berkas ("File PDF (opsional)") sebagai pertanyaan pilihan. Keduanya bukan pertanyaan untuk dijawab di
 * Applify: kode negara tidak ditanyakan, unggahan menjadi petunjuk unggah sendiri (jenis `file`).
 * Aturan yang sama ada di ekstensi (`controlHints.ts`) dan backend (`extension-control-hints.ts`).
 */
function isCountryCodeQuestion(label: string, options: readonly string[] | undefined): boolean {
  const list = options ?? [];
  const dial = list.filter((o) => DIAL_OPTION_RE.test(o)).length;
  if (list.length >= 3 && dial / list.length >= 0.6) return true;
  return COUNTRY_CODE_LABEL_RE.test(label) || BARE_INDONESIA_CODE_RE.test(label);
}

function isFileUploadQuestion(label: string, options: readonly string[] | undefined): boolean {
  const list = options ?? [];
  if (list.length === 0) return FILE_LABEL_RE.test(label);
  return list.every((o) => FILE_OPTION_RE.test(o)) && (FILE_LABEL_RE.test(label) || list.every((o) => FILE_LABEL_RE.test(o)));
}

/**
 * `details` satu baris application_logs (atau langsung daftar pertanyaannya) -> pertanyaan yang bisa dijawab.
 * Butir tanpa kunci atau label dibuang, jenis tak dikenal dianggap teks, kunci kembar hanya dipakai sekali,
 * paling banyak 20 pertanyaan. Log lama (tanpa `questions`) menghasilkan daftar kosong.
 */
export function parseQuestions(details: unknown): PendingQuestion[] {
  const list = Array.isArray(details) ? details : isRecord(details) ? details.questions : null;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: PendingQuestion[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const key = typeof item.key === "string" ? item.key.trim().slice(0, MAX_KEY_LENGTH) : "";
    const label = typeof item.label === "string" ? item.label.trim().slice(0, MAX_LABEL_LENGTH).trim() : "";
    // "__proto__" tidak pernah dihasilkan questionKey; kunci seperti itu hanya mungkin dari data rusak.
    if (!key || !label || key === "__proto__" || seen.has(key)) continue;
    let kind = typeof item.kind === "string" && KINDS.has(item.kind) ? (item.kind as QuestionKind) : "text";
    let options = kind === "select" || kind === "radio" ? cleanOptions(item.options) : undefined;
    if (kind === "select" || kind === "radio") {
      if (isCountryCodeQuestion(label, options)) continue;
      if (isFileUploadQuestion(label, options)) {
        kind = "file";
        options = undefined;
      }
    }
    seen.add(key);
    out.push({ key, label, kind, ...(options ? { options } : {}), ...(typeof item.required === "boolean" ? { required: item.required } : {}) });
    if (out.length >= MAX_QUESTIONS) break;
  }
  return out;
}

/** Fakta percobaan agen yang dibutuhkan untuk memutuskan apakah pertanyaan masih perlu dijawab. */
export interface QuestionFacts {
  log_status?: string | null;
  questions?: PendingQuestion[];
}

function openQuestions(facts: QuestionFacts | null | undefined): PendingQuestion[] {
  if (!facts || !Array.isArray(facts.questions)) return [];
  if (facts.log_status === "success" || facts.log_status === "submit_unverified") return [];
  return facts.questions;
}

/**
 * Pertanyaan yang masih perlu dijawab menurut percobaan terbaru. Percobaan yang sudah terkirim (success) atau
 * yang kirimnya belum terkonfirmasi (submit_unverified) tidak lagi butuh jawaban: bertanya di situ menyesatkan
 * dan bisa memicu kirim ulang. Kolom rahasia (`secret_skip`) dan berkas yang diunggah sendiri (`file`) tidak ikut:
 * keduanya tidak dijawab di Applify.
 */
export function questionsToAnswer(facts: QuestionFacts | null | undefined): PendingQuestion[] {
  return openQuestions(facts).filter((q) => q.kind !== "secret_skip" && q.kind !== "file");
}

/** Kolom rahasia yang dibiarkan kosong oleh ekstensi dan harus diisi pengguna sendiri di halaman lowongan. Aturan gerbang sama dengan questionsToAnswer. */
export function questionsToSelfFill(facts: QuestionFacts | null | undefined): PendingQuestion[] {
  return openQuestions(facts).filter((q) => q.kind === "secret_skip");
}

/** Berkas yang tidak terpasang otomatis dan harus diunggah pengguna sendiri di tab lowongan. Aturan gerbang sama dengan questionsToAnswer. */
export function questionsToUpload(facts: QuestionFacts | null | undefined): PendingQuestion[] {
  return openQuestions(facts).filter((q) => q.kind === "file");
}

/**
 * Petunjuk untuk pertanyaan berkas. Label dari ekstensi berbentuk "Unggah CV secara manual": awalan "Unggah" dan akhiran
 * "secara manual" dibuang supaya kalimatnya tidak berulang. Label lain dipakai apa adanya.
 */
export function fileUploadInstruction(label: string): string {
  const target =
    String(label ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^unggah\s+/i, "")
      .replace(/\s+secara manual$/i, "")
      .trim() || "berkas";
  return `Unggah ${target} sendiri di tab lowongan yang dibuka ekstensi, lalu tekan Kirim di sana.`;
}

/** Pertanyaan bertanda `required: false` boleh dikosongkan. Tanpa tanda itu (log lama dan log worker) pertanyaan wajib dijawab. */
export const isRequiredQuestion = (q: PendingQuestion): boolean => q.required !== false;

/** Jawaban awal per kunci: jawaban tersimpan yang masih cocok dengan pertanyaannya, selain itu kosong. */
export function initialAnswers(questions: readonly PendingQuestion[], saved: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const q of questions ?? []) {
    out[q.key] = "";
    // Kolom rahasia dan berkas tidak pernah diisi dari jawaban tersimpan.
    if (q.kind === "secret_skip" || q.kind === "file") continue;
    if (!isRecord(saved) || !hasOwn(saved, q.key)) continue;
    const value = saved[q.key];
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (!text || text.length > MAX_ANSWER_LENGTH) continue;
    if (q.kind === "check" && text !== ANSWER_YES && text !== ANSWER_NO) continue;
    if ((q.kind === "select" || q.kind === "radio") && q.options && !q.options.includes(text)) continue;
    out[q.key] = text;
  }
  return out;
}

export interface AnswerValidation {
  ok: boolean;
  /** Pesan galat per kunci pertanyaan; hanya pertanyaan yang bermasalah. */
  errors: Record<string, string>;
}

export const ERROR_EMPTY = "Isi jawaban ini.";
export const ERROR_TOO_LONG = `Jawaban terlalu panjang. Maksimal ${MAX_ANSWER_LENGTH} karakter.`;
export const ERROR_CHOOSE_OPTION = "Pilih salah satu pilihan.";
export const ERROR_CHOOSE_YES_NO = "Pilih Ya atau Tidak.";

function answerOf(answers: Record<string, string> | null | undefined, key: string): string {
  if (!isRecord(answers) || !hasOwn(answers, key)) return "";
  const value = answers[key];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Setiap pertanyaan wajib butuh jawaban tidak kosong, paling panjang 2000 karakter. Select dan radio dengan
 * pilihan harus dijawab dengan salah satu pilihan, dan check dengan "Yes" atau "No". Pertanyaan opsional
 * (`required: false`) boleh kosong, tetapi bila diisi aturan yang sama berlaku. Kolom rahasia (`secret_skip`)
 * dan berkas (`file`) tidak divalidasi. Bentuk yang tidak dikenal tidak melempar galat: dianggap belum dijawab.
 */
export function validateAnswers(questions: readonly PendingQuestion[], answers: Record<string, string> | null | undefined): AnswerValidation {
  const errors: Record<string, string> = {};
  for (const q of questions ?? []) {
    if (q.kind === "secret_skip" || q.kind === "file") continue;
    const text = answerOf(answers, q.key);
    if (!text) {
      if (!isRequiredQuestion(q)) continue;
      errors[q.key] = q.kind === "check" ? ERROR_CHOOSE_YES_NO : (q.kind === "select" || q.kind === "radio") && q.options ? ERROR_CHOOSE_OPTION : ERROR_EMPTY;
    } else if (text.length > MAX_ANSWER_LENGTH) {
      errors[q.key] = ERROR_TOO_LONG;
    } else if (q.kind === "check" && text !== ANSWER_YES && text !== ANSWER_NO) {
      errors[q.key] = ERROR_CHOOSE_YES_NO;
    } else if ((q.kind === "select" || q.kind === "radio") && q.options && !q.options.includes(text)) {
      errors[q.key] = ERROR_CHOOSE_OPTION;
    }
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export interface AnswerRow {
  question_key: string;
  question_label: string;
  answer: string;
}

/** Baris untuk tabel user_form_answers. Pertanyaan tanpa jawaban tidak ikut; teks dipangkas ke batas kolom. */
export function answersToRows(questions: readonly PendingQuestion[], answers: Record<string, string> | null | undefined): AnswerRow[] {
  const rows: AnswerRow[] = [];
  for (const q of questions ?? []) {
    if (q.kind === "secret_skip" || q.kind === "file") continue;
    const text = answerOf(answers, q.key).slice(0, MAX_ANSWER_LENGTH);
    if (!text) continue;
    rows.push({ question_key: q.key.slice(0, MAX_KEY_LENGTH), question_label: q.label.slice(0, MAX_LABEL_LENGTH), answer: text });
  }
  return rows;
}

// ---- Pesan untuk pengguna ----

export const ANSWERS_TABLE_MISSING_TEXT = "Jawaban tersimpan belum tersedia.";
export const RERUN_STARTED_TEXT = "Agen berjalan lagi dengan jawabanmu.";
/** Jawaban untuk log Ekstensi Browser: tidak ada tugas worker yang dijalankan ulang, pengguna mengisi ulang dari panel ekstensi. */
export const EXTENSION_ANSWERS_SAVED_TEXT =
  "Jawaban tersimpan. Kembali ke tab lowongan lalu klik Simpan jawaban dan isi ulang di panel Applify.";
export const SELF_FILL_LABEL = "Isi sendiri di halaman lowongan";
export const ERROR_NO_ANSWERS = "Isi minimal satu jawaban dulu.";

/**
 * Galat Supabase karena tabel user_form_answers belum ada (migrasi belum dijalankan): kode Postgres 42P01,
 * kode PostgREST PGRST205, atau pesan yang menyebut nama tabelnya.
 */
export function isMissingAnswersTable(err: unknown): boolean {
  if (!isRecord(err)) return typeof err === "string" && err.includes("user_form_answers");
  const code = typeof err.code === "string" ? err.code : "";
  if (code === "42P01" || code === "PGRST205") return true;
  const message = typeof err.message === "string" ? err.message : "";
  return message.includes("user_form_answers");
}

/**
 * Status HTTP dari POST /api/approvals/:id/rerun -> pesan singkat. undefined berarti status lain
 * (jaringan, 5xx), yang dijelaskan pemanggil.
 */
export function rerunStatusMessage(status: number | undefined): string | undefined {
  switch (status) {
    case 404:
      return "Persetujuan ini tidak ditemukan.";
    case 409:
      return "Agen belum bisa dijalankan lagi. Lamaran mungkin sudah terkirim, belum disetujui, atau agen masih bekerja. Muat ulang halaman untuk melihat statusnya.";
    case 410:
      return "Persetujuan ini sudah kedaluwarsa. Ajukan lamaran lagi dari halaman Lowongan.";
    case 422:
      return "Tidak ada tugas agen yang bisa dijalankan lagi untuk persetujuan ini.";
    case 429:
      return "Agen sudah dijalankan ulang terlalu sering. Coba lagi nanti.";
    default:
      return undefined;
  }
}
