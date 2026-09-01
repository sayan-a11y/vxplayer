import { NextResponse } from 'next/server'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { rm } from 'fs/promises'

import { requireAuth } from '@/lib/admin-auth'
import {
  UploadError,
  finalizeCreativeUpload,
  streamBodyToFile,
} from '@/lib/upload-server'
import { CAMPAIGN_MUTATION_ROLES } from '../../campaigns/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/admin/creatives/upload?name=<filename>
 * Single-shot direct streaming upload for ad creative video/image.
 * RBAC: SUPER_ADMIN | ADMIN | AD_MANAGER
 */
export async function POST(req: Request) {
  let tmpAbs: string | null = null
  try {
    const session = requireAuth(req)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!CAMPAIGN_MUTATION_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const url = new URL(req.url)
    const nameParam = url.searchParams.get('name')
    const originalName = nameParam ? decodeURIComponent(nameParam).trim() : 'creative.mp4'

    if (!originalName || /[/\\\0]/.test(originalName)) {
      return NextResponse.json({ error: 'Invalid file name' }, { status: 400 })
    }

    const tmpName = `vx-creative-${randomUUID()}-${path.basename(originalName)}`
    tmpAbs = path.join(os.tmpdir(), tmpName)

    const bytes = await streamBodyToFile(req.body, tmpAbs)
    if (bytes === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 })
    }

    const result = await finalizeCreativeUpload(tmpAbs, originalName, bytes)
    return NextResponse.json(result)
  } catch (err) {
    if (tmpAbs) await rm(tmpAbs, { force: true }).catch(() => {})
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('POST /api/admin/creatives/upload failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Creative upload failed' },
      { status: 500 }
    )
  }
}
