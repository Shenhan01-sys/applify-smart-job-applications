import { useState, useCallback } from 'react'
import { Brain, Search, Check, Loader2, Sparkles, Radar, Globe } from 'lucide-react'
import { useJobSearch } from '@/hooks/useAutomation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { describeApiError } from '@/lib/apiErrors'

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
  { name: 'Greenhouse', icon: '🌱', id: 'greenhouse' },
  { name: 'Lever', icon: '🔄', id: 'lever' },
  { name: 'Ashby', icon: '⚡', id: 'ashby' },
  { name: 'SmartRecruiters', icon: '🧩', id: 'smartrecruiters' },
  { name: 'Workable', icon: '🔧', id: 'workable' },
  { name: 'LinkedIn', icon: '💼', id: 'linkedin' },
]

// Default: sumber yang bisa diakses tanpa login dan punya papan default di backend.
// LinkedIn butuh sesi browser; Workable belum punya papan default (config/job-boards.json).
const DEFAULT_PLATFORMS = ['jobstreet', 'glints', 'kalibrr', 'greenhouse', 'lever', 'ashby', 'smartrecruiters']

interface ScanStage {
  message: string
  type: 'info' | 'success' | 'analysis' | 'error'
}

export function AIJobScanner({ onComplete }: { onComplete: () => void }) {
  const [isScanning, setIsScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(DEFAULT_PLATFORMS)
  const [stages, setStages] = useState<ScanStage[]>([])
  const { results, loading, totalJobs, searchJobs } = useJobSearch()

  const addStage = useCallback((message: string, type: ScanStage['type'] = 'info') => {
    setStages((prev) => [...prev.slice(-4), { message, type }])
  }, [])

  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platformId) ? prev.filter((p) => p !== platformId) : [...prev, platformId]
    )
  }

  const startScan = async () => {
    if (selectedPlatforms.length === 0) {
      toast.error('Pilih minimal satu situs lowongan dulu.')
      return
    }

    setIsScanning(true)
    setProgress(0)
    setStages([])

    try {
      // Stage 1: Initialize
      addStage('Memulai pencarian...', 'info')
      setProgress(10)
      await sleep(500)

      addStage(`Menghubungi ${selectedPlatforms.length} situs lowongan...`, 'info')
      setProgress(20)
      await sleep(500)

      // Stage 2: Search
      addStage('Mencari lowongan...', 'info')
      const { groups: searchResults, total, stats, failed } = await searchJobs({
        platforms: selectedPlatforms,
      })

      setProgress(60)

      // Ringkasan per sumber dari backend (jumlah lolos filter / error)
      const unresponsive = stats.filter((s) => s.errors.length > 0 && s.afterFilter === 0).map((s) => s.platform)
      if (unresponsive.length > 0) {
        addStage(`Situs yang tidak merespons: ${unresponsive.join(', ')}`, 'error')
      }

      if (failed) {
        // Penyebab sudah ditampilkan sebagai toast oleh useJobSearch; jangan menulis "tidak ada lowongan" untuk permintaan yang gagal.
        addStage('Pencarian gagal. Periksa koneksi lalu coba lagi.', 'error')
        setIsScanning(false)
        return
      }

      if (total === 0) {
        addStage('Pencarian selesai, tetapi tidak ada lowongan yang cocok. Coba pilih lebih banyak situs lowongan.', 'error')
        setIsScanning(false)
        return
      }

      // Stage 3: tahap yang benar-benar dikerjakan backend (job-aggregation.service.ts)
      addStage(`Menyaring lokasi dan menghapus duplikat dari ${searchResults.length} sumber...`, 'analysis')
      setProgress(80)
      await sleep(600)

      addStage('Mengurutkan berdasarkan kecocokan dengan kata kunci dan skill di profilmu...', 'analysis')
      setProgress(95)
      await sleep(600)

      setProgress(100)
      addStage(`Selesai. ${total} lowongan ditemukan dan diurutkan.`, 'success')
      await sleep(1000)

      onComplete()
    } catch (error) {
      addStage('Terjadi kesalahan saat mencari lowongan.', 'error')
      toast.error(describeApiError(error, 'Pencarian lowongan gagal. Coba lagi.'))
    } finally {
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
            Cari lowongan dari JobStreet, Glints, Kalibrr, dan papan karier perusahaan sekaligus. Hasil diurutkan menurut kecocokan dengan skill di Profil Saya, jadi isi skill dulu supaya urutannya tepat.
          </p>
        </div>
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
      </div>

      {/* Platform Selection */}
      <div className="mb-6">
        <p id="label-situs" className="text-sm font-medium mb-3">Pilih situs lowongan:</p>
        <div role="group" aria-labelledby="label-situs" className="flex flex-wrap gap-2">
          {PLATFORMS.map((platform) => (
            <button
              key={platform.id}
              type="button"
              onClick={() => togglePlatform(platform.id)}
              disabled={isScanning}
              aria-pressed={selectedPlatforms.includes(platform.id)}
              className={`inline-flex min-h-11 items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
                selectedPlatforms.includes(platform.id)
                  ? 'bg-[#0A5BE0] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              } disabled:opacity-50`}
            >
              <span aria-hidden="true">{platform.icon}</span>
              <span>{platform.name}</span>
            </button>
          ))}
        </div>
      </div>

      {(isScanning || loading) && (
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
          <div role="status" aria-live="polite" className="rounded-xl bg-[#F5F5F5] p-4 h-40 overflow-hidden">
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
