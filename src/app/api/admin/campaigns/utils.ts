// Shared helpers for the admin campaigns routes (non-route module).
import { db } from '@/lib/db'
import type { Campaign, Creative } from '@prisma/client'
import type { AdPlacement, CampaignDTO, CreativeDTO } from '@/lib/types'

export const CAMPAIGN_MUTATION_ROLES = ['SUPER_ADMIN', 'ADMIN', 'AD_MANAGER']
export const SETTINGS_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN']
export const CAMPAIGN_STATUSES = ['ACTIVE', 'PAUSED', 'EXPIRED', 'DRAFT']
export const CAMPAIGN_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW']
export const CREATIVE_TYPES = ['VIDEO', 'IMAGE', 'OVERLAY', 'BANNER', 'TEXT']
export const ALL_PLACEMENTS = ['PRE_ROLL', 'MID_ROLL', 'POST_ROLL', 'OVERLAY', 'BANNER']

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
  const user = await db.adminUser.findUnique({
    where: { email: adminEmail },
    select: { name: true },
  })
  await db.auditLog.create({
    data: { adminName: user?.name ?? adminEmail, adminEmail, action, target, detail },
  })
}
