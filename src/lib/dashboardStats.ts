/**
 * Counters and activity rows for the Dashboard, computed from `ai_applications` (the table the draft Edge
 * Function, the Applications board and the worker actually write, with a `jobs` join). The older
 * `applications` table is never written by any flow, so the Dashboard does not read it.
 *
 * The system cannot know whether an ATS accepted a CV, so there is no "ATS passed" counter.
 *
 * Plain TypeScript with no imports, so it runs under `node --test` without a bundler.
 */

export const APPLICATION_STATUS_VALUES = ["draft", "ready", "submitted", "follow_up", "responded", "closed"] as const;
export type DashStatus = (typeof APPLICATION_STATUS_VALUES)[number];

export interface DashApplication {
  id?: string;
  status?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
  jobs?: { title?: string | null; company?: string | null } | null;
}

export interface DashStats {
  total: number;
  /** status draft only, the same rows as the "Draf" column of the Lamaran Saya board */
  drafts: number;
  /** status ready only, the same rows as the "Siap dikirim" column of the board */
  ready: number;
  /** isApplicationSent(): submitted, follow_up, responded, or closed after it was submitted */
  sent: number;
  /** submitted and past its follow-up date (status follow_up) */
  followUp: number;
  responded: number;
}

// Same wording as the board columns (lib/statusLabels.ts APPLICATION_STATUS_LABEL); a test keeps them equal.
export const STATUS_LABEL: Record<DashStatus, string> = {
  draft: "Draf",
  ready: "Siap dikirim",
  submitted: "Terkirim",
  follow_up: "Perlu follow-up",
  responded: "Dibalas",
  closed: "Ditutup",
};

const isStatus = (s: unknown): s is DashStatus => (APPLICATION_STATUS_VALUES as readonly string[]).includes(s as string);

/**
 * One column per status, in APPLICATION_STATUS_VALUES order. The Lamaran Saya board builds its columns with this
 * function and the Dashboard counters are derived from the same grouping, so both screens always agree.
 * Rows with a missing or unknown status are left out.
 */
export function groupByStatus<T extends { status?: string | null }>(rows: ReadonlyArray<T> | null | undefined): Record<DashStatus, T[]> {
  const groups = Object.fromEntries(APPLICATION_STATUS_VALUES.map((s) => [s, [] as T[]])) as Record<DashStatus, T[]>;
  for (const r of rows ?? []) {
    if (r && isStatus(r.status)) groups[r.status].push(r);
  }
  return groups;
}

/** Statuses that only exist after the application was sent. */
const SENT_STATUSES: ReadonlySet<string> = new Set(["submitted", "follow_up", "responded"]);

/**
 * THE one rule for "terkirim" (sent). The counters, the board card, the list row and the detail window of
 * Lamaran Saya, and the Dashboard all call this, so they cannot disagree.
 *
 * The truth is `ai_applications.status`, which the worker, the extension and the backend only move to
 * `submitted` after a confirmed send (or after the user marked it sent). Things that are NOT a send:
 *  - an approval with status `approved` ("Disetujui"): the user allowed the agent, nothing left yet;
 *  - the agent filling the form and stopping before the submit button: the row stays `ready`;
 *  - a stale `submitted_at` on a `draft` or `ready` row (the user moved the card back): the status wins.
 * `closed` is sent only when the application was submitted before it was closed.
 */
export function isApplicationSent(row: { status?: string | null; submitted_at?: string | null } | null | undefined): boolean {
  if (!row) return false;
  if (SENT_STATUSES.has(row.status as string)) return true;
  if (row.status === "closed") return typeof row.submitted_at === "string" && row.submitted_at.trim() !== "";
  return false;
}

/** Whole days since `iso`, never negative; null for a missing or invalid date. */
function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 86400000));
}

export const NOT_SENT_NOTE = "Belum dikirim";

/**
 * Footer text of a board card. Derived from `isApplicationSent`, not from `submitted_at` alone: a draft with a stale
 * `submitted_at` says "Belum dikirim", and a sent row without a timestamp says "Terkirim" (never "Belum dikirim").
 */
export function applicationSentNote(row: { status?: string | null; submitted_at?: string | null } | null | undefined, now: Date = new Date()): string {
  if (!isApplicationSent(row)) return NOT_SENT_NOTE;
  const days = daysSince(row?.submitted_at, now);
  if (days === null) return "Terkirim (waktu tidak tercatat)";
  return days === 0 ? "Terkirim hari ini" : `Terkirim ${days} hari lalu`;
}

export function summarizeApplications(rows: ReadonlyArray<DashApplication> | null | undefined): DashStats {
  const g = groupByStatus(rows);
  const known = APPLICATION_STATUS_VALUES.flatMap((s) => g[s]);
  return {
    total: known.length,
    drafts: g.draft.length,
    ready: g.ready.length,
    sent: known.filter((r) => isApplicationSent(r)).length,
    followUp: g.follow_up.length,
    responded: g.responded.length,
  };
}

export interface ActivityRow {
  id: string;
  title: string;
  company: string;
  status: DashStatus;
  label: string;
  /** when it happened: the submission time, else the creation time */
  at: string | undefined;
}

/** Newest first, at most `limit`, with a readable title even when the job row is missing. */
export function recentActivity(rows: ReadonlyArray<DashApplication> | null | undefined, limit = 6): ActivityRow[] {
  const stamp = (r: DashApplication) => r.submitted_at || r.created_at || "";
  return (rows ?? [])
    .filter((r): r is DashApplication & { status: DashStatus } => !!r && isStatus(r.status))
    .map((r, i) => ({
      id: r.id ?? `row-${i}`,
      title: r.jobs?.title?.trim() || "Lowongan tidak tersedia",
      company: r.jobs?.company?.trim() || "",
      status: r.status,
      label: STATUS_LABEL[r.status],
      at: stamp(r) || undefined,
    }))
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, limit);
}

/** "baru saja", "5 mnt lalu", "3 jam lalu", "2 hari lalu"; empty for a missing or invalid date. */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const minutes = Math.floor((now.getTime() - t) / 60000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}
