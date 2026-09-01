import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** POST /api/admin/logout — requires auth; audit-logs the sign-out. */
export async function POST(req: Request) {
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await db.adminUser.findUnique({
      where: { email: session.email },
      select: { name: true },
    })

    await db.auditLog.create({
      data: {
        adminName: user?.name ?? session.email,
        adminEmail: session.email,
        action: 'LOGOUT',
        target: session.email,
        detail: 'Signed out of admin panel',
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/admin/logout failed:', err)
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 })
  }
}
