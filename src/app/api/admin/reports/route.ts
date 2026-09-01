import { NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { requireAuth } from '@/lib/admin-auth'
import type { ReportsDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/admin/reports?days=7|30 — summary report over a 7- or 30-day window. */
export async function GET(req: Request) {
  try {
    await ensureSchema()
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const raw = Number(new URL(req.url).searchParams.get('days') ?? '30')
    const days = raw === 7 ? 7 : 30

    const since = new Date()
    since.setDate(since.getDate() - (days - 1))
    since.setHours(0, 0, 0, 0)

    const [stats, eventGroups, campaigns] = await Promise.all([
      db.dailyStat.findMany({ where: { date: { gte: since } }, orderBy: { date: 'asc' } }).catch(() => []),
      db.adEvent.groupBy({
        by: ['campaignId', 'eventType'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }).catch(() => []),
      db.campaign.findMany({ select: { id: true, name: true, advertiser: true } }).catch(() => []),
    ])

    const sum = (pick: (s: (typeof stats)[number]) => number) =>
      stats.reduce((acc, s) => acc + pick(s), 0)

    const impressions = sum((s) => s.adImpressions)
    const starts = sum((s) => s.adStarts)
    const completions = sum((s) => s.adCompletions)
    const skips = sum((s) => s.adSkips)
    const errors = sum((s) => s.adErrors)

    const summary: ReportsDTO['summary'] = {
      days,
      impressions,
      starts,
      completions,
      skips,
      errors,
      completionRate: starts > 0 ? Math.round((completions / starts) * 100) : 0,
      watchTimeMin: sum((s) => s.watchTimeMin),
      sessions: sum((s) => s.playbackSessions),
    }

    const campaignMeta = new Map(campaigns.map((c) => [c.id, c]))
    const perCampaign = new Map<
      string,
      { impressions: number; completions: number; skips: number; starts: number }
    >()
    for (const g of eventGroups) {
      if (!g.campaignId) continue
      const entry =
        perCampaign.get(g.campaignId) ?? { impressions: 0, completions: 0, skips: 0, starts: 0 }
      if (g.eventType === 'IMPRESSION') entry.impressions += g._count._all
      else if (g.eventType === 'COMPLETE') entry.completions += g._count._all
      else if (g.eventType === 'SKIP') entry.skips += g._count._all
      else if (g.eventType === 'START') entry.starts += g._count._all
      perCampaign.set(g.campaignId, entry)
    }

    const topCampaigns: ReportsDTO['topCampaigns'] = [...perCampaign.entries()]
      .map(([campaignId, v]) => {
        const meta = campaignMeta.get(campaignId)
        return {
          campaignId,
          campaignName: meta?.name ?? 'Unknown campaign',
          advertiser: meta?.advertiser ?? '—',
          impressions: v.impressions,
          completions: v.completions,
          skips: v.skips,
          completionRate: v.starts > 0 ? Math.round((v.completions / v.starts) * 100) : 0,
        }
      })
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5)

    const byDay: ReportsDTO['byDay'] = stats.map((s) => ({
      date: s.date.toISOString(),
      impressions: s.adImpressions,
      completions: s.adCompletions,
      skips: s.adSkips,
    }))

    const payload: ReportsDTO = { summary, topCampaigns, byDay }
    return NextResponse.json(payload)
  } catch (err) {
    console.error('GET /api/admin/reports failed:', err)
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 })
  }
}
