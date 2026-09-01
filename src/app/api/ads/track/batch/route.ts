import { NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { isAdEventType, isAdPlacement } from '@/app/api/ads/serve/eligibility'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type BatchEvent = {
  campaignId: string
  creativeId: string
  placement: string
  eventType: string
  sessionId?: string
  videoId?: string
  createdAt?: string
}

/**
 * POST /api/ads/track/batch
 * Batch ingestion of offline-collected ad metrics when network connectivity returns.
 */
export async function POST(req: Request) {
  try {
    await ensureSchema()
    const body = (await req.json().catch(() => null)) as { events: BatchEvent[] } | null
    if (!body || !Array.isArray(body.events) || body.events.length === 0) {
      return NextResponse.json({ ok: true, count: 0 })
    }

    const validData = body.events
      .filter(
        (e) =>
          typeof e.campaignId === 'string' &&
          typeof e.creativeId === 'string' &&
          isAdPlacement(e.placement) &&
          isAdEventType(e.eventType)
      )
      .map((e) => ({
        campaignId: e.campaignId,
        creativeId: e.creativeId,
        placement: e.placement,
        eventType: e.eventType,
        sessionId: typeof e.sessionId === 'string' ? e.sessionId : null,
        videoId: typeof e.videoId === 'string' ? e.videoId : null,
        createdAt: e.createdAt ? new Date(e.createdAt) : new Date(),
      }))

    if (validData.length > 0) {
      await db.adEvent.createMany({
        data: validData,
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, count: validData.length })
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'Batch track failed' }, { status: 500 })
  }
}
