import { NextResponse } from 'next/server'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { rm } from 'fs/promises'

import {
  UploadError,
  finalizeVideoUpload,
  streamBodyToFile,
} from '@/lib/upload-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/videos/upload?name=<filename>
 * Single-shot direct streaming upload for imported library video.
 */
export async function POST(req: Request) {
  let tmpAbs: string | null = null
  try {
    const url = new URL(req.url)
    const nameParam = url.searchParams.get('name')
    const originalName = nameParam ? decodeURIComponent(nameParam).trim() : 'video.mp4'

    if (!originalName || /[/\\\0]/.test(originalName)) {
      return NextResponse.json({ error: 'Invalid file name' }, { status: 400 })
    }

    const tmpName = `vx-video-${randomUUID()}-${path.basename(originalName)}`
    tmpAbs = path.join(os.tmpdir(), tmpName)

    const bytes = await streamBodyToFile(req.body, tmpAbs)
    if (bytes === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 })
    }

    const result = await finalizeVideoUpload(tmpAbs, originalName, bytes)
    return NextResponse.json(result)
  } catch (err) {
    if (tmpAbs) await rm(tmpAbs, { force: true }).catch(() => {})
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('POST /api/videos/upload failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Video upload failed' },
      { status: 500 }
    )
  }
}
