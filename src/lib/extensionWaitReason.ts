/**
 * Alasan tugas Ekstensi Browser (`extension_apply`) masih menunggu, dibaca dari baris `automation_queue`.
 * Murni, supaya bisa dites dengan `node --test`.
 *
 * Tabel antrean tidak punya kolom alasan, jadi ekstensi mengirim kode sebagai awalan stabil di `error_message`
 * saat melepas tugas (backend: `services/extension-wait-reason.ts`, parser yang sama; jaga keduanya tetap sama):
 *
 *   permission_required:<host> — Izin situs ATS belum diberikan di ekstensi.
 *
 * Baris lama (sebelum awalan ada) memakai pesan lama persis dan tetap terbaca sebagai `permission_required` tanpa host.
 */

export type ExtensionWaitReason = "permission_required" | "no_extension_seen";

export interface ExtensionWait {
  extension_wait_reason: ExtensionWaitReason | null;
  /** Host yang butuh izin; hanya terisi untuk `permission_required` yang membawa host. */
  extension_wait_host: string | null;
}

export interface ExtensionWaitRow {
  job_type?: string | null;
  status?: string | null;
  error_message?: string | null;
  scheduled_at?: string | null;
}

const PERMISSION_REQUIRED_CODE = "permission_required";
const LEGACY_PERMISSION_TEXT = "Izin situs ATS belum diberikan di ekstensi.";
const PREFIX = `${PERMISSION_REQUIRED_CODE}:`;
const HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** Tugas pending yang jatuh temponya terlewat sejauh ini belum disentuh ekstensi mana pun (ekstensi poll tiap menit). */
export const NO_EXTENSION_SEEN_AFTER_MS = 5 * 60 * 1000;

function cleanHost(raw: string): string | null {
  const host = raw.trim().toLowerCase();
  return host.length <= 253 && HOST_RE.test(host) ? host : null;
}

/** `{ host }` bila `error_message` membawa alasan izin (host null untuk baris lama atau host rusak), selain itu null. */
export function parsePermissionRequired(errorMessage: unknown): { host: string | null } | null {
  if (typeof errorMessage !== "string") return null;
  const text = errorMessage.replace(/[\r\n\t]+/g, " ").trim();
  if (!text) return null;
  if (text === LEGACY_PERMISSION_TEXT || text === PERMISSION_REQUIRED_CODE) return { host: null };
  if (!text.startsWith(PREFIX)) return null;
  return { host: cleanHost(text.slice(PREFIX.length).split(/\s/, 1)[0] ?? "") };
}

/**
 * Alasan satu baris antrean menunggu.
 *  - `no_extension_seen`: pending dan jatuh temponya terlewat >= 5 menit, jadi tidak ada ekstensi aktif yang
 *    mengambilnya. Menang atas pesan izin yang sudah basi.
 *  - `permission_required`: pending dan pelepasan terakhir membawa kode izin.
 * Selain itu kosong: teks menunggu biasa tetap dipakai.
 */
export function describeExtensionWait(row: ExtensionWaitRow | null | undefined, now: number = Date.now()): ExtensionWait {
  const none: ExtensionWait = { extension_wait_reason: null, extension_wait_host: null };
  if (!row || row.job_type !== "extension_apply" || row.status !== "pending") return none;
  const scheduled = typeof row.scheduled_at === "string" ? Date.parse(row.scheduled_at) : NaN;
  if (Number.isFinite(scheduled) && now - scheduled >= NO_EXTENSION_SEEN_AFTER_MS) {
    return { extension_wait_reason: "no_extension_seen", extension_wait_host: null };
  }
  const permission = parsePermissionRequired(row.error_message);
  if (permission) return { extension_wait_reason: "permission_required", extension_wait_host: permission.host };
  return none;
}

/** Petunjuk untuk pengguna awam saat ekstensi menunggu izin situs. Tanpa istilah teknis. */
export function permissionRequiredHint(host: string | null): string {
  return host
    ? `Ekstensi perlu izin untuk membuka ${host}. Buka panel ekstensi Applify lalu klik Izinkan ${host}.`
    : "Ekstensi perlu izin untuk membuka situs lowongan ini. Buka panel ekstensi Applify lalu klik tombol Izinkan.";
}

export const NO_EXTENSION_SEEN_HINT =
  "Belum ada ekstensi Applify yang aktif mengambil tugas ini. Pastikan ekstensinya terpasang dan terhubung, lalu cek bahwa saklar Isi otomatis di latar di panel ekstensi menyala.";

/** Petunjuk untuk satu alasan, atau null bila tidak ada alasan khusus. */
export function extensionWaitHint(wait: ExtensionWait): string | null {
  if (wait.extension_wait_reason === "permission_required") return permissionRequiredHint(wait.extension_wait_host);
  if (wait.extension_wait_reason === "no_extension_seen") return NO_EXTENSION_SEEN_HINT;
  return null;
}
