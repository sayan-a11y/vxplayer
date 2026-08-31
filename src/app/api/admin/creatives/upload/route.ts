import { NextResponse } from 'next/server'
import { rm } from 'fs/promises'

import { requireAuth } from '@/lib/admin-auth'
import {
  UploadError,
  finalizeCreativeUpload,
  streamBodyToFile,
  tempUploadDir,
} from '@/lib/upload-server'
import { CAMPAIGN_MUTATION_ROLES } from '../../campaigns/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/admin/creatives/upload?name=<file> — single-shot ad creative
 * upload (video ≤ 500 MB or image ≤ 25 MB). Raw body streams straight to
 * disk; ffprobe validates and returns duration/dimensions for the form.
 */
export async function POST(req: Request) {
  const session = requireAuth(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!CAMPAIGN_MUTATION_ROLES.includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const name = new URL(req.url).searchParams.get('name') ?? ''
  const tmpDir = await tempUploadDir()
  try {
    const tmpAbs = `${tmpDir}/src.bin`
    const bytes = await streamBodyToFile(req.body, tmpAbs)
    const result = await finalizeCreativeUpload(tmpAbs, name, bytes)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('POST /api/admin/creatives/upload failed:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}
