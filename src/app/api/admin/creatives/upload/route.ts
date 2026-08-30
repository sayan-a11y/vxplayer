import { NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { createWriteStream } from 'fs'
import { mkdir, rm, stat } from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { promisify } from 'util'
import crypto from 'crypto'

import { requireAuth } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const execFileAsync = promisify(execFile)

const ADS_DIR = path.join(process.cwd(), 'public', 'ads')

const VIDEO_EXT = new Set(['mp4', 'webm', 'mkv', 'mov', 'm4v', '3gp'])
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])
const MAX_VIDEO_BYTES = 500 * 1024 * 1024 // 500 MB
const MAX_IMAGE_BYTES = 25 * 1024 * 1024 // 25 MB

type ProbeOut = {
  duration: number
  width: number
  height: number
  codec: string
}

/** ffprobe works for videos AND images — validates and measures either. */
async function probe(file: string): Promise<ProbeOut> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    file,
  ])
  const meta = JSON.parse(stdout) as {
    format?: { duration?: string }
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number }[]
  }
  const video = meta.streams?.find((s) => s.codec_type === 'video')
  if (!video || !video.width || !video.height) throw new Error('no video stream')
  const duration = Number.parseFloat(meta.format?.duration ?? '0')
  return {
    duration: Number.isFinite(duration) ? Math.max(0, duration) : 0,
    width: video.width,
    height: video.height,
    codec: (video.codec_name ?? '').toLowerCase(),
  }
}

/**
 * POST /api/admin/creatives/upload?name=<filename>
 * Raw-body upload of an ad creative asset (video or image) from device
 * storage. Returns the served URL (plus probe metadata) to fill into the
 * campaign/creative form. RBAC: SUPER_ADMIN | ADMIN | AD_MANAGER.
 */
export async function POST(req: Request) {
  const session = requireAuth(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'SUPER_ADMIN' && session.role !== 'ADMIN' && session.role !== 'AD_MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const url = new URL(req.url)
  const rawName = decodeURIComponent(url.searchParams.get('name') ?? '')
  const base = path.basename(rawName).trim()
  const dot = base.lastIndexOf('.')
  const ext = (dot > 0 ? base.slice(dot + 1) : '').toLowerCase()

  const kind = VIDEO_EXT.has(ext) ? 'video' : IMAGE_EXT.has(ext) ? 'image' : null
  if (!kind) {
    return NextResponse.json(
      {
        error: `Unsupported file type. Allowed — video: ${[...VIDEO_EXT].join(', ')}; image: ${[
          ...IMAGE_EXT,
        ].join(', ')}`,
      },
      { status: 415 },
    )
  }

  const maxBytes = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (contentLength > maxBytes) {
    return NextResponse.json(
      { error: `File is too large (max ${Math.round(maxBytes / (1024 * 1024))} MB)` },
      { status: 413 },
    )
  }
  if (!req.body) return NextResponse.json({ error: 'Empty upload' }, { status: 400 })

  await mkdir(ADS_DIR, { recursive: true })
  const id = crypto.randomUUID()
  const dest = path.join(ADS_DIR, `${id}.${ext}`)

  try {
    const nodeStream = Readable.fromWeb(req.body as import('stream/web').ReadableStream)
    await pipeline(nodeStream, createWriteStream(dest))
  } catch (err) {
    console.error('POST /api/admin/creatives/upload write failed:', err)
    await rm(dest, { force: true })
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }

  try {
    const info = await stat(dest)
    if (info.size === 0) throw new Error('empty file')

    // Validate the asset is a real playable/showable media file.
    let probeOut: ProbeOut
    try {
      probeOut = await probe(dest)
    } catch {
      await rm(dest, { force: true })
      return NextResponse.json(
        {
          error:
            kind === 'video'
              ? 'This file is not a playable video (or is corrupted).'
              : 'This file is not a valid image (or is corrupted).',
        },
        { status: 415 },
      )
    }

    return NextResponse.json({
      url: `/ads/${id}.${ext}`,
      kind,
      fileName: base,
      sizeMB: Math.max(1, Math.round(info.size / (1024 * 1024))),
      duration: kind === 'video' ? Math.round(probeOut.duration) : null,
      width: probeOut.width,
      height: probeOut.height,
      codec: probeOut.codec,
    })
  } catch (err) {
    console.error('POST /api/admin/creatives/upload failed:', err)
    await rm(dest, { force: true })
    return NextResponse.json({ error: 'Could not import this asset.' }, { status: 500 })
  }
}
