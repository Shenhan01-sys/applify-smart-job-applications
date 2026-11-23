// Membaca objek JSON dari jawaban model untuk draf lamaran. TypeScript murni tanpa import, supaya dites dengan node:test.
//
// Latar belakang (23 November 2026, draf GoTo Data Scientist Intern): dua jawaban Claude ditolak not_a_letter.
// Bila JSON tidak bisa diurai (terpotong di tengah, atau ada baris baru mentah di dalam string), seluruh teks mentah
// dipakai sebagai surat. Teks itu diawali "{" sehingga validator menolaknya, padahal suratnya ada di dalamnya.

/** Ganti baris baru, tab, dan karakter kontrol mentah di dalam literal string JSON dengan bentuk escape-nya. */
export function escapeControlCharsInStrings(s: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (inString) {
      if (escaped) {
        escaped = false;
        out += ch;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        out += ch;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, "0")}`;
      else out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

function tryParse(s: string): any {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Nilai string kunci `coverLetter` dari JSON yang rusak atau terpotong. Bila string-nya tidak pernah ditutup
 * (jawaban terpotong), isinya diambil sampai akhir teks lalu sisa escape yang patah dibuang. Null bila kunci tidak ada.
 */
export function salvageCoverLetter(s: string): string | null {
  const m = /"coverLetter"\s*:\s*"/.exec(s);
  if (!m) return null;
  let i = m.index + m[0].length;
  let raw = "";
  let closed = false;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\\") {
      raw += s.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch === '"') {
      closed = true;
      break;
    }
    raw += ch;
    i++;
  }
  if (!closed) raw = raw.replace(/\\u[0-9a-fA-F]{0,3}$|\\$/, "");
  try {
    const text = JSON.parse(`"${escapeControlCharsInStrings(`"${raw}"`).slice(1, -1)}"`);
    return typeof text === "string" && text.trim() ? text : null;
  } catch {
    return null;
  }
}

/**
 * Objek JSON dari jawaban model: pagar kode dibuang, lalu diurai apa adanya, dari "{" pertama sampai "}" terakhir,
 * dan sekali lagi sesudah karakter kontrol mentah di dalam string di-escape. Bila semua gagal tetapi kunci
 * coverLetter masih terbaca, dikembalikan `{ coverLetter, salvaged: true }` supaya suratnya tidak hilang.
 */
export function extractDraftJson(s: string): Record<string, any> | null {
  const cleaned = s.replace(/```(?:json)?/gi, "").trim();
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  const candidates = [cleaned];
  if (a >= 0 && b > a) candidates.push(cleaned.slice(a, b + 1));
  for (const c of candidates) {
    const v = tryParse(c) ?? tryParse(escapeControlCharsInStrings(c));
    if (v) return v;
  }
  const letter = salvageCoverLetter(cleaned);
  return letter ? { coverLetter: letter, salvaged: true } : null;
}
