import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import path from 'path'

import { createR2PresignedUpload, isR2Configured, getMimeType } from '@/lib/r2'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/videos/presign
 * Generates a presigned PUT URL for direct browser-to-Cloudflare R2 video upload.
 * No serverless size or memory limits apply.
 */
export async function POST(req: Request) {
  try {
    if (!isR2Configured()) {
      return NextResponse.json(
        { error: 'Cloudflare R2 is not configured' },
        { status: 400 }
      )
    }

    const body = (await req.json().catch(() => ({}))) as {
      name?: string
      type?: string
    }

    const originalName = body.name ? body.name.trim() : 'video.mp4'
    const ext = path.extname(originalName).toLowerCase().replace(/^\./, '') || 'mp4'
    const fileId = randomUUID()
    const key = `media/${fileId}.${ext}`
    const contentType = body.type || getMimeType(originalName)

    const presigned = await createR2PresignedUpload(key, contentType, 3600)
    if (!presigned) {
      return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 })
    }

    return NextResponse.json({
      ...presigned,
      fileId,
      ext,
    })
  } catch (err) {
    console.error('POST /api/videos/presign failed:', err)
    return NextResponse.json({ error: 'Presign failed' }, { status: 500 })
  }
}
