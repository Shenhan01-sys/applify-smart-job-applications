import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { automationApi, AutomationSettings } from '@/services/automationApi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

export const Route = createFileRoute('/automation-settings')({
  component: AutomationSettingsPage,
})

function AutomationSettingsPage() {
  const [settings, setSettings] = useState<AutomationSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const data = await automationApi.getSettings()
      setSettings(data)
    } catch (error) {
      toast.error('Failed to load automation settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await automationApi.updateSettings(settings)
      toast.success('Automation settings saved successfully')
    } catch (error) {
      toast.error('Failed to save automation settings')
    } finally {
      setSaving(false)
    }
  }

  const updateField = (field: keyof AutomationSettings, value: any) => {
    setSettings((prev) => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0367FC]" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#161616]">Automation Settings</h1>
        <p className="text-gray-600 mt-2">
          Configure your AI job application automation preferences
        </p>
      </div>

      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-8">
          <TabsTrigger value="personal">Personal Info</TabsTrigger>
          <TabsTrigger value="answers">Application Answers</TabsTrigger>
          <TabsTrigger value="search">Search Preferences</TabsTrigger>
          <TabsTrigger value="behavior">Behavior</TabsTrigger>
          <TabsTrigger value="ai">AI Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>
                This information will be used to auto-fill job application forms
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    value={settings.first_name || ''}
                    onChange={(e) => updateField('first_name', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    value={settings.last_name || ''}
                    onChange={(e) => updateField('last_name', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone_number">Phone Number</Label>
                <Input
                  id="phone_number"
                  value={settings.phone_number || ''}
                  onChange={(e) => updateField('phone_number', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="current_city">Current City</Label>
                <Input
                  id="current_city"
                  value={settings.current_city || ''}
                  onChange={(e) => updateField('current_city', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="street">Street</Label>
                  <Input
                    id="street"
                    value={settings.street || ''}
                    onChange={(e) => updateField('street', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={settings.state || ''}
                    onChange={(e) => updateField('state', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zipcode">Zip Code</Label>
                  <Input
                    id="zipcode"
                    value={settings.zipcode || ''}
                    onChange={(e) => updateField('zipcode', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={settings.country || ''}
                  onChange={(e) => updateField('country', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="answers">
          <Card>
            <CardHeader>
              <CardTitle>Application Answers</CardTitle>
              <CardDescription>
                Pre-configured answers for common job application questions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="years_of_experience">Years of Experience</Label>
                  <Input
                    id="years_of_experience"
                    value={settings.years_of_experience || ''}
                    onChange={(e) => updateField('years_of_experience', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="require_visa">Require Visa Sponsorship</Label>
                  <select
                    id="require_visa"
                    className="w-full p-2 border rounded-md"
                    value={settings.require_visa || 'No'}
                    onChange={(e) => updateField('require_visa', e.target.value)}
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="desired_salary">Desired Salary (Annual)</Label>
                  <Input
                    id="desired_salary"
                    type="number"
                    value={settings.desired_salary || ''}
                    onChange={(e) => updateField('desired_salary', Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="current_ctc">Current CTC (Annual)</Label>
                  <Input
                    id="current_ctc"
                    type="number"
                    value={settings.current_ctc || ''}
                    onChange={(e) => updateField('current_ctc', Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notice_period">Notice Period (days)</Label>
                <Input
                  id="notice_period"
                  type="number"
                  value={settings.notice_period || 30}
                  onChange={(e) => updateField('notice_period', Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                <Input
                  id="linkedin_url"
                  value={settings.linkedin_url || ''}
                  onChange={(e) => updateField('linkedin_url', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website/Portfolio</Label>
                <Input
                  id="website"
                  value={settings.website || ''}
                  onChange={(e) => updateField('website', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cover_letter">Default Cover Letter</Label>
                <Textarea
                  id="cover_letter"
                  rows={6}
                  value={settings.cover_letter || ''}
                  onChange={(e) => updateField('cover_letter', e.target.value)}
                  placeholder="Your default cover letter template..."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search">
          <Card>
            <CardHeader>
              <CardTitle>Search Preferences</CardTitle>
              <CardDescription>
                Configure job search keywords and filters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="search_keywords">Search Keywords (comma-separated)</Label>
                <Input
                  id="search_keywords"
                  value={settings.search_keywords?.join(', ') || ''}
                  onChange={(e) =>
                    updateField(
                      'search_keywords',
                      e.target.value.split(',').map((k) => k.trim()).filter(Boolean)
                    )
                  }
                  placeholder="Software Engineer, React Developer, Full Stack"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="search_location">Search Location</Label>
                <Input
                  id="search_location"
                  value={settings.search_location || ''}
                  onChange={(e) => updateField('search_location', e.target.value)}
                  placeholder="Jakarta, Indonesia or Remote"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="easy_apply_only"
                  checked={settings.easy_apply_only ?? true}
                  onCheckedChange={(checked) => updateField('easy_apply_only', checked)}
                />
                <Label htmlFor="easy_apply_only">Easy Apply Only</Label>
              </div>

              <div className="space-y-2">
                <Label>Blacklist Companies (comma-separated)</Label>
                <Input
                  value={settings.blacklist_companies?.join(', ') || ''}
                  onChange={(e) =>
                    updateField(
                      'blacklist_companies',
                      e.target.value.split(',').map((k) => k.trim()).filter(Boolean)
                    )
                  }
                  placeholder="Company A, Company B"
                />
              </div>

              <div className="space-y-2">
                <Label>Blacklist Words (comma-separated)</Label>
                <Input
                  value={settings.blacklist_words?.join(', ') || ''}
                  onChange={(e) =>
                    updateField(
                      'blacklist_words',
                      e.target.value.split(',').map((k) => k.trim()).filter(Boolean)
                    )
                  }
                  placeholder="PHP, .NET, WordPress"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="behavior">
          <Card>
            <CardHeader>
              <CardTitle>Automation Behavior</CardTitle>
              <CardDescription>
                Control how the AI behaves during job applications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="pause_before_submit">Pause Before Submit</Label>
                  <p className="text-sm text-gray-500">
                    Stop before submitting each application for your review
                  </p>
                </div>
                <Switch
                  id="pause_before_submit"
                  checked={settings.pause_before_submit ?? true}
                  onCheckedChange={(checked) => updateField('pause_before_submit', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="pause_at_failed_question">Pause at Unknown Questions</Label>
                  <p className="text-sm text-gray-500">
                    Stop when AI encounters a question it can't answer
                  </p>
                </div>
                <Switch
                  id="pause_at_failed_question"
                  checked={settings.pause_at_failed_question ?? true}
                  onCheckedChange={(checked) => updateField('pause_at_failed_question', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="overwrite_previous_answers">Overwrite Previous Answers</Label>
                  <p className="text-sm text-gray-500">
                    Always use latest settings instead of saved answers
                  </p>
                </div>
                <Switch
                  id="overwrite_previous_answers"
                  checked={settings.overwrite_previous_answers ?? false}
                  onCheckedChange={(checked) => updateField('overwrite_previous_answers', checked)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <CardTitle>AI Settings</CardTitle>
              <CardDescription>
                Configure AI model and provider for automation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ai_provider">AI Provider</Label>
                <select
                  id="ai_provider"
                  className="w-full p-2 border rounded-md"
                  value={settings.ai_provider || 'openrouter'}
                  onChange={(e) => updateField('ai_provider', e.target.value)}
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="openai">OpenAI</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="gemini">Google Gemini</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai_model">AI Model</Label>
                <Input
                  id="ai_model"
                  value={settings.ai_model || 'openrouter/free'}
                  onChange={(e) => updateField('ai_model', e.target.value)}
                  placeholder="e.g., openrouter/free, claude-3.5-sonnet"
                />
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mt-4">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> AI model selection affects both quality and cost.
                  Free tier uses openrouter/free models. Pro tier uses Claude Opus/Sonnet.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-8 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#0367FC] hover:bg-[#0256d3] text-white px-8"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
