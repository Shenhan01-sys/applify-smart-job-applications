import { useEffect } from 'react'
import { useRateLimits } from '@/hooks/useAutomation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, CheckCircle, Clock } from 'lucide-react'

export function RateLimitStatus() {
  const { limits, loading, loadLimits } = useRateLimits()

  useEffect(() => {
    loadLimits()
  }, [])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="h-8 bg-gray-200 rounded" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!limits) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-gray-500">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p>Rate limit data unavailable</p>
        </CardContent>
      </Card>
    )
  }

  const quota = limits.quota || {}
  const dailyLimit = quota.daily_limit || 10
  const dailyUsed = quota.daily_used || 0
  const dailyRemaining = quota.daily_remaining || dailyLimit
  const percentage = ((dailyUsed / dailyLimit) * 100)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Daily Quota</CardTitle>
          <Badge variant={dailyRemaining > 0 ? 'default' : 'destructive'}>
            {dailyRemaining > 0 ? 'Active' : 'Exhausted'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600">Applications Today</span>
            <span className="font-medium">
              {dailyUsed} / {dailyLimit}
            </span>
          </div>
          <Progress value={percentage} className="h-2" />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span>{dailyRemaining} remaining</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <span>Resets at midnight</span>
          </div>
        </div>

        {limits.platforms && (
          <div className="border-t pt-3">
            <p className="text-sm font-medium mb-2">Platform Limits:</p>
            <div className="space-y-1">
              {Object.entries(limits.platforms).map(([platform, data]: [string, any]) => (
                <div key={platform} className="flex justify-between text-xs">
                  <span className="capitalize text-gray-600">{platform}</span>
                  <span className="font-mono">
                    {data?.remaining || 0} / {data?.limit || 0} req/hr
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
