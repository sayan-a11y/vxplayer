import { NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import type { HistoryEntry, Playlist, PlaylistItem, Video } from '@prisma/client'
import type { PlaylistDTO, VideoDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

type ItemWithVideo = PlaylistItem & { video: Video & { history: HistoryEntry | null } }

function itemToVideoDTO(item: ItemWithVideo): VideoDTO {
  const v = item.video
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

type PlaylistWithItems = Playlist & { items: ItemWithVideo[] }

function toPlaylistDTO(p: PlaylistWithItems): PlaylistDTO {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt.toISOString(),
    videos: p.items.map(itemToVideoDTO),
  }
}

/** GET /api/playlists — all playlists, newest first, videos ordered by item order. */
export async function GET() {
  try {
    await ensureSchema()
    const rows = await db.playlist.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        items: { orderBy: { order: 'asc' }, include: { video: { include: { history: true } } } },
      },
    })
    return NextResponse.json({ playlists: rows.map(toPlaylistDTO) })
  } catch (err) {
    console.error('GET /api/playlists failed:', err)
    return NextResponse.json({ playlists: [] })
  }
}

/** POST /api/playlists — create an empty playlist. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { name?: unknown } | null
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name) return NextResponse.json({ error: 'Playlist name is required' }, { status: 400 })

    const created = await db.playlist.create({ data: { name } })
    const playlist: PlaylistDTO = {
      id: created.id,
      name: created.name,
      createdAt: created.createdAt.toISOString(),
      videos: [],
    }
    return NextResponse.json({ playlist })
  } catch (err) {
    console.error('POST /api/playlists failed:', err)
    return NextResponse.json({ error: 'Failed to create playlist' }, { status: 500 })
  }
}
