import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { clearRateLimit, signToken } from '@/lib/admin-auth'
import type { AdminRole } from '@/lib/types'
import { verifyTwoFactorCode } from '../two-factor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** POST /api/admin/verify-2fa — step 2: code → signed session token. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { email?: unknown; code?: unknown }
      | null
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const code = typeof body?.code === 'string' ? body.code.trim() : ''
    if (!email || !code) {
      return NextResponse.json({ error: 'Email and code are required' }, { status: 400 })
    }

    if (!verifyTwoFactorCode(email, code)) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 401 })
    }

    const user = await db.adminUser.findUnique({ where: { email } })
    if (!user) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 401 })
    }

    clearRateLimit(email)
    await db.adminUser.update({ where: { email }, data: { lastLoginAt: new Date() } })
    await db.auditLog.create({
      data: {
        adminName: user.name,
        adminEmail: user.email,
        action: 'LOGIN',
        target: user.email,
        detail: 'Signed in with 2FA (demo code)',
      },
    })

    return NextResponse.json({
      ok: true,
      token: signToken(user.email, user.role),
      admin: {
        name: user.name,
        email: user.email,
        role: user.role as AdminRole,
      },
    })
  } catch (err) {
    console.error('POST /api/admin/verify-2fa failed:', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
