/**
 * Teks dan keputusan tampilan kartu "Notifikasi WhatsApp" di Pengaturan, murni supaya bisa dites dengan `node --test`.
 *
 * Fitur notifikasi bisa mati di sisi server (saklar notifikasi mati, atau tabelnya belum siap). Pengguna tidak
 * perlu tahu sebabnya: kartu cukup berkata "Belum tersedia" dan tidak menawarkan formulir yang pasti gagal.
 */

export const NOTIFICATIONS_UNAVAILABLE_TITLE = "Belum tersedia";
export const NOTIFICATIONS_UNAVAILABLE_TEXT =
  "Notifikasi WhatsApp dan email belum bisa dipakai untuk saat ini. Status lamaranmu tetap bisa dilihat di Applify.";

export const WHATSAPP_UNAVAILABLE_LABEL = "Belum tersedia";
export const WHATSAPP_WAITING_LABEL = "Menunggu verifikasi nomor";

export interface NotificationServerFacts {
  /** Dari GET /api/notifications/preferences: tabel preferensi belum siap. */
  migrationPending?: boolean;
  /** Dari GET /api/notifications/status: saklar notifikasi di server. undefined = status tidak terbaca. */
  notificationsEnabled?: boolean;
  /** Dari GET /api/notifications/status: penyedia WhatsApp sudah disiapkan. undefined = status tidak terbaca. */
  whatsappKapso?: boolean;
}

/** Seluruh kartu tidak tersedia: tidak ada formulir yang ditawarkan. */
export function notificationsUnavailable(facts: NotificationServerFacts): boolean {
  return facts.migrationPending === true || facts.notificationsEnabled === false;
}

/** Hanya bagian WhatsApp yang belum tersedia (email notifikasi tetap bisa diatur). */
export function whatsappUnavailable(facts: NotificationServerFacts): boolean {
  return facts.whatsappKapso === false;
}

/** Label kecil di kepala bagian WhatsApp bila nomor belum terverifikasi. */
export function whatsappStatusLabel(facts: NotificationServerFacts): string {
  return whatsappUnavailable(facts) ? WHATSAPP_UNAVAILABLE_LABEL : WHATSAPP_WAITING_LABEL;
}
