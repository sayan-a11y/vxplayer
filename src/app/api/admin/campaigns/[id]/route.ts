import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/admin-auth'
import {
  ALL_PLACEMENTS,
  CAMPAIGN_MUTATION_ROLES,
  CAMPAIGN_PRIORITIES,
  CAMPAIGN_STATUSES,
  SETTINGS_ADMIN_ROLES,
  campaignStatsMap,
  toCampaignDTO,
  writeAudit,
  ZERO_STATS,
} from '../utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function parseDateParam(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** PATCH /api/admin/campaigns/[id] — partial update. RBAC: SUPER_ADMIN | ADMIN | AD_MANAGER. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAMPAIGN_MUTATION_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { id } = await params
    const existing = await db.campaign.findUnique({ where: { id }, include: { creatives: true } })
    if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

    const data: {
      name?: string
      advertiser?: string
      status?: string
      startAt?: Date
      endAt?: Date
      priority?: string
      frequencyCap?: number
      placements?: string
    } = {}

    if ('name' in body) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
      }
      data.name = body.name.trim()
    }
    if ('advertiser' in body) {
      if (typeof body.advertiser !== 'string' || !body.advertiser.trim()) {
        return NextResponse.json({ error: 'advertiser must be a non-empty string' }, { status: 400 })
      }
      data.advertiser = body.advertiser.trim()
    }
    if ('status' in body) {
      if (typeof body.status !== 'string' || !CAMPAIGN_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      data.status = body.status
    }
    if ('priority' in body) {
      if (typeof body.priority !== 'string' || !CAMPAIGN_PRIORITIES.includes(body.priority)) {
        return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
      }
      data.priority = body.priority
    }
    if ('startAt' in body) {
      const d = parseDateParam(body.startAt)
      if (!d) return NextResponse.json({ error: 'startAt must be a valid date' }, { status: 400 })
      data.startAt = d
    }
    if ('endAt' in body) {
      const d = parseDateParam(body.endAt)
      if (!d) return NextResponse.json({ error: 'endAt must be a valid date' }, { status: 400 })
      data.endAt = d
    }
    if (data.startAt && data.endAt && data.endAt <= data.startAt) {
      return NextResponse.json({ error: 'endAt must be after startAt' }, { status: 400 })
    }
    if ('frequencyCap' in body) {
      if (typeof body.frequencyCap !== 'number' || !Number.isFinite(body.frequencyCap)) {
        return NextResponse.json({ error: 'frequencyCap must be a number' }, { status: 400 })
      }
      data.frequencyCap = Math.max(1, Math.round(body.frequencyCap))
    }
    if ('placements' in body) {
      if (!Array.isArray(body.placements)) {
        return NextResponse.json({ error: 'placements must be an array' }, { status: 400 })
      }
      const list = body.placements.filter(
        (p): p is string => typeof p === 'string' && (ALL_PLACEMENTS as string[]).includes(p)
      )
      data.placements = list.join(',')
    }

    const updated = await db.campaign.update({ where: { id }, data, include: { creatives: true } })

    // Audit action reflects status transitions (pause / re-activate / generic update).
    let action = 'CAMPAIGN_UPDATED'
    let detail = 'Updated campaign fields'
    if (data.status && data.status !== existing.status) {
      if (data.status === 'PAUSED') {
        action = 'CAMPAIGN_PAUSED'
        detail = `Status changed ${existing.status} → ${data.status}`
      } else if (data.status === 'ACTIVE') {
        action = 'CAMPAIGN_ACTIVATED'
        detail = `Status changed ${existing.status} → ${data.status}`
      } else {
        detail = `Status changed ${existing.status} → ${data.status}`
      }
    } else {
      const fields = Object.keys(data)
      detail = fields.length > 0 ? `Updated fields: ${fields.join(', ')}` : 'No fields changed'
    }
    await writeAudit(session.email, action, updated.name, detail)

    const stats = await campaignStatsMap()
    return NextResponse.json({
      campaign: toCampaignDTO(updated, stats.get(id) ?? ZERO_STATS),
    })
  } catch (err) {
    console.error('PATCH /api/admin/campaigns/[id] failed:', err)
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
  }
}

/** DELETE /api/admin/campaigns/[id] — RBAC: SUPER_ADMIN | ADMIN (stricter than other mutations). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!SETTINGS_ADMIN_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { id } = await params
    const existing = await db.campaign.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    await db.campaign.delete({ where: { id } })
    await writeAudit(
      session.email,
      'CAMPAIGN_DELETED',
      existing.name,
      `Deleted campaign "${existing.name}" (advertiser ${existing.advertiser})`
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/admin/campaigns/[id] failed:', err)
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
  }
}
