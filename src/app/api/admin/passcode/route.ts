import { NextResponse } from 'next/server'
import { signToken } from '@/lib/admin-auth'
import type { AdminRole } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const VALID_PASSCODES = [
  '2026',
  '123456',
  'vx2026',
  'vxplayer',
  'vxadmin@2026',
  'vxplayer@2026db',
  'admin',
]

/**
 * POST /api/admin/passcode — Instant, fail-safe master passcode / code generator unlock.
 * Allows instant 1-click admin authentication without database dependency.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      passcode?: string
      email?: string
      role?: AdminRole
    }

    const code = (body.passcode || '').trim().toLowerCase()
    const email = body.email?.trim().toLowerCase() || 'sayankarmakar159@gmail.com'
    const name = email === 'sayankarmakar159@gmail.com' ? 'Sayan Karmakar' : 'Super Admin'
    const role: AdminRole = 'SUPER_ADMIN'

    // If passcode is provided, check if valid or allow direct generation
    if (code && !VALID_PASSCODES.includes(code)) {
      return NextResponse.json({ error: 'Invalid admin passcode' }, { status: 401 })
    }

    const token = signToken(email, role)

    return NextResponse.json({
      ok: true,
      token,
      admin: {
        name,
        email,
        role,
      },
    })
  } catch (err) {
    console.error('POST /api/admin/passcode failed:', err)
    return NextResponse.json({ error: 'Passcode authentication failed' }, { status: 500 })
  }
}
