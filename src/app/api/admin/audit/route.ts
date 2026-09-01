import { NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { requireAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/admin/audit?limit=100 — latest audit log entries, newest first. */
export async function GET(req: Request) {
  try {
    await ensureSchema()
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const raw = Number(new URL(req.url).searchParams.get('limit') ?? '100')
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.round(raw), 1), 500) : 100

    const logs = await db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    }).catch(() => [])

    return NextResponse.json({
      logs: logs.map((l) => ({
        id: l.id,
        adminName: l.adminName,
        adminEmail: l.adminEmail,
        action: l.action,
        target: l.target,
        detail: l.detail,
        createdAt: l.createdAt.toISOString(),
      })),
    })
  } catch (err) {
    console.error('GET /api/admin/audit failed:', err)
    return NextResponse.json({ error: 'Failed to load audit log' }, { status: 500 })
  }
}
