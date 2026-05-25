import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useLinkedInSession } from '@/hooks/useAutomation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { Shield, ShieldCheck, ShieldAlert, RefreshCw, Copy, CheckCircle, AlertCircle, Clock } from 'lucide-react'

export const Route = createFileRoute('/linkedin-session')({
  component: LinkedInSessionPage,
})

function LinkedInSessionPage() {
  const { sessionStatus, loading, checkSession, importSession, verifySession } = useLinkedInSession()
  const [cookiesJson, setCookiesJson] = useState('')
  const [importing, setImporting] = useState(false)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    checkSession()
  }, [])

  const handleImport = async () => {
    if (!cookiesJson.trim()) {
      toast.error('Please paste your cookies JSON')
      return
    }

    try {
      setImporting(true)
      const cookies = JSON.parse(cookiesJson)
      await importSession(cookies)
      setCookiesJson('')
    } catch (error) {
      toast.error('Invalid JSON format. Please check your cookies.')
    } finally {
      setImporting(false)
    }
  }

  const handleVerify = async () => {
    setVerifying(true)
    await verifySession()
    setVerifying(false)
  }

  const getSessionIcon = () => {
    if (!sessionStatus?.hasSession) {
      return <ShieldAlert className="h-12 w-12 text-red-400" />
    }
    if (sessionStatus?.isValid) {
      return <ShieldCheck className="h-12 w-12 text-green-500" />
    }
    return <Shield className="h-12 w-12 text-yellow-500" />
  }

  const getSessionStatus = () => {
    if (!sessionStatus?.hasSession) {
      return { text: 'No Session', color: 'bg-red-100 text-red-800 border-red-200' }
    }
    if (sessionStatus?.isValid) {
      return { text: 'Active', color: 'bg-green-100 text-green-800 border-green-200' }
    }
    return { text: 'Expired', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#161616]">LinkedIn Session Management</h1>
        <p className="text-gray-600 mt-2">
          Manage your LinkedIn browser session for automated job applications
        </p>
      </div>

      <div className="grid gap-6">
        {/* Session Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Session Status</CardTitle>
                <CardDescription>Current LinkedIn authentication status</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                {getSessionIcon()}
                <Badge variant="outline" className={getSessionStatus().color}>
                  {getSessionStatus().text}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {sessionStatus?.hasSession ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Last Used:</span>
                    <p className="font-medium">
                      {sessionStatus?.lastUsed
                        ? new Date(sessionStatus.lastUsed).toLocaleString()
                        : 'Never'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Expires At:</span>
                    <p className="font-medium">
                      {sessionStatus?.expiresAt
                        ? new Date(sessionStatus.expiresAt).toLocaleString()
                        : 'Unknown'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={handleVerify}
                    disabled={verifying}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${verifying ? 'animate-spin' : ''}`} />
                    {verifying ? 'Verifying...' : 'Verify Session'}
                  </Button>
                  <Button
                    onClick={() => checkSession()}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <Clock className="h-4 w-4" />
                    Refresh Status
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-yellow-700 bg-yellow-50 p-4 rounded-lg">
                <AlertCircle className="h-5 w-5" />
                <p className="text-sm">
                  No active LinkedIn session found. Import your session cookies below to enable
                  automated applications.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Import Session */}
        <Card>
          <CardHeader>
            <CardTitle>Import Session</CardTitle>
            <CardDescription>
              Export cookies from your browser and paste them here
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="manual">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="manual">Manual Import</TabsTrigger>
                <TabsTrigger value="guide">How to Export</TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cookies">Cookies JSON</Label>
                  <textarea
                    id="cookies"
                    rows={6}
                    className="w-full p-3 border rounded-md font-mono text-xs"
                    placeholder={`Paste your cookies here in JSON format:
[
  {"name": "li_at", "value": "your_cookie_value", "domain": ".linkedin.com"},
  {"name": "JSESSIONID", "value": "your_session_id", "domain": "www.linkedin.com"}
]`}
                    value={cookiesJson}
                    onChange={(e) => setCookiesJson(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleImport}
                  disabled={importing || !cookiesJson.trim()}
                  className="bg-[#0367FC] hover:bg-[#0256d3]"
                >
                  {importing ? 'Importing...' : 'Import Session'}
                </Button>
              </TabsContent>

              <TabsContent value="guide" className="space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg space-y-3 text-sm">
                  <h4 className="font-semibold">How to export LinkedIn cookies:</h4>
                  <ol className="list-decimal list-inside space-y-2">
                    <li>
                      Open LinkedIn in your browser and login to your account
                    </li>
                    <li>
                      Open Developer Tools (F12 or Ctrl+Shift+I / Cmd+Option+I)
                    </li>
                    <li>
                      Go to the Application tab → Cookies → https://www.linkedin.com
                    </li>
                    <li>
                      Find and copy these cookies: <code>li_at</code>,{' '}
                      <code>JSESSIONID</code>, <code>bcookie</code>
                    </li>
                    <li>
                      Paste them in JSON format in the Manual Import tab
                    </li>
                  </ol>
                  <div className="bg-blue-50 p-3 rounded border border-blue-200 text-blue-800">
                    <p className="font-medium">Security Note:</p>
                    <p className="text-xs mt-1">
                      Your cookies are encrypted before storage and never shared. You can revoke
                      access anytime by logging out of LinkedIn on your browser.
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Security Info */}
        <Card>
          <CardHeader>
            <CardTitle>Security Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium">Encrypted Storage</p>
                <p className="text-gray-500">
                  Session cookies are encrypted with AES-256 before storage
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div>
                <p className="font-medium">User Control</p>
                <p className="text-gray-500">
                  You can revoke access anytime by logging out of LinkedIn
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
              <div>
                <p className="font-medium">Session Expiry</p>
                <p className="text-gray-500">
                  Sessions expire after 30 days and must be re-imported
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
