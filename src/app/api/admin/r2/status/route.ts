import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/admin-auth'
import { getR2Config, isR2Configured } from '@/lib/r2'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** GET /api/admin/r2/status — Get current Cloudflare R2 storage status */
export async function GET(req: Request) {
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const configured = isR2Configured()
    const config = getR2Config()

    return NextResponse.json({
      configured,
      bucketName: config?.bucketName ?? null,
      publicUrl: config?.publicUrl ?? null,
      accountId: config?.accountId ? `${config.accountId.slice(0, 6)}...` : null,
    })
  } catch (err) {
    console.error('GET /api/admin/r2/status failed:', err)
    return NextResponse.json({ error: 'Failed to retrieve R2 status' }, { status: 500 })
  }
}
