import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { automationApi } from '@/services/automationApi'
import ApprovalReviewModal from '@/components/ApprovalReviewModal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/approvals')({
  component: ApprovalsPage,
})

interface ApprovalRequest {
  id: string
  job_title: string
  company: string
  platform: string
  status: string
  expires_at: string
  created_at: string
  reviewed_at?: string
  rejection_reason?: string
}

function ApprovalsPage() {
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([])
  const [history, setHistory] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [pending, hist] = await Promise.all([
        automationApi.getPendingApprovals(),
        automationApi.getApprovalHistory({ limit: 50 }),
      ])
      setPendingApprovals(pending)
      setHistory(hist)
    } catch (error) {
      toast.error('Failed to load approvals')
    } finally {
      setLoading(false)
    }
  }

  const handleReview = (request: ApprovalRequest) => {
    setSelectedRequest(request)
    setModalOpen(true)
  }

  const handleApproved = () => {
    setModalOpen(false)
    setSelectedRequest(null)
    loadData()
    toast.success('Application approved successfully!')
  }

  const handleRejected = () => {
    setModalOpen(false)
    setSelectedRequest(null)
    loadData()
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'expired':
        return <AlertCircle className="h-4 w-4 text-gray-400" />
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      approved: 'bg-green-100 text-green-800 border-green-200',
      rejected: 'bg-red-100 text-red-800 border-red-200',
      expired: 'bg-gray-100 text-gray-800 border-gray-200',
    }
    return (
      <Badge variant="outline" className={variants[status] || variants.pending}>
        {getStatusIcon(status)}
        <span className="ml-1 capitalize">{status}</span>
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0367FC]" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#161616]">Application Approvals</h1>
        <p className="text-gray-600 mt-2">
          Review and approve AI-generated job applications before submission
        </p>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8">
          <TabsTrigger value="pending">
            Pending ({pendingApprovals.length})
          </TabsTrigger>
          <TabsTrigger value="history">
            History ({history.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {pendingApprovals.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-green-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900">All caught up!</h3>
                <p className="text-gray-500 mt-2 text-center max-w-md">
                  No pending approvals. AI will notify you when new applications are ready for review.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingApprovals.map((request) => (
                <Card key={request.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{request.job_title}</CardTitle>
                        <CardDescription>{request.company}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(request.status)}
                        <Badge variant="outline">{request.platform}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        <p>Expires: {new Date(request.expires_at).toLocaleString()}</p>
                        <p>Created: {new Date(request.created_at).toLocaleString()}</p>
                      </div>
                      <Button
                        onClick={() => handleReview(request)}
                        className="bg-[#0367FC] hover:bg-[#0256d3]"
                      >
                        Review Application
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          {history.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clock className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900">No history yet</h3>
                <p className="text-gray-500 mt-2">
                  Approved or rejected applications will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-3">
                {history.map((request) => (
                  <Card key={request.id} className="border-l-4 border-l-gray-300">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{request.job_title}</h4>
                          <p className="text-sm text-gray-600">{request.company}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(request.status)}
                          <span className="text-xs text-gray-400">
                            {request.reviewed_at
                              ? new Date(request.reviewed_at).toLocaleDateString()
                              : new Date(request.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      {request.rejection_reason && (
                        <p className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                          Reason: {request.rejection_reason}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>

      {selectedRequest && (
        <ApprovalReviewModal
          request={selectedRequest as any}
          open={modalOpen}
          onClose={() => {
            setModalOpen(false)
            setSelectedRequest(null)
          }}
          onApproved={handleApproved}
          onRejected={handleRejected}
        />
      )}
    </div>
  )
}
