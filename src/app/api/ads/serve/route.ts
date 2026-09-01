import { NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import type { AdPlacement } from '@/lib/types'
import {
  allowedCreativeTypes,
  byPriorityDesc,
  getSettings,
  isAdPlacement,
  placementFlags,
  toServedAd,
} from './eligibility'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const HOUR_MS = 60 * 60 * 1000

/**
 * GET /api/ads/serve?placement=&sessionId=&videoId=&videoDuration=
 * Serves the highest-priority eligible creative for a placement:
 * kill switches → session caps → active campaigns → per-campaign frequency caps → creative type match.
 */
export async function GET(req: Request) {
  try {
    await ensureSchema()
    const url = new URL(req.url)
    const placementParam = url.searchParams.get('placement')
    if (!isAdPlacement(placementParam)) {
      return NextResponse.json({ error: 'Invalid placement' }, { status: 400 })
    }
    const placement: AdPlacement = placementParam
    const sessionId = url.searchParams.get('sessionId')
    const videoDuration = Number(url.searchParams.get('videoDuration') ?? NaN)

    // 1. Master + per-placement kill switches
    const settings = await getSettings()
    if (!settings.adsEnabled || !placementFlags(settings)[placement]) {
      return NextResponse.json({ ad: null })
    }

    // 2. Mid-rolls only for long-enough videos
    if (
      placement === 'MID_ROLL' &&
      Number.isFinite(videoDuration) &&
      videoDuration < settings.minMidRollDurationSec
    ) {
      return NextResponse.json({ ad: null })
    }

    const now = new Date()
    const hourAgo = new Date(now.getTime() - HOUR_MS)

    // 3. Global session cap (impressions for this session in the last hour)
    if (sessionId) {
      const sessionImpressions = await db.adEvent.count({
        where: { eventType: 'IMPRESSION', sessionId, createdAt: { gte: hourAgo } },
      })
      if (sessionImpressions >= settings.adsPerSession) {
        return NextResponse.json({ ad: null })
      }

      // Overlay-specific hourly cap
      if (placement === 'OVERLAY') {
        const overlayImpressions = await db.adEvent.count({
          where: {
            eventType: 'IMPRESSION',
            sessionId,
            placement: 'OVERLAY',
            createdAt: { gte: hourAgo },
          },
        })
        if (overlayImpressions >= settings.overlayPerHour) {
          return NextResponse.json({ ad: null })
        }
      }
    }

    // 4. Candidate campaigns: ACTIVE, in flight window, targeting this placement
    const campaigns = await db.campaign.findMany({
      where: {
        status: 'ACTIVE',
        startAt: { lte: now },
        endAt: { gte: now },
      },
      include: { creatives: true },
    })

    const candidates = campaigns
      .filter((c) => {
        if (!c.placements || c.placements.trim() === '') return true
        const list = c.placements.split(',').map((p) => p.trim())
        return list.includes(placement) || list.includes('ALL')
      })
      .sort((a, b) => {
        const diff = byPriorityDesc(a, b)
        return diff !== 0 ? diff : Math.random() - 0.5
      })

    const types = allowedCreativeTypes(placement)

    // 5-6. Per-campaign frequency cap, then pick a random matching creative
    for (const campaign of candidates) {
      if (sessionId) {
        const campaignImpressions = await db.adEvent.count({
          where: {
            eventType: 'IMPRESSION',
            sessionId,
            campaignId: campaign.id,
            createdAt: { gte: hourAgo },
          },
        })
        if (campaignImpressions >= campaign.frequencyCap) continue
      }

      const matching = campaign.creatives.filter((c) => types.includes(c.type))
      if (matching.length === 0) continue

      const creative = matching[Math.floor(Math.random() * matching.length)]
      return NextResponse.json(
        { ad: toServedAd(campaign, creative, placement) },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      )
    }

    return NextResponse.json(
      { ad: null },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    )
  } catch (err) {
    console.error('GET /api/ads/serve failed:', err)
    return NextResponse.json({ error: 'Ad serving failed' }, { status: 500 })
  }
}
