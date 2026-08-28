import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/admin-auth'
import type { DashboardDTO, DailyStatDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/admin/dashboard — 30-day KPI cards, charts and latest audit entries. */
export async function GET(req: Request) {
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const since = new Date()
    since.setDate(since.getDate() - 29)
    since.setHours(0, 0, 0, 0)

    const [stats, placementGroups, recentAuditRows] = await Promise.all([
      db.dailyStat.findMany({ where: { date: { gte: since } }, orderBy: { date: 'asc' } }),
      db.adEvent.groupBy({
        by: ['placement'],
        where: { eventType: 'IMPRESSION' },
        _count: { placement: true },
      }),
      db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    ])

    const latest = stats.length > 0 ? stats[stats.length - 1] : null
    const sum = (pick: (s: (typeof stats)[number]) => number) =>
      stats.reduce((acc, s) => acc + pick(s), 0)

    const daily: DailyStatDTO[] = stats.map((s) => ({
      date: s.date.toISOString(),
      totalUsers: s.totalUsers,
      activeUsers: s.activeUsers,
      newUsers: s.newUsers,
      playbackSessions: s.playbackSessions,
      videosPlayed: s.videosPlayed,
      watchTimeMin: s.watchTimeMin,
      adImpressions: s.adImpressions,
      adStarts: s.adStarts,
      adCompletions: s.adCompletions,
      adSkips: s.adSkips,
      adErrors: s.adErrors,
    }))

    const dashboard: DashboardDTO = {
      cards: {
        totalUsers: latest?.totalUsers ?? 0,
        activeUsers: sum((s) => s.activeUsers),
        newUsers: sum((s) => s.newUsers),
        videosPlayed: sum((s) => s.videosPlayed),
        sessions: sum((s) => s.playbackSessions),
        watchTimeMin: sum((s) => s.watchTimeMin),
        adImpressions: sum((s) => s.adImpressions),
        adStarts: sum((s) => s.adStarts),
        adCompletions: sum((s) => s.adCompletions),
        adSkips: sum((s) => s.adSkips),
        adErrors: sum((s) => s.adErrors),
      },
      charts: {
        daily,
        adDaily: stats.map((s) => ({
          date: s.date.toISOString(),
          impressions: s.adImpressions,
          completions: s.adCompletions,
          skips: s.adSkips,
        })),
        placementSplit: placementGroups.map((g) => ({
          placement: g.placement,
          impressions: g._count.placement,
        })),
      },
      recentAudit: recentAuditRows.map((a) => ({
        id: a.id,
        adminName: a.adminName,
        adminEmail: a.adminEmail,
        action: a.action,
        target: a.target,
        detail: a.detail,
        createdAt: a.createdAt.toISOString(),
      })),
    }

    return NextResponse.json(dashboard)
  } catch (err) {
    console.error('GET /api/admin/dashboard failed:', err)
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}
