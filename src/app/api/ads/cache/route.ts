import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { ServedAd } from '@/lib/types'
import {
  PLACEMENTS,
  allowedCreativeTypes,
  getSettings,
  placementFlags,
  toServedAd,
} from '../serve/eligibility'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/ads/cache
 * Bundle of ALL eligible ads (ACTIVE campaigns within their flight window — no session caps)
 * flattened to ServedAd, for offline caching. Expires in 24h.
 */
export async function GET() {
  try {
    const settings = await getSettings()
    const now = new Date()

    const campaigns = await db.campaign.findMany({
      where: { status: 'ACTIVE', startAt: { lte: now }, endAt: { gte: now } },
      include: { creatives: true },
    })

    const flags = placementFlags(settings)
    const ads: ServedAd[] = []

    for (const placement of PLACEMENTS) {
      // Never cache ads for placements that are currently switched off.
      if (!settings.adsEnabled || !flags[placement]) continue

      const types = allowedCreativeTypes(placement)
      for (const campaign of campaigns) {
        const list = (campaign.placements || '').split(',').map((p) => p.trim())
        if (list.length > 0 && !list.includes(placement) && !list.includes('ALL')) continue
        for (const creative of campaign.creatives) {
          if (!types.includes(creative.type)) continue
          ads.push(toServedAd(campaign, creative, placement))
        }
      }
    }

    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    return NextResponse.json({ version: settings.adCacheVersion, expiresAt, ads })
  } catch (err) {
    console.error('GET /api/ads/cache failed:', err)
    return NextResponse.json({ error: 'Failed to build ad cache' }, { status: 500 })
  }
}
