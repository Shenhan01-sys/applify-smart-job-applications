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
  /** draft + ready: not sent yet */
  drafts: number;
  /** submitted, follow_up, responded, or closed after it was submitted */
  sent: number;
  /** submitted and past its follow-up date (status follow_up) */
  followUp: number;
  responded: number;
}

export const STATUS_LABEL: Record<DashStatus, string> = {
  draft: "Draf",
  ready: "Siap",
  submitted: "Terkirim",
  follow_up: "Perlu follow-up",
  responded: "Dibalas",
  closed: "Ditutup",
};

const isStatus = (s: unknown): s is DashStatus => (APPLICATION_STATUS_VALUES as readonly string[]).includes(s as string);

export function summarizeApplications(rows: ReadonlyArray<DashApplication> | null | undefined): DashStats {
  const stats: DashStats = { total: 0, drafts: 0, sent: 0, followUp: 0, responded: 0 };
  for (const r of rows ?? []) {
    if (!r || !isStatus(r.status)) continue;
    stats.total += 1;
    switch (r.status) {
      case "draft":
      case "ready":
        stats.drafts += 1;
        break;
      case "submitted":
        stats.sent += 1;
        break;
      case "follow_up":
        stats.sent += 1;
        stats.followUp += 1;
        break;
      case "responded":
        stats.sent += 1;
        stats.responded += 1;
        break;
      case "closed":
        if (r.submitted_at) stats.sent += 1;
        break;
    }
  }
  return stats;
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
