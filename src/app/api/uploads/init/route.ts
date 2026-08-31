import { NextResponse } from 'next/server'

import { requireAuth } from '@/lib/admin-auth'
import { UploadError, createUploadSession, type UploadKind } from '@/lib/upload-server'
import { CAMPAIGN_MUTATION_ROLES } from '../../admin/campaigns/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/uploads/init — open a chunked upload session.
 * Body: { name, size, kind: 'video' | 'creative' }.
 * Creative uploads require an admin token with campaign rights.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown
      size?: unknown
      kind?: unknown
    }
    const kind: UploadKind | null =
      body.kind === 'creative' ? 'creative' : body.kind === 'video' ? 'video' : null
    if (!kind) return NextResponse.json({ error: 'kind must be "video" or "creative"' }, { status: 400 })

    if (kind === 'creative') {
      const session = requireAuth(req)
      if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      if (!CAMPAIGN_MUTATION_ROLES.includes(session.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const name = typeof body.name === 'string' ? body.name : ''
    const size = typeof body.size === 'number' ? Math.round(body.size) : Number.NaN
    const result = await createUploadSession(name, size, kind)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('POST /api/uploads/init failed:', err)
    return NextResponse.json({ error: 'Could not start upload' }, { status: 500 })
  }
}
