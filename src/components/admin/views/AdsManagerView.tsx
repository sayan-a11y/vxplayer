'use client'

// Ads Manager — emergency kill switches, per-placement toggles, cache version
// bump, offline fallback policy, frequency caps and a quick ad stats row.

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  Info,
  Megaphone,
  Play,
  RefreshCw,
  Save,
  ShieldAlert,
  SkipForward,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { formatCompact } from '@/lib/format'
import type { DashboardDTO, SettingsDTO } from '@/lib/types'
import { adminGet, adminPatch, adminPost, can, useAdminSession } from '../session'
import { ErrorState, LoadingCards, PageHeader, StatCard } from '../shared'

const PLACEMENT_KILLS: { key: keyof SettingsDTO; label: string; desc: string }[] = [
  { key: 'heroEnabled', label: 'Hero', desc: 'Hero showcase slot at the top of Home' },
  { key: 'preRollEnabled', label: 'Pre-Roll', desc: 'Ads before the video starts' },
  { key: 'midRollEnabled', label: 'Mid-Roll', desc: 'Ad breaks during playback' },
  { key: 'postRollEnabled', label: 'Post-Roll', desc: 'Ads after the video ends' },
  { key: 'overlayEnabled', label: 'Overlay', desc: 'Non-intrusive in-player overlay' },
  { key: 'bannerEnabled', label: 'Banner', desc: 'Banner slots in content pages' },
  { key: 'footerEnabled', label: 'Footer', desc: 'Footer ad slot above bottom navigation' },
]

const DEFAULT_SETTINGS: SettingsDTO = {
  adsEnabled: true,
  heroEnabled: true,
  preRollEnabled: true,
  midRollEnabled: true,
  postRollEnabled: true,
  overlayEnabled: true,
  bannerEnabled: true,
  footerEnabled: true,
  adsPerSession: 6,
  maxMidRolls: 2,
  overlayPerHour: 3,
  minMidRollDurationSec: 90,
  offlineAdFallback: 'LAST_CACHED',
  adCacheVersion: 1,
  defaultSpeed: 1,
  autoPlayNext: true,
  resumePlayback: true,
  doubleTapSeek: 10,
  hwAcceleration: true,
  defaultOrientation: 'SENSOR',
  theme: 'dark',
  accent: 'violet',
  playerTheme: 'OLED',
  subtitleSize: 'M',
  subtitlePosition: 10,
  subtitleBgOpacity: 70,
  defaultSubtitleLang: 'en',
}

export default function AdsManagerView() {
  const session = useAdminSession()
  const canEdit = can(session?.role, 'settings')

  const [settings, setSettings] = useState<SettingsDTO>(DEFAULT_SETTINGS)
  const [dash, setDash] = useState<DashboardDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [freq, setFreq] = useState({
    adsPerSession: 6,
    maxMidRolls: 2,
    overlayPerHour: 3,
    minMidRollDurationSec: 90,
  })

  const [r2Status, setR2Status] = useState<{
    configured: boolean
    bucketName: string | null
    publicUrl: string | null
    accountId: string | null
  } | null>(null)
  const [testingR2, setTestingR2] = useState(false)
  const [r2TestResult, setR2TestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [s, d, r2] = await Promise.all([
        adminGet<{ settings: SettingsDTO }>('/api/admin/settings').catch(() => ({ settings: DEFAULT_SETTINGS })),
        adminGet<DashboardDTO>('/api/admin/dashboard').catch(() => null),
        adminGet<{
          configured: boolean
          bucketName: string | null
          publicUrl: string | null
          accountId: string | null
        }>('/api/admin/r2/status').catch(() => null),
      ])
      if (s?.settings) {
        setSettings(s.settings)
        setFreq({
          adsPerSession: s.settings.adsPerSession,
          maxMidRolls: s.settings.maxMidRolls,
          overlayPerHour: s.settings.overlayPerHour,
          minMidRollDurationSec: s.settings.minMidRollDurationSec,
        })
      }
      if (d) setDash(d)
      if (r2) setR2Status(r2)
    } catch {
      /* keep defaults */
    } finally {
      setLoading(false)
    }
  }, [])

  async function handleTestR2() {
    setTestingR2(true)
    setR2TestResult(null)
    try {
      const res = await adminPost<{ ok: boolean; message: string }>('/api/admin/r2/test', {})
      setR2TestResult(res)
      if (res.ok) {
        toast.success(res.message)
      } else {
        toast.error(res.message)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'R2 connection test failed'
      setR2TestResult({ ok: false, message: msg })
      toast.error(msg)
    } finally {
      setTestingR2(false)
    }
  }

  useEffect(() => {
    void load()
  }, [load])

  async function patch(partial: Partial<SettingsDTO>, successMsg?: string) {
    if (!settings) return
    setBusy(true)
    try {
      const res = await adminPatch<{ settings: SettingsDTO }>('/api/admin/settings', partial)
      setSettings((prev) => (prev ? { ...prev, ...res.settings } : res.settings))
      if (successMsg) toast.success(successMsg)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update settings')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ads Manager" description="Ad engine controls & emergency kill switches" />
        <LoadingCards className="grid-cols-1" count={1} />
        <LoadingCards className="grid-cols-2 sm:grid-cols-5" count={5} />
      </div>
    )
  }

  if (error || !settings) {
    return <ErrorState message={error ?? 'No settings available.'} onRetry={() => void load()} />
  }

  const cards = dash?.cards

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ads Manager"
        description="Ad engine controls & emergency kill switches"
        actions={
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              settings.adsEnabled
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-red-500/40 bg-red-500/15 text-red-300'
            }`}
          >
            {settings.adsEnabled ? 'ADS LIVE' : 'ADS DISABLED'}
          </span>
        }
      />

      {!canEdit ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200/90">
          Controls below require Super Admin or Admin role — you can view the current configuration but changes are
          rejected by the server.
        </p>
      ) : null}

      {/* 🚨 Emergency controls */}
      <div className="vx-card border-red-500/25 bg-red-500/[0.04] p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-400" />
          <h3 className="text-sm font-semibold text-white">🚨 Emergency Controls</h3>
        </div>

        {/* Master switch */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-black/20 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">Disable all ads</p>
            <p className="text-xs text-white/45">Master kill switch — no placement will serve any ad while off.</p>
          </div>
          <Switch
            checked={settings.adsEnabled}
            disabled={!canEdit || busy}
            onCheckedChange={(v) => {
              if (v) {
                void patch({ adsEnabled: true }, '✅ Ads re-enabled across all placements')
              } else {
                setConfirmDisable(true)
              }
            }}
            className="data-[state=checked]:bg-red-600"
            aria-label="Disable all ads"
          />
        </div>

        <Separator className="my-4 bg-white/[0.08]" />

        {/* Per-placement kills */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PLACEMENT_KILLS.map((k) => {
            const value = settings[k.key] === true
            return (
              <div key={String(k.key)} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white/85">{k.label}</p>
                  <p className="truncate text-[11px] text-white/40">{k.desc}</p>
                </div>
                <Switch
                  checked={value}
                  disabled={!canEdit || busy}
                  onCheckedChange={(v) => void patch({ [k.key]: v } as Partial<SettingsDTO>, `${k.label} ${v ? 'enabled' : 'disabled'}`)}
                  aria-label={`Toggle ${k.label}`}
                />
              </div>
            )
          })}

          {/* Offline fallback policy */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/85">Offline policy</p>
              <p className="truncate text-[11px] text-white/40">What clients do offline</p>
            </div>
            <Select
              value={settings.offlineAdFallback}
              disabled={!canEdit || busy}
              onValueChange={(v) => void patch({ offlineAdFallback: v as SettingsDTO['offlineAdFallback'] }, `Offline policy set to ${v}`)}
            >
              <SelectTrigger className="h-9 w-[150px] border-white/10 bg-white/[0.04] text-xs text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#12122a] text-white">
                <SelectItem value="LAST_CACHED">LAST_CACHED</SelectItem>
                <SelectItem value="SKIP_ADS">SKIP_ADS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Cache bump */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/85">Campaign cache</p>
              <p className="truncate text-[11px] text-white/40">Current version v{settings.adCacheVersion}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!canEdit || busy}
              onClick={() => void patch({ adCacheVersion: settings.adCacheVersion + 1 }, 'Cache version bumped — clients re-sync')}
              className="h-9 border-white/15 bg-transparent text-white/75 hover:bg-white/5 hover:text-white"
            >
              <Database className="mr-2 h-4 w-4" /> Clear campaign cache
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-white/50">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/40" />
          Offline policy: cached ads play offline while still valid; expired ads are never played. Bumping the cache
          version forces all clients to discard their cached bundle and re-sync.
        </div>
      </div>

      {/* Frequency caps */}
      <div className="vx-card p-5">
        <h3 className="text-sm font-semibold text-white/85">Frequency caps</h3>
        <p className="mt-0.5 text-xs text-white/45">Throttle how often ads appear per session / hour.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="f-aps" className="text-xs text-white/55">Ads per session</Label>
            <Input id="f-aps" type="number" min={0} value={freq.adsPerSession} disabled={!canEdit} onChange={(e) => setFreq((f) => ({ ...f, adsPerSession: Number(e.target.value) }))} className="border-white/10 bg-white/[0.04] text-white" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-mmr" className="text-xs text-white/55">Max mid-rolls per video</Label>
            <Input id="f-mmr" type="number" min={0} value={freq.maxMidRolls} disabled={!canEdit} onChange={(e) => setFreq((f) => ({ ...f, maxMidRolls: Number(e.target.value) }))} className="border-white/10 bg-white/[0.04] text-white" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-oph" className="text-xs text-white/55">Overlays per hour</Label>
            <Input id="f-oph" type="number" min={0} value={freq.overlayPerHour} disabled={!canEdit} onChange={(e) => setFreq((f) => ({ ...f, overlayPerHour: Number(e.target.value) }))} className="border-white/10 bg-white/[0.04] text-white" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-mdr" className="text-xs text-white/55">Min video duration for mid-roll (sec)</Label>
            <Input id="f-mdr" type="number" min={0} value={freq.minMidRollDurationSec} disabled={!canEdit} onChange={(e) => setFreq((f) => ({ ...f, minMidRollDurationSec: Number(e.target.value) }))} className="border-white/10 bg-white/[0.04] text-white" />
          </div>
        </div>
        <Button
          onClick={() => void patch({ ...freq }, 'Frequency caps saved')}
          disabled={!canEdit || busy}
          className="vx-btn-accent mt-4 h-10 rounded-xl px-5 font-medium"
        >
          <Save className="mr-2 h-4 w-4" /> Save frequency caps
        </Button>
      </div>

      {/* Cloudflare R2 Cloud Storage */}
      <div className="vx-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-white/85">Cloudflare R2 Storage (Ad Videos & Media)</h3>
            </div>
            <p className="mt-0.5 text-xs text-white/45">
              All ad video and image creatives are stored in high-speed Cloudflare R2 object storage.
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              r2Status?.configured
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
            }`}
          >
            {r2Status?.configured ? 'R2 ACTIVE' : 'LOCAL FALLBACK'}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[11px] text-white/45">Target Bucket</p>
            <p className="mt-1 text-xs font-medium text-white/90">
              {r2Status?.bucketName || 'Not configured (using public/ads/)'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[11px] text-white/45">Public CDN URL</p>
            <p className="mt-1 truncate text-xs font-medium text-white/90">
              {r2Status?.publicUrl || 'Direct / Local URL'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[11px] text-white/45">Cloudflare Account</p>
            <p className="mt-1 text-xs font-medium text-white/90">
              {r2Status?.accountId || 'Default'}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={testingR2 || !canEdit}
            onClick={() => void handleTestR2()}
            className="h-9 border-white/15 bg-white/[0.04] text-xs text-white hover:bg-white/10"
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${testingR2 ? 'animate-spin' : ''}`} />
            {testingR2 ? 'Testing connection...' : 'Test R2 Connection'}
          </Button>

          {r2TestResult && (
            <span
              className={`text-xs ${
                r2TestResult.ok ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {r2TestResult.message}
            </span>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-white/50">
          <p className="font-medium text-white/70">To configure or change your Cloudflare R2 bucket:</p>
          <p className="mt-1">
            Add <code className="text-violet-300">R2_ACCOUNT_ID</code>, <code className="text-violet-300">R2_ACCESS_KEY_ID</code>, <code className="text-violet-300">R2_SECRET_ACCESS_KEY</code>, <code className="text-violet-300">R2_BUCKET_NAME</code>, and <code className="text-violet-300">R2_PUBLIC_URL</code> in your <code className="text-white/80">.env</code> file.
          </p>
        </div>
      </div>

      {/* Quick ad stats */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-white/85">Ad performance (all time)</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard icon={Megaphone} label="Impressions" value={formatCompact(cards?.adImpressions ?? 0)} accent />
          <StatCard icon={Play} label="Ad starts" value={formatCompact(cards?.adStarts ?? 0)} accent />
          <StatCard icon={CheckCircle2} label="Completions" value={formatCompact(cards?.adCompletions ?? 0)} accent />
          <StatCard icon={SkipForward} label="Skips" value={formatCompact(cards?.adSkips ?? 0)} accent />
          <StatCard icon={AlertTriangle} label="Errors" value={formatCompact(cards?.adErrors ?? 0)} accent danger />
        </div>
      </div>

      {/* Disable-all confirmation */}
      <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <AlertDialogContent className="border-white/10 bg-[#0b0b1e]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">🚨 Disable ALL ads?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              Every placement (Pre-Roll, Mid-Roll, Post-Roll, Overlay, Banner) will stop serving immediately across all
              clients. You can re-enable at any time. This action is audit-logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent text-white/70 hover:text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void patch({ adsEnabled: false }, '🚨 All ads disabled')}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              Yes, disable all ads
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
