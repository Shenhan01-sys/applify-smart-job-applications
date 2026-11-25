import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { automationApi } from '@/services/automationApi'
import { describeApiError } from '@/lib/apiErrors'
import { EXTENSION_CONSENT_REQUIRED_TOAST, consentRequiredFrom } from '@/lib/extensionConsent'
import { HitlTrack } from '@/components/HitlTrack'
import { platformLabel } from '@/lib/platforms'
import { PERSONAL_DATA_LINK_LABEL, personalDataHint } from '@/lib/personalData'
import {
  LEVEL_LABEL,
  SOURCE_LABEL,
  confidenceLevel,
  countNeedingAttention,
  needsAttention,
  normalizeAnswers,
  rejectReasonHint,
} from '@/lib/answerReview'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ShieldCheck, XCircle, Clock, AlertTriangle, Loader2, Edit3, Eye, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

interface ApprovalRequest {
  id: string
  job_title: string
  company: string
  platform: string
  cover_letter?: string
  /** jsonb from approval_requests.answers; cleaned by normalizeAnswers() before use */
  answers?: unknown
  resume_url?: string
  status: string
  expires_at: string
  created_at: string
}

interface ApprovalReviewModalProps {
  request: ApprovalRequest
  open: boolean
  onClose: () => void
  /** `consentRequired`: lamaran belum diantre; pengguna harus mengizinkan Ekstensi Browser di kartu Riwayat. */
  onApproved: (result?: { consentRequired: boolean }) => void
  onRejected: () => void
}

export default function ApprovalReviewModal({
  request,
  open,
  onClose,
  onApproved,
  onRejected,
}: ApprovalReviewModalProps) {
  const [loading, setLoading] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const rejectReasonRef = useRef<HTMLTextAreaElement>(null)
  const [editedCoverLetter, setEditedCoverLetter] = useState(request.cover_letter || '')
  const [isEditing, setIsEditing] = useState(false)
  // Peringatan dari penjaga mutu backend setelah "Tulis ulang": angka yang tidak ada di surat asli.
  const [regenWarnings, setRegenWarnings] = useState<string[]>([])

  const timeRemaining = new Date(request.expires_at).getTime() - Date.now()
  const isExpiringSoon = timeRemaining < 15 * 60 * 1000 // 15 minutes
  const minutesLeft = Math.max(0, Math.round(timeRemaining / 60000))
  const timeLeft = minutesLeft >= 120
    ? { value: Math.round(minutesLeft / 60), unit: 'jam' }
    : { value: minutesLeft, unit: 'menit' }
  const edited = editedCoverLetter !== (request.cover_letter || '')
  const answers = normalizeAnswers(request.answers)
  const needAttention = countNeedingAttention(answers)
  // Jawaban kosong untuk isian Data Pribadi (telepon, negara, kota, ...): tab itu di Pengaturan Agen belum diisi.
  const personalHint = personalDataHint(answers.filter((a) => a.answer.trim() === '').map((a) => a.question))
  const rejectHint = rejectReasonHint(showRejectForm, rejectReason)

  // Kolom alasan ada di dasar isi yang panjang: setelah "Tolak", gulir ke sana dan beri fokus supaya terlihat dan bisa langsung diketik.
  useEffect(() => {
    if (!showRejectForm) return
    const field = rejectReasonRef.current
    if (!field) return
    field.scrollIntoView({ block: 'center' })
    field.focus({ preventScroll: true })
  }, [showRejectForm])

  const handleApprove = async () => {
    setLoading(true)
    try {
      // The version on screen (including edits) is the one being approved.
      const result = await automationApi.approveApplication(request.id, edited ? editedCoverLetter : undefined)
      // Situs yang perlu login: lamaran belum diantre sampai pengguna mengizinkan ekstensi (kartu Riwayat).
      const consentRequired = consentRequiredFrom(result)
      toast.success(consentRequired ? EXTENSION_CONSENT_REQUIRED_TOAST : 'Disetujui — lamaran masuk antrean agen.')
      onApproved({ consentRequired })
    } catch (error: any) {
      toast.error(describeApiError(error, 'Gagal menyetujui'))
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    setLoading(true)
    try {
      await automationApi.rejectApplication(request.id, rejectReason)
      toast.success('Ditolak. Alasanmu tersimpan di riwayat persetujuan.')
      onRejected()
    } catch (error: any) {
      toast.error(describeApiError(error, 'Gagal menolak'))
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerate = async () => {
    setLoading(true)
    try {
      const result: any = await automationApi.regenerateCoverLetter(
        request.id,
        'Make it more concise and highlight relevant experience'
      )
      if (result?.cover_letter) {
        setEditedCoverLetter(result.cover_letter)
        setRegenWarnings(
          Array.isArray(result.warnings)
            ? result.warnings.map((w: any) => String(w?.message ?? '')).filter(Boolean)
            : []
        )
        toast.success('Surat lamaran ditulis ulang.')
      } else {
        // The backend answered without a new letter: keep the current text, never pretend it was rewritten.
        toast.info('AI tidak mengembalikan surat baru. Edit langsung lalu setujui.')
        setIsEditing(true)
      }
    } catch (error: any) {
      toast.error(describeApiError(error, 'Gagal menulis ulang'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-4 rounded-2xl border-2 border-[#16150F]/15 bg-white p-0">
        <DialogHeader className="px-6 pt-6">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="font-display text-2xl text-[#16150F]">Gerbang Persetujuan</DialogTitle>
            <span
              className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 px-2.5 py-1 text-xs font-semibold ${
                isExpiringSoon
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : 'border-[#16150F]/15 bg-[#F4F1E8] text-[#16150F]'
              }`}
            >
              <Clock className="h-3 w-3" />
              <span className="font-mono">{timeLeft.value}</span> {timeLeft.unit} lagi
            </span>
          </div>
          <DialogDescription className="text-sm text-[#16150F]/70">
            Tidak ada yang terkirim sebelum kamu menyetujui. Edit dulu bila perlu — versi di layar inilah yang disetujui.
          </DialogDescription>
          <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="real-submit-warning">
            Setujui berarti lamaran ini benar-benar dikirim ke perusahaan atas namamu dan tidak bisa ditarik. Tekan Tolak bila
            kamu tidak ingin melamar.
          </p>
        </DialogHeader>

        {/* Radix renders the viewport child as display:table, which lets content overflow sideways */}
        {/* Div biasa, bukan ScrollArea Radix: DialogContent hanya punya max-h, sehingga h-full pada viewport Radix
            tidak pernah terselesaikan dan isi di bawah surat (jawaban formulir dan keyakinannya) tidak bisa digulir.
            Ditemukan saat uji klik produksi 19 November 2026. */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6" data-testid="approval-review-scroll">
          <HitlTrack
            stage="gate"
            caption="Setujui untuk memasukkan lamaran ke antrean agen, atau tolak bila tidak sesuai."
            className="mb-4"
          />

          {/* Job */}
          <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border-2 border-[#16150F]/10 bg-[#F4F1E8] p-4">
            <div className="min-w-0">
              <h3 className="font-display text-lg font-bold text-[#16150F] truncate">{request.job_title}</h3>
              <p className="text-sm text-[#16150F]/70">{request.company}</p>
            </div>
            <span className="shrink-0 rounded-full border-2 border-[#16150F]/15 bg-white px-2.5 py-1 text-xs font-semibold text-[#16150F]">
              {platformLabel(request.platform)}
            </span>
          </div>

          {/* Cover letter */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-[#16150F]">
                Cover Letter
                {edited && (
                  <span className="rounded-full bg-[#D2F801] px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[#16150F]">
                    diedit
                  </span>
                )}
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="flex h-8 items-center gap-1 rounded-lg border-2 border-[#16150F]/15 px-3 text-xs font-semibold text-[#16150F] transition hover:border-[#0A5BE0]"
                >
                  {isEditing ? <Eye className="h-3 w-3" /> : <Edit3 className="h-3 w-3" />}
                  {isEditing ? 'Pratinjau' : 'Edit'}
                </button>
                <button
                  onClick={handleRegenerate}
                  disabled={loading}
                  className="flex h-8 items-center gap-1 rounded-lg bg-[#0A5BE0]/10 px-3 text-xs font-semibold text-[#0A5BE0] transition hover:bg-[#0A5BE0]/20 disabled:opacity-60"
                >
                  <Sparkles className="h-3 w-3" />
                  Tulis ulang
                </button>
              </div>
            </div>
            {isEditing ? (
              <textarea
                value={editedCoverLetter}
                onChange={(e) => setEditedCoverLetter(e.target.value)}
                rows={10}
                className="w-full resize-none rounded-xl border-2 border-[#16150F]/15 p-4 text-sm leading-relaxed focus:border-[#0A5BE0] focus:outline-none"
              />
            ) : (
              <div className="whitespace-pre-wrap rounded-xl border-2 border-[#16150F]/10 bg-white p-4 text-sm leading-relaxed">
                {editedCoverLetter || 'Belum ada cover letter.'}
              </div>
            )}
            {regenWarnings.length > 0 && (
              <div role="alert" className="mt-2 rounded-xl border-2 border-[#D9741A]/40 bg-[#D9741A]/10 p-3 text-xs text-[#16150F]">
                <p className="mb-1 flex items-center gap-1 font-semibold text-[#D9741A]">
                  <AlertTriangle className="h-3 w-3" />
                  Periksa dulu sebelum menyetujui
                </p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {regenWarnings.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Form answers prepared by the agent, with how sure it is about each one */}
          {answers.length > 0 && (
            <div className="mb-4">
              <h4 className="mb-1 text-sm font-semibold text-[#16150F]">Jawaban formulir</h4>
              <p className="mb-2 text-xs text-[#16150F]/60">
                Jawaban standar yang disiapkan agen dari Profil dan Pengaturan Agen-mu.{' '}
                {needAttention > 0 ? (
                  <span className="font-semibold text-[#D9741A]">
                    {needAttention} dari {answers.length} perlu dicek sebelum kamu menyetujui.
                  </span>
                ) : (
                  <span>Semua berkeyakinan tinggi.</span>
                )}{' '}
                Isian pada formulir lowongan yang sebenarnya dibaca agen setelah persetujuan.
              </p>
              {personalHint && (
                <div
                  data-testid="approval-personal-data-hint"
                  className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-2 border-[#D9741A]/40 bg-[#D9741A]/10 p-3 text-xs text-[#16150F]"
                >
                  <span className="min-w-0 flex-1 basis-56">{personalHint}</span>
                  <Link
                    to="/automation-settings"
                    onClick={onClose}
                    className="inline-flex min-h-11 shrink-0 items-center rounded-lg border-2 border-[#16150F]/15 bg-white px-3 font-semibold text-[#0A5BE0] hover:border-[#0A5BE0]"
                  >
                    {PERSONAL_DATA_LINK_LABEL}
                  </Link>
                </div>
              )}
              <div className="space-y-2">
                {answers.map((answer, index) => {
                  const level = confidenceLevel(answer.confidence)
                  const attention = needsAttention(answer)
                  return (
                    <div
                      key={index}
                      data-confidence={level}
                      className={`rounded-xl border-2 p-3 ${
                        attention ? 'border-[#D9741A]/50 bg-[#D9741A]/5' : 'border-[#16150F]/10'
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="min-w-0 break-words text-sm font-medium">{answer.question}</span>
                        {attention && (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#D9741A]">
                            <AlertTriangle className="h-3 w-3" />
                            Perlu dicek
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[#16150F]/80">
                        {answer.answer.trim() ? answer.answer : <em className="text-[#16150F]/50">(kosong: isi dulu di Profil atau Pengaturan Agen)</em>}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[#16150F]/50">
                        <span>
                          Keyakinan: <span className="font-mono">{Math.round(answer.confidence * 100)}%</span> ({LEVEL_LABEL[level]})
                        </span>
                        {answer.source && <span>{SOURCE_LABEL[answer.source]}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {request.resume_url && (
            <a
              href={request.resume_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-4 inline-block text-sm font-semibold text-[#0A5BE0] hover:underline"
            >
              Lihat CV terlampir
            </a>
          )}

          {showRejectForm && (
            <div className="mb-4 rounded-xl border-2 border-red-200 bg-red-50 p-4">
              <h4 id="reject-reason-label" className="mb-1 text-sm font-semibold text-red-800">
                Kenapa ditolak? <span className="text-xs font-normal">(wajib diisi)</span>
              </h4>
              <p className="mb-2 text-xs text-red-700">
                Alasanmu disimpan di riwayat persetujuan. Belum dipakai untuk mengubah hasil AI secara otomatis.
              </p>
              <textarea
                ref={rejectReasonRef}
                aria-labelledby="reject-reason-label"
                aria-required="true"
                aria-describedby={rejectHint ? 'reject-reason-hint' : undefined}
                placeholder="mis. tidak cocok, gaji terlalu rendah, butuh skill yang belum kupunya..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full resize-none rounded-lg border-2 border-red-200 bg-white p-3 text-sm focus:outline-none focus:border-red-400"
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t-2 border-[#16150F]/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[#16150F]/60">
              Berlaku sampai {new Date(request.expires_at).toLocaleString('id-ID')}
            </span>
            {rejectHint && (
              <span id="reject-reason-hint" role="status" className="text-xs font-semibold text-red-700">
                {rejectHint}
              </span>
            )}
          </div>
          <div className="flex gap-3 [&>button]:flex-1 sm:[&>button]:flex-none">
            {!showRejectForm ? (
              <>
                <button
                  onClick={() => setShowRejectForm(true)}
                  disabled={loading}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-red-200 px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                >
                  <XCircle className="h-4 w-4" />
                  Tolak
                </button>
                <button
                  onClick={handleApprove}
                  disabled={loading}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#16150F] px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4 text-[#D2F801]" />}
                  <span className="sm:hidden">Setujui</span>
                  <span className="hidden sm:inline">Setujui &amp; Masukkan Antrean</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowRejectForm(false)}
                  disabled={loading}
                  className="h-11 rounded-xl border-2 border-[#16150F]/15 px-4 text-sm font-semibold text-[#16150F] disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  onClick={handleReject}
                  disabled={loading || !rejectReason.trim()}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Konfirmasi Tolak
                </button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
