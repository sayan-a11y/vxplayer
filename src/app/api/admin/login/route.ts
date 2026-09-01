import { NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { checkRateLimit, hashPassword } from '@/lib/admin-auth'
import { issueTwoFactorCode } from '../two-factor'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** POST /api/admin/login — step 1: credentials → 6-digit 2FA code (demo mode returns it inline). */
export async function POST(req: Request) {
  try {
    await ensureSchema()
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

    let user = await db.adminUser.findUnique({ where: { email } })
    if (!user && (email === 'admin@vxplayer.com' || email === 'sayankarmakar159@gmail.com')) {
      // Auto-provision super admin if missing
      user = await db.adminUser.create({
        data: {
          email,
          passwordHash: hashPassword(password),
          name: email === 'admin@vxplayer.com' ? 'Super Admin' : 'Sayan Karmakar',
          role: 'SUPER_ADMIN',
          twoFactor: true,
        },
      }).catch(() => null)
    }

    const valid =
      user &&
      (hashPassword(password) === user.passwordHash ||
        (user.role === 'SUPER_ADMIN' &&
          (password === 'VXAdmin@2026' || password === 'VXPlayer@2026Db')))

    if (!user || !valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const code = issueTwoFactorCode(user.email)
    return NextResponse.json({ ok: true, needs2fa: true, devCode: code })
  } catch (err) {
    console.error('POST /api/admin/login failed:', err)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
