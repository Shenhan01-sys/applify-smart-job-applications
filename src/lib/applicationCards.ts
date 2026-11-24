/**
 * Pembeda kartu lamaran untuk lowongan yang sama (uji klik 20 November 2026, temuan 18).
 *
 * Membuat draf baru untuk lowongan yang sudah punya draf menghasilkan baris `ai_applications` kedua. Di papan
 * Lamaran Saya dua kartu berjudul sama ("Strategic Account Executive", Datadog) tidak bisa dibedakan dari judul
 * dan perusahaan. Kartu yang punya kembaran diberi satu baris kecil: urutan pembuatannya dan waktu dibuat.
 * Kartu tanpa kembaran tidak diberi apa pun.
 *
 * TypeScript murni tanpa impor, supaya jalan di bawah `node --test`.
 */

export interface ApplicationCardInput {
  id: string;
  created_at?: string | null;
  job_id?: string | null;
  title?: string | null;
  company?: string | null;
}

export interface DuplicateInfo {
  /** Urutan pembuatan di antara lamaran untuk lowongan yang sama, mulai dari 1 (paling lama). */
  position: number;
  total: number;
  /** Waktu dibuat, mis. "20 Nov, 23.10". Kosong bila tanggalnya tidak terbaca. */
  created: string;
}

const norm = (s: unknown): string => (typeof s === "string" ? s.toLowerCase().replace(/\s+/g, " ").trim() : "");

/** Lowongan yang sama: judul dan perusahaan sama (huruf besar-kecil dan spasi ganda diabaikan); tanpa keduanya, id lowongan. */
function sameJobKey(a: ApplicationCardInput): string {
  const title = norm(a.title);
  const company = norm(a.company);
  if (title || company) return `t:${title}|${company}`;
  return a.job_id ? `j:${a.job_id}` : `i:${a.id}`;
}

const timeOf = (iso: string | null | undefined): number => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

/** "20 Nov, 23.10"; `timeZone` hanya untuk uji (bawaan: zona waktu peramban). Kosong bila tanggal tidak valid. */
export function formatCreated(iso: string | null | undefined, timeZone?: string): string {
  const t = timeOf(iso);
  if (!Number.isFinite(t)) return "";
  const parts = new Intl.DateTimeFormat("id-ID", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")}, ${get("hour")}.${get("minute")}`;
}

/**
 * Id lamaran -> info pembeda, hanya untuk lamaran yang lowongannya muncul lebih dari sekali.
 * Urutan: yang dibuat lebih dulu dapat nomor lebih kecil; tanggal tak terbaca di akhir, urutan asal dipertahankan.
 */
export function duplicateApplications(apps: readonly ApplicationCardInput[], timeZone?: string): Map<string, DuplicateInfo> {
  const groups = new Map<string, ApplicationCardInput[]>();
  for (const a of apps) {
    const key = sameJobKey(a);
    const list = groups.get(key);
    if (list) list.push(a);
    else groups.set(key, [a]);
  }
  const out = new Map<string, DuplicateInfo>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const ordered = list.map((a, i) => ({ a, i })).sort((x, y) => timeOf(x.a.created_at) - timeOf(y.a.created_at) || x.i - y.i);
    ordered.forEach(({ a }, idx) => out.set(a.id, { position: idx + 1, total: list.length, created: formatCreated(a.created_at, timeZone) }));
  }
  return out;
}

/**
 * Teks cadangan bila lowongan lamaran tidak terbawa join `jobs(*)`. Penyebab di produksi (24 November 2026): kebijakan
 * RLS tabel `jobs` hanya membuka baris berstatus `active`, jadi lamaran untuk lowongan yang sudah `closed` kembali
 * dengan `jobs: null` dan kartunya dulu bertuliskan "Lowongan" dan "Perusahaan", seolah itu judulnya.
 */
export const NO_TITLE_LABEL = "Lowongan tanpa judul";
export const NO_COMPANY_LABEL = "Perusahaan tidak diketahui";

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Judul dan perusahaan dari lowongan hasil join; kosong atau tidak ada -> teks cadangan yang jelas. */
export function jobDisplay(job: { title?: unknown; company?: unknown } | null | undefined): { title: string; company: string; known: boolean } {
  const title = clean(job?.title);
  const company = clean(job?.company);
  return { title: title || NO_TITLE_LABEL, company: company || NO_COMPANY_LABEL, known: !!title };
}

/** Teks kecil di kartu: "Lamaran ke-2 dari 2 · dibuat 20 Nov, 23.10". */
export function duplicateLabel(info: DuplicateInfo): string {
  const head = `Lamaran ke-${info.position} dari ${info.total}`;
  return info.created ? `${head} · dibuat ${info.created}` : head;
}
