import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** POST /api/playlists/[id]/items — append a video at the next order position. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = (await req.json().catch(() => null)) as { videoId?: unknown } | null
    if (!body || typeof body.videoId !== 'string') {
      return NextResponse.json({ error: 'Body must be { videoId: string }' }, { status: 400 })
    }

    const playlist = await db.playlist.findUnique({ where: { id }, select: { id: true } })
    if (!playlist) return NextResponse.json({ error: 'Playlist not found' }, { status: 404 })

    const video = await db.video.findUnique({ where: { id: body.videoId }, select: { id: true } })
    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

    // Idempotent: adding an existing video again is a no-op.
    const existing = await db.playlistItem.findUnique({
      where: { playlistId_videoId: { playlistId: id, videoId: body.videoId } },
      select: { id: true },
    })
    if (existing) return NextResponse.json({ ok: true })

    const last = await db.playlistItem.findFirst({
      where: { playlistId: id },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    const nextOrder = (last?.order ?? -1) + 1

    await db.playlistItem.create({
      data: { playlistId: id, videoId: body.videoId, order: nextOrder },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('POST /api/playlists/[id]/items failed:', err)
    return NextResponse.json({ error: 'Failed to add video to playlist' }, { status: 500 })
  }
}

/** DELETE /api/playlists/[id]/items?videoId= — remove a video from the playlist. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const videoId = new URL(req.url).searchParams.get('videoId')
    if (!videoId) {
      return NextResponse.json({ error: 'videoId query parameter is required' }, { status: 400 })
    }

    const item = await db.playlistItem.findUnique({
      where: { playlistId_videoId: { playlistId: id, videoId } },
      select: { id: true },
    })
    if (!item) return NextResponse.json({ error: 'Video not in playlist' }, { status: 404 })

    await db.playlistItem.delete({ where: { id: item.id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/playlists/[id]/items failed:', err)
    return NextResponse.json({ error: 'Failed to remove video from playlist' }, { status: 500 })
  }
}
