'use client'

// Ad Placements — complete management for all 12 independent placement slots
// with live toggles, active campaign metrics, and interactive placement preview.

import { useCallback, useEffect, useState } from 'react'
import { Eye, Layers, Monitor, Play, Smartphone, Tablet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
    id: 'HERO',
    settingKey: 'heroEnabled',
    desc: 'Premium showcase ad slot positioned at the top of Home above Continue Watching. Plays video or image.',
    flow: 'HOME VIEW → HERO AD (VIDEO/IMAGE) → CONTINUE WATCHING → CONTENT',
  },
  {
    id: 'PRE_ROLL',
    settingKey: 'preRollEnabled',
    desc: 'Short ad played before the selected video starts. Highest completion rate of all slots.',
    flow: 'SELECT VIDEO → PRE-ROLL → MAIN VIDEO',
  },
  {
    id: 'MID_ROLL',
    settingKey: 'midRollEnabled',
    desc: 'Ad breaks injected during video playback at designated timestamp triggers. Preserves exact playback position.',
    flow: 'MAIN VIDEO → MID-ROLL BREAK → EXACT POSITION RESUME',
  },
  {
    id: 'POST_ROLL',
    settingKey: 'postRollEnabled',
    desc: 'Ad played after the video finishes, before Up Next or recommendations.',
    flow: 'MAIN VIDEO ENDS → POST-ROLL → UP NEXT QUEUE',
  },
  {
    id: 'VIDEO_OVERLAY',
    settingKey: 'videoOverlayEnabled',
    desc: 'Non-intrusive in-player video overlay that appears during playback with close button. Non-blocking controls.',
    flow: 'VIDEO PLAYING → VIDEO OVERLAY → CLOSE / AUTO-DISMISS',
  },
  {
    id: 'IMAGE_OVERLAY',
    settingKey: 'imageOverlayEnabled',
    desc: 'In-player image/banner overlay rendered over video playback with close button.',
    flow: 'VIDEO PLAYING → IMAGE OVERLAY CARD → CLOSE (X)',
  },
  {
    id: 'BANNER',
    settingKey: 'bannerEnabled',
    desc: 'Independent responsive banner slot rendered across content pages outside video playback.',
    flow: 'OPEN APP / BROWSE → BANNER SLOT → CONTENT',
  },
  {
    id: 'FOOTER',
    settingKey: 'footerEnabled',
    desc: 'Dedicated sticky/in-page footer ad slot positioned at the bottom of the screens above navigation.',
    flow: 'VIEW ANY SCREEN → FOOTER AD CREATIVE → RESPONSIVE WITH CLOSE (X)',
  },
  {
    id: 'HOME_FEED',
    settingKey: 'homeFeedEnabled',
    desc: 'In-feed advertisement inserted between Home sections (e.g. between Continue Watching and Recently Added).',
    flow: 'CONTINUE WATCHING → HOME FEED AD → RECENTLY ADDED → VIDEOS',
  },
  {
    id: 'BETWEEN_CARDS',
    settingKey: 'betweenCardsEnabled',
    desc: 'Ad card naturally inserted inside video card grids without breaking layout or aspect ratio.',
    flow: 'VIDEO 1, 2 → BETWEEN CARDS AD → VIDEO 3, 4',
  },
  {
    id: 'UP_NEXT',
    settingKey: 'upNextEnabled',
    desc: 'Advertisement card rendered inside or around the player Up Next drawer and queue.',
    flow: 'OPEN UP NEXT → UP NEXT AD → QUEUE ITEMS',
  },
  {
    id: 'PLAYER_BOTTOM',
    settingKey: 'playerBottomEnabled',
    desc: 'Non-intrusive advertisement beneath player video controls and timeline.',
    flow: 'PLAYER CONTROLS → PLAYER BOTTOM AD → DETAILS',
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
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewPlacement, setPreviewPlacement] = useState<AdPlacement | null>(null)

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
        <LoadingCards className="grid-cols-1 lg:grid-cols-2" count={6} />
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
        description="12 independent advertisement slots across VX Player — toggle availability, view flows, and inspect preview"
        actions={
          <Button
            onClick={() => {
              setPreviewPlacement('HERO')
              setPreviewOpen(true)
            }}
            variant="outline"
            className="gap-2 border-white/10 bg-white/5 text-white hover:bg-white/10"
          >
            <Eye className="size-4 text-violet-300" />
            Placement Preview
          </Button>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PLACEMENT_META.map((p) => {
          const targeting = campaigns.filter(
            (c) =>
              c.placements.includes(p.id) ||
              (p.id === 'VIDEO_OVERLAY' && c.placements.includes('OVERLAY')) ||
              (p.id === 'IMAGE_OVERLAY' && c.placements.includes('OVERLAY'))
          )
          const active = targeting.filter((c) => c.status === 'ACTIVE').length
          const enabled = settings[p.settingKey] ?? true
          return (
            <div key={p.id} className="vx-card flex flex-col justify-between space-y-3.5 p-4 sm:p-5">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/25 bg-violet-500/10">
                      <Layers className="size-4 text-violet-300" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-white">{PLACEMENT_LABELS[p.id]}</h3>
                      <p className="text-[10px] font-mono uppercase tracking-wide text-white/40">{p.id}</p>
                    </div>
                  </div>
                  <Switch
                    checked={enabled}
                    disabled={!canEdit || busy}
                    onCheckedChange={(v) => void toggle(p.settingKey, PLACEMENT_LABELS[p.id], v)}
                    aria-label={`Toggle ${PLACEMENT_LABELS[p.id]}`}
                  />
                </div>

                <p className="text-xs leading-relaxed text-white/60 line-clamp-2">{p.desc}</p>

                <div className="rounded-lg border border-white/[0.07] bg-black/40 px-2.5 py-1.5 font-mono text-[10px] tracking-wide text-white/55">
                  {p.flow}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5 text-[11px]">
                <div className="flex flex-wrap gap-1.5 text-white/50">
                  <span className="rounded-md border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 tabular-nums text-violet-200">
                    {targeting.length} target
                  </span>
                  <span className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 tabular-nums text-emerald-300">
                    {active} active
                  </span>
                  {!enabled && (
                    <span className="rounded-md border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-red-300">
                      OFF
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewPlacement(p.id)
                    setPreviewOpen(true)
                  }}
                  className="flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200"
                >
                  <Eye className="size-3" />
                  Preview
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Interactive Placement Preview Modal ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl border-white/10 bg-[#0c0d22] text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Eye className="size-5 text-violet-400" />
              Ad Placement Preview — {previewPlacement ? PLACEMENT_LABELS[previewPlacement] : 'Overview'}
            </DialogTitle>
            <DialogDescription className="text-xs text-white/50">
              Inspect responsive positioning and layout behavior across device viewpoints.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="mobile" className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-white/5">
              <TabsTrigger value="mobile" className="gap-1.5 text-xs">
                <Smartphone className="size-3.5" /> Mobile
              </TabsTrigger>
              <TabsTrigger value="tablet" className="gap-1.5 text-xs">
                <Tablet className="size-3.5" /> Tablet
              </TabsTrigger>
              <TabsTrigger value="desktop" className="gap-1.5 text-xs">
                <Monitor className="size-3.5" /> Desktop
              </TabsTrigger>
              <TabsTrigger value="player" className="gap-1.5 text-xs">
                <Play className="size-3.5" /> Player
              </TabsTrigger>
            </TabsList>

            <TabsContent value="mobile" className="mt-4">
              <div className="mx-auto max-w-xs rounded-2xl border border-white/15 bg-black p-3 space-y-2.5 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-xs font-bold text-violet-400">VX Player</span>
                  <span className="text-[10px] text-white/40">375 × 667</span>
                </div>
                {previewPlacement === 'HERO' && (
                  <div className="rounded-xl border border-violet-500/50 bg-violet-950/40 p-3 text-center ring-2 ring-violet-500/30">
                    <span className="rounded bg-violet-500 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">HERO AD SLOT</span>
                    <p className="mt-1 text-xs font-semibold text-white">Top Showcase Ad</p>
                  </div>
                )}
                <div className="rounded-lg bg-white/5 p-2 text-[11px] text-white/60">Continue Watching</div>
                {previewPlacement === 'HOME_FEED' && (
                  <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/40 p-3 text-center ring-2 ring-emerald-500/30">
                    <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">HOME FEED AD</span>
                    <p className="mt-1 text-xs font-semibold text-white">In-Feed Section Ad</p>
                  </div>
                )}
                <div className="rounded-lg bg-white/5 p-2 text-[11px] text-white/60">Recently Added</div>
                {previewPlacement === 'BETWEEN_CARDS' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="h-16 rounded-lg bg-white/5 p-1 text-[10px] text-white/40">Video 1</div>
                    <div className="h-16 rounded-lg border border-pink-500/50 bg-pink-950/40 p-1 text-center text-[10px] text-pink-300 font-bold">BETWEEN CARDS AD</div>
                  </div>
                )}
                {previewPlacement === 'BANNER' && (
                  <div className="rounded-xl border border-amber-500/50 bg-amber-950/40 p-2.5 text-center ring-2 ring-amber-500/30">
                    <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold text-black uppercase">BANNER AD</span>
                  </div>
                )}
                {previewPlacement === 'FOOTER' && (
                  <div className="rounded-xl border border-blue-500/50 bg-blue-950/40 p-2.5 text-center ring-2 ring-blue-500/30">
                    <span className="rounded bg-blue-500 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">FOOTER AD</span>
                  </div>
                )}
                <div className="rounded-lg bg-white/10 p-2 text-center text-[10px] text-white/40">Fixed Bottom Navigation</div>
              </div>
            </TabsContent>

            <TabsContent value="tablet" className="mt-4">
              <div className="mx-auto max-w-md rounded-2xl border border-white/15 bg-black p-4 space-y-3 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-xs font-bold text-violet-400">VX Player Tablet View</span>
                  <span className="text-[10px] text-white/40">768 × 1024</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1 rounded-lg bg-white/5 p-2 text-[11px] text-white/40">Sidebar Nav</div>
                  <div className="col-span-2 space-y-2">
                    <div className="rounded-lg border border-violet-500/40 bg-violet-950/30 p-2.5 text-center text-xs text-violet-200">
                      Active Slot: {previewPlacement ? PLACEMENT_LABELS[previewPlacement] : 'HERO'}
                    </div>
                    <div className="rounded-lg bg-white/5 p-2 text-[11px] text-white/50">Tablet Grid (3 cols)</div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="desktop" className="mt-4">
              <div className="mx-auto max-w-xl rounded-2xl border border-white/15 bg-black p-4 space-y-3 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-xs font-bold text-violet-400">VX Player Desktop View</span>
                  <span className="text-[10px] text-white/40">1920 × 1080</span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-1 rounded-lg bg-white/5 p-3 text-xs text-white/40">Sidebar Navigation</div>
                  <div className="col-span-3 space-y-2.5">
                    <div className="rounded-xl border border-violet-500/40 bg-violet-950/30 p-3 text-center text-xs font-semibold text-violet-200">
                      Placement: {previewPlacement ? PLACEMENT_LABELS[previewPlacement] : 'HERO'}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-16 rounded-lg bg-white/5 p-1 text-[10px] text-white/40">Card {i}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="player" className="mt-4">
              <div className="mx-auto max-w-md rounded-2xl border border-white/15 bg-black p-4 space-y-3 shadow-2xl">
                <div className="relative aspect-video rounded-xl bg-zinc-950 flex flex-col justify-between p-3 border border-white/10 overflow-hidden">
                  <div className="flex items-center justify-between text-[11px] text-white/60">
                    <span>VX Player</span>
                    <span className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white/80">1080p</span>
                  </div>

                  {(previewPlacement === 'PRE_ROLL' || previewPlacement === 'MID_ROLL' || previewPlacement === 'POST_ROLL') && (
                    <div className="rounded-lg border border-red-500/60 bg-red-950/60 p-2 text-center backdrop-blur">
                      <span className="rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                        {previewPlacement} AD PLAYING
                      </span>
                      <p className="mt-1 text-xs text-white">Full-Screen Roll with Skip Button</p>
                    </div>
                  )}

                  {(previewPlacement === 'VIDEO_OVERLAY' || previewPlacement === 'IMAGE_OVERLAY' || previewPlacement === 'OVERLAY') && (
                    <div className="rounded-lg border border-violet-500/60 bg-black/80 p-2 text-left backdrop-blur">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-violet-300 uppercase">OVERLAY AD</span>
                        <span className="text-[10px] text-white/60">✕ Close</span>
                      </div>
                      <p className="text-xs text-white">In-Player Overlay (Non-Blocking Controls)</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px] text-white/50">
                    <span>02:15 / 15:40</span>
                    <span>Timeline & Controls</span>
                  </div>
                </div>

                {previewPlacement === 'PLAYER_BOTTOM' && (
                  <div className="rounded-xl border border-indigo-500/50 bg-indigo-950/40 p-2.5 text-center text-xs text-indigo-200">
                    <span className="font-bold">PLAYER BOTTOM AD</span> — Positioned below playback timeline
                  </div>
                )}

                {previewPlacement === 'UP_NEXT' && (
                  <div className="rounded-xl border border-cyan-500/50 bg-cyan-950/40 p-2.5 text-center text-xs text-cyan-200">
                    <span className="font-bold">UP NEXT AD</span> — Injected inside the queue drawer
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}
