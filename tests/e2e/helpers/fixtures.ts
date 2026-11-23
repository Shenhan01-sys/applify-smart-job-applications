/**
 * Pembuat data uji. Bentuk barisnya mengikuti yang dibaca aplikasi dari backend dan Supabase, dan log agen
 * mengikuti yang ditulis worker (worker/src/handlers/apply.ts: log(...) dan announceAwaiting).
 */
type Row = Record<string, any>;

const MIN = 60_000;
export const isoIn = (ms: number): string => new Date(Date.now() + ms).toISOString();
export const isoAgo = (ms: number): string => new Date(Date.now() - ms).toISOString();

export function approval(id: string, over: Row = {}): Row {
  return {
    id,
    user_id: undefined,
    job_id: `job-${id}`,
    application_id: `app-${id}`,
    job_title: `Frontend Engineer ${id}`,
    company: `PT Contoh ${id}`,
    platform: "linkedin",
    status: "pending",
    cover_letter: `Yth. tim rekrutmen ${id}, saya tertarik pada posisi ini.`,
    answers: [],
    created_at: isoAgo(5 * MIN),
    expires_at: isoIn(55 * MIN),
    ...over,
  };
}

/** Persetujuan yang sudah disetujui (muncul di tab Riwayat, tempat status agen ditampilkan). */
export function approvedApproval(id: string, over: Row = {}): Row {
  return approval(id, { status: "approved", reviewed_at: isoAgo(2 * MIN), ...over });
}

export function queueRow(queueJobId: string, approvalId: string, status: string, over: Row = {}): Row {
  return {
    id: queueJobId,
    job_type: "apply",
    status,
    error_message: null,
    created_at: isoAgo(3 * MIN),
    payload: { approval_request_id: approvalId, job_id: `job-${approvalId}` },
    ...over,
  };
}

/** Baris application_logs milik tugas apply (action "apply"). `details` ditambah queue_job_id dan approval_request_id. */
export function applyLog(queueJobId: string, approvalId: string, status: string, details: Row = {}, over: Row = {}): Row {
  return {
    action: "apply",
    status,
    job_id: `job-${approvalId}`,
    created_at: isoAgo(1 * MIN),
    details: { queue_job_id: queueJobId, approval_request_id: approvalId, ...details },
    ...over,
  };
}

/** Log "awaiting_code": agen sudah menekan kirim dan menunggu kode dari email (announceAwaiting di worker). */
export function awaitingCodeLog(queueJobId: string, approvalId: string, over: Row = {}): Row {
  return applyLog(queueJobId, approvalId, "awaiting_code", {
    awaiting_until: isoIn(10 * MIN),
    code_length: 6,
    submit_clicked: true,
    code_attempt: 1,
    previous_code_rejected: false,
    ...over,
  });
}

export const QUESTIONS = [
  { key: "why do you want to work here", label: "Why do you want to work here? (required)", kind: "textarea" },
  { key: "are you authorized to work in indonesia", label: "Are you authorized to work in Indonesia?", kind: "select", options: ["Yes", "No"] },
  { key: "i agree to the privacy policy", label: "I agree to the privacy policy", kind: "check" },
];

/** Log "ready": agen mengisi sebagian formulir lalu berhenti karena pertanyaan wajib yang tidak bisa dijawabnya. */
export function questionsLog(queueJobId: string, approvalId: string, over: Row = {}): Row {
  return applyLog(queueJobId, approvalId, "ready", {
    reason: null,
    submit_blocked: "required_remaining",
    fields_filled: 5,
    remaining_required: QUESTIONS.map((q) => q.label),
    questions: QUESTIONS,
    questions_pending: QUESTIONS.length,
    ...over,
  });
}

/** Log "ready" tanpa pertanyaan: agen berhenti sebelum tombol kirim. `blocked` = details.submit_blocked. */
export function stoppedLog(queueJobId: string, approvalId: string, blocked: string | null, over: Row = {}, logOver: Row = {}): Row {
  return applyLog(queueJobId, approvalId, "ready", {
    reason: null,
    submit_blocked: blocked,
    fields_filled: 7,
    remaining_required: blocked === "required_remaining" ? ["Nomor telepon"] : [],
    filled_fields: [{ label: "Nama lengkap", kind: "text", value: "Penguji Applify" }],
    ...over,
  }, logOver);
}

export function jobRow(jobId: string, over: Row = {}): Row {
  return {
    id: jobId,
    title: `Lowongan ${jobId}`,
    company: `PT ${jobId}`,
    platform_source: "linkedin",
    description: "Deskripsi lowongan contoh.",
    external_url: `https://jobs.example.test/${jobId}`,
    ...over,
  };
}

/** ai_applications dengan lowongan tertanam, seperti hasil select("*, jobs(*)"). */
export function applicationRow(id: string, jobId: string, over: Row = {}): Row {
  return {
    id,
    job_id: jobId,
    status: "ready",
    cover_letter: "Surat lamaran contoh.",
    tailored_skills: [],
    follow_up_sent: false,
    submitted_at: null,
    // Lebih lama daripada log percobaan agen: attemptForApplication hanya menghitung percobaan sesudah lamaran dibuat.
    created_at: isoAgo(60 * MIN),
    updated_at: isoAgo(60 * MIN),
    jobs: jobRow(jobId, { title: `Backend Engineer ${id}`, company: `PT Contoh ${id}` }),
    ...over,
  };
}
