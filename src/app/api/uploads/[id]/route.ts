import { NextResponse } from 'next/server'

import { requireAuth } from '@/lib/admin-auth'
import {
  UploadError,
  discardSession,
  getUploadSession,
  writeChunk,
} from '@/lib/upload-server'
import { CAMPAIGN_MUTATION_ROLES } from '../../admin/campaigns/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * PUT /api/uploads/[id]?offset=N — stream one chunk to disk.
 * Chunks are independent part-files so several can upload in parallel.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
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

    const offset = Number(new URL(req.url).searchParams.get('offset'))
    const bytes = await writeChunk(session, offset, req.body, Number(req.headers.get('content-length') ?? 0))
    return NextResponse.json({ bytes, offset })
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('PUT /api/uploads/[id] failed:', err)
    return NextResponse.json({ error: 'Chunk upload failed' }, { status: 500 })
  }
}

/** DELETE /api/uploads/[id] — abort and clean up. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await discardSession(id)
  return NextResponse.json({ ok: true })
}
