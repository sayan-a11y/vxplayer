import { NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { requireAuth } from '@/lib/admin-auth'
import type { AnalyticsDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FUNNEL_STEPS: { key: string; label: string }[] = [
  { key: 'IMPRESSION', label: 'Impressions' },
  { key: 'START', label: 'Starts' },
  { key: 'Q25', label: '25% watched' },
  { key: 'Q50', label: '50% watched' },
  { key: 'Q75', label: '75% watched' },
  { key: 'COMPLETE', label: 'Completed' },
]

/** GET /api/admin/analytics — ad event totals, funnel, daily trend, placement & campaign splits. */
export async function GET(req: Request) {
  try {
    await ensureSchema()
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [eventGroups, placementGroups, campaignGroups, campaigns, dailyStats] =
      await Promise.all([
        db.adEvent.groupBy({ by: ['eventType'], _count: { _all: true } }).catch(() => []),
        db.adEvent.groupBy({ by: ['placement', 'eventType'], _count: { _all: true } }).catch(() => []),
        db.adEvent.groupBy({ by: ['campaignId', 'eventType'], _count: { _all: true } }).catch(() => []),
        db.campaign.findMany({ select: { id: true, name: true } }).catch(() => []),
        db.dailyStat.findMany({ orderBy: { date: 'asc' } }).catch(() => []),
      ])

    // ── Totals across all events ──
    const totals = { impressions: 0, starts: 0, q25: 0, q50: 0, q75: 0, completions: 0, skips: 0, clicks: 0, errors: 0 }
    for (const g of eventGroups) {
      const n = g._count._all
      switch (g.eventType) {
        case 'IMPRESSION': totals.impressions += n; break
        case 'START': totals.starts += n; break
        case 'Q25': totals.q25 += n; break
        case 'Q50': totals.q50 += n; break
        case 'Q75': totals.q75 += n; break
        case 'COMPLETE': totals.completions += n; break
        case 'SKIP': totals.skips += n; break
        case 'CLICK': totals.clicks += n; break
        case 'ERROR': totals.errors += n; break
      }
    }
    const completionRate = totals.starts > 0 ? Math.round((totals.completions / totals.starts) * 100) : 0

    // ── Funnel (sequential quartile stages) ──
    const totalsMap: Record<string, number> = {
      IMPRESSION: totals.impressions,
      START: totals.starts,
      Q25: totals.q25,
      Q50: totals.q50,
      Q75: totals.q75,
      COMPLETE: totals.completions,
    }
    const funnel: AnalyticsDTO['funnel'] = FUNNEL_STEPS.map((s) => ({
      label: s.label,
      value: totalsMap[s.key] ?? 0,
    }))

    // ── Daily trend (last 30 DailyStat rows, ascending) ──
    const byDay = dailyStats.slice(-30).map((s) => ({
      date: s.date.toISOString(),
      impressions: s.adImpressions,
      completions: s.adCompletions,
      skips: s.adSkips,
    }))

    // ── Placement × event split ──
    const placementMap = new Map<string, { impressions: number; completions: number; skips: number }>()
    for (const g of placementGroups) {
      const entry = placementMap.get(g.placement) ?? { impressions: 0, completions: 0, skips: 0 }
      if (g.eventType === 'IMPRESSION') entry.impressions += g._count._all
      else if (g.eventType === 'COMPLETE') entry.completions += g._count._all
      else if (g.eventType === 'SKIP') entry.skips += g._count._all
      placementMap.set(g.placement, entry)
    }
    const byPlacement = [...placementMap.entries()]
      .map(([placement, v]) => ({ placement, ...v }))
      .sort((a, b) => b.impressions - a.impressions)

    // ── Per-campaign performance ──
    const campaignNameById = new Map<string, string>()
    for (const c of (campaigns as { id: string; name: string }[])) {
      if (c && typeof c.id === 'string') {
        campaignNameById.set(c.id, c.name ?? 'Campaign')
      }
    }
    const campaignMap = new Map<
      string,
      { impressions: number; starts: number; completions: number; skips: number }
    >()
    for (const g of campaignGroups) {
      if (!g.campaignId) continue
      const entry =
        campaignMap.get(g.campaignId) ?? { impressions: 0, starts: 0, completions: 0, skips: 0 }
      if (g.eventType === 'IMPRESSION') entry.impressions += g._count._all
      else if (g.eventType === 'START') entry.starts += g._count._all
      else if (g.eventType === 'COMPLETE') entry.completions += g._count._all
      else if (g.eventType === 'SKIP') entry.skips += g._count._all
      campaignMap.set(g.campaignId, entry)
    }
    const byCampaign: AnalyticsDTO['byCampaign'] = [...campaignMap.entries()]
      .map(([campaignId, v]) => ({
        campaignId,
        campaignName: campaignNameById.get(campaignId) ?? 'Unknown campaign',
        ...v,
        completionRate: v.starts > 0 ? Math.round((v.completions / v.starts) * 100) : 0,
      }))
      .sort((a, b) => b.impressions - a.impressions)

    const payload: AnalyticsDTO = {
      totals: { ...totals, completionRate },
      funnel,
      byDay,
      byPlacement,
      byCampaign,
    }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('GET /api/admin/analytics failed:', err)
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 })
  }
}
