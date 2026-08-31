import { NextResponse } from 'next/server'
import { rm } from 'fs/promises'

import {
  UploadError,
  finalizeVideoUpload,
  streamBodyToFile,
  tempUploadDir,
} from '@/lib/upload-server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/videos/upload?name=<file> — single-shot device import.
 * Raw body streams straight to disk (no buffering), then the shared
 * finalizer validates with ffprobe, thumbnails and creates the row.
 */
export async function POST(req: Request) {
  const name = new URL(req.url).searchParams.get('name') ?? ''
  const tmpDir = await tempUploadDir()
  try {
    const tmpAbs = `${tmpDir}/src.bin`
    const bytes = await streamBodyToFile(req.body, tmpAbs)
    const result = await finalizeVideoUpload(tmpAbs, name, bytes)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('POST /api/videos/upload failed:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}
