import { supabase } from '../lib/supabase'
import {
  mockJobs,
  mockAutomationSettings,
  mockApprovals,
  mockApprovalHistory,
  mockLinkedInStatus,
  mockRateLimits,
  mockPlatforms,
  mockAiAnalysis,
} from '@/mocks/mockData'

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === 'true'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

async function getAuthHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function apiFetch<T>(
  url: string,
  options?: RequestInit,
  mockFn?: () => T,
  delay = 0,
  readOnly = false,
): Promise<T> {
  if (isMockMode() && mockFn) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay))
    return mockFn()
  }
  // Only reads may fall back to placeholder data. A mocked "success" for approve/reject/queue/
  // settings or for AI output would tell the user an action happened when nothing reached
  // the backend, so those errors surface to the caller instead.
  const method = (options?.method ?? 'GET').toUpperCase()
  const canFallback = method === 'GET' || readOnly
  try {
    const res = await fetch(url, options)
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  } catch (err) {
    // Automation backend (Fastify) is optional/not-yet-hosted — degrade gracefully to
    // placeholder data for reads instead of crashing the page.
    if (mockFn && canFallback) {
      console.warn(`[automationApi] backend unavailable for ${url}; using fallback data.`, err)
      return mockFn()
    }
    throw err
  }
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
  desired_salary?: number
  current_ctc?: number
  notice_period?: number
  linkedin_headline?: string
  linkedin_summary?: string
  cover_letter?: string
  recent_employer?: string
  confidence_level?: string
  search_keywords?: string[]
  search_location?: string
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
      `${API_BASE_URL}/api/automation/settings`,
      { headers: await getAuthHeaders() },
      () => mockAutomationSettings as AutomationSettings,
    )
  },

  async updateSettings(settings: Partial<AutomationSettings>) {
    return apiFetch(
      `${API_BASE_URL}/api/automation/settings`,
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
      `${API_BASE_URL}/api/automation/search`,
      {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(params),
      },
      () => ({ jobs: mockJobs, total: mockJobs.length }),
      1500,
      true, // search is a read even though it is a POST
    )
  },

  // Logs
  async getLogs(params?: { limit?: number; offset?: number; action?: string; status?: string }) {
    const query = new URLSearchParams(params as any).toString()
    return apiFetch(
      `${API_BASE_URL}/api/automation/logs?${query}`,
      { headers: await getAuthHeaders() },
      () => [],
    )
  },

  // Queue
  async getQueue(status?: string) {
    const query = status ? `?status=${status}` : ''
    return apiFetch(
      `${API_BASE_URL}/api/automation/queue${query}`,
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
      return await apiFetch<{ gmail: boolean }>(`${API_BASE_URL}/api/oauth/status`, { headers: await getAuthHeaders() })
    } catch (err) {
      console.warn('[automationApi] Gmail status unavailable:', err)
      return null
    }
  },

  /** Browser redirect that starts the Gmail OAuth flow (the backend route takes the user id as `uid`). */
  getGmailConnectUrl(userId: string): string {
    return `${API_BASE_URL}/api/oauth/google?uid=${encodeURIComponent(userId)}`
  },

  async addToQueue(jobType: string, payload: any, priority?: number) {
    return apiFetch(
      `${API_BASE_URL}/api/automation/queue`,
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
      `${API_BASE_URL}/api/approvals/pending`,
      { headers: await getAuthHeaders() },
      () => mockApprovals,
    )
  },

  async getApproval(id: string) {
    return apiFetch(
      `${API_BASE_URL}/api/approvals/${id}`,
      { headers: await getAuthHeaders() },
      () => mockApprovals.find(a => a.id === id) || mockApprovals[0],
    )
  },

  async createApproval(data: any) {
    return apiFetch(
      `${API_BASE_URL}/api/approvals`,
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
      `${API_BASE_URL}/api/approvals/${id}/approve`,
      {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify(coverLetter ? { cover_letter: coverLetter } : {}),
      },
      () => ({ success: true, id, status: "approved" }),
    )
  },

  async rejectApplication(id: string, reason?: string) {
    return apiFetch(
      `${API_BASE_URL}/api/approvals/${id}/reject`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ reason }) },
      () => ({ success: true, id, status: "rejected", reason }),
    )
  },

  async regenerateCoverLetter(id: string, instructions: string) {
    return apiFetch(
      `${API_BASE_URL}/api/approvals/${id}/regenerate`,
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
      `${API_BASE_URL}/api/notifications/application-status`,
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
      `${API_BASE_URL}/api/approvals/history?${query}`,
      { headers: await getAuthHeaders() },
      () => mockApprovalHistory,
    )
  },

  // AI Pipeline — always mock with delay
  async generateCoverLetter(params: { jobTitle: string; company: string; jobDescription: string; userProfile: any }) {
    return apiFetch(
      `${API_BASE_URL}/api/ai/cover-letter`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify(params) },
      () => ({ coverLetter: mockAiAnalysis.coverLetter }),
      2000,
    )
  },

  async analyzeMatch(jobDescription: string, userSkills: string[]) {
    return apiFetch(
      `${API_BASE_URL}/api/ai/analyze-match`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ jobDescription, userSkills }) },
      () => ({ matchScore: 85, acceptancePotential: 78, skillMatches: userSkills.map(s => ({ skill: s, matched: true, level: 80 })), skillGaps: [] }),
      1500,
    )
  },

  async extractSkills(jobDescription: string) {
    return apiFetch(
      `${API_BASE_URL}/api/ai/extract-skills`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ jobDescription }) },
      () => ({ skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker"] }),
      1000,
    )
  },

  async generateAnswer(question: string, questionType: string, options?: string[], jobDescription?: string, userProfile?: any) {
    return apiFetch(
      `${API_BASE_URL}/api/ai/answer`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ question, questionType, options, jobDescription, userProfile }) },
      () => ({ answer: `This is a simulated answer to: "${question}". I have extensive experience in this area and would be happy to discuss in more detail.`, confidence: 0.85 }),
      1000,
    )
  },

  async fillForm(formFields: any[], jobData: any, userSettings: any, userProfile: any) {
    return apiFetch(
      `${API_BASE_URL}/api/ai/fill-form`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ formFields, jobData, userSettings, userProfile }) },
      () => ({ filled: formFields.map(f => ({ field: f.name || f.label, value: "Simulated answer from AI" })) }),
      1500,
    )
  },

  // Platforms
  async getPlatforms() {
    return apiFetch(
      `${API_BASE_URL}/api/platforms`,
      undefined,
      () => mockPlatforms,
    )
  },

  // Rate Limits
  async getRateLimitStatus() {
    return apiFetch(
      `${API_BASE_URL}/api/rate-limits/status`,
      { headers: await getAuthHeaders() },
      () => mockRateLimits,
    )
  },

  async getPlatformLimit(platform: string) {
    return apiFetch(
      `${API_BASE_URL}/api/rate-limits/platform/${platform}`,
      { headers: await getAuthHeaders() },
      () => mockRateLimits.platforms[platform as keyof typeof mockRateLimits.platforms] || { limit: 30, used: 0, remaining: 30 },
    )
  },

  // LinkedIn Session
  async getLinkedInSessionStatus() {
    return apiFetch(
      `${API_BASE_URL}/api/linkedin/status`,
      { headers: await getAuthHeaders() },
      () => mockLinkedInStatus,
    )
  },

  async getLinkedInInstructions() {
    return apiFetch(
      `${API_BASE_URL}/api/linkedin/instructions`,
      undefined,
      () => ({ instructions: "1. Go to linkedin.com\n2. Open DevTools (F12)\n3. Go to Application tab\n4. Copy cookies" }),
    )
  },

  async importLinkedInSession(cookies: any, userAgent?: string) {
    return apiFetch(
      `${API_BASE_URL}/api/linkedin/import`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ cookies, userAgent }) },
      () => ({ success: true, message: "Session imported (mock)" }),
      1000,
    )
  },

  async verifyLinkedInSession() {
    return apiFetch(
      `${API_BASE_URL}/api/linkedin/verify`,
      { method: 'POST', headers: await getAuthHeaders() },
      () => ({ valid: true, sessionId: "mock-session", expiresAt: new Date(Date.now() + 86400000).toISOString() }),
      800,
    )
  },

  async refreshLinkedInSession() {
    return apiFetch(
      `${API_BASE_URL}/api/linkedin/refresh`,
      { method: 'POST', headers: await getAuthHeaders() },
      () => ({ success: true, message: "Session refreshed (mock)" }),
      1500,
    )
  },

  // Sessions
  async getSessions() {
    return apiFetch(
      `${API_BASE_URL}/api/sessions`,
      { headers: await getAuthHeaders() },
      () => [{ platform: "linkedin", status: "active", expiresAt: new Date(Date.now() + 86400000).toISOString() }],
    )
  },

  async saveSession(platform: string, sessionData: any, expiresAt?: string) {
    return apiFetch(
      `${API_BASE_URL}/api/sessions/${platform}`,
      { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ session_data: sessionData, expires_at: expiresAt }) },
      () => ({ success: true, platform }),
    )
  },
}
