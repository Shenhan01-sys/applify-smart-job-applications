import { useEffect } from 'react'
import { useApprovalQueue, useRateLimits } from '@/hooks/useAutomation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Bot,
  Clock,
  CheckCircle,
  AlertCircle,
  Zap,
  ShieldCheck,
  TrendingUp,
  Loader2,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'

export function AutomationStatusCard() {
  const { pending, loading: approvalsLoading, loadPending } = useApprovalQueue()
  const { limits, loading: limitsLoading, loadLimits } = useRateLimits()

  useEffect(() => {
    loadPending()
    loadLimits()
  }, [])

  const quota = limits?.quota || {}
  const dailyLimit = quota.daily_limit || 10
  const dailyUsed = quota.daily_used || 0
  const dailyRemaining = quota.daily_remaining || dailyLimit

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-[#0367FC]" />
            <CardTitle className="text-base">Automation Status</CardTitle>
          </div>
          <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
            Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pending Approvals */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-yellow-600" />
            <span className="text-sm">Pending Approvals</span>
          </div>
          <Link to="/approvals">
            <Badge variant={pending.length > 0 ? 'default' : 'secondary'}>
              {approvalsLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                pending.length
              )}
            </Badge>
          </Link>
        </div>

        {/* Daily Quota */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-500" />
              Daily Applications
            </span>
            <span className="font-medium">
              {limitsLoading ? (
                <Loader2 className="h-3 w-3 animate-spin inline" />
              ) : (
                `${dailyUsed}/${dailyLimit}`
              )}
            </span>
          </div>
          <Progress
            value={limitsLoading ? 0 : ((dailyUsed / dailyLimit) * 100)}
            className="h-1.5"
          />
          <p className="text-xs text-gray-500 mt-1">
            {dailyRemaining} applications remaining today
          </p>
        </div>

        {/* Platform Status */}
        <div className="border-t pt-3">
          <p className="text-sm font-medium mb-2">Connected Platforms:</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs bg-green-50">
              <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
              LinkedIn
            </Badge>
            <Badge variant="outline" className="text-xs bg-green-50">
              <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
              Greenhouse
            </Badge>
            <Badge variant="outline" className="text-xs bg-green-50">
              <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
              Lever
            </Badge>
            <Badge variant="outline" className="text-xs bg-green-50">
              <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
              Workable
            </Badge>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 pt-2">
          <Link to="/automation-settings" className="flex-1">
            <Button variant="outline" size="sm" className="w-full text-xs">
              Configure
            </Button>
          </Link>
          <Link to="/approvals" className="flex-1">
            <Button
              variant={pending.length > 0 ? 'default' : 'outline'}
              size="sm"
              className={`w-full text-xs ${pending.length > 0 ? 'bg-[#0367FC]' : ''}`}
            >
              Review ({pending.length})
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
