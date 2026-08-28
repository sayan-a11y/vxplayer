import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/admin-auth'
import type { AdminRole, AdminUserDTO } from '@/lib/types'
import { SETTINGS_ADMIN_ROLES } from '../campaigns/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/admin/users — all admin accounts without password hashes. RBAC: SUPER_ADMIN | ADMIN. */
export async function GET(req: Request) {
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!SETTINGS_ADMIN_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const users = await db.adminUser.findMany({ orderBy: { createdAt: 'asc' } })

    const admins: AdminUserDTO[] = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as AdminRole,
      twoFactor: u.twoFactor,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    }))

    return NextResponse.json({ admins })
  } catch (err) {
    console.error('GET /api/admin/users failed:', err)
    return NextResponse.json({ error: 'Failed to load admin users' }, { status: 500 })
  }
}
