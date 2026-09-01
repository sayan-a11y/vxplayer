import { NextResponse } from 'next/server'
import { db, ensureSchema } from '@/lib/db'
import { toVideoDTO } from '../serialize'
import { queueTranscode } from '@/lib/transcode'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function resolutionLabelFor(height: number): string {
  if (height >= 2160) return '4K'
  if (height >= 1440) return '2K'
  if (height >= 1080) return '1080p'
  if (height >= 720) return '720p'
  if (height >= 480) return '480p'
  if (height >= 360) return '360p'
  return 'SD'
}

function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[._]+/g, ' ').trim()
  return base ? base.slice(0, 120) : 'Untitled video'
}

/**
 * POST /api/videos/register
 * Registers a video uploaded directly to Cloudflare R2 into the Supabase database.
 */
export async function POST(req: Request) {
  try {
    await ensureSchema()
    const body = (await req.json().catch(() => ({}))) as {
      name?: string
      srcUrl?: string
      sizeMB?: number
      duration?: number
      width?: number
      height?: number
      thumbnailUrl?: string
    }

    const name = body.name?.trim() || 'Untitled Video'
    const srcUrl = body.srcUrl?.trim()
    if (!srcUrl) {
      return NextResponse.json({ error: 'srcUrl is required' }, { status: 400 })
    }

    const sizeMB = typeof body.sizeMB === 'number' && body.sizeMB > 0 ? body.sizeMB : 1
    const duration = typeof body.duration === 'number' && body.duration > 0 ? Math.round(body.duration) : 60
    const width = typeof body.width === 'number' && body.width > 0 ? body.width : 1920
    const height = typeof body.height === 'number' && body.height > 0 ? body.height : 1080
    const ext = name.lastIndexOf('.') >= 0 ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : 'mp4'

    // Check duplicate
    const existing = await db.video.findFirst({
      where: { fileName: name, sizeMB },
      include: { history: true, qualities: true },
    })

    if (existing) {
      return NextResponse.json({ video: toVideoDTO(existing), duplicate: true })
    }

    const video = await db.video.create({
      data: {
        title: titleFromFileName(name),
        fileName: name,
        folder: 'Device storage',
        duration,
        width,
        height,
        resolutionLabel: resolutionLabelFor(height),
        sizeMB,
        codec: 'h264',
        audioCodec: 'aac',
        container: ext,
        frameRate: 30,
        srcUrl,
        thumbnailUrl: body.thumbnailUrl || srcUrl,
      },
      include: { history: true, qualities: true },
    })

    queueTranscode(video.id)

    return NextResponse.json({ video: toVideoDTO(video), duplicate: false })
  } catch (err) {
    console.error('POST /api/videos/register failed:', err)
    return NextResponse.json({ error: 'Failed to register video' }, { status: 500 })
  }
}
