import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import path from 'path'

import { requireAuth } from '@/lib/admin-auth'
import { createR2PresignedUpload, isR2Configured, getMimeType } from '@/lib/r2'
import { CAMPAIGN_MUTATION_ROLES } from '../../campaigns/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/admin/r2/presign
 * Generates an authorized presigned PUT URL for direct browser-to-Cloudflare R2 upload.
 * RBAC: SUPER_ADMIN | ADMIN | AD_MANAGER
 */
export async function POST(req: Request) {
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAMPAIGN_MUTATION_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    if (!isR2Configured()) {
      return NextResponse.json(
        { error: 'Cloudflare R2 is not configured on this instance' },
        { status: 400 }
      )
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: string
      type?: string
      folder?: string
    }

    const originalName = body.name ? body.name.trim() : 'creative.mp4'
    const ext = path.extname(originalName).toLowerCase().replace(/^\./, '') || 'mp4'
    const folder = body.folder === 'media' ? 'media' : 'ads'
    const key = `${folder}/${randomUUID()}.${ext}`
    const contentType = body.type || getMimeType(originalName)

    const presigned = await createR2PresignedUpload(key, contentType, 3600)
    if (!presigned) {
      return NextResponse.json({ error: 'Failed to generate presigned upload URL' }, { status: 500 })
    }

    return NextResponse.json(presigned)
  } catch (err) {
    console.error('POST /api/admin/r2/presign failed:', err)
    return NextResponse.json({ error: 'Presign failed' }, { status: 500 })
  }
}
