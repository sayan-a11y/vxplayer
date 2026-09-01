import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { HistoryEntry, Video } from '@prisma/client'
import type { HistoryDTO, VideoDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

function toVideoDTO(v: Video): VideoDTO {
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
    history: null, // filled below from the HistoryEntry itself
  }
}

/** GET /api/history — watch history entries with the video joined, newest first. */
export async function GET() {
  try {
    const rows = await db.historyEntry.findMany({
      orderBy: { lastPlayedAt: 'desc' },
      include: { video: true },
    })

    const history: HistoryDTO[] = rows.map((h: HistoryEntry & { video: Video }) => ({
      video: { ...toVideoDTO(h.video), history: {
        position: h.position,
        watchedPct: h.watchedPct,
        lastPlayedAt: h.lastPlayedAt.toISOString(),
      } },
      position: h.position,
      watchedPct: h.watchedPct,
      lastPlayedAt: h.lastPlayedAt.toISOString(),
    }))

    return NextResponse.json({ history })
  } catch (err) {
    console.error('GET /api/history failed:', err)
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 })
  }
}

/** POST /api/history — upsert playback progress; computes watchedPct = position/duration*100 (clamped 0-100). */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { videoId?: unknown; position?: unknown; duration?: unknown; sessionId?: unknown }
      | null
    if (
      !body ||
      typeof body.videoId !== 'string' ||
      typeof body.position !== 'number' ||
      typeof body.duration !== 'number'
    ) {
      return NextResponse.json(
        { error: 'Body must be { videoId: string, position: number, duration: number }' },
        { status: 400 }
      )
    }

    const video = await db.video.findUnique({ where: { id: body.videoId }, select: { id: true } })
    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

    const position = Math.max(0, Math.round(body.position))
    const duration = Math.max(0, body.duration)
    const watchedPct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0
    const sessionId =
      typeof body.sessionId === 'string' && body.sessionId.trim() ? body.sessionId.trim() : null

    await db.historyEntry.upsert({
      where: { videoId: body.videoId },
      create: { videoId: body.videoId, position, watchedPct, sessionId },
      update: { position, watchedPct, sessionId, lastPlayedAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/history failed:', err)
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
  }
}

/** DELETE /api/history — clear the entire watch history. */
export async function DELETE() {
  try {
    await db.historyEntry.deleteMany({})
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/history failed:', err)
    return NextResponse.json({ error: 'Failed to clear history' }, { status: 500 })
  }
}
