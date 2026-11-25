/**
 * Days between submitting an application and the follow-up reminder. One value for the whole system:
 * worker/src/lib/applicationStatus.ts uses the same number (4), and the thesis text says 4 days.
 *
 * Applify only REMINDS (Telegram, sent by the worker) and records the date. The follow-up message itself
 * is written and sent by the user; the "mark as sent" button only records that it was done.
 */
export const FOLLOW_UP_DAYS = 4;

export function followUpDueAt(from: Date = new Date(), days: number = FOLLOW_UP_DAYS): string {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Lencana tindak lanjut pada kartu papan (uji 25 Nov 2026). `follow_up_scheduled` diisi saat lamaran terkirim
 * (tanggal saran, FOLLOW_UP_DAYS ke depan), jadi keberadaannya saja bukan berarti perlu tindak lanjut sekarang.
 * Kata "Perlu tindak lanjut" hanya dipakai kolom papan (status `follow_up`), supaya lencana tidak bertentangan
 * dengan kolom dan dengan status di detail.
 *   - null: tidak ada saran, sudah ditandai dikirim, atau status bukan submitted/follow_up.
 *   - due: tanggal saran sudah lewat (atau status sudah follow_up): "Saatnya tindak lanjut".
 *   - scheduled: tanggal saran belum tiba: "Tindak lanjut <tanggal>".
 */
export function followUpBadge(
  app: { status?: string | null; follow_up_scheduled?: string | null; follow_up_sent?: boolean | null },
  now: Date = new Date()
): { kind: "due" | "scheduled"; label: string } | null {
  if (!app.follow_up_scheduled || app.follow_up_sent) return null;
  if (app.status !== "submitted" && app.status !== "follow_up") return null;
  const due = new Date(app.follow_up_scheduled);
  if (Number.isNaN(due.getTime())) return null;
  if (app.status === "follow_up" || due.getTime() <= now.getTime()) return { kind: "due", label: "Saatnya tindak lanjut" };
  const tanggal = due.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  return { kind: "scheduled", label: `Tindak lanjut ${tanggal}` };
}

/** Lencana konfirmasi bila pengguna sudah menandai tindak lanjut selesai. */
export const FOLLOW_UP_DONE_LABEL = "Sudah ditindaklanjuti";

/**
 * Status baru sesudah pengguna menekan "Tandai: Sudah Kutindaklanjuti" (UX-P7-02).
 * Kolom `follow_up` berarti "Perlu tindak lanjut", sehingga kartu `submitted` harus tetap di `submitted`
 * dan kartu yang sedang di `follow_up` dikembalikan ke `submitted` agar tidak lagi masuk hitungan perlu
 * tindak lanjut. Tahap lanjut (`responded`, `closed`) tidak diubah.
 */
export function nextStatusAfterFollowUpSent(status: string): string {
  return status === "follow_up" ? "submitted" : status;
}

/** True bila lencana "Sudah ditindaklanjuti" layak tampil pada kartu atau detail lamaran. */
export function showFollowUpDoneBadge(
  app: { status?: string | null; follow_up_sent?: boolean | null } | null | undefined
): boolean {
  if (!app?.follow_up_sent) return false;
  return app.status === "submitted" || app.status === "follow_up" || app.status === "responded";
}
