/**
 * Helper murni untuk pusat notifikasi in-app (`U5-P1-01`).
 */

export interface InAppNotification {
  id: string;
  event: string;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
}

export interface InAppNotificationsResponse {
  items: InAppNotification[];
  unreadCount: number;
  migrationPending?: boolean;
}

/** Label jumlah belum dibaca untuk lencana lonceng: null bila 0, `99+` bila lebih dari 99. */
export function formatUnreadBadge(unreadCount: number): string | null {
  if (!Number.isFinite(unreadCount) || unreadCount <= 0) return null;
  const n = Math.floor(unreadCount);
  return n > 99 ? "99+" : String(n);
}

/** Hanya mengizinkan rute internal aplikasi (dimulai dengan `/` tunggal). */
export function safeNotificationHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const trimmed = href.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

/** Perbarui state lokal setelah menandai semua atau satu notifikasi terbaca. */
export function applyReadLocally(
  state: InAppNotificationsResponse,
  opts: { ids?: string[]; all?: boolean },
  nowIso: string = new Date().toISOString(),
): InAppNotificationsResponse {
  const idSet = new Set(opts.ids ?? []);
  const items = state.items.map((item) => {
    if (item.read_at) return item;
    if (opts.all || idSet.has(item.id)) {
      return { ...item, read_at: nowIso };
    }
    return item;
  });
  const unreadCount = items.filter((item) => !item.read_at).length;
  return { ...state, items, unreadCount };
}
