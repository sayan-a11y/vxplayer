import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/admin-auth'
import {
  ALL_PLACEMENTS,
  CAMPAIGN_MUTATION_ROLES,
  buildCreativeData,
  type CreativeInput,
  CAMPAIGN_PRIORITIES,
  CAMPAIGN_STATUSES,
  CREATIVE_TYPES,
  ZERO_STATS,
  campaignStatsMap,
  toCampaignDTO,
  writeAudit,
} from './utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/admin/campaigns — all campaigns with creatives and aggregated ad stats. */
export async function GET(req: Request) {
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [rows, stats] = await Promise.all([
      db.campaign.findMany({ orderBy: { createdAt: 'desc' }, include: { creatives: true } }),
      campaignStatsMap(),
    ])

    return NextResponse.json({
      campaigns: rows.map((c) => toCampaignDTO(c, stats.get(c.id) ?? ZERO_STATS)),
    })
  } catch (err) {
    console.error('GET /api/admin/campaigns failed:', err)
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 })
  }
}

/** POST /api/admin/campaigns — create a campaign (optionally with creatives). RBAC: SUPER_ADMIN | ADMIN | AD_MANAGER. */
export async function POST(req: Request) {
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAMPAIGN_MUTATION_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const advertiser = typeof body.advertiser === 'string' ? body.advertiser.trim() : ''
    if (!name || !advertiser) {
      return NextResponse.json({ error: 'name and advertiser are required' }, { status: 400 })
    }

    const status =
      typeof body.status === 'string' && CAMPAIGN_STATUSES.includes(body.status)
        ? body.status
        : 'ACTIVE'
    const priority =
      typeof body.priority === 'string' && CAMPAIGN_PRIORITIES.includes(body.priority)
        ? body.priority
        : 'MEDIUM'

    const startAt = parseDateParam(body.startAt) ?? new Date()
    const endAt = parseDateParam(body.endAt) ?? new Date(Date.now() + 30 * 864e5)
    if (body.startAt !== undefined && !parseDateParam(body.startAt)) {
      return NextResponse.json({ error: 'startAt must be a valid date' }, { status: 400 })
    }
    if (body.endAt !== undefined && !parseDateParam(body.endAt)) {
      return NextResponse.json({ error: 'endAt must be a valid date' }, { status: 400 })
    }
    if (endAt <= startAt) {
      return NextResponse.json({ error: 'endAt must be after startAt' }, { status: 400 })
    }

    const frequencyCap =
      typeof body.frequencyCap === 'number' && Number.isFinite(body.frequencyCap)
        ? Math.max(1, Math.round(body.frequencyCap))
        : 2

    const placements = Array.isArray(body.placements)
      ? body.placements.filter(
          (p): p is string => typeof p === 'string' && (ALL_PLACEMENTS as string[]).includes(p)
        )
      : []

    const creativesInput = Array.isArray(body.creatives) ? (body.creatives as CreativeInput[]) : []
    const creativesData: { name: string; type: string; mediaUrl: string | null; duration: number; skipAfter: number; position: string | null; headline: string | null; bodyText: string | null; ctaText: string | null; ctaUrl: string | null }[] = []
    for (const raw of creativesInput) {
      const parsed = buildCreativeData(raw)
      if (!parsed) {
        return NextResponse.json(
          { error: 'Each creative requires a name and a valid type' },
          { status: 400 }
        )
      }
      creativesData.push(parsed)
    }

    const created = await db.campaign.create({
      data: {
        name,
        advertiser,
        status,
        startAt,
        endAt,
        priority,
        frequencyCap,
        placements: placements.join(','),
        creatives: { create: creativesData },
      },
      include: { creatives: true },
    })

    await db.appSettings
      .update({
        where: { id: 'singleton' },
        data: { adCacheVersion: { increment: 1 } },
      })
      .catch(() => {})

    await writeAudit(
      session.email,
      'CAMPAIGN_CREATED',
      name,
      `Created campaign "${name}" for ${advertiser} (status ${status}, priority ${priority}, ${creativesData.length} creative(s), placements: ${placements.join(', ') || 'none'})`
    )

    return NextResponse.json({ campaign: toCampaignDTO(created, ZERO_STATS) })
  } catch (err) {
    console.error('POST /api/admin/campaigns failed:', err)
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }
}

function parseDateParam(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
