import { supabase } from '../lib/supabase'
import { ApiError } from '../lib/apiErrors'
import {
  mockJobs,
  mockAutomationSettings,
  mockApprovals,
  mockApprovalHistory,
  mockLinkedInStatus,
  mockRateLimits,
  mockPlatforms,
  mockAiAnalysis,
  mockLinkedInImportPreview,
} from '@/mocks/mockData'

import { getApiBaseUrl, isMockMode } from '@/lib/appConfig'
import type { EnrichJobResult, SalaryBenchmarkResult } from '@/lib/jobDetail'
import { LINKEDIN_IMPORT_TIMEOUT_MS, parseImportPreview, type ImportPreview } from '@/lib/linkedinImport'
import {
  parseDeleteResponse,
  parseLlmKeysResponse,
  providerInfo,
  parseSaveResponse,
  parseTestResponse,
  type LlmKeyRow,
  type LlmKeysResponse,
  type LlmProvider,
  type LlmTestResponse,
} from '@/lib/llmKeys'
import { mockDeleteKey, mockLlmKeysResponse, mockSaveKey, mockTestKey } from '@/mocks/llmKeysMock'
import { consentRequestBody } from '@/lib/extensionConsent'

// Kunci API sendiri (BYOK) di mode demo: hanya 4 karakter terakhir yang diingat, selama halaman terbuka.
let mockLlmKeyRows: LlmKeyRow[] = []

const badResponse = () => new ApiError(502, JSON.stringify({ code: 'bad_response' }))

// Alamat server dibaca saat dipanggil. Di build produksi tanpa VITE_API_URL ini melempar ApiConfigError,
// yang dijelaskan ke pengguna oleh describeApiError(). Localhost hanya dipakai saat `vite dev`.
// Mode demo tidak memanggil server (data contoh dipakai), jadi tidak butuh alamat.
const apiBase = () => (isMockMode() ? 'demo://tanpa-server' : getApiBaseUrl())

async function getAuthHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

/**
 * Semua panggilan ke server otomasi lewat sini.
 *
 * `mockFn` hanya dipakai bila VITE_MOCK_MODE === 'true' (mode demo). Di luar mode demo, galat jaringan atau
 * status non-2xx selalu dilempar ke pemanggil, termasuk untuk GET. Data contoh diam-diam akan membuat
 * pengguna mengira lamaran, persetujuan, atau antrean palsu itu nyata.
 */
async function apiFetch<T>(
  url: string,
  options?: RequestInit,
  mockFn?: () => T,
  delay = 0,
): Promise<T> {
  if (isMockMode() && mockFn) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay))
    return mockFn()
  }
  const res = await fetch(url, options)
  if (!res.ok) {
    // Keep the response text as the message (callers parse it) and add the status and Retry-After header,
    // so describeApiError() can tell 401, 429 quota_exhausted, 429 rate_limited and 503 apart.
    const retryAfter = Number(res.headers.get('Retry-After'))
    throw new ApiError(res.status, await res.text(), Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined)
  }
  return res.json()
}

export interface AutomationSettings {
  first_name?: string
  last_name?: string
  phone_number?: string
  current_city?: string
  street?: string
  state?: string
  zipcode?: string
  country?: string
  ethnicity?: string
  gender?: string
  disability_status?: string
  veteran_status?: string
  years_of_experience?: string
  require_visa?: string
  website?: string
  linkedin_url?: string
  us_citizenship?: string
  // null = dikosongkan oleh pengguna (kolom database boleh null)
  desired_salary?: number | null
  current_ctc?: number | null
  notice_period?: number | null
  linkedin_headline?: string
  linkedin_summary?: string
  cover_letter?: string
  recent_employer?: string
  confidence_level?: string
  search_keywords?: string[]
  search_location?: string | null
  experience_level_filter?: string[]
  job_type_filter?: string[]
  work_type_filter?: string[]
  easy_apply_only?: boolean
  blacklist_companies?: string[]
  blacklist_words?: string[]
  whitelist_words?: string[]
  pause_before_submit?: boolean
  pause_at_failed_question?: boolean
  overwrite_previous_answers?: boolean
  ai_provider?: string
  ai_model?: string
  /** Pakai Ekstensi Browser langsung (tanpa bertanya) untuk situs yang perlu login. Bawaan: mati. */
  extension_auto_use?: boolean
}

export const automationApi = {
  // Settings
  async getSettings(): Promise<AutomationSettings> {
    return apiFetch(
      `${apiBase()}/api/automation/settings`,
      { headers: await getAuthHeaders() },
      () => mockAutomationSettings as AutomationSettings,
    )
  },

  async updateSettings(settings: Partial<AutomationSettings>) {
    return apiFetch(
      `${apiBase()}/api/automation/settings`,
      {
        method: 'PUT',
        headers: await getAuthHeaders(),
        body: JSON.stringify(settings),
      },
      () => ({ ...mockAutomationSettings, ...settings, updated_at: new Date().toISOString() }),
    )
  },

  // Job Search
  async searchJobs(params: { keywords?: string; location?: string; platforms?: string[] }) {
    return apiFetch(
      `${apiBase()}/api/automation/search`,
      {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(params),
      },
      () => ({ jobs: mockJobs, total: mockJobs.length }),
      1500,
    )
  },

  // Logs
  async getLogs(params?: { limit?: number; offset?: number; action?: string; status?: string }) {
    const query = new URLSearchParams(params as any).toString()
    return apiFetch(
      `${apiBase()}/api/automation/logs?${query}`,
      { headers: await getAuthHeaders() },
      () => [],
    )
  },

  // Queue
  async getQueue(status?: string) {
    const query = status ? `?status=${status}` : ''
    return apiFetch(
      `${apiBase()}/api/automation/queue${query}`,
      { headers: await getAuthHeaders() },
      () => [],
    )
  },

  /**
   * Is the current user's Gmail connected (GET /api/oauth/status)? null = could not be checked. The email
   * channel needs it, and a failed request must not look like "connected", so there is no placeholder fallback.
   */
  async getGmailStatus(): Promise<{ gmail: boolean } | null> {
    if (isMockMode()) return { gmail: true }
    try {
      return await apiFetch<{ gmail: boolean }>(`${apiBase()}/api/oauth/status`, { headers: await getAuthHeaders() })
    } catch (err) {
      console.warn('[automationApi] Gmail status unavailable:', err)
      return null
    }
  },

  /** Memulai alur Gmail OAuth lewat endpoint POST terautentikasi dengan credentials agar cookie nonce HttpOnly tersimpan lintas origin. */
  async startGmailOAuth(): Promise<string> {
    if (isMockMode()) return `${typeof window !== 'undefined' ? window.location.origin : ''}/settings?gmail=connected`
    const res = await apiFetch<{ url: string }>(`${apiBase()}/api/oauth/google/init`, {
      method: 'POST',
      credentials: 'include',
      headers: await getAuthHeaders(),
      // Fastify menolak POST ber-Content-Type JSON tanpa isi (FST_ERR_CTP_EMPTY_JSON_BODY), jadi kirim objek kosong.
      body: '{}',
    })
    return res.url
  },

  async addToQueue(jobType: string, payload: any, priority?: number) {
    return apiFetch(
      `${apiBase()}/api/automation/queue`,
      {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ job_type: jobType, payload, priority }),
      },
      () => ({ success: true, id: `q-${Date.now()}`, jobType, status: "queued" }),
    )
  },

  // Approvals
  async getPendingApprovals() {
    return apiFetch(
      `${apiBase()}/api/approvals/pending`,
      { headers: await getAuthHeaders() },
      () => mockApprovals,
    )
  },

  async getApproval(id: string) {
    return apiFetch(
      `${apiBase()}/api/approvals/${id}`,
      { headers: await getAuthHeaders() },
      () => mockApprovals.find(a => a.id === id) || mockApprovals[0],
    )
  },

  async createApproval(data: any) {
    return apiFetch(
      `${apiBase()}/api/approvals`,
      {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(data),
      },
      () => ({ ...data, id: `apr-${Date.now()}`, status: "pending", created_at: new Date().toISOString() }),
    )
  },

  /**
   * Approve = consent to submit. `coverLetter` carries the user's edits from the review screen. For a login site
   * the answer carries `apply_channel: 'extension'` and `extension_consent_required: true`: the job was NOT
   * queued, the user must allow the Browser Extension first (grantExtensionConsent).
   */
  async approveApplication(id: string, coverLetter?: string) {
    return apiFetch<{ success?: boolean; id?: string; status?: string; apply_channel?: string; extension_consent_required?: boolean }>(
      `${apiBase()}/api/approvals/${id}/approve`,
      {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(coverLetter ? { cover_letter: coverLetter } : {}),
      },
      () => ({ success: true, id, status: "approved" }),
    )
  },

  /**
   * Izinkan Ekstensi Browser mengisi formulir persetujuan ini (POST /api/approvals/:id/extension-consent).
   * 200 { queued: true, queue_job_id }. 409 bila tugas ekstensi sudah aktif; 404 dan 410 dilempar sebagai ApiError
   * (lihat describeConsentError). Dengan `always` true, backend juga menyalakan pengaturan extension_auto_use.
   */
  async grantExtensionConsent(id: string, always = false) {
    return apiFetch<{ queued?: boolean; queue_job_id?: string }>(
      `${apiBase()}/api/approvals/${encodeURIComponent(id)}/extension-consent`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(consentRequestBody(always)) },
      () => ({ queued: true, queue_job_id: `mock-extension-queue-${id}` }),
    )
  },

  /**
   * Re-queue the SAME approved apply job so the agent runs again with the user's saved form answers.
   * 200 { success, queue_job_id }; 404, 409 (not approved, already sent or agent working), 410 expired,
   * 422 no job, 429 too many reruns are thrown as ApiError (see describeRerunError).
   */
  async rerunApproval(id: string) {
    return apiFetch<{ success: boolean; queue_job_id?: string }>(
      `${apiBase()}/api/approvals/${encodeURIComponent(id)}/rerun`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({}) },
      () => ({ success: true, queue_job_id: `mock-queue-${id}` }),
    )
  },

  /**
   * Pengguna mengirim lamaran sendiri di situs lowongan dan menandainya (POST /api/approvals/:id/mark-sent).
   * Tidak ada yang dikirim ke situs mana pun: backend mencatat log "success" bertanda manual dan memindahkan
   * kartu lamaran ke Terkirim. 200 { success: true, already_marked? }; 404, 409 { code: not_approved |
   * already_sent | agent_working }, 422 { code: no_job } dilempar sebagai ApiError (lihat markSentErrorMessage).
   */
  async markApprovalSent(id: string) {
    return apiFetch<{ success: boolean; already_marked?: boolean }>(
      `${apiBase()}/api/approvals/${encodeURIComponent(id)}/mark-sent`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({}) },
      () => ({ success: true }),
    )
  },

  /**
   * Teruskan kode keamanan dari email ke agen yang menunggu (POST /api/agent/security-code).
   * 202 { accepted: true }; 400 invalid_code | invalid_job, 401, 404, 409 agent_not_waiting, 429 too_many_codes,
   * 503 feature_unavailable, 500 dilempar sebagai ApiError (lihat describeSecurityCodeError di securityCode.ts).
   * Kode hanya ada di badan permintaan ini: tidak dicatat dan tidak disimpan.
   */
  async submitSecurityCode(queueJobId: string, code: string) {
    return apiFetch<{ accepted: boolean }>(
      `${apiBase()}/api/agent/security-code`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ queue_job_id: queueJobId, code }) },
      () => ({ accepted: true }),
    )
  },

  async rejectApplication(id: string, reason?: string) {
    return apiFetch(
      `${apiBase()}/api/approvals/${id}/reject`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ reason }) },
      () => ({ success: true, id, status: "rejected", reason }),
    )
  },

  async regenerateCoverLetter(id: string, instructions: string) {
    return apiFetch(
      `${apiBase()}/api/approvals/${id}/regenerate`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ instructions }) },
      () => ({ success: true, id, cover_letter: mockAiAnalysis.coverLetter }),
      2000,
    )
  },

  /**
   * Ask the backend to announce this application's CURRENT status on Telegram. Best effort: the status
   * itself was already saved by the caller, so a failure here is only logged, never shown as an error.
   */
  async notifyApplicationStatus(applicationId: string) {
    return apiFetch(
      `${apiBase()}/api/notifications/application-status`,
      {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ application_id: applicationId }),
      },
      () => ({ sent: false, reason: 'mock' }),
    )
  },

  async getApprovalHistory(params?: { limit?: number; offset?: number }) {
    const query = new URLSearchParams(params as any).toString()
    return apiFetch(
      `${apiBase()}/api/approvals/history?${query}`,
      { headers: await getAuthHeaders() },
      () => mockApprovalHistory,
    )
  },

  // AI Pipeline — always mock with delay
  async generateCoverLetter(params: { jobTitle: string; company: string; jobDescription: string; userProfile: any }) {
    return apiFetch(
      `${apiBase()}/api/ai/cover-letter`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(params) },
      () => ({ coverLetter: mockAiAnalysis.coverLetter }),
      2000,
    )
  },

  async analyzeMatch(jobDescription: string, userSkills: string[]) {
    return apiFetch(
      `${apiBase()}/api/ai/analyze-match`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ jobDescription, userSkills }) },
      () => ({ matchScore: 85, acceptancePotential: 78, skillMatches: userSkills.map(s => ({ skill: s, matched: true, level: 80 })), skillGaps: [] }),
      1500,
    )
  },

  async extractSkills(jobDescription: string) {
    return apiFetch(
      `${apiBase()}/api/ai/extract-skills`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ jobDescription }) },
      () => ({ skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker"] }),
      1000,
    )
  },

  async generateAnswer(question: string, questionType: string, options?: string[], jobDescription?: string, userProfile?: any) {
    return apiFetch(
      `${apiBase()}/api/ai/answer`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ question, questionType, options, jobDescription, userProfile }) },
      () => ({ answer: `This is a simulated answer to: "${question}". I have extensive experience in this area and would be happy to discuss in more detail.`, confidence: 0.85 }),
      1000,
    )
  },

  async fillForm(formFields: any[], jobData: any, userSettings: any, userProfile: any) {
    return apiFetch(
      `${apiBase()}/api/ai/fill-form`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ formFields, jobData, userSettings, userProfile }) },
      () => ({ filled: formFields.map(f => ({ field: f.name || f.label, value: "Simulated answer from AI" })) }),
      1500,
    )
  },

  // Platforms
  async getPlatforms() {
    return apiFetch(
      `${apiBase()}/api/platforms`,
      undefined,
      () => mockPlatforms,
    )
  },

  // Rate Limits
  async getRateLimitStatus() {
    return apiFetch(
      `${apiBase()}/api/rate-limits/status`,
      { headers: await getAuthHeaders() },
      () => mockRateLimits,
    )
  },

  async getPlatformLimit(platform: string) {
    return apiFetch(
      `${apiBase()}/api/rate-limits/platform/${platform}`,
      { headers: await getAuthHeaders() },
      () => mockRateLimits.platforms[platform as keyof typeof mockRateLimits.platforms] || { limit: 30, used: 0, remaining: 30 },
    )
  },

  // LinkedIn Session
  async getLinkedInSessionStatus() {
    return apiFetch(
      `${apiBase()}/api/linkedin/status`,
      { headers: await getAuthHeaders() },
      () => mockLinkedInStatus,
    )
  },

  async getLinkedInInstructions() {
    return apiFetch(
      `${apiBase()}/api/linkedin/instructions`,
      undefined,
      () => ({ instructions: "1. Go to linkedin.com\n2. Open DevTools (F12)\n3. Go to Application tab\n4. Copy cookies" }),
    )
  },

  async importLinkedInSession(cookies: any, userAgent?: string) {
    return apiFetch(
      `${apiBase()}/api/linkedin/import`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ cookies, userAgent }) },
      () => ({ success: true, message: "Session imported (mock)" }),
      1000,
    )
  },

  async verifyLinkedInSession() {
    return apiFetch(
      `${apiBase()}/api/linkedin/verify`,
      { method: 'POST', headers: await getAuthHeaders(), body: '{}' },
      () => ({ valid: true, sessionId: "mock-session", expiresAt: new Date(Date.now() + 86400000).toISOString() }),
      800,
    )
  },

  async refreshLinkedInSession() {
    return apiFetch(
      `${apiBase()}/api/linkedin/refresh`,
      { method: 'POST', headers: await getAuthHeaders(), body: '{}' },
      () => ({ success: true, message: "Session refreshed (mock)" }),
      1500,
    )
  },

  // Detail lowongan (lib/jobDetail.ts). Mode demo tidak punya server, jadi hasilnya null (tidak ada).
  /** Mengambil deskripsi lengkap, requirements, dan gaji dari situs asal lalu menyimpannya. Glints tidak didukung. */
  async enrichJob(jobId: string): Promise<EnrichJobResult | null> {
    return apiFetch<EnrichJobResult | null>(
      `${apiBase()}/api/jobs/${encodeURIComponent(jobId)}/enrich`,
      // Fastify menolak POST ber-Content-Type JSON tanpa isi, jadi body kosong tetap dikirim sebagai objek.
      { method: 'POST', headers: await getAuthHeaders(), body: '{}' },
      () => null,
    )
  },

  /** Median gaji lowongan serupa yang mencantumkan gaji (per bulan). */
  async getSalaryBenchmark(jobId: string): Promise<SalaryBenchmarkResult | null> {
    return apiFetch<SalaryBenchmarkResult | null>(
      `${apiBase()}/api/jobs/${encodeURIComponent(jobId)}/salary-benchmark`,
      { headers: await getAuthHeaders() },
      () => null,
    )
  },

  /**
   * Impor profil dari PDF LinkedIn. Server hanya mengembalikan pratinjau dan tidak menulis apa pun; penulisan
   * dilakukan setelah pengguna menyetujui pratinjau (services/linkedinImportService.ts). PDF dikirim mentah
   * sebagai badan permintaan (Content-Type: application/pdf), bukan multipart. Tidak memakai kuota draf AI.
   */
  async importLinkedInPdf(file: File): Promise<ImportPreview> {
    const auth = await getAuthHeaders()
    const body = await apiFetch<unknown>(
      `${apiBase()}/api/profile/import/linkedin-pdf`,
      {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/pdf' },
        body: file,
        signal: AbortSignal.timeout(LINKEDIN_IMPORT_TIMEOUT_MS),
      },
      () => ({ success: true, preview: mockLinkedInImportPreview }),
      1200,
    )
    const preview = parseImportPreview(body)
    if (!preview) throw new ApiError(502, JSON.stringify({ success: false, code: 'bad_response', error: 'Jawaban server tidak dikenali.' }))
    return preview
  },

  // Sessions
  async getSessions() {
    return apiFetch(
      `${apiBase()}/api/sessions`,
      { headers: await getAuthHeaders() },
      () => [{ platform: "linkedin", status: "active", expiresAt: new Date(Date.now() + 86400000).toISOString() }],
    )
  },

  async saveSession(platform: string, sessionData: any, expiresAt?: string) {
    return apiFetch(
      `${apiBase()}/api/sessions/${platform}`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ session_data: sessionData, expires_at: expiresAt }) },
      () => ({ success: true, platform }),
    )
  },

  /** Token singkat scoped `extension:apply` (berlaku 4 jam) untuk menghubungkan Ekstensi Chrome/Edge. */
  async createExtensionToken(ttlSeconds: number = 14400): Promise<{
    token: string
    expiresAt: string
    scope: string
    ttlSeconds: number
  }> {
    return apiFetch(
      `${apiBase()}/api/extension/token`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ ttlSeconds }) },
      () => ({
        token: 'ext_tok_v1.demo_preview_only.demo_signature',
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
        scope: 'extension:apply',
        ttlSeconds,
      }),
    )
  },

  /** Cabut seluruh token ekstensi lama milik pengguna ("Putuskan semua perangkat"). */
  async revokeAllExtensionTokens(): Promise<{ revoked: boolean; minTokenVersion: number }> {
    return apiFetch(
      `${apiBase()}/api/extension/revoke-all`,
      { method: 'POST', headers: await getAuthHeaders(), body: '{}' },
      () => ({ revoked: true, minTokenVersion: 2 }),
    )
  },

  /** Status klaim atomik untuk persetujuan yang disetujui (mendeteksi klaim macet). */
  async getApprovalClaimStatuses(approvalIds: string[]): Promise<{
    claims: Record<string, { approvalId: string; state: 'none' | 'in_progress' | 'submitted' | 'abandoned' | 'locked_stuck'; channel: 'worker' | 'extension' | null }>
  }> {
    return apiFetch(
      `${apiBase()}/api/approvals/claim-statuses`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ approval_ids: approvalIds }) },
      () => ({ claims: {} }),
    )
  },

  /** Pemulihan aman untuk klaim persetujuan yang macet tanpa menghapus klaim lama. */
  async resolveLockedClaim(
    approvalId: string,
    resolution: 'mark_sent' | 'create_fresh_approval',
  ): Promise<{ ok: boolean; resolution: string; newApprovalId: string | null }> {
    return apiFetch(
      `${apiBase()}/api/approvals/${encodeURIComponent(approvalId)}/resolve-claim`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ resolution }) },
      () => ({ ok: true, resolution, newApprovalId: null }),
    )
  },

  async getNotificationStatus(): Promise<{ telegram: boolean; notificationsEnabled?: boolean; whatsappKapso?: boolean; email?: boolean }> {
    return apiFetch(
      `${apiBase()}/api/notifications/status`,
      { headers: await getAuthHeaders() },
      () => ({ telegram: false, notificationsEnabled: false, whatsappKapso: false, email: false }),
    )
  },

  async getNotificationPreferences() {
    return apiFetch<{
      userId: string
      whatsappPhone: string | null
      whatsappVerified: boolean
      whatsappEnabled: boolean
      whatsappLastInboundAt: string | null
      /** Email akun (read-only, dari server); null bila belum terkonfirmasi atau tidak tersedia. */
      emailAddress: string | null
      emailEnabled: boolean
      notifyEvents: Record<'ready' | 'submitted' | 'awaiting_code' | 'follow_up' | 'locked_claim', boolean>
      migrationPending?: boolean
    }>(
      `${apiBase()}/api/notifications/preferences`,
      { headers: await getAuthHeaders() },
      () => ({
        userId: 'demo-user',
        whatsappPhone: null,
        whatsappVerified: false,
        whatsappEnabled: false,
        whatsappLastInboundAt: null,
        emailAddress: null,
        emailEnabled: false,
        notifyEvents: { ready: true, submitted: true, awaiting_code: true, follow_up: true, locked_claim: true },
      }),
    )
  },

  /** Email dan Telegram tidak bisa diubah klien: penerima email selalu email akun, jadi tidak ada field-nya di sini. */
  async updateNotificationPreferences(patch: {
    whatsappEnabled?: boolean
    emailEnabled?: boolean
    notifyEvents?: Record<string, boolean>
  }) {
    return apiFetch(
      `${apiBase()}/api/notifications/preferences`,
      { method: 'PUT', headers: await getAuthHeaders(), body: JSON.stringify(patch) },
      () => ({ ok: true }),
    )
  },

  async requestWhatsappOtp(phone: string) {
    return apiFetch<{ sent: boolean; phone: string }>(
      `${apiBase()}/api/notifications/whatsapp/request-otp`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ phone }) },
      () => ({ sent: true, phone }),
    )
  },

  async verifyWhatsappOtp(phone: string, code: string) {
    return apiFetch(
      `${apiBase()}/api/notifications/whatsapp/verify-otp`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ phone, code }) },
      () => ({ whatsappVerified: true, whatsappEnabled: true, whatsappPhone: phone }),
    )
  },

  async testWhatsappNotification() {
    return apiFetch<{ success: boolean }>(
      `${apiBase()}/api/notifications/whatsapp/test`,
      { method: 'POST', headers: await getAuthHeaders(), body: '{}' },
      () => ({ success: true }),
    )
  },

  // Kunci API LLM milik pengguna (BYOK), lib/llmKeys.ts. Kunci utuh hanya ada di badan PUT: tidak di alamat,
  // tidak dicatat, tidak disimpan di browser, dan tidak pernah ada di jawaban server (hanya 4 karakter terakhir).

  /** Daftar kunci tersimpan dan apakah fiturnya aktif (GET /api/llm-keys). */
  async getLlmKeys(): Promise<LlmKeysResponse> {
    const body = await apiFetch<unknown>(
      `${apiBase()}/api/llm-keys`,
      { headers: await getAuthHeaders() },
      () => mockLlmKeysResponse(mockLlmKeyRows),
    )
    const parsed = parseLlmKeysResponse(body)
    if (!parsed) throw badResponse()
    return parsed
  },

  /**
   * Simpan dan periksa kunci (PUT /api/llm-keys/:provider { apiKey, consent: true, model? }). `consent` harus
   * `true` (pengguna mencentang persetujuan pengiriman data); tanpa itu server menjawab 400 consent_required.
   * Kunci yang ditolak penyedia tidak disimpan. Galat { code } dilempar sebagai ApiError (lihat describeLlmKeyApiError).
   */
  async saveLlmKey(
    provider: LlmProvider,
    apiKey: string,
    options: { consent: true; model?: string | null },
  ): Promise<LlmKeyRow> {
    const model = options.model || undefined // kosong = tidak memilih model: kolomnya tidak dikirim
    const body = await apiFetch<unknown>(
      `${apiBase()}/api/llm-keys/${encodeURIComponent(provider)}`,
      { method: 'PUT', headers: await getAuthHeaders(), body: JSON.stringify({ apiKey, consent: options.consent, model }) },
      () => {
        const info = providerInfo(provider)
        if (!info.verified) throw new ApiError(400, JSON.stringify({ code: 'provider_unverified' }))
        if (info.requiresModel && !model) throw new ApiError(400, JSON.stringify({ code: 'model_required' }))
        const saved = mockSaveKey(mockLlmKeyRows, provider, apiKey, model ?? null)
        mockLlmKeyRows = saved.rows
        return { key: saved.key }
      },
      600,
    )
    const parsed = parseSaveResponse(body)
    if (!parsed) throw badResponse()
    return parsed
  },

  /** Periksa ulang kunci tersimpan ke penyedia (POST /api/llm-keys/:provider/test). */
  async testLlmKey(provider: LlmProvider): Promise<LlmTestResponse> {
    const body = await apiFetch<unknown>(
      `${apiBase()}/api/llm-keys/${encodeURIComponent(provider)}/test`,
      // Fastify menolak POST ber-Content-Type JSON tanpa isi, jadi body kosong tetap dikirim sebagai objek.
      { method: 'POST', headers: await getAuthHeaders(), body: '{}' },
      () => {
        const tested = mockTestKey(mockLlmKeyRows, provider)
        if (!tested) throw new ApiError(404, JSON.stringify({ code: 'not_found' }))
        mockLlmKeyRows = tested.rows
        return tested.response
      },
      600,
    )
    const parsed = parseTestResponse(body)
    if (!parsed) throw badResponse()
    return parsed
  },

  /** Hapus kunci tersimpan (DELETE /api/llm-keys/:provider). Tetap jalan walau fiturnya dimatikan. */
  async deleteLlmKey(provider: LlmProvider): Promise<boolean> {
    // DELETE tanpa isi: Content-Type JSON dibuang supaya Fastify tidak menolaknya sebagai body kosong.
    const { 'Content-Type': _contentType, ...auth } = await getAuthHeaders()
    const body = await apiFetch<unknown>(
      `${apiBase()}/api/llm-keys/${encodeURIComponent(provider)}`,
      { method: 'DELETE', headers: auth },
      () => {
        const removed = mockDeleteKey(mockLlmKeyRows, provider)
        mockLlmKeyRows = removed.rows
        return { deleted: removed.deleted }
      },
    )
    return parseDeleteResponse(body)
  },
}
