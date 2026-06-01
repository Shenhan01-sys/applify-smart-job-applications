import { useState, useEffect, useCallback } from 'react'
import { automationApi } from '@/services/automationApi'
import { toast } from 'sonner'

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
      toast.error('Failed to load automation settings')
    } finally {
      setLoading(false)
    }
  }

  const updateSettings = async (newSettings: Partial<AutomationSettings>) => {
    try {
      setSaving(true)
      const updated = await automationApi.updateSettings({ ...settings, ...newSettings })
      setSettings(updated || { ...settings, ...newSettings })
      toast.success('Settings saved successfully')
      return true
    } catch (error) {
      toast.error('Failed to save settings')
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

export function useJobSearch() {
  const [results, setResults] = useState<Array<{ platform: string; jobs: any[] }>>([])
  const [loading, setLoading] = useState(false)
  const [totalJobs, setTotalJobs] = useState(0)

  const searchJobs = async (params: {
    keywords?: string
    location?: string
    platforms?: string[]
  }) => {
    try {
      setLoading(true)
      const data = await automationApi.searchJobs(params)
      const grouped = [{ platform: 'all', jobs: (data.jobs as any[]) || [] }]
      setResults(grouped)
      setTotalJobs(data.total || 0)
      return grouped
    } catch (error) {
      toast.error('Failed to search jobs')
      return []
    } finally {
      setLoading(false)
    }
  }

  return { results, loading, totalJobs, searchJobs }
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
      toast.error('Failed to generate cover letter')
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
      toast.error('Failed to analyze job match')
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
      toast.error('Failed to extract skills')
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
      toast.success('Application approved!')
      await loadPending()
      return true
    } catch (error) {
      toast.error('Failed to approve application')
      return false
    }
  }

  const reject = async (id: string, reason?: string) => {
    try {
      await automationApi.rejectApplication(id, reason)
      toast.success('Application rejected')
      await loadPending()
      return true
    } catch (error) {
      toast.error('Failed to reject application')
      return false
    }
  }

  const regenerate = async (id: string, instructions: string) => {
    try {
      const result = await automationApi.regenerateCoverLetter(id, instructions)
      toast.success('Cover letter regenerated!')
      return result.cover_letter || ''
    } catch (error) {
      toast.error('Failed to regenerate cover letter')
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
      const result = await automationApi.importLinkedInSession(cookies, userAgent)
      toast.success('LinkedIn session imported successfully!')
      await checkSession()
      return result
    } catch (error) {
      toast.error('Failed to import LinkedIn session')
      return null
    } finally {
      setLoading(false)
    }
  }

  const verifySession = async () => {
    try {
      setLoading(true)
      const result = await automationApi.verifyLinkedInSession()
      toast.success(result.valid ? 'Session verified!' : 'Session invalid')
      return result.valid
    } catch (error) {
      toast.error('Failed to verify session')
      return false
    } finally {
      setLoading(false)
    }
  }

  return {
    sessionStatus,
    loading,
    checkSession,
    importSession,
    verifySession,
  }
}
