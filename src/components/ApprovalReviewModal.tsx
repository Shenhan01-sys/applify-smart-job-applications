import { useState } from 'react'
import { automationApi } from '@/services/automationApi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { CheckCircle, XCircle, Clock, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface ApprovalRequest {
  id: string
  job_title: string
  company: string
  platform: string
  cover_letter?: string
  answers?: Array<{
    question: string
    answer: string
    confidence: number
    needs_review: boolean
  }>
  resume_url?: string
  status: string
  expires_at: string
  created_at: string
}

interface ApprovalReviewModalProps {
  request: ApprovalRequest
  open: boolean
  onClose: () => void
  onApproved: () => void
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
  const [editedCoverLetter, setEditedCoverLetter] = useState(request.cover_letter || '')
  const [isEditing, setIsEditing] = useState(false)

  const timeRemaining = new Date(request.expires_at).getTime() - Date.now()
  const isExpiringSoon = timeRemaining < 15 * 60 * 1000 // 15 minutes

  const handleApprove = async () => {
    setLoading(true)
    try {
      await automationApi.approveApplication(request.id)
      toast.success('Application approved! Will be submitted automatically.')
      onApproved()
    } catch (error: any) {
      toast.error(`Failed to approve: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    setLoading(true)
    try {
      await automationApi.rejectApplication(request.id, rejectReason)
      toast.success('Application rejected. Feedback saved for future improvements.')
      onRejected()
    } catch (error: any) {
      toast.error(`Failed to reject: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerate = async () => {
    setLoading(true)
    try {
      const result = await automationApi.regenerateCoverLetter(
        request.id,
        'Make it more concise and highlight relevant experience'
      )
      toast.info(result.message)
    } catch (error: any) {
      toast.error(`Failed to regenerate: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">Review Application</DialogTitle>
            <Badge
              variant={isExpiringSoon ? 'destructive' : 'outline'}
              className="flex items-center gap-1"
            >
              <Clock className="h-3 w-3" />
              {isExpiringSoon ? 'Expiring soon' : 'Pending approval'}
            </Badge>
          </div>
          <DialogDescription>
            Review and edit before AI submits this application
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          {/* Job Info */}
          <div className="bg-slate-50 p-4 rounded-lg mb-4">
            <h3 className="font-semibold text-lg">{request.job_title}</h3>
            <p className="text-gray-600">{request.company}</p>
            <Badge variant="secondary" className="mt-2">{request.platform}</Badge>
          </div>

          {/* Cover Letter */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium">Cover Letter</h4>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                >
                  {isEditing ? 'Preview' : 'Edit'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={loading}
                >
                  Regenerate
                </Button>
              </div>
            </div>
            {isEditing ? (
              <Textarea
                value={editedCoverLetter}
                onChange={(e) => setEditedCoverLetter(e.target.value)}
                rows={8}
                className="w-full"
              />
            ) : (
              <div className="bg-white border rounded-md p-4 whitespace-pre-wrap text-sm">
                {editedCoverLetter || 'No cover letter generated.'}
              </div>
            )}
          </div>

          {/* Application Answers */}
          {request.answers && request.answers.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium mb-2">Application Answers</h4>
              <div className="space-y-3">
                {request.answers.map((answer, index) => (
                  <div
                    key={index}
                    className={`border rounded-md p-3 ${
                      answer.needs_review ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{answer.question}</span>
                      {answer.needs_review && (
                        <Badge variant="warning" className="text-xs">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Needs review
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-700">{answer.answer}</p>
                    <div className="mt-1 text-xs text-gray-500">
                      Confidence: {Math.round(answer.confidence * 100)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resume */}
          {request.resume_url && (
            <div className="mb-4">
              <h4 className="font-medium mb-2">Resume</h4>
              <a
                href={request.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                View attached resume
              </a>
            </div>
          )}

          {/* Reject Form */}
          {showRejectForm && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="font-medium text-red-800 mb-2">Why are you rejecting this?</h4>
              <p className="text-sm text-red-600 mb-2">
                Your feedback helps AI learn and improve future applications.
              </p>
              <Textarea
                placeholder="e.g., Not a good fit, salary too low, requires skills I don't have..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                className="w-full bg-white"
              />
            </div>
          )}
        </ScrollArea>

        <Separator className="my-4" />

        <DialogFooter className="flex justify-between items-center">
          <div className="text-sm text-gray-500">
            Expires at: {new Date(request.expires_at).toLocaleString()}
          </div>
          <div className="flex gap-3">
            {!showRejectForm ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowRejectForm(true)}
                  disabled={loading}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Approve & Submit
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowRejectForm(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={loading || !rejectReason.trim()}
                  variant="destructive"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  Confirm Reject
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
