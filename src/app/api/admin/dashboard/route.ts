import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/admin-auth'
import type { DashboardDTO, DailyStatDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function dayKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10)
}

/**
 * GET /api/admin/dashboard — REAL-TIME analytics computed directly from
 * actual player + ad events (no pre-aggregated/fake DailyStat rows):
 *  - Viewer metrics from AdEvent.sessionId ∪ HistoryEntry.sessionId
 *  - Playback metrics from HistoryEntry (videos played, watch time, sessions)
 *  - Ad metrics from AdEvent (impressions/starts/completions/skips/errors)
 *  - 30-day daily charts bucketed in JS; placement split from real impressions
 *  - Latest audit entries
 */
export async function GET(req: Request) {
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const now = new Date()
    const today = startOfDay(now)
    const since30 = new Date(today.getTime() - 29 * DAY_MS)
    const since7 = new Date(today.getTime() - 6 * DAY_MS)

    const [adRows, historyRows, recentAuditRows] = await Promise.all([
      db.adEvent.findMany({
        select: { eventType: true, placement: true, sessionId: true, createdAt: true },
      }),
      db.historyEntry.findMany({
        select: { position: true, sessionId: true, lastPlayedAt: true },
      }),
      db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    ])

    // ── Viewer sessions (union of ad + playback sessions) ──
    const firstSeen = new Map<string, number>() // sessionId -> earliest activity (ms)
    const touch = (sessionId: string | null, at: Date) => {
      if (!sessionId) return
      const t = at.getTime()
      const prev = firstSeen.get(sessionId)
      if (prev === undefined || t < prev) firstSeen.set(sessionId, t)
    }
    for (const e of adRows) touch(e.sessionId, e.createdAt)
    for (const h of historyRows) touch(h.sessionId, h.lastPlayedAt)

    const allViewers = firstSeen.size

    // active = any activity in the last 7 days
    const recentSessions = new Set<string>()
    for (const e of adRows) {
      if (e.sessionId && e.createdAt.getTime() >= since7.getTime()) recentSessions.add(e.sessionId)
    }
    for (const h of historyRows) {
      if (h.sessionId && h.lastPlayedAt.getTime() >= since7.getTime()) recentSessions.add(h.sessionId)
    }
    const active7 = recentSessions.size
    // new = sessions whose very first activity is within the last 7 days
    let new7 = 0
    for (const first of firstSeen.values()) {
      if (first >= since7.getTime()) new7 += 1
    }

    // ── Playback totals ──
    const videosPlayed = historyRows.length
    const watchTimeSec = historyRows.reduce((acc, h) => acc + h.position, 0)
    const playbackSessions = new Set(historyRows.map((h) => h.sessionId).filter(Boolean)).size

    // ── Ad totals (all-time, real events) ──
    const adCounts = { IMPRESSION: 0, START: 0, COMPLETE: 0, SKIP: 0, ERROR: 0 }
    const placementSplitMap = new Map<string, number>()
    for (const e of adRows) {
      if (e.eventType in adCounts) adCounts[e.eventType as keyof typeof adCounts] += 1
      if (e.eventType === 'IMPRESSION') {
        placementSplitMap.set(e.placement, (placementSplitMap.get(e.placement) ?? 0) + 1)
      }
    }

    // ── 30-day daily buckets ──
    const days: { key: string; date: Date }[] = []
    for (let i = 0; i < 30; i++) {
      const d = new Date(since30.getTime() + i * DAY_MS)
      days.push({ key: dayKey(d), date: d })
    }
    const dayIndex = new Map(days.map((d, i) => [d.key, i]))

    type Bucket = {
      adEvents: { type: string; session: string | null }[]
      historyRows: { position: number; session: string | null }[]
    }
    const buckets: Bucket[] = days.map(() => ({ adEvents: [], historyRows: [] }))
    for (const e of adRows) {
      const i = dayIndex.get(dayKey(e.createdAt))
      if (i !== undefined) buckets[i].adEvents.push({ type: e.eventType, session: e.sessionId })
    }
    for (const h of historyRows) {
      const i = dayIndex.get(dayKey(h.lastPlayedAt))
      if (i !== undefined) buckets[i].historyRows.push({ position: h.position, session: h.sessionId })
    }

    let cumulativeViewers = 0
    const daily: DailyStatDTO[] = days.map((d, i) => {
      const b = buckets[i]

      const adSessions = new Set<string>()
      let impressions = 0,
        starts = 0,
        completions = 0,
        skips = 0,
        errors = 0
      for (const ev of b.adEvents) {
        if (ev.session) adSessions.add(ev.session)
        if (ev.type === 'IMPRESSION') impressions += 1
        else if (ev.type === 'START') starts += 1
        else if (ev.type === 'COMPLETE') completions += 1
        else if (ev.type === 'SKIP') skips += 1
        else if (ev.type === 'ERROR') errors += 1
      }

      const playSessions = new Set<string>()
      let videos = 0,
        watch = 0
      for (const h of b.historyRows) {
        if (h.session) playSessions.add(h.session)
        videos += 1
        watch += h.position
      }

      // viewers active this day (ad + playback union)
      const activeDay = new Set<string>([...adSessions, ...playSessions])
      // "new" this day = sessions whose very first activity falls on this day
      let newDay = 0
      for (const s of activeDay) {
        const first = firstSeen.get(s)
        if (first !== undefined && dayKey(new Date(first)) === d.key) newDay += 1
      }
      cumulativeViewers = countViewersUpTo(days[i].key, firstSeen)

      return {
        date: d.date.toISOString(),
        totalUsers: cumulativeViewers,
        activeUsers: activeDay.size,
        newUsers: newDay,
        playbackSessions: playSessions.size,
        videosPlayed: videos,
        watchTimeMin: Math.round(watch / 60),
        adImpressions: impressions,
        adStarts: starts,
        adCompletions: completions,
        adSkips: skips,
        adErrors: errors,
      }
    })

    const dashboard: DashboardDTO = {
      cards: {
        totalUsers: allViewers,
        activeUsers: active7,
        newUsers: new7,
        videosPlayed,
        sessions: playbackSessions,
        watchTimeMin: Math.round(watchTimeSec / 60),
        adImpressions: adCounts.IMPRESSION,
        adStarts: adCounts.START,
        adCompletions: adCounts.COMPLETE,
        adSkips: adCounts.SKIP,
        adErrors: adCounts.ERROR,
      },
      charts: {
        daily,
        adDaily: days.map((d, i) => {
          let impressions = 0,
            completions = 0,
            skips = 0
          for (const ev of buckets[i].adEvents) {
            if (ev.type === 'IMPRESSION') impressions += 1
            else if (ev.type === 'COMPLETE') completions += 1
            else if (ev.type === 'SKIP') skips += 1
          }
          return { date: d.date.toISOString(), impressions, completions, skips }
        }),
        placementSplit: Array.from(placementSplitMap.entries())
          .map(([placement, impressions]) => ({ placement, impressions }))
          .sort((a, b) => b.impressions - a.impressions),
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

/** Count distinct viewers whose first activity is on/before the given day key. */
function countViewersUpTo(dayKeyCutoff: string, firstSeen: Map<string, number>): number {
  let n = 0
  for (const first of firstSeen.values()) {
    if (dayKey(new Date(first)) <= dayKeyCutoff) n += 1
  }
  return n
}
