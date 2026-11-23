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

  /** Browser redirect that starts the Gmail OAuth flow (the backend route takes the user id as `uid`). */
  getGmailConnectUrl(userId: string): string | null {
    try {
      return `${apiBase()}/api/oauth/google?uid=${encodeURIComponent(userId)}`
    } catch {
      return null // alamat server belum diatur di build ini: tautannya disembunyikan, halaman tidak rusak
    }
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

  /** Approve = consent to submit. `coverLetter` carries the user's edits from the review screen. */
  async approveApplication(id: string, coverLetter?: string) {
    return apiFetch(
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
      { method: 'POST', headers: await getAuthHeaders() },
      () => ({ valid: true, sessionId: "mock-session", expiresAt: new Date(Date.now() + 86400000).toISOString() }),
      800,
    )
  },

  async refreshLinkedInSession() {
    return apiFetch(
      `${apiBase()}/api/linkedin/refresh`,
      { method: 'POST', headers: await getAuthHeaders() },
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
}
