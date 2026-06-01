import { useState, useEffect } from 'react'
import { automationApi } from '@/services/automationApi'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Globe, Loader2 } from 'lucide-react'

interface Platform {
  name: string
  display_name: string
  type: string
  is_active: boolean
  rate_limit: number
}

interface PlatformSelectorProps {
  selected: string[]
  onChange: (platforms: string[]) => void
}

export function PlatformSelector({ selected, onChange }: PlatformSelectorProps) {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPlatforms()
  }, [])

  const loadPlatforms = async () => {
    try {
      setLoading(true)
      const data = await automationApi.getPlatforms()
      setPlatforms((data || []) as unknown as Platform[])
    } catch (error) {
      console.error('Failed to load platforms')
    } finally {
      setLoading(false)
    }
  }

  const togglePlatform = (platformName: string) => {
    if (selected.includes(platformName)) {
      onChange(selected.filter((p) => p !== platformName))
    } else {
      onChange([...selected, platformName])
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#0367FC]" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-[#0367FC]" />
          <CardTitle className="text-base">Job Platforms</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {platforms.map((platform) => (
            <div key={platform.name} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id={`platform-${platform.name}`}
                  checked={selected.includes(platform.name)}
                  onCheckedChange={() => togglePlatform(platform.name)}
                />
                <Label
                  htmlFor={`platform-${platform.name}`}
                  className="text-sm font-medium cursor-pointer"
                >
                  {platform.display_name || platform.name}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {platform.type}
                </Badge>
                {!platform.is_active && (
                  <Badge variant="secondary" className="text-xs">
                    Maintenance
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
