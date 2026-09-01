// Shared helpers for the admin campaigns routes (non-route module).
import { db } from '@/lib/db'
import type { Campaign, Creative } from '@prisma/client'
import type { AdPlacement, CampaignDTO, CreativeDTO } from '@/lib/types'

export const CAMPAIGN_MUTATION_ROLES = ['SUPER_ADMIN', 'ADMIN', 'AD_MANAGER']
export const SETTINGS_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN']
export const CAMPAIGN_STATUSES = ['ACTIVE', 'PAUSED', 'EXPIRED', 'DRAFT']
export const CAMPAIGN_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW']
export const CREATIVE_TYPES = ['VIDEO', 'IMAGE', 'OVERLAY', 'BANNER', 'TEXT']
export const ALL_PLACEMENTS = [
  'HERO',
  'PRE_ROLL',
  'MID_ROLL',
  'POST_ROLL',
  'VIDEO_OVERLAY',
  'IMAGE_OVERLAY',
  'BANNER',
  'FOOTER',
  'HOME_FEED',
  'BETWEEN_CARDS',
  'UP_NEXT',
  'PLAYER_BOTTOM',
  'OVERLAY',
]

export function parsePlacementsCsv(csv: string): AdPlacement[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is AdPlacement => (ALL_PLACEMENTS as string[]).includes(s))
}

export function toCreativeDTO(c: Creative): CreativeDTO {
  return {
    id: c.id,
    campaignId: c.campaignId,
    name: c.name,
    type: c.type as CreativeDTO['type'],
    mediaUrl: c.mediaUrl,
    duration: c.duration,
    skipAfter: c.skipAfter,
    position: (c.position as CreativeDTO['position']) ?? null,
    headline: c.headline,
    bodyText: c.bodyText,
    ctaText: c.ctaText,
    ctaUrl: c.ctaUrl,
  }
}

export type CampaignEventStats = {
  impressions: number
  starts: number
  completions: number
  skips: number
  errors: number
}

export function toCampaignDTO(
  c: Campaign & { creatives: Creative[] },
  stats?: CampaignEventStats & { completionRate?: number }
): CampaignDTO {
  const completionRate =
    stats && stats.completionRate !== undefined
      ? stats.completionRate
      : stats && stats.starts > 0
        ? Math.round((stats.completions / stats.starts) * 100)
        : 0
  return {
    id: c.id,
    name: c.name,
    advertiser: c.advertiser,
    status: c.status as CampaignDTO['status'],
    startAt: c.startAt.toISOString(),
    endAt: c.endAt.toISOString(),
    priority: c.priority as CampaignDTO['priority'],
    frequencyCap: c.frequencyCap,
    placements: parsePlacementsCsv(c.placements),
    createdAt: c.createdAt.toISOString(),
    creatives: c.creatives.map(toCreativeDTO),
    stats: stats ? { ...stats, completionRate } : undefined,
  }
}

/** Aggregate AdEvent counts per campaign from a single groupBy query. */
export async function campaignStatsMap(): Promise<Map<string, CampaignEventStats>> {
  const groups = await db.adEvent.groupBy({
    by: ['campaignId', 'eventType'],
    _count: { _all: true },
  })
  const map = new Map<string, CampaignEventStats>()
  for (const g of groups) {
    const s =
      map.get(g.campaignId) ?? { impressions: 0, starts: 0, completions: 0, skips: 0, errors: 0 }
    const n = g._count._all
    if (g.eventType === 'IMPRESSION') s.impressions += n
    else if (g.eventType === 'START') s.starts += n
    else if (g.eventType === 'COMPLETE') s.completions += n
    else if (g.eventType === 'SKIP') s.skips += n
    else if (g.eventType === 'ERROR') s.errors += n
    map.set(g.campaignId, s)
  }
  return map
}

export const ZERO_STATS: CampaignEventStats & { completionRate: number } = {
  impressions: 0,
  starts: 0,
  completions: 0,
  skips: 0,
  errors: 0,
  completionRate: 0,
}

/** Write an audit log entry, resolving the admin's display name from their email. */
export async function writeAudit(
  adminEmail: string,
  action: string,
  target: string | null,
  detail: string
): Promise<void> {
  try {
    const user = await db.adminUser.findUnique({
      where: { email: adminEmail },
      select: { name: true },
    }).catch(() => null)
    await db.auditLog.create({
      data: { adminName: user?.name ?? adminEmail, adminEmail, action, target, detail },
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}

// ── Creative payload validation (shared by POST create and PATCH update) ──

export type CreativeInput = {
  name?: unknown
  type?: unknown
  mediaUrl?: unknown
  duration?: unknown
  skipAfter?: unknown
  position?: unknown
  headline?: unknown
  bodyText?: unknown
  ctaText?: unknown
  ctaUrl?: unknown
}

export type CreativeData = {
  name: string
  type: string
  mediaUrl: string | null
  duration: number
  skipAfter: number
  position: string | null
  headline: string | null
  bodyText: string | null
  ctaText: string | null
  ctaUrl: string | null
}

/** Validate one creative payload with automatic safe defaults. */
export function buildCreativeData(raw: CreativeInput): CreativeData {
  const opt = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Ad Creative'
  const type = typeof raw.type === 'string' && CREATIVE_TYPES.includes(raw.type) ? raw.type : 'VIDEO'

  return {
    name,
    type,
    mediaUrl: opt(raw.mediaUrl),
    duration: typeof raw.duration === 'number' && raw.duration >= 0 ? Math.round(raw.duration) : 15,
    skipAfter: typeof raw.skipAfter === 'number' ? Math.round(raw.skipAfter) : 5,
    position:
      raw.position === 'TOP' || raw.position === 'BOTTOM' || raw.position === 'CENTER'
        ? raw.position
        : null,
    headline: opt(raw.headline),
    bodyText: opt(raw.bodyText),
    ctaText: opt(raw.ctaText),
    ctaUrl: opt(raw.ctaUrl),
  }
}
