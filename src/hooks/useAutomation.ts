import { useState, useEffect, useCallback } from 'react'
import { automationApi } from '@/services/automationApi'
import { toast } from 'sonner'
import { describeApiError, parseApiError } from '@/lib/apiErrors'

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

export function useAutomationSettings() {
  const [settings, setSettings] = useState<AutomationSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const data = await automationApi.getSettings()
      setSettings(data || {})
    } catch (error) {
      toast.error(describeApiError(error, 'Pengaturan agen belum bisa dimuat.'))
    } finally {
      setLoading(false)
    }
  }

  const updateSettings = async (newSettings: Partial<AutomationSettings>) => {
    try {
      setSaving(true)
      const updated = await automationApi.updateSettings({ ...settings, ...newSettings })
      setSettings(updated || { ...settings, ...newSettings })
      toast.success('Pengaturan tersimpan.')
      return true
    } catch (error) {
      toast.error(describeApiError(error, 'Pengaturan belum tersimpan.'))
      return false
    } finally {
      setSaving(false)
    }
  }

  const updateField = useCallback((field: keyof AutomationSettings, value: any) => {
    setSettings((prev) => ({ ...prev, [field]: value }))
  }, [])

  return { settings, loading, saving, loadSettings, updateSettings, updateField }
}

export interface JobSearchSourceStat {
  platform: string
  displayName?: string
  fetched: number
  afterFilter: number
  errors: string[]
}

export function useJobSearch() {
  const [results, setResults] = useState<Array<{ platform: string; jobs: any[] }>>([])
  const [stats, setStats] = useState<JobSearchSourceStat[]>([])
  const [loading, setLoading] = useState(false)
  const [totalJobs, setTotalJobs] = useState(0)

  /**
   * POST /api/automation/search. Respons backend: { jobs, total, results: [{platform, jobs, errors}], stats, ingest }.
   * Hasil dikelompokkan per sumber supaya kartu platform di AIJobScanner bisa menampilkan jumlahnya.
   */
  const searchJobs = async (params: {
    keywords?: string
    location?: string
    platforms?: string[]
  }): Promise<{ groups: Array<{ platform: string; jobs: any[] }>; total: number; stats: JobSearchSourceStat[] }> => {
    try {
      setLoading(true)
      const data: any = await automationApi.searchJobs(params)
      const jobs: any[] = Array.isArray(data?.jobs) ? data.jobs : []
      let groups: Array<{ platform: string; jobs: any[] }>
      if (Array.isArray(data?.results) && data.results.every((r: any) => Array.isArray(r?.jobs))) {
        groups = data.results.map((r: any) => ({ platform: String(r.platform), jobs: r.jobs }))
      } else {
        const byPlatform = new Map<string, any[]>()
        for (const j of jobs) {
          const key = String(j?.platform ?? j?.platform_source ?? 'all').toLowerCase()
          byPlatform.set(key, [...(byPlatform.get(key) ?? []), j])
        }
        groups = Array.from(byPlatform, ([platform, list]) => ({ platform, jobs: list }))
      }
      const total = Number(data?.total ?? data?.total_jobs ?? jobs.length) || 0
      const sourceStats: JobSearchSourceStat[] = Array.isArray(data?.stats) ? data.stats : []
      setResults(groups)
      setStats(sourceStats)
      setTotalJobs(total)
      return { groups, total, stats: sourceStats }
    } catch (error) {
      toast.error(describeApiError(error, 'Gagal mencari lowongan.'))
      return { groups: [], total: 0, stats: [] }
    } finally {
      setLoading(false)
    }
  }

  return { results, stats, loading, totalJobs, searchJobs }
}

export function useAIPipeline() {
  const [loading, setLoading] = useState(false)

  const generateCoverLetter = async (params: {
    jobTitle: string
    company: string
    jobDescription: string
    userProfile: any
  }) => {
    try {
      setLoading(true)
      const result = await automationApi.generateCoverLetter(params)
      return result.coverLetter || ''
    } catch (error) {
      // 429 quota_exhausted / rate_limited and 503 *_check_failed each get their own message.
      toast.error(describeApiError(error, 'Gagal membuat surat lamaran.'))
      return ''
    } finally {
      setLoading(false)
    }
  }

  const analyzeMatch = async (jobDescription: string, userSkills: string[]) => {
    try {
      setLoading(true)
      const result = await automationApi.analyzeMatch(jobDescription, userSkills)
      return result
    } catch (error) {
      toast.error(describeApiError(error, 'Gagal menganalisis kecocokan lowongan.'))
      return null
    } finally {
      setLoading(false)
    }
  }

  const extractSkills = async (jobDescription: string) => {
    try {
      setLoading(true)
      const result = await automationApi.extractSkills(jobDescription)
      return result.skills || []
    } catch (error) {
      toast.error(describeApiError(error, 'Gagal mengambil daftar skill dari lowongan.'))
      return []
    } finally {
      setLoading(false)
    }
  }

  return { loading, generateCoverLetter, analyzeMatch, extractSkills }
}

export function useApprovalQueue() {
  const [pending, setPending] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const loadPending = async () => {
    try {
      setLoading(true)
      const data = await automationApi.getPendingApprovals()
      setPending(data || [])
    } catch (error) {
      console.error('Failed to load pending approvals')
    } finally {
      setLoading(false)
    }
  }

  const loadHistory = async (params?: { limit?: number; offset?: number }) => {
    try {
      const data = await automationApi.getApprovalHistory(params)
      setHistory(data || [])
    } catch (error) {
      console.error('Failed to load approval history')
    }
  }

  const approve = async (id: string) => {
    try {
      await automationApi.approveApplication(id)
      toast.success('Lamaran disetujui.')
      await loadPending()
      return true
    } catch (error) {
      toast.error(describeApiError(error, 'Lamaran belum bisa disetujui.'))
      return false
    }
  }

  const reject = async (id: string, reason?: string) => {
    try {
      await automationApi.rejectApplication(id, reason)
      toast.success('Lamaran ditolak.')
      await loadPending()
      return true
    } catch (error) {
      toast.error(describeApiError(error, 'Lamaran belum bisa ditolak.'))
      return false
    }
  }

  const regenerate = async (id: string, instructions: string) => {
    try {
      const result = await automationApi.regenerateCoverLetter(id, instructions)
      toast.success('Surat lamaran ditulis ulang.')
      return result.cover_letter || ''
    } catch (error) {
      toast.error(describeApiError(error, 'Gagal menulis ulang surat lamaran.'))
      return ''
    }
  }

  return {
    pending,
    history,
    loading,
    loadPending,
    loadHistory,
    approve,
    reject,
    regenerate,
  }
}

export function useRateLimits() {
  const [limits, setLimits] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const loadLimits = async () => {
    try {
      setLoading(true)
      const data = await automationApi.getRateLimitStatus()
      setLimits(data)
    } catch (error) {
      console.error('Failed to load rate limits')
    } finally {
      setLoading(false)
    }
  }

  return { limits, loading, loadLimits }
}

export function useLinkedInSession() {
  const [sessionStatus, setSessionStatus] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  // Last import/verify failure, kept so the page can show it (a toast alone disappears).
  const [sessionError, setSessionError] = useState<{ code?: string; message: string } | null>(null)

  const checkSession = async () => {
    try {
      setLoading(true)
      const data = await automationApi.getLinkedInSessionStatus()
      setSessionStatus(data)
      return data
    } catch (error) {
      console.error('Failed to check LinkedIn session')
      return null
    } finally {
      setLoading(false)
    }
  }

  const importSession = async (cookies: any, userAgent?: string) => {
    try {
      setLoading(true)
      setSessionError(null)
      const result = await automationApi.importLinkedInSession(cookies, userAgent)
      toast.success('Sesi LinkedIn berhasil diimpor.')
      await checkSession()
      return result
    } catch (error) {
      // 503 session_encryption_not_configured and 422 session_undecryptable are server-side problems:
      // say so instead of a generic failure, and keep the message on screen (see sessionError).
      const message = describeApiError(error, 'Gagal mengimpor sesi LinkedIn.')
      setSessionError({ code: parseApiError(error).code, message })
      toast.error(message)
      return null
    } finally {
      setLoading(false)
    }
  }

  const verifySession = async () => {
    try {
      setLoading(true)
      setSessionError(null)
      const result = await automationApi.verifyLinkedInSession()
      if (result.valid) toast.success('Sesi terverifikasi.')
      else toast.error('Sesi tidak valid. Impor ulang cookie LinkedIn.')
      return result.valid
    } catch (error) {
      const message = describeApiError(error, 'Gagal memverifikasi sesi.')
      setSessionError({ code: parseApiError(error).code, message })
      toast.error(message)
      return false
    } finally {
      setLoading(false)
    }
  }

  return {
    sessionError,
    sessionStatus,
    loading,
    checkSession,
    importSession,
    verifySession,
  }
}
