import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { HistoryEntry, Video } from '@prisma/client'
import type { VideoDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

type VideoWithHistory = Video & { history: HistoryEntry | null }

/** Serialize a Prisma Video (with optional history) into the contract VideoDTO. */
function toVideoDTO(v: VideoWithHistory): VideoDTO {
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

const SORTS = ['recent_added', 'recent_played', 'name', 'duration', 'size'] as const
type SortKey = (typeof SORTS)[number]

function parseSort(raw: string | null): SortKey {
  if (raw && (SORTS as readonly string[]).includes(raw)) return raw as SortKey
  return 'recent_added'
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const sort = parseSort(url.searchParams.get('sort'))
    const q = url.searchParams.get('q')?.trim() ?? ''
    const folder = url.searchParams.get('folder')?.trim() ?? ''

    const where: { OR?: object[]; folder?: string } = {}
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { folder: { contains: q } },
        { fileName: { contains: q } },
      ]
    }
    if (folder) where.folder = folder

    // Deterministic DB-level ordering; `recent_played` (nulls last) is re-ranked below.
    const orderBy: Record<string, 'asc' | 'desc'> =
      sort === 'name'
        ? { title: 'asc' }
        : sort === 'duration'
          ? { duration: 'desc' }
          : sort === 'size'
            ? { sizeMB: 'desc' }
            : { addedAt: 'desc' } // recent_added (and base order for recent_played)

    const rows = await db.video.findMany({
      where,
      orderBy,
      include: { history: true },
    })

    if (sort === 'recent_played') {
      rows.sort((a, b) => {
        const aT = a.history?.lastPlayedAt.getTime() ?? -1
        const bT = b.history?.lastPlayedAt.getTime() ?? -1
        return bT - aT
      })
    }

    return NextResponse.json({ videos: rows.map(toVideoDTO) })
  } catch (err) {
    console.error('GET /api/videos failed:', err)
    return NextResponse.json({ error: 'Failed to load videos' }, { status: 500 })
  }
}
