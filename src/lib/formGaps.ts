/**
 * Isian wajib yang masih kosong saat agen berhenti di formulir lowongan.
 *
 * Worker menulis satu baris `application_logs` (action "apply") setiap kali agen mencoba mengisi formulir.
 * Baris berstatus "ready" berarti formulir terisi tetapi tombol kirim tidak ditekan; `details.remaining_required`
 * memuat label isian wajib yang tidak bisa diisi. Status lamaran tetap "ready"; layar hanya menampilkan
 * kekurangannya.
 *
 * Fungsi murni tanpa impor, supaya bisa dites dengan `node --test`. Masukan dari database tidak dipercaya:
 * bentuk yang rusak diabaikan dan tidak pernah melempar galat.
 */

export type FormGaps = {
  /** Label isian wajib yang masih kosong (apa adanya dari formulir, biasanya bahasa Inggris). */
  remaining: string[];
  /** Waktu baris log yang dipakai (created_at, apa adanya). */
  at: string;
  /** true bila agen melampirkan berkas CV, false bila tidak, null bila log lama tidak mencatatnya. */
  cvAttached: boolean | null;
};

export const MAX_GAP_ITEMS = 20;
export const MAX_GAP_LABEL_LENGTH = 200;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function cleanRemaining(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const label = item.trim().slice(0, MAX_GAP_LABEL_LENGTH).trimEnd();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
    if (out.length >= MAX_GAP_ITEMS) break;
  }
  return out;
}

function cvAttachedFrom(details: Record<string, unknown>): boolean | null {
  const kinds = details.fields_by_kind;
  if (!isRecord(kinds)) return null;
  const upload = kinds.upload;
  if (typeof upload !== "number" || !Number.isFinite(upload)) return null;
  if (upload > 0) return true;
  if (upload === 0) return false;
  return null;
}

/**
 * Kekurangan isian pada percobaan agen terbaru untuk satu lowongan, atau null.
 * Hanya baris terbaru yang dihitung: bila percobaan terbaru bukan "ready" (misalnya sudah terkirim atau gagal),
 * kekurangan dari percobaan yang lebih lama tidak ditampilkan lagi.
 */
export function latestFormGaps(rows: unknown, jobId: string): FormGaps | null {
  if (!Array.isArray(rows) || typeof jobId !== "string" || !jobId) return null;

  let newest: Record<string, unknown> | null = null;
  let newestTime = -Infinity;
  for (const row of rows) {
    if (!isRecord(row) || row.job_id !== jobId) continue;
    if (typeof row.created_at !== "string") continue;
    const time = Date.parse(row.created_at);
    if (Number.isNaN(time)) continue;
    // Sama waktunya: baris yang lebih dulu di daftar tetap menang (kueri sudah mengurutkan terbaru lebih dulu).
    if (time > newestTime) {
      newest = row;
      newestTime = time;
    }
  }
  if (!newest || newest.status !== "ready") return null;

  const details = newest.details;
  if (!isRecord(details)) return null;
  const remaining = cleanRemaining(details.remaining_required);
  if (remaining.length === 0) return null;

  return { remaining, at: newest.created_at as string, cvAttached: cvAttachedFrom(details) };
}

/** Kekurangan isian untuk banyak lowongan sekaligus; lowongan tanpa kekurangan tidak ikut di hasil. */
export function gapsByJob(rows: unknown, jobIds: unknown): Record<string, FormGaps> {
  if (!Array.isArray(jobIds)) return {};
  const entries: [string, FormGaps][] = [];
  const done = new Set<string>();
  for (const id of jobIds) {
    if (typeof id !== "string" || !id || done.has(id)) continue;
    done.add(id);
    const gaps = latestFormGaps(rows, id);
    if (gaps) entries.push([id, gaps]);
  }
  return Object.fromEntries(entries);
}
