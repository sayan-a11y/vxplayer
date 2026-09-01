// VX Player ad engine — shared eligibility helpers for /api/ads/*
// (server only; imported by the serve, cache and track routes)

import { db } from '@/lib/db'
import type { AppSettings, Campaign, Creative } from '@prisma/client'
import type { AdEventType, AdPlacement, ServedAd } from '@/lib/types'

export const PLACEMENTS: readonly AdPlacement[] = [
  'HERO',
  'PRE_ROLL',
  'MID_ROLL',
  'POST_ROLL',
  'OVERLAY',
  'BANNER',
  'FOOTER',
]

export function isAdPlacement(v: string | null | undefined): v is AdPlacement {
  return !!v && (PLACEMENTS as readonly string[]).includes(v)
}

export const VALID_EVENT_TYPES: readonly AdEventType[] = [
  'IMPRESSION',
  'START',
  'Q25',
  'Q50',
  'Q75',
  'COMPLETE',
  'SKIP',
  'CLICK',
  'ERROR',
]

export function isAdEventType(v: unknown): v is AdEventType {
  return typeof v === 'string' && (VALID_EVENT_TYPES as readonly string[]).includes(v)
}

export const PRIORITY_RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }

/** Creative types eligible per placement (API contract). */
export function allowedCreativeTypes(placement: AdPlacement): string[] {
  switch (placement) {
    case 'HERO':
      // Dedicated Hero slot serves video (autoplaying muted) and image creatives
      return ['VIDEO', 'IMAGE', 'BANNER', 'TEXT']
    case 'PRE_ROLL':
    case 'MID_ROLL':
    case 'POST_ROLL':
      // Video rolls also serve IMAGE creatives as timed display spots.
      return ['VIDEO', 'IMAGE']
    case 'OVERLAY':
      return ['IMAGE', 'OVERLAY', 'TEXT']
    case 'BANNER':
      // Banner slot serves images, text cards, and display banners outside video playback.
      return ['IMAGE', 'BANNER', 'TEXT', 'VIDEO']
    case 'FOOTER':
      return ['IMAGE', 'BANNER', 'TEXT', 'OVERLAY', 'VIDEO']
  }
}

/** Per-placement kill switch map from the settings singleton. */
export function placementFlags(s: AppSettings): Record<AdPlacement, boolean> {
  return {
    HERO: (s as any).heroEnabled ?? true,
    PRE_ROLL: s.preRollEnabled,
    MID_ROLL: s.midRollEnabled,
    POST_ROLL: s.postRollEnabled,
    OVERLAY: s.overlayEnabled,
    BANNER: s.bannerEnabled,
    FOOTER: (s as any).footerEnabled ?? true,
  }
}

/** Fetch (or lazily create) the settings singleton row. */
export async function getSettings(): Promise<AppSettings> {
  const existing = await db.appSettings.findUnique({ where: { id: 'singleton' } })
  if (existing) return existing
  return db.appSettings.create({ data: { id: 'singleton' } })
}

/** Flatten a campaign+creative pair into the contract ServedAd shape. */
export function toServedAd(
  campaign: Campaign,
  creative: Creative,
  placement: AdPlacement
): ServedAd {
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    advertiser: campaign.advertiser,
    priority: campaign.priority,
    placement,
    creativeId: creative.id,
    creativeName: creative.name,
    type: creative.type as ServedAd['type'],
    mediaUrl: creative.mediaUrl,
    duration: creative.duration,
    skipAfter: creative.skipAfter,
    position: (creative.position as ServedAd['position']) ?? null,
    headline: creative.headline,
    bodyText: creative.bodyText,
    ctaText: creative.ctaText,
    ctaUrl: creative.ctaUrl,
  }
}

/** Sort campaigns by priority HIGH > MEDIUM > LOW (stable for equal priority). */
export function byPriorityDesc(a: Campaign, b: Campaign): number {
  return (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3)
}
