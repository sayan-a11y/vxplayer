import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/admin-auth'
import { toCreativeDTO } from '../campaigns/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/admin/creatives — every creative with its parent campaign name. */
export async function GET(req: Request) {
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rows = await db.creative.findMany({
      orderBy: { createdAt: 'desc' },
      include: { campaign: { select: { name: true, status: true } } },
    })

    return NextResponse.json({
      creatives: rows.map((c) => ({
        ...toCreativeDTO(c),
        campaignName: c.campaign.name,
        campaignStatus: c.campaign.status,
      })),
    })
  } catch (err) {
    console.error('GET /api/admin/creatives failed:', err)
    return NextResponse.json({ error: 'Failed to load creatives' }, { status: 500 })
  }
}
