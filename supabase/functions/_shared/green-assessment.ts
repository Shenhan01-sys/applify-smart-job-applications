// Logika murni Edge Function green-career-assessment: membaca JSON dari jawaban model, merapikan soal dan umpan
// balik, dan menetapkan status dari skor. TypeScript murni tanpa API Deno, supaya bisa dites dengan node:test.
//
// Model kadang membalas dengan daftar berisi objek, teks kosong, atau tipe yang salah. Antarmuka (routes/
// green-career.tsx) menampilkan setiap butir umpan balik sebagai teks dan memakai `id` soal sebagai kunci
// jawaban, jadi bentuknya dirapikan di sini sebelum dikirim.

/** Skor kesiapan minimal untuk status "ready". Di bawah itu pengguna mendapat jalur pengembangan, bukan penolakan. */
export const READY_THRESHOLD = 70;

/** Jumlah soal paling banyak yang dikirim ke pengguna. */
export const MAX_QUESTIONS = 6;

export interface AssessmentQuestion {
  id: string;
  type: "mcq" | "text";
  question: string;
  options?: string[];
}

export interface AssessmentFeedback {
  strengths: string[];
  gaps: string[];
  developmentPath: string[];
}

export function extractJson(s: string): any {
  const c = s.replace(/```(?:json)?/gi, "").trim();
  try { return JSON.parse(c); } catch { /* lanjut */ }
  const a = c.indexOf("{"), b = c.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(c.slice(a, b + 1)); } catch { /* lanjut */ } }
  return null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Soal yang layak ditampilkan: teks soal tidak kosong, `id` unik (dibuat q1, q2, ... bila hilang atau kembar),
 * soal pilihan ganda minimal punya dua opsi (kalau tidak, jadi soal isian). Daftar kosong berarti jawaban model
 * tidak bisa dipakai.
 */
export function normalizeQuestions(raw: unknown): AssessmentQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: AssessmentQuestion[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const q = item as { id?: unknown; type?: unknown; question?: unknown; options?: unknown } | null;
    const question = str(q?.question);
    if (!question) continue;
    const options = Array.isArray(q?.options) ? q!.options.map(str).filter(Boolean) : [];
    const isMcq = str(q?.type).toLowerCase() === "mcq" && options.length >= 2;
    let id = str(q?.id);
    if (!id || seen.has(id)) id = `q${out.length + 1}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    out.push(isMcq ? { id, type: "mcq", question, options } : { id, type: "text", question });
    if (out.length >= MAX_QUESTIONS) break;
  }
  return out;
}

/** Daftar teks tidak kosong; objek dengan `text`, `skill`, atau `message` ikut dibaca, selain itu dibuang. */
function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const o = item as { text?: unknown; skill?: unknown; message?: unknown } | null;
    const s = typeof item === "string" ? item.trim() : str(o?.text) || str(o?.skill) || str(o?.message);
    if (s) out.push(s);
  }
  return out;
}

export function normalizeFeedback(raw: unknown): AssessmentFeedback {
  const f = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    strengths: stringList(f.strengths),
    gaps: stringList(f.gaps),
    developmentPath: stringList(f.developmentPath),
  };
}

export interface ParsedScore {
  score: number;
  status: "ready" | "needs_development";
  feedback: AssessmentFeedback;
}

export const statusForScore = (score: number): "ready" | "needs_development" =>
  score >= READY_THRESHOLD ? "ready" : "needs_development";

/**
 * Hasil penilaian dari teks jawaban model, atau null bila tidak ada skor yang terbaca. Tanpa skor, jawaban
 * ditolak dan model berikutnya dicoba. Dulu jawaban yang tidak terbaca diam-diam menjadi skor 0.
 */
export function parseScoreReply(text: string): ParsedScore | null {
  const parsed = extractJson(text);
  if (!parsed || typeof parsed !== "object") return null;
  const raw = (parsed as { readinessScore?: unknown }).readinessScore;
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const score = Math.max(0, Math.min(100, Math.round(n)));
  return { score, status: statusForScore(score), feedback: normalizeFeedback((parsed as { feedback?: unknown }).feedback) };
}

/** Soal dari teks jawaban model, atau null bila tidak ada satu pun soal yang layak. */
export function parseQuestionsReply(text: string): AssessmentQuestion[] | null {
  const questions = normalizeQuestions(extractJson(text)?.questions);
  return questions.length > 0 ? questions : null;
}

// Pesan untuk pengguna (Indonesia). Antarmuka menampilkan pesan berbahasa Indonesia apa adanya.
export const MSG_GENERATE_FAILED = "Soal asesmen belum bisa dibuat karena layanan AI sedang sibuk. Coba lagi beberapa menit lagi.";
export const MSG_SCORE_FAILED = "Jawabanmu belum bisa dinilai karena layanan AI sedang sibuk. Jawabanmu masih ada di layar, coba kirim lagi beberapa menit lagi.";
export const MSG_SAVE_FAILED = "Asesmen belum bisa disimpan. Coba lagi beberapa menit lagi.";
export const MSG_SERVER_ERROR = "Terjadi gangguan di server. Coba lagi beberapa menit lagi.";
