import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkRateLimit, hashPassword } from '@/lib/admin-auth'
import { issueTwoFactorCode } from '../two-factor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** POST /api/admin/login — step 1: credentials → 6-digit 2FA code (demo mode returns it inline). */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { email?: unknown; password?: unknown }
      | null
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const rl = checkRateLimit(email)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in 5 minutes.' },
        { status: 429 }
      )
    }

    const user = await db.adminUser.findUnique({ where: { email } })
    if (!user || hashPassword(password) !== user.passwordHash) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const code = issueTwoFactorCode(user.email)
    return NextResponse.json({ ok: true, needs2fa: true, devCode: code })
  } catch (err) {
    console.error('POST /api/admin/login failed:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
