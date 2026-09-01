import { NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { requireAuth } from '@/lib/admin-auth'
import {
  ALL_PLACEMENTS,
  CAMPAIGN_MUTATION_ROLES,
  CAMPAIGN_PRIORITIES,
  CAMPAIGN_STATUSES,
  buildCreativeData,
  campaignStatsMap,
  toCampaignDTO,
  writeAudit,
  ZERO_STATS,
  type CreativeInput,
} from './utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function parseDateParam(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** GET /api/admin/campaigns — list all campaigns with aggregates. RBAC: SUPER_ADMIN | ADMIN | AD_MANAGER | VIEWER. */
export async function GET(req: Request) {
  try {
    await ensureSchema()
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [rows, stats] = await Promise.all([
      db.campaign.findMany({
        orderBy: { createdAt: 'desc' },
        include: { creatives: true },
      }).catch(() => []),
      campaignStatsMap().catch(() => new Map()),
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
    await ensureSchema()
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAMPAIGN_MUTATION_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'New Campaign'
    const advertiser = typeof body.advertiser === 'string' && body.advertiser.trim() ? body.advertiser.trim() : 'Advertiser'

    const status =
      typeof body.status === 'string' && CAMPAIGN_STATUSES.includes(body.status)
        ? body.status
        : 'ACTIVE'
    const priority =
      typeof body.priority === 'string' && CAMPAIGN_PRIORITIES.includes(body.priority)
        ? body.priority
        : 'MEDIUM'

    let startAt = parseDateParam(body.startAt) ?? new Date()
    let endAt = parseDateParam(body.endAt) ?? new Date(Date.now() + 30 * 864e5)
    if (endAt <= startAt) {
      endAt = new Date(startAt.getTime() + 30 * 864e5)
    }

    const frequencyCap =
      typeof body.frequencyCap === 'number' && Number.isFinite(body.frequencyCap)
        ? Math.max(1, Math.round(body.frequencyCap))
        : 2

    const placements = Array.isArray(body.placements)
      ? body.placements.filter(
          (p): p is string => typeof p === 'string' && (ALL_PLACEMENTS as string[]).includes(p)
        )
      : ['BANNER', 'PRE_ROLL']

    const creativesInput = Array.isArray(body.creatives) ? (body.creatives as CreativeInput[]) : []
    const creativesData = creativesInput.map((raw) => buildCreativeData(raw)).filter((c): c is NonNullable<ReturnType<typeof buildCreativeData>> => !!c)

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
