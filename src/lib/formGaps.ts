/**
 * Isian wajib yang masih kosong saat agen berhenti di formulir lowongan.
 *
 * Worker menulis satu baris `application_logs` (action "apply") setiap kali agen mencoba mengisi formulir.
 * Baris berstatus "ready" berarti formulir terisi tetapi tombol kirim tidak ditekan; `details.remaining_required`
 * memuat label isian wajib yang tidak bisa diisi. Status lamaran tetap "ready"; layar hanya menampilkan
 * kekurangannya.
 *
 * Baris berstatus "incomplete" berarti agen berhenti sebelum formulir tuntas. `details.reason` memberi sebabnya
 * (no_fields_filled, partly_filled, page_mismatch, timeout, atau kosong pada log lama), `details.fields_filled`
 * jumlah isian yang berhasil diisi, dan `details.application_status` apa yang terjadi pada lamaran: "ready"
 * bila ada isian yang terisi, "unchanged" bila tidak ada satu pun (status lamaran tidak berubah). Untuk
 * no_fields_filled tidak ada daftar kekurangan (agen tidak mengisi apa pun), tetapi layar perlu tahu bahwa
 * pengguna harus mengisi sendiri: itu dibaca lewat latestApplyAttempt.
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
  /** details.reason percobaan itu (partly_filled, page_mismatch, timeout), null pada log "ready" dan log lama. */
  reason: string | null;
  /** details.fields_filled: jumlah isian yang terisi, null bila log tidak mencatatnya. */
  fieldsFilled: number | null;
};

/** Percobaan agen terbaru untuk satu lowongan, apa pun hasilnya (bukan hanya yang punya kekurangan isian). */
export type ApplyAttempt = {
  /** application_logs.status: ready, incomplete, success, atau nilai lain yang ditulis worker. */
  status: string;
  at: string;
  reason: string | null;
  fieldsFilled: number | null;
  /** details.application_status: "ready", "submitted", atau "unchanged"; null pada log lama. */
  applicationStatus: string | null;
  /** details.queue_job_id: id baris automation_queue yang menjalankan percobaan ini; null pada log lama. */
  queueJobId: string | null;
};

export const REASON_NO_FIELDS_FILLED = "no_fields_filled";

export const MAX_GAP_ITEMS = 20;
// Pernyataan persetujuan di formulir lowongan bisa lebih dari 200 karakter; batas lama memotongnya di tengah kata
// ("...true and correct to the bes", uji E2E klik 20 November 2026, temuan 14).
export const MAX_GAP_LABEL_LENGTH = 400;

/** Label sepanjang-panjangnya `max` karakter. Yang lebih panjang dipotong di batas kata dan diakhiri "…", tidak di tengah kata. */
export function shortenGapLabel(label: string, max: number = MAX_GAP_LABEL_LENGTH): string {
  const text = label.trim();
  if (text.length <= max) return text;
  const room = text.slice(0, max - 1);
  const lastSpace = room.lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? room.slice(0, lastSpace) : room;
  return `${cut.trimEnd().replace(/[,;:.\-]+$/, "")}…`;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function cleanRemaining(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const label = shortenGapLabel(item);
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

function cleanReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const r = value.trim().slice(0, 40);
  return r || null;
}

function cleanCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

function cleanId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : null;
}

/** Baris log terbaru untuk satu lowongan (kueri sudah mengurutkan terbaru dulu, jadi waktu sama: yang lebih dulu menang). */
function newestRow(rows: unknown, jobId: string): Record<string, unknown> | null {
  if (!Array.isArray(rows) || typeof jobId !== "string" || !jobId) return null;
  let newest: Record<string, unknown> | null = null;
  let newestTime = -Infinity;
  for (const row of rows) {
    if (!isRecord(row) || row.job_id !== jobId) continue;
    if (typeof row.created_at !== "string") continue;
    const time = Date.parse(row.created_at);
    if (Number.isNaN(time)) continue;
    if (time > newestTime) {
      newest = row;
      newestTime = time;
    }
  }
  return newest;
}

/**
 * Percobaan agen terbaru untuk satu lowongan, atau null bila belum ada log. Dipakai layar untuk tahu hasil
 * percobaan itu (reason, fields_filled) walau tidak ada kekurangan isian yang bisa didaftar.
 */
export function latestApplyAttempt(rows: unknown, jobId: string): ApplyAttempt | null {
  const newest = newestRow(rows, jobId);
  if (!newest) return null;
  const details = isRecord(newest.details) ? newest.details : {};
  return {
    status: typeof newest.status === "string" ? newest.status : "",
    at: newest.created_at as string,
    reason: cleanReason(details.reason),
    fieldsFilled: cleanCount(details.fields_filled),
    applicationStatus: cleanReason(details.application_status),
    queueJobId: cleanId(details.queue_job_id),
  };
}

/**
 * Percobaan agen yang boleh dikaitkan dengan satu lamaran, atau undefined.
 *
 * Log percobaan tidak menyimpan application_id, jadi `getApplyState` mencocokkannya lewat job_id. Akibatnya
 * lowongan yang sama membawa percobaan lama ke draf barunya: pengguna menyerahkan draf pertama ke agen, agen
 * gagal, lalu pengguna membuat draf baru untuk lowongan itu, dan kartu draf baru yang belum pernah diajukan
 * langsung berlencana "Isi sendiri di situs" (temuan 33, uji klik 21 November 2026). Percobaan yang tercatat
 * sebelum lamaran ini dibuat pasti bukan percobaan atas lamaran ini, jadi tidak dikembalikan. Tanggal yang tidak
 * terbaca juga tidak dikembalikan: lebih baik tanpa lencana daripada lencana yang tidak bisa dibuktikan.
 *
 * Batas yang diketahui: bila satu lowongan punya dua draf dan percobaan terjadi sesudah keduanya dibuat, log
 * tidak menunjukkan draf mana yang dikerjakan agen, sehingga keduanya mewarisinya (kartunya sudah diberi baris
 * "Lamaran ke-N dari M", lib/applicationCards.ts).
 */
export function attemptForApplication(
  attempt: ApplyAttempt | null | undefined,
  application: { created_at?: unknown } | null | undefined,
): ApplyAttempt | undefined {
  if (!attempt || !application || typeof application.created_at !== "string") return undefined;
  const made = Date.parse(attempt.at);
  const created = Date.parse(application.created_at);
  if (Number.isNaN(made) || Number.isNaN(created)) return undefined;
  return made >= created ? attempt : undefined;
}

/**
 * True bila percobaan terbaru berhenti karena agen tidak berhasil mengisi satu isian pun (halaman mungkin
 * meminta masuk). Lamaran belum terkirim dan pengguna perlu mengisi sendiri di situs lowongan.
 */
export function needsFillYourself(attempt: ApplyAttempt | null | undefined): boolean {
  return !!attempt && attempt.status === "incomplete" && attempt.reason === REASON_NO_FIELDS_FILLED;
}

/**
 * Kekurangan isian pada percobaan agen terbaru untuk satu lowongan, atau null.
 * Hanya baris terbaru yang dihitung: bila percobaan terbaru bukan "ready" atau "incomplete" (misalnya sudah
 * terkirim atau gagal), kekurangan dari percobaan yang lebih lama tidak ditampilkan lagi.
 *
 * Baris "incomplete" juga dibaca, supaya "Perlu dilengkapi" muncul untuk partly_filled. Tidak ada daftar bila
 * agen tidak mengisi apa pun (reason no_fields_filled, atau log lama dengan fields_filled 0): daftar
 * remaining_required pada percobaan seperti itu hanya semua isian wajib, bukan sisa yang belum terisi.
 */
export function latestFormGaps(rows: unknown, jobId: string): FormGaps | null {
  const newest = newestRow(rows, jobId);
  if (!newest || (newest.status !== "ready" && newest.status !== "incomplete")) return null;

  const details = newest.details;
  if (!isRecord(details)) return null;
  const reason = cleanReason(details.reason);
  const fieldsFilled = cleanCount(details.fields_filled);
  if (newest.status === "incomplete" && (reason === REASON_NO_FIELDS_FILLED || fieldsFilled === 0)) return null;
  const remaining = cleanRemaining(details.remaining_required);
  if (remaining.length === 0) return null;

  return { remaining, at: newest.created_at as string, cvAttached: cvAttachedFrom(details), reason, fieldsFilled };
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

/** Percobaan agen terbaru untuk banyak lowongan sekaligus; lowongan tanpa log tidak ikut di hasil. */
export function attemptsByJob(rows: unknown, jobIds: unknown): Record<string, ApplyAttempt> {
  if (!Array.isArray(jobIds)) return {};
  const entries: [string, ApplyAttempt][] = [];
  const done = new Set<string>();
  for (const id of jobIds) {
    if (typeof id !== "string" || !id || done.has(id)) continue;
    done.add(id);
    const attempt = latestApplyAttempt(rows, id);
    if (attempt) entries.push([id, attempt]);
  }
  return Object.fromEntries(entries);
}
