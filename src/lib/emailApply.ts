/**
 * Enabling logic and request building for the "Kirim lewat Email" action on an approved application.
 *
 * Contract (read only, from backend/api/routes/automation.ts + backend/services/queue-guard.ts and
 * worker/src/handlers/emailApply.ts):
 *   POST /api/automation/queue  { job_type: "email_apply", payload: { approval_request_id, apply_email } }
 * The backend fills job_id and application_id from the approval row itself, ignores a client-sent `approved`,
 * verifies that `approval_request_id` belongs to the user, has
 * status "approved" and has not expired (otherwise 403 { code: "approval_required" }), and the worker sends
 * the approved cover letter verbatim through the user's Gmail. One approval is good for one sent
 * submission. The UI only shows the action for an approval that exists and is approved.
 *
 * Plain TypeScript (only one relative import, with its extension), so it runs under `node --test` without a bundler.
 */

import { describeApiError, parseApiError } from "./apiErrors.ts";

export const EMAIL_APPLY_JOB_TYPE = "email_apply";

/** Shown next to the action: what is sent and under which conditions. */
export const EMAIL_APPLY_EXPLANATION =
  "Isi email adalah surat lamaran yang sudah kamu setujui, dikirim apa adanya tanpa diubah atau ditulis ulang AI. " +
  "Email dikirim dari akun Gmail yang kamu hubungkan, dengan subjek yang dibuat otomatis dan lampiran CV serta surat lamaran (PDF). " +
  "Transkrip nilai atau portofolio dilampirkan hanya bila lowongan memintanya dan berkasnya sudah ada di Profil. " +
  "Satu persetujuan hanya berlaku untuk satu pengiriman dan hanya selama masa berlakunya.";

// ---------------------------------------------------------------------------------------------
// Recruiter email
// ---------------------------------------------------------------------------------------------

export type EmailCheck = { ok: true; email: string } | { ok: false; error: string };

const LOCAL_RE = /^[A-Za-z0-9._%+-]{1,64}$/;
const LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/**
 * One plain address. The worker puts this string into the `To:` header unchanged, so anything that could add
 * a second recipient or header (space, comma, semicolon, angle brackets, quotes, line breaks) is refused here.
 */
export function validateRecruiterEmail(raw: unknown): EmailCheck {
  const email = typeof raw === "string" ? raw.trim() : "";
  if (!email) return { ok: false, error: "Alamat email tujuan wajib diisi." };
  if (email.length > 254) return { ok: false, error: "Alamat email terlalu panjang." };
  if (/[\s,;<>"'()[\]\\\u0000-\u001f\u007f]/.test(email)) return { ok: false, error: "Isi satu alamat email saja, tanpa spasi atau tanda lain." };
  const parts = email.split("@");
  if (parts.length !== 2) return { ok: false, error: "Alamat email harus berbentuk nama@domain.com." };
  const [local, domain] = parts;
  if (!LOCAL_RE.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return { ok: false, error: "Bagian sebelum @ tidak valid." };
  }
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l)) || !/^[A-Za-z]{2,}$/.test(labels[labels.length - 1])) {
    return { ok: false, error: "Domain email tidak valid." };
  }
  return { ok: true, email };
}

const IMAGE_SUFFIX = /\.(png|jpe?g|gif|svg|webp)$/i;

/** Addresses written in a job posting, offered as suggestions (never filled in automatically). */
export function extractRecruiterEmails(text: unknown, max = 5): string[] {
  if (typeof text !== "string" || !text) return [];
  const found = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of found) {
    if (IMAGE_SUFFIX.test(candidate)) continue;
    const c = validateRecruiterEmail(candidate);
    if (!c.ok) continue;
    const key = c.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c.email);
    if (out.length >= max) break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Enabling logic
// ---------------------------------------------------------------------------------------------

export interface ApprovalLike {
  id: string;
  status?: string | null;
  /** approval_requests.platform; cadangan bila lowongan tidak punya platform_source. */
  platform?: string | null;
  expires_at?: string | null;
  job_id?: string | null;
  application_id?: string | null;
  cover_letter?: string | null;
  /** Tautan CV bertanda tangan yang ditulis server saat draf diajukan (sumber CV yang sama dengan agen pengisi formulir). */
  resume_url?: string | null;
}

export interface EmailQueueRow {
  status?: string | null;
  error_message?: string | null;
}

/** True bila percobaan kirim terakhir gagal karena berkas CV pada persetujuan tidak bisa diunduh/dilampirkan. */
export function isCvAttachmentFailure(job?: EmailQueueRow | null): boolean {
  if (job?.status !== "failed") return false;
  return /gagal diunduh|gagal dilampirkan|cv_attachment_unavailable/i.test(job.error_message ?? "");
}

/** True bila tugas email_apply masih menunggu atau sedang diproses worker sehingga /approvals perlu polling. */
export function isEmailApplyActive(job?: EmailQueueRow | null): boolean {
  return job?.status === "pending" || job?.status === "processing";
}

export interface EmailApplyContext {
  now?: Date;
  /** A successful application_logs row already consumed this approval (the worker refuses a second use). */
  used: boolean;
  /** Latest email_apply queue row for this approval, if there is one. */
  job?: EmailQueueRow | null;
  /** null = the status request failed, so it is unknown. */
  gmailConnected: boolean | null;
  /** What the user typed. */
  applyEmail: string;
  /** Locked claim or unverified previous attempt on the agent side: hold email apply to prevent double submission. */
  agentBlockedReason?: "locked_stuck" | "submit_unverified" | null;
}

export type EmailApplyBlock =
  | "expired"
  | "no_job"
  | "no_letter"
  | "used"
  | "agent_review"
  | "queued"
  | "do_not_resend"
  | "gmail_off"
  | "gmail_unknown"
  | "bad_email";

export interface EmailApplyState {
  /** Show the action at all. Only an approval that exists and is "approved" gets it. */
  visible: boolean;
  /** The button can be pressed. */
  enabled: boolean;
  block?: EmailApplyBlock;
  /** Why the button is off (or a note when it is on). */
  message?: string;
  /** Inline error for the email field (only when something was typed). */
  emailError?: string;
}

const HIDDEN: EmailApplyState = { visible: false, enabled: false };

export function getEmailApplyState(approval: ApprovalLike | null | undefined, ctx: EmailApplyContext): EmailApplyState {
  if (!approval || approval.status !== "approved") return HIDDEN;

  const now = (ctx.now ?? new Date()).getTime();
  const expires = approval.expires_at ? new Date(approval.expires_at).getTime() : NaN;
  const off = (block: EmailApplyBlock, message: string, extra: Partial<EmailApplyState> = {}): EmailApplyState => ({
    visible: true,
    enabled: false,
    block,
    message,
    ...extra,
  });

  if (!Number.isFinite(expires) || expires <= now) {
    return off("expired", "Persetujuanmu tetap tercatat, tetapi masa berlakunya (24 jam) sudah kedaluwarsa, jadi email tidak bisa dikirim dari persetujuan ini. Ajukan draf lagi dari halaman Lowongan untuk mendapat persetujuan baru.");
  }
  if (!approval.job_id) return off("no_job", "Persetujuan ini tidak terhubung ke lowongan, jadi email tidak bisa dikirim.");
  if (typeof approval.cover_letter !== "string" || approval.cover_letter.trim() === "") {
    return off("no_letter", "Surat lamaran pada persetujuan ini kosong. Email tidak dibuat dari AI, jadi tidak ada yang bisa dikirim.");
  }
  if (ctx.used) return off("used", "Persetujuan ini sudah dipakai untuk satu pengiriman. Satu persetujuan hanya berlaku untuk satu pengiriman.");
  if (ctx.agentBlockedReason === "locked_stuck" || ctx.agentBlockedReason === "submit_unverified") {
    return off(
      "agent_review",
      "Percobaan kirim agen sebelumnya masih terkunci atau belum terkonfirmasi. Cek email dan statusnya di atas sebelum mengirim lewat email agar tidak terkirim ganda."
    );
  }

  const job = ctx.job;
  if (job && (job.status === "pending" || job.status === "processing")) {
    return off("queued", job.status === "processing" ? "Email sedang diproses agen." : "Email sudah masuk antrean dan menunggu agen.");
  }
  if (job?.status === "failed" && /jangan kirim ulang/i.test(job.error_message ?? "")) {
    return off("do_not_resend", job.error_message ?? "Email sudah terkirim; jangan kirim ulang.");
  }

  if (ctx.gmailConnected === false) return off("gmail_off", "Gmail belum terhubung. Hubungkan Gmail dulu agar email bisa dikirim dari akunmu.");
  if (ctx.gmailConnected === null) return off("gmail_unknown", "Status Gmail tidak dapat diperiksa. Muat ulang halaman ini.");

  const typed = (ctx.applyEmail ?? "").trim();
  const check = validateRecruiterEmail(typed);
  if (!check.ok) {
    return off("bad_email", typed === "" ? "Isi alamat email rekruter dulu." : check.error, typed === "" ? {} : { emailError: check.error });
  }

  // On: a failed earlier job is only a note, the user may try again.
  if (job?.status === "failed") {
    return { visible: true, enabled: true, message: `Percobaan sebelumnya gagal: ${job.error_message ?? "tanpa keterangan"}` };
  }
  return { visible: true, enabled: true };
}

// ---------------------------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------------------------

export interface EmailApplyRequest {
  job_type: typeof EMAIL_APPLY_JOB_TYPE;
  payload: { approval_request_id: string; apply_email: string; allow_without_cv?: true };
}

/**
 * Body of POST /api/automation/queue. Only the approval id and the address: the job and application come from
 * the approval row on the server, and there is no `approved` key on purpose (the server sets it only after it
 * has read that row and drops any value a client sends). Returns null when the input is not enough.
 */
export function buildEmailApplyRequest(approval: ApprovalLike, applyEmail: string, options: { allowWithoutCv?: boolean } = {}): EmailApplyRequest | null {
  const check = validateRecruiterEmail(applyEmail);
  if (!check.ok || !approval.id || !approval.job_id) return null;
  return {
    job_type: EMAIL_APPLY_JOB_TYPE,
    payload: {
      approval_request_id: approval.id,
      apply_email: check.email,
      ...(options.allowWithoutCv === true ? { allow_without_cv: true as const } : {}),
    },
  };
}

/** Turn what apiFetch throws into a message for the user (the server's own text is never shown). */
export function describeQueueError(err: unknown): string {
  if (parseApiError(err).code === "missing_cv_unconfirmed") {
    return "CV belum dilampirkan. Unggah CV di Profil atau centang konfirmasi kirim tanpa CV sebelum mengirim.";
  }
  return describeApiError(
    err,
    "Lamaran belum bisa masuk ke antrean. Periksa koneksi internetmu lalu coba kirim ulang. Surat dan persetujuanmu tidak hilang.",
  );
}
