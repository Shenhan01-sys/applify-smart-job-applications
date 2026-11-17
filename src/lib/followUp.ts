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
