import { NextResponse } from 'next/server'
import { rm } from 'fs/promises'
import path from 'path'

import { db } from '@/lib/db'

import { toVideoDTO } from '../serialize'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function publicPath(urlPath: string): string {
  return path.join(process.cwd(), 'public', urlPath.replace(/^\//, ''))
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const video = await db.video.findUnique({
      where: { id },
      include: { history: true, qualities: true },
    })
    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    return NextResponse.json({ video: toVideoDTO(video) })
  } catch (err) {
    console.error('GET /api/videos/[id] failed:', err)
    return NextResponse.json({ error: 'Failed to load video' }, { status: 500 })
  }
}

/**
 * DELETE /api/videos/[id] — remove a video from the library.
 * Cascades to history, playlist items and quality variants, then removes the
 * source file, thumbnail and quality renditions from disk (best effort).
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const video = await db.video.findUnique({ where: { id } })
    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

    await db.video.delete({ where: { id } })

    // Best-effort file cleanup (quality dir may not exist for old imports).
    await rm(publicPath(video.srcUrl), { force: true })
    if (video.thumbnailUrl) await rm(publicPath(video.thumbnailUrl), { force: true })
    await rm(path.join(process.cwd(), 'public', 'media', 'quality', id), {
      recursive: true,
      force: true,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/videos/[id] failed:', err)
    return NextResponse.json({ error: 'Failed to delete video' }, { status: 500 })
  }
}
