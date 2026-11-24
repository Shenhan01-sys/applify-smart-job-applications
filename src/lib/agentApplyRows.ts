import { agentLogFacts } from "./agentEvidence.ts";
import type { AgentApplyRow } from "./agentApplyStatus.ts";

/**
 * Status agen per persetujuan dari tiga sumber yang dibaca dengan sesi pengguna sendiri (RLS pemilik):
 * tugas apply di antrean worker (`automation_queue`), log percobaan worker (`application_logs`, dicocokkan lewat
 * `details.queue_job_id`), dan log Ekstensi Browser (`application_logs` dengan `details.channel = "extension"`,
 * dicocokkan lewat `details.approval_request_id`).
 *
 * Bentuk log ekstensi ditulis `reportExtensionRun` di `backend/services/extension-runner.ts`: `details.channel`,
 * `details.run_id`, `details.approval_request_id`, `details.questions`, `details.filled_fields`, dan (fase 1)
 * `details.documents_attached`. Log itu tidak punya `queue_job_id`, karena ekstensi tidak memakai antrean worker.
 *
 * Aturan: bila persetujuan punya log worker dan log ekstensi, log dengan `created_at` terbaru dipakai. Tidak
 * ada tulis ke database; fungsi di sini murni supaya bisa dites dengan `node --test`. Masukan dari database
 * tidak dipercaya: baris rusak diabaikan dan tidak pernah melempar galat.
 */

export type RawRow = Record<string, unknown>;

const isRecord = (v: unknown): v is RawRow => typeof v === "object" && v !== null && !Array.isArray(v);

/** Waktu baris sebagai angka; tidak terbaca = -Infinity, jadi kalah dari baris yang terbaca. */
function timeOf(row: unknown): number {
  const t = isRecord(row) && typeof row.created_at === "string" ? Date.parse(row.created_at) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

const ACTIVE_QUEUE_STATUSES: ReadonlySet<string> = new Set(["pending", "processing"]);

/** Tugas apply terbaru per persetujuan (kunci: approval_request_id). Baris yang sama waktunya: yang lebih dulu di daftar menang. */
function latestQueueByApproval(queueRows: unknown): Map<string, RawRow> {
  const out = new Map<string, RawRow>();
  if (!Array.isArray(queueRows)) return out;
  for (const row of queueRows) {
    if (!isRecord(row) || !isRecord(row.payload)) continue;
    const approvalId = row.payload.approval_request_id;
    if (typeof approvalId !== "string" || !approvalId || row.id == null) continue;
    const current = out.get(approvalId);
    if (!current || timeOf(row) > timeOf(current)) out.set(approvalId, row);
  }
  return out;
}

/** Id tugas apply terbaru per persetujuan: log worker hanya dibaca untuk tugas-tugas ini. */
export function latestQueueJobIds(queueRows: unknown): string[] {
  return [...latestQueueByApproval(queueRows).values()].map((row) => String(row.id));
}

/** Log terbaru per kunci. Waktu sama: yang lebih dulu di daftar menang (kueri mengurutkan terbaru dulu). */
function newestBy(rows: unknown, keyOf: (details: RawRow) => string | null): Map<string, RawRow> {
  const out = new Map<string, RawRow>();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!isRecord(row) || !isRecord(row.details)) continue;
    const key = keyOf(row.details);
    if (!key) continue;
    const current = out.get(key);
    if (!current || timeOf(row) > timeOf(current)) out.set(key, row);
  }
  return out;
}

const stringOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * Baris status agen per persetujuan.
 *
 * - Tugas worker memberi `status`, `error_message`, dan `queue_job_id`; log worker terbaru untuk tugas itu memberi
 *   fakta hasil percobaan (perilaku lama).
 * - Bila log ekstensi untuk persetujuan yang sama lebih baru daripada log worker (atau log worker tidak ada),
 *   fakta berasal dari log ekstensi dan baris itu bertanda `channel: "extension"` tanpa `queue_job_id`. Statusnya
 *   `completed` (ekstensi melapor sesudah selesai), kecuali ada tugas worker yang masih pending atau processing dan
 *   dibuat sesudah log ekstensi itu: tugas yang benar-benar lebih baru tidak disembunyikan.
 * - Persetujuan yang hanya punya log ekstensi (tanpa tugas worker) tetap mendapat baris.
 */
export function buildAgentApplyRows(queueRows: unknown, workerLogs: unknown, extensionLogs: unknown): Record<string, AgentApplyRow> {
  const out: Record<string, AgentApplyRow> = {};
  const queue = latestQueueByApproval(queueRows);
  const queueIdToApproval = new Map<string, string>();
  for (const [approvalId, row] of queue) {
    const jobType = stringOrNull(row.job_type);
    out[approvalId] = {
      status: row.status as string | null | undefined,
      error_message: row.error_message as string | null | undefined,
      fields_filled: null,
      queue_job_id: String(row.id),
      ...(jobType ? { job_type: jobType } : {}),
      ...(stringOrNull(row.scheduled_at) ? { scheduled_at: stringOrNull(row.scheduled_at) } : {}),
    };
    queueIdToApproval.set(String(row.id), approvalId);
  }

  const workerNewest = new Map<string, RawRow>();
  for (const [queueId, row] of newestBy(workerLogs, (d) => stringOrNull(d.queue_job_id))) {
    const approvalId = queueIdToApproval.get(queueId);
    if (!approvalId) continue;
    const current = workerNewest.get(approvalId);
    if (!current || timeOf(row) > timeOf(current)) workerNewest.set(approvalId, row);
  }

  const extensionNewest = newestBy(extensionLogs, (d) => (d.channel === "extension" ? stringOrNull(d.approval_request_id) : null));

  for (const [approvalId, worker] of workerNewest) {
    const ext = extensionNewest.get(approvalId);
    if (ext && timeOf(ext) > timeOf(worker)) continue;
    Object.assign(out[approvalId], agentLogFacts(worker));
  }

  for (const [approvalId, ext] of extensionNewest) {
    const worker = workerNewest.get(approvalId);
    if (worker && timeOf(worker) >= timeOf(ext)) continue;
    const facts = agentLogFacts(ext);
    const base = out[approvalId];
    const awaitingLoginActive = !!base && ACTIVE_QUEUE_STATUSES.has(String(base.status)) && facts.log_status === "awaiting_login";
    const newerActiveJob = !!base && ACTIVE_QUEUE_STATUSES.has(String(base.status)) && (awaitingLoginActive || timeOf(queue.get(approvalId)) > timeOf(ext));
    const extType = base?.job_type === "extension_apply" ? { job_type: "extension_apply" as const } : {};
    if (newerActiveJob) {
      out[approvalId] = { ...base, ...facts };
    } else if (!base && facts.log_status === "awaiting_login") {
      out[approvalId] = { ...facts, status: "processing", error_message: null };
    } else {
      out[approvalId] = { ...facts, ...extType, status: "completed", error_message: null };
    }
  }
  return out;
}
