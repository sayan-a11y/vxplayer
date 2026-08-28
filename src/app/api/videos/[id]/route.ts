import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { HistoryEntry, Video } from '@prisma/client'
import type { VideoDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

function toVideoDTO(v: Video & { history: HistoryEntry | null }): VideoDTO {
  return {
    id: v.id,
    title: v.title,
    fileName: v.fileName,
    folder: v.folder,
    duration: v.duration,
    width: v.width,
    height: v.height,
    resolutionLabel: v.resolutionLabel,
    sizeMB: v.sizeMB,
    codec: v.codec,
    audioCodec: v.audioCodec,
    container: v.container,
    frameRate: v.frameRate,
    srcUrl: v.srcUrl,
    thumbnailUrl: v.thumbnailUrl,
    addedAt: v.addedAt.toISOString(),
    favorite: v.favorite,
    history: v.history
      ? {
          position: v.history.position,
          watchedPct: v.history.watchedPct,
          lastPlayedAt: v.history.lastPlayedAt.toISOString(),
        }
      : null,
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const video = await db.video.findUnique({ where: { id }, include: { history: true } })
    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    return NextResponse.json({ video: toVideoDTO(video) })
  } catch (err) {
    console.error('GET /api/videos/[id] failed:', err)
    return NextResponse.json({ error: 'Failed to load video' }, { status: 500 })
  }
}
