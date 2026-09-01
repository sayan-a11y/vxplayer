'use client'

// Ad Placements — educational overview of each placement slot with live
// enable/disable toggles and the number of campaigns currently targeting it.

import { useCallback, useEffect, useState } from 'react'
import { Layers } from 'lucide-react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import type { AdPlacement, CampaignDTO, SettingsDTO } from '@/lib/types'
import { adminGet, adminPatch, can, useAdminSession } from '../session'
import { ErrorState, LoadingBlock, LoadingCards, PageHeader, PLACEMENT_LABELS } from '../shared'

const PLACEMENT_META: {
  id: AdPlacement
  settingKey: keyof SettingsDTO
  desc: string
  flow: string
}[] = [
  {
    id: 'PRE_ROLL',
    settingKey: 'preRollEnabled',
    desc: 'Short ad played before the selected video starts. Highest completion rate of all slots.',
    flow: 'SELECT VIDEO → PRE-ROLL → MAIN VIDEO',
  },
  {
    id: 'MID_ROLL',
    settingKey: 'midRollEnabled',
    desc: 'Ad breaks injected during long videos. Only served when the video meets the minimum duration rule.',
    flow: 'MAIN VIDEO → MID-ROLL (per frequency caps) → MAIN VIDEO CONTINUES',
  },
  {
    id: 'POST_ROLL',
    settingKey: 'postRollEnabled',
    desc: 'Ad played after the video finishes, before autoplay moves to the next item.',
    flow: 'MAIN VIDEO ENDS → POST-ROLL → NEXT VIDEO / RECOMMENDATIONS',
  },
  {
    id: 'OVERLAY',
    settingKey: 'overlayEnabled',
    desc: 'Non-intrusive in-player overlay that appears during playback and auto-dismisses. Capped per hour.',
    flow: 'MAIN VIDEO PLAYING → OVERLAY AD → AUTO-DISMISS',
  },
  {
    id: 'BANNER',
    settingKey: 'bannerEnabled',
    desc: 'Static banner slot on home / detail screens, outside of video playback.',
    flow: 'OPEN APP / BROWSE → BANNER SLOT → CONTENT',
  },
]

export default function PlacementsView() {
  const session = useAdminSession()
  const canEdit = can(session.role, 'settings')

  const [settings, setSettings] = useState<SettingsDTO | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignDTO[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, c] = await Promise.all([
        adminGet<{ settings: SettingsDTO }>('/api/admin/settings'),
        adminGet<{ campaigns: CampaignDTO[] }>('/api/admin/campaigns'),
      ])
      setSettings(s.settings)
      setCampaigns(c.campaigns)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load placements')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(key: keyof SettingsDTO, label: string, value: boolean) {
    setBusy(true)
    try {
      const res = await adminPatch<{ settings: SettingsDTO }>('/api/admin/settings', { [key]: value })
      setSettings((prev) => (prev ? { ...prev, ...res.settings } : res.settings))
      toast.success(`${label} ${value ? 'enabled' : 'disabled'}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update placement')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ad Placements" description="Placement rules, availability & flow" />
        <LoadingCards className="grid-cols-1 lg:grid-cols-2" count={4} />
        <LoadingBlock className="h-40" />
      </div>
    )
  }

  if (error || !settings || !campaigns) {
    return <ErrorState message={error ?? 'No placement data available.'} onRetry={() => void load()} />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ad Placements"
        description="Five slots across the player and app screens — toggle availability and see current usage"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {PLACEMENT_META.map((p) => {
          const targeting = campaigns.filter((c) => c.placements.includes(p.id))
          const active = targeting.filter((c) => c.status === 'ACTIVE').length
          const enabled = settings[p.settingKey] === true
          return (
            <div key={p.id} className="vx-card space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10">
                    <Layers className="h-5 w-5 text-violet-300" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{PLACEMENT_LABELS[p.id]}</h3>
                    <p className="text-[11px] font-mono uppercase tracking-wide text-white/35">{p.id}</p>
                  </div>
                </div>
                <Switch
                  checked={enabled}
                  disabled={!canEdit || busy}
                  onCheckedChange={(v) => void toggle(p.settingKey, PLACEMENT_LABELS[p.id], v)}
                  aria-label={`Toggle ${PLACEMENT_LABELS[p.id]}`}
                />
              </div>

              <p className="text-sm leading-relaxed text-white/55">{p.desc}</p>

              <div className="rounded-lg border border-white/[0.07] bg-black/30 px-3 py-2 font-mono text-[11px] tracking-wide text-white/55">
                {p.flow}
              </div>

              <div className="flex items-center gap-2 text-xs text-white/50">
                <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2.5 py-0.5 tabular-nums text-violet-200">
                  {targeting.length} campaign{targeting.length === 1 ? '' : 's'} targeting
                </span>
                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 tabular-nums text-emerald-300">
                  {active} active
                </span>
                {!enabled ? (
                  <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-0.5 text-red-300">
                    disabled
                  </span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {!canEdit ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200/90">
          Toggles require Super Admin or Admin role — server rejects changes from other roles.
        </p>
      ) : null}
    </div>
  )
}
