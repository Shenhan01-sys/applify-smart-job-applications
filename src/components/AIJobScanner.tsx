import { useState, useCallback, useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { AlertCircle, Brain, Check, Loader2, Sparkles, Radar, X } from 'lucide-react'
import { useJobSearch } from '@/hooks/useAutomation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { describeApiError } from '@/lib/apiErrors'
import { appendScanStage, settleScanStages, type ScanStage } from '@/lib/scanStages'
import {
  SEARCH_INPUT_HINT_PROFILE_LINK,
  SEARCH_INPUT_HINT_SETTINGS_LINK,
  SEARCH_INPUT_HINT_TEXT,
  SEARCH_INPUT_HINT_TITLE,
} from '@/lib/searchReadiness'
import { loadSearchInputMissing } from '@/services/searchReadinessService'

interface Platform {
  name: string
  icon: string
  id: string
}

// id harus sama dengan nama sumber di backend/services/mcp-registry.ts
const PLATFORMS: Platform[] = [
  { name: 'JobStreet', icon: '📋', id: 'jobstreet' },
  { name: 'Glints', icon: '✨', id: 'glints' },
  { name: 'Kalibrr', icon: '🇮🇩', id: 'kalibrr' },
  { name: 'Dealls', icon: '🤝', id: 'dealls' },
  { name: 'LinkedIn', icon: '💼', id: 'linkedin' },
  { name: 'Greenhouse', icon: '🌱', id: 'greenhouse' },
  { name: 'Lever', icon: '🔄', id: 'lever' },
  { name: 'Ashby', icon: '⚡', id: 'ashby' },
  { name: 'SmartRecruiters', icon: '🧩', id: 'smartrecruiters' },
  { name: 'Workable', icon: '🔧', id: 'workable' },
]

const PORTAL_IDS = new Set(['jobstreet', 'glints', 'kalibrr', 'dealls', 'linkedin'])
const PLATFORM_HINTS: Record<string, string> = {
  linkedin: 'Sering butuh login; lamar manual',
}

// Default: sumber yang bisa diakses tanpa login dan punya papan default di backend (config/job-boards.json).
// LinkedIn butuh sesi browser dan dilamar manual.
const DEFAULT_PLATFORMS = ['jobstreet', 'glints', 'kalibrr', 'dealls', 'greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters']


export function AIJobScanner({ onComplete }: { onComplete: () => void }) {
  const [isScanning, setIsScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(DEFAULT_PLATFORMS)
  const [keywordsInput, setKeywordsInput] = useState('')
  const [locationInput, setLocationInput] = useState('')
  const [stages, setStages] = useState<ScanStage[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const { results, loading, totalJobs, searchJobs } = useJobSearch()
  // Uji E2E klik 20 November 2026: selama sekitar 60 detik layar hanya menampilkan "Mencari lowongan...".
  // Backend mengembalikan hasil semua situs sekaligus, jadi kemajuan per situs tidak bisa diketahui di tengah jalan.
  // Yang ditampilkan adalah waktu yang sudah berjalan, bukan persentase tebakan.
  const [waitingSince, setWaitingSince] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  // Tanpa kata kunci tersimpan dan tanpa jabatan di profil, pencarian tidak punya bahan: petunjuk tampil sebelum mencari.
  // Bernilai true juga bila backend menjawab 400 keywords_required.
  const [inputMissing, setInputMissing] = useState(false)

  useEffect(() => {
    let alive = true
    loadSearchInputMissing().then((missing) => {
      if (alive) setInputMissing(missing)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (waitingSince === null) return
    setElapsed(0)
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - waitingSince) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [waitingSince])

  const addStage = useCallback((message: string, type: ScanStage['type'] = 'info') => {
    setStages((prev) => appendScanStage(prev, message, type))
  }, [])

  // Pencarian berakhir: baris kemajuan ("Menghubungi 9 situs...") dibuang, tersisa kalimat hasil dan galat per situs.
  const settleStage = useCallback((message: string, type: ScanStage['type']) => {
    setStages((prev) => settleScanStages(prev, message, type))
  }, [])

  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platformId) ? prev.filter((p) => p !== platformId) : [...prev, platformId]
    )
  }

  const cancelScan = () => {
    abortRef.current?.abort()
    abortRef.current = null
  }

  const startScan = async () => {
    if (selectedPlatforms.length === 0) {
      toast.error('Pilih minimal satu situs lowongan dulu.')
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsScanning(true)
    setProgress(0)
    setStages([])

    try {
      // Stage 1: Initialize
      addStage(`Menghubungi ${selectedPlatforms.length} situs lowongan...`, 'info')
      setProgress(20)

      // Stage 2: Search
      addStage('Mencari lowongan...', 'info')
      const kw = keywordsInput.trim()
      const loc = locationInput.trim()
      setWaitingSince(Date.now())
      let searched: Awaited<ReturnType<typeof searchJobs>>
      try {
        searched = await searchJobs(
          {
            platforms: selectedPlatforms,
            ...(kw ? { keywords: kw } : {}),
            ...(loc ? { location: loc } : {}),
          },
          { signal: controller.signal },
        )
      } finally {
        setWaitingSince(null)
      }
      if (searched.cancelled) {
        settleStage('Pencarian dibatalkan.', 'info')
        setProgress(0)
        return
      }
      const { groups: searchResults, total, stats, failed } = searched

      setProgress(60)

      // Ringkasan per sumber dari backend (jumlah lolos filter / error)
      const unresponsive = stats.filter((s) => s.errors.length > 0 && s.afterFilter === 0).map((s) => s.platform)
      if (unresponsive.length > 0) {
        addStage(`Situs yang tidak merespons: ${unresponsive.join(', ')}`, 'error')
      }

      if (failed) {
        // Penyebab sudah ditampilkan sebagai toast oleh useJobSearch; jangan menulis "tidak ada lowongan" untuk permintaan yang gagal.
        if (searched.code === 'keywords_required') setInputMissing(true)
        settleStage(searched.message ?? 'Pencarian gagal. Periksa koneksi lalu coba lagi.', 'error')
        setIsScanning(false)
        return
      }

      if (total === 0) {
        settleStage('Pencarian selesai, tetapi tidak ada lowongan yang cocok. Coba pilih lebih banyak situs lowongan.', 'error')
        setIsScanning(false)
        return
      }

      // Stage 3: tahap yang benar-benar dikerjakan backend (job-aggregation.service.ts)
      addStage(`Menyaring lokasi dan menghapus duplikat dari ${searchResults.length} sumber...`, 'analysis')
      addStage('Mengurutkan berdasarkan kecocokan dengan kata kunci dan skill di profilmu...', 'analysis')
      setProgress(100)
      settleStage(`Selesai. ${total} lowongan ditemukan dan diurutkan. Daftar di bawah sudah diperbarui.`, 'success')
      // Panel tidak ditutup otomatis: dulu tertutup satu detik sesudah selesai, sehingga hasilnya hampir tak terbaca.
      onComplete()
    } catch (error) {
      addStage('Terjadi kesalahan saat mencari lowongan.', 'error')
      toast.error(describeApiError(error, 'Pencarian lowongan gagal. Coba lagi.'))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setIsScanning(false)
    }
  }

  return (
    <div className="rounded-2xl border-2 border-[#999999] bg-white p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="h-5 w-5 text-[#0A5BE0]" aria-hidden="true" />
            <h2 className="text-lg font-bold">Pencarian Lowongan</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Cari lowongan dari JobStreet, Glints, Kalibrr, Dealls, dan papan karier perusahaan sekaligus. Hasil diurutkan menurut kecocokan dengan skill di Profil Saya, jadi isi skill dulu supaya urutannya tepat.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={startScan}
            disabled={isScanning || selectedPlatforms.length === 0}
            className="inline-flex items-center justify-center gap-2 min-h-11 px-6 rounded-xl bg-[#0A5BE0] text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isScanning || loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Radar className="h-4 w-4" aria-hidden="true" />
            )}
            {isScanning || loading ? 'Mencari lowongan...' : 'Cari Sekarang'}
          </Button>
          {isScanning && (
            <Button
              type="button"
              variant="outline"
              onClick={cancelScan}
              data-testid="cancel-scan-btn"
              className="inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-xl text-sm"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Batalkan
            </Button>
          )}
        </div>
      </div>

      {/* Input kata kunci & kota cepat (opsional, melengkapi Pengaturan Agen; 47.3 P3-01) */}
      <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="scanner-keywords" className="block text-xs font-medium text-muted-foreground mb-1">
            Kata kunci cepat (opsional)
          </label>
          <input
            id="scanner-keywords"
            type="text"
            value={keywordsInput}
            onChange={(e) => setKeywordsInput(e.target.value)}
            maxLength={120}
            disabled={isScanning}
            placeholder="Mis. Frontend Developer, Data Analyst"
            className="w-full min-h-11 rounded-xl border border-black/15 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]"
          />
        </div>
        <div>
          <label htmlFor="scanner-location" className="block text-xs font-medium text-muted-foreground mb-1">
            Kota atau lokasi (opsional)
          </label>
          <input
            id="scanner-location"
            type="text"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            maxLength={80}
            disabled={isScanning}
            placeholder="Mis. Jakarta, Bandung, Remote"
            className="w-full min-h-11 rounded-xl border border-black/15 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]"
          />
        </div>
      </div>

      {inputMissing && (
        <div role="status" data-testid="search-input-hint" className="mb-6 flex items-start gap-2.5 rounded-xl border-2 border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{SEARCH_INPUT_HINT_TITLE}</p>
            <p className="mt-0.5">
              {SEARCH_INPUT_HINT_TEXT}{' '}
              <Link to="/automation-settings" className="font-semibold underline">{SEARCH_INPUT_HINT_SETTINGS_LINK}</Link>
              {' '}atau{' '}
              <Link to="/profile" className="font-semibold underline">{SEARCH_INPUT_HINT_PROFILE_LINK}</Link>
              , lalu cari lagi.
            </p>
          </div>
        </div>
      )}

      {/* Platform Selection */}
      <div className="mb-6">
        <p id="label-situs" className="text-sm font-medium mb-3">Pilih situs lowongan:</p>
        <div role="group" aria-labelledby="label-situs" className="space-y-3">
          {([
            { key: 'portal', title: 'Portal Karir' },
            { key: 'ats', title: 'Situs Karir Perusahaan (ATS)' },
          ] as const).map((group) => (
            <div key={group.key}>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">{group.title}</p>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.filter((p) => (group.key === 'portal' ? PORTAL_IDS.has(p.id) : !PORTAL_IDS.has(p.id))).map((platform) => {
                  const hint = PLATFORM_HINTS[platform.id]
                  return (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => togglePlatform(platform.id)}
                      disabled={isScanning}
                      aria-pressed={selectedPlatforms.includes(platform.id)}
                      title={hint}
                      className={`inline-flex min-h-11 items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                        selectedPlatforms.includes(platform.id)
                          ? 'bg-[#0A5BE0] text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      } disabled:opacity-50`}
                    >
                      <span aria-hidden="true">{platform.icon}</span>
                      <span>{platform.name}</span>
                      {hint && <span className="text-xs opacity-75">({hint})</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Log tahap tetap tampil sesudah selesai, supaya pesan "tidak ada lowongan" atau galat tidak hilang. */}
      {(isScanning || loading || stages.length > 0) && (
        <div className="space-y-4">
          {/* Progress bar */}
          <div
            role="progressbar"
            aria-label="Kemajuan pencarian"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-2 bg-[#EFEFEF] rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-[#0A5BE0] rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {waitingSince !== null && (
            <p className="text-sm text-muted-foreground" data-testid="scan-elapsed">
              Sudah berjalan {elapsed} detik. {selectedPlatforms.length} situs dicari bersamaan, dan jumlah lowongan per
              situs tampil sesudah semua situs menjawab. Situs yang lambat bisa membuat pencarian lebih dari satu menit.
            </p>
          )}

          {/* Platform scanning status */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {PLATFORMS.map((platform) => {
              const isSelected = selectedPlatforms.includes(platform.id)
              const platformResult = results.find((r) => r.platform === platform.id)
              
              return (
                <div
                  key={platform.name}
                  className={`rounded-xl border p-3 text-center transition-all ${
                    !isSelected
                      ? 'border-gray-200 opacity-50'
                      : isScanning && !platformResult
                      ? 'border-[#0A5BE0] bg-[#0A5BE0]/5'
                      : platformResult
                      ? 'border-[#D2F801] bg-[#D2F801]/10'
                      : 'border-[#E0E0E0]'
                  }`}
                >
                  <div className="text-2xl mb-1" aria-hidden="true">{platform.icon}</div>
                  <div className="text-xs font-medium truncate">{platform.name}</div>
                  {platformResult && (
                    <div className="text-xs text-[#0A5BE0] font-bold mt-1">
                      +{platformResult.jobs.length}
                    </div>
                  )}
                  {isScanning && !platformResult && isSelected && (
                    <Loader2 className="h-3 w-3 animate-spin mx-auto mt-1 text-[#0A5BE0]" aria-label="Sedang dicari" />
                  )}
                </div>
              )
            })}
          </div>

          {/* Scan stages log */}
          <div role="status" aria-live="polite" className="rounded-xl bg-[#F5F5F5] p-4 min-h-36 max-h-64 overflow-y-auto">
            <div className="space-y-2">
              {stages.map((stage, i) => (
                <div
                  key={i}
                  className={`text-sm animate-fade-in ${
                    stage.type === 'success'
                      ? 'text-green-600'
                      : stage.type === 'analysis'
                      ? 'text-[#0A5BE0]'
                      : stage.type === 'error'
                      ? 'text-red-600'
                      : 'text-[#666666]'
                  }`}
                >
                  {stage.message}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {totalJobs > 0 && !isScanning && !loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-[#0A5BE0] font-semibold">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          <span>{totalJobs} lowongan ditemukan.</span>
        </div>
      )}
    </div>
  )
}
