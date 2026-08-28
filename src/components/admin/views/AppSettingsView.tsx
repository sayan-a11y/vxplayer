'use client'

// App Settings — remote player defaults pushed to every client.
// SUPER_ADMIN / ADMIN only (server enforces, UI shows a lock note otherwise).

import { useCallback, useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { SPEED_OPTIONS } from '@/lib/types'
import type { SettingsDTO } from '@/lib/types'
import { adminGet, adminPatch, can, useAdminSession } from '../session'
import { ErrorState, LoadingBlock, LockNote, PageHeader } from '../shared'

const ORIENTATIONS: SettingsDTO['defaultOrientation'][] = ['PORTRAIT', 'LANDSCAPE', 'SENSOR', 'LOCKED']
const THEMES: SettingsDTO['theme'][] = ['dark', 'light', 'system']
const ACCENTS: SettingsDTO['accent'][] = ['violet', 'purple', 'fuchsia', 'rose']
const PLAYER_THEMES: SettingsDTO['playerTheme'][] = ['OLED', 'DIM']
const SUBTITLE_SIZES: SettingsDTO['subtitleSize'][] = ['S', 'M', 'L', 'XL']
const SEEK_STEPS = [5, 10, 15, 20, 30]

function ToggleRow({ label, desc, checked, disabled, onChange }: { label: string; desc: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <div>
        <p className="text-sm text-white/80">{label}</p>
        <p className="text-[11px] text-white/40">{desc}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label} />
    </div>
  )
}

export default function AppSettingsView() {
  const session = useAdminSession()
  const allowed = can(session.role, 'settings')

  const [settings, setSettings] = useState<SettingsDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [subPosition, setSubPosition] = useState(85)
  const [subOpacity, setSubOpacity] = useState(60)
  const [subLang, setSubLang] = useState('en')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminGet<{ settings: SettingsDTO }>('/api/admin/settings')
      setSettings(data.settings)
      setSubPosition(data.settings.subtitlePosition)
      setSubOpacity(data.settings.subtitleBgOpacity)
      setSubLang(data.settings.defaultSubtitleLang)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (allowed) void load()
    else setLoading(false)
  }, [allowed, load])

  async function save() {
    if (!settings) return
    setSaving(true)
    try {
      const res = await adminPatch<{ settings: SettingsDTO }>('/api/admin/settings', {
        ...settings,
        subtitlePosition: subPosition,
        subtitleBgOpacity: subOpacity,
        defaultSubtitleLang: subLang,
      })
      setSettings(res.settings)
      toast.success('Settings saved — players sync on next launch')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="App Settings" description="Remote player defaults & preferences" />
        <LockNote role={session.role} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="App Settings" description="Remote player defaults & preferences" />
        <LoadingBlock className="h-[420px]" />
      </div>
    )
  }

  if (error || !settings) {
    return <ErrorState message={error ?? 'No settings available.'} onRetry={() => void load()} />
  }

  function upd(patch: Partial<SettingsDTO>) {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="App Settings"
        description="Remote defaults applied to every VX Player client"
        actions={
          <Button onClick={() => void save()} disabled={saving} className="vx-btn-accent h-10 rounded-xl font-medium">
            <Save className="mr-2 h-4 w-4" /> {saving ? 'Saving…' : 'Save changes'}
          </Button>
        }
      />

      {/* Playback defaults */}
      <div className="vx-card p-5">
        <h3 className="text-sm font-semibold text-white/85">Playback defaults</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-white/55">Default speed</Label>
            <Select value={String(settings.defaultSpeed)} onValueChange={(v) => upd({ defaultSpeed: Number(v) })}>
              <SelectTrigger className="border-white/10 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#12122a] text-white">
                {SPEED_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s}×</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-white/55">Double-tap seek</Label>
            <Select value={String(settings.doubleTapSeek)} onValueChange={(v) => upd({ doubleTapSeek: Number(v) })}>
              <SelectTrigger className="border-white/10 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#12122a] text-white">
                {SEEK_STEPS.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s} seconds</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-white/55">Default orientation</Label>
            <Select value={settings.defaultOrientation} onValueChange={(v) => upd({ defaultOrientation: v as SettingsDTO['defaultOrientation'] })}>
              <SelectTrigger className="border-white/10 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#12122a] text-white">
                {ORIENTATIONS.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ToggleRow label="Auto-play next" desc="Continue to next item after playback ends" checked={settings.autoPlayNext} onChange={(v) => upd({ autoPlayNext: v })} />
          <ToggleRow label="Resume playback" desc="Reopen videos from last position" checked={settings.resumePlayback} onChange={(v) => upd({ resumePlayback: v })} />
          <ToggleRow label="Hardware acceleration" desc="Use HW decoder when available" checked={settings.hwAcceleration} onChange={(v) => upd({ hwAcceleration: v })} />
        </div>
      </div>

      {/* Appearance */}
      <div className="vx-card p-5">
        <h3 className="text-sm font-semibold text-white/85">Appearance</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-white/55">Theme</Label>
            <Select value={settings.theme} onValueChange={(v) => upd({ theme: v as SettingsDTO['theme'] })}>
              <SelectTrigger className="border-white/10 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#12122a] text-white">
                {THEMES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-white/55">Accent color</Label>
            <Select value={settings.accent} onValueChange={(v) => upd({ accent: v as SettingsDTO['accent'] })}>
              <SelectTrigger className="border-white/10 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#12122a] text-white">
                {ACCENTS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-white/55">Player theme</Label>
            <Select value={settings.playerTheme} onValueChange={(v) => upd({ playerTheme: v as SettingsDTO['playerTheme'] })}>
              <SelectTrigger className="border-white/10 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#12122a] text-white">
                {PLAYER_THEMES.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Subtitles */}
      <div className="vx-card p-5">
        <h3 className="text-sm font-semibold text-white/85">Subtitles</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-white/55">Default size</Label>
            <Select value={settings.subtitleSize} onValueChange={(v) => upd({ subtitleSize: v as SettingsDTO['subtitleSize'] })}>
              <SelectTrigger className="border-white/10 bg-white/[0.04] text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#12122a] text-white">
                {SUBTITLE_SIZES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-pos" className="text-xs text-white/55">Position (% from top)</Label>
            <Input id="s-pos" type="number" min={0} max={100} value={subPosition} onChange={(e) => setSubPosition(Number(e.target.value))} className="border-white/10 bg-white/[0.04] text-white" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-op" className="text-xs text-white/55">Background opacity (0–100)</Label>
            <Input id="s-op" type="number" min={0} max={100} value={subOpacity} onChange={(e) => setSubOpacity(Number(e.target.value))} className="border-white/10 bg-white/[0.04] text-white" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-lang" className="text-xs text-white/55">Default language</Label>
            <Input id="s-lang" value={subLang} onChange={(e) => setSubLang(e.target.value)} placeholder="e.g. en" className="border-white/10 bg-white/[0.04] text-white" />
          </div>
        </div>
      </div>

      <p className="text-xs text-white/35">Saving PATCHes /api/admin/settings — every change is audit-logged.</p>
    </div>
  )
}
