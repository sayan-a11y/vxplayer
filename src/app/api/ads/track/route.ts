import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdEventType, isAdPlacement } from '../serve/eligibility'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/ads/track
 * Records a single ad event: { campaignId, creativeId, placement, eventType, sessionId, videoId? }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

    const { campaignId, creativeId, placement, eventType, sessionId, videoId } = body

    if (typeof campaignId !== 'string' || typeof creativeId !== 'string') {
      return NextResponse.json(
        { error: 'campaignId and creativeId are required' },
        { status: 400 }
      )
    }
    if (typeof placement !== 'string' || !isAdPlacement(placement)) {
      return NextResponse.json({ error: 'Invalid placement' }, { status: 400 })
    }
    if (!isAdEventType(eventType)) {
      return NextResponse.json({ error: 'Invalid eventType' }, { status: 400 })
    }

    await db.adEvent.create({
      data: {
        campaignId,
        creativeId,
        placement,
        eventType,
        sessionId: typeof sessionId === 'string' && sessionId ? sessionId : null,
        videoId: typeof videoId === 'string' && videoId ? videoId : null,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/ads/track failed:', err)
    return NextResponse.json({ error: 'Failed to track ad event' }, { status: 500 })
  }
}
