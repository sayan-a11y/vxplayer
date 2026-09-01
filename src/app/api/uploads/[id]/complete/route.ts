import { NextResponse } from 'next/server'

import { requireAuth } from '@/lib/admin-auth'
import {
  UploadError,
  completeUpload,
  discardSession,
  getUploadSession,
} from '@/lib/upload-server'
import { CAMPAIGN_MUTATION_ROLES } from '../../../admin/campaigns/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/uploads/[id]/complete — verify chunk coverage, concatenate
 * once, run ffprobe validation and publish (library video or ad creative).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let sessionId: string | null = null
  try {
    const { id } = await params
    sessionId = id
    const session = getUploadSession(id)
    if (!session) {
      return NextResponse.json({ error: 'Upload session not found or expired' }, { status: 404 })
    }

    if (session.kind === 'creative') {
      const auth = requireAuth(req)
      if (!auth || !CAMPAIGN_MUTATION_ROLES.includes(auth.role)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const payload = await completeUpload(session)
    return NextResponse.json(payload)
  } catch (err) {
    // Failed assembly/validation frees the temp chunks right away.
    if (sessionId) await discardSession(sessionId).catch(() => {})
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('POST /api/uploads/[id]/complete failed:', err)
    return NextResponse.json({ error: 'Upload finalization failed' }, { status: 500 })
  }
}
