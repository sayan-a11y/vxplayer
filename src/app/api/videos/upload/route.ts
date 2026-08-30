import { NextResponse } from 'next/server'
import { createWriteStream } from 'fs'
import { mkdir, rm, stat } from 'fs/promises'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import crypto from 'crypto'

import { db } from '@/lib/db'
import type { VideoDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const execFileAsync = promisify(execFile)

const MEDIA_DIR = path.join(process.cwd(), 'public', 'media')
const THUMBS_DIR = path.join(process.cwd(), 'public', 'thumbs')

/** Containers the player supports (mirrors the PRD format list). */
const ALLOWED_EXT = new Set(['mp4', 'mkv', 'avi', 'mov', 'webm', '3gp', 'm4v', 'ts', 'mts', 'flv'])
const MAX_BYTES = 3 * 1024 * 1024 * 1024 // 3 GB safety cap

type ProbeResult = {
  duration: number
  width: number
  height: number
  videoCodec: string
  audioCodec: string
  frameRate: number
}

function resolutionLabel(height: number): string {
  if (height >= 2160) return '4K'
  if (height >= 1440) return '2K'
  if (height >= 1080) return '1080p'
  if (height >= 720) return '720p'
  if (height >= 480) return '480p'
  return 'SD'
}

/** "My.Video.2024.mkv" → { title: "My Video 2024", ext: "mkv" } */
function parseFileName(raw: string): { title: string; ext: string } {
  const base = path.basename(raw).trim()
  const dot = base.lastIndexOf('.')
  const ext = (dot > 0 ? base.slice(dot + 1) : '').toLowerCase()
  const stem = dot > 0 ? base.slice(0, dot) : base
  const title = stem.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled video'
  return { title, ext }
}

async function probeVideo(file: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    file,
  ])
  const meta = JSON.parse(stdout) as {
    format?: { duration?: string }
    streams?: {
      codec_type?: string
      codec_name?: string
      width?: number
      height?: number
      avg_frame_rate?: string
    }[]
  }
  const video = meta.streams?.find((s) => s.codec_type === 'video')
  const audio = meta.streams?.find((s) => s.codec_type === 'audio')
  if (!video || !video.width || !video.height) throw new Error('no video stream')

  const duration = Number.parseFloat(meta.format?.duration ?? '0')
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('bad duration')

  let frameRate = 30
  const [num, den] = (video.avg_frame_rate ?? '30/1').split('/').map(Number)
  if (num > 0 && den > 0) frameRate = Math.round(num / den)

  return {
    duration: Math.round(duration),
    width: video.width,
    height: video.height,
    videoCodec: (video.codec_name ?? 'unknown').toLowerCase(),
    audioCodec: (audio?.codec_name ?? 'none').toLowerCase(),
    frameRate,
  }
}

/** Grab a frame for the thumbnail; fall back to a solid VX-style frame. */
async function generateThumbnail(source: string, id: string, duration: number): Promise<string> {
  await mkdir(THUMBS_DIR, { recursive: true })
  const dest = path.join(THUMBS_DIR, `${id}.png`)
  const at = Math.min(3, Math.max(0, duration * 0.25)).toFixed(2)
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-ss', at, '-i', source,
      '-frames:v', '1', '-vf', 'scale=640:-2',
      dest,
    ])
  } catch {
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'color=c=0x141428:s=640x360:d=1',
      '-frames:v', '1',
      dest,
    ])
  }
  return `/thumbs/${id}.png`
}

type UploadedVideoRow = {
  id: string
  title: string
  fileName: string
  folder: string
  duration: number
  width: number
  height: number
  resolutionLabel: string
  sizeMB: number
  codec: string
  audioCodec: string
  container: string
  frameRate: number
  srcUrl: string
  thumbnailUrl: string
  addedAt: Date
}

function serialize(row: UploadedVideoRow): VideoDTO {
  return {
    id: row.id,
    title: row.title,
    fileName: row.fileName,
    folder: row.folder,
    duration: row.duration,
    width: row.width,
    height: row.height,
    resolutionLabel: row.resolutionLabel,
    sizeMB: row.sizeMB,
    codec: row.codec,
    audioCodec: row.audioCodec,
    container: row.container,
    frameRate: row.frameRate,
    srcUrl: row.srcUrl,
    thumbnailUrl: row.thumbnailUrl,
    addedAt: row.addedAt.toISOString(),
    favorite: false,
    history: null,
  }
}

/**
 * POST /api/videos/upload?name=<filename>
 * Raw-body stream upload from device storage. Saves the file, probes real
 * metadata with ffprobe, generates a thumbnail, and adds the video to the
 * library. Duplicate guard: same fileName + same size returns the existing row.
 */
export async function POST(req: Request) {
  const url = new URL(req.url)
  const rawName = decodeURIComponent(url.searchParams.get('name') ?? '')
  const { title, ext } = parseFileName(rawName)

  if (!ext || !ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${Array.from(ALLOWED_EXT).join(', ')}` },
      { status: 415 },
    )
  }

  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (contentLength > MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large (max 3 GB)' }, { status: 413 })
  }
  if (!req.body) {
    return NextResponse.json({ error: 'Empty upload' }, { status: 400 })
  }

  await mkdir(MEDIA_DIR, { recursive: true })
  const id = crypto.randomUUID()
  const dest = path.join(MEDIA_DIR, `${id}.${ext}`)

  try {
    // Stream the raw body straight to disk (no full-file buffering).
    const nodeStream = Readable.fromWeb(req.body as import('stream/web').ReadableStream)
    await pipeline(nodeStream, createWriteStream(dest))
  } catch (err) {
    console.error('POST /api/videos/upload write failed:', err)
    await rm(dest, { force: true })
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }

  try {
    const info = await stat(dest)
    const sizeMB = Math.max(1, Math.round(info.size / (1024 * 1024)))

    // Duplicate guard — same file name and same size already imported.
    const existing = await db.video.findFirst({
      where: { fileName: path.basename(rawName), sizeMB },
    })
    if (existing) {
      await rm(dest, { force: true })
      return NextResponse.json({ video: serialize(existing), duplicate: true })
    }

    // Real metadata via ffprobe; corrupted/unsupported files are rejected.
    let probe: ProbeResult
    try {
      probe = await probeVideo(dest)
    } catch {
      await rm(dest, { force: true })
      return NextResponse.json(
        { error: 'This file is not a playable video (or is corrupted).' },
        { status: 415 },
      )
    }

    const thumbnailUrl = await generateThumbnail(dest, id, probe.duration)

    const row = await db.video.create({
      data: {
        id,
        title,
        fileName: path.basename(rawName),
        folder: 'Device storage',
        duration: probe.duration,
        width: probe.width,
        height: probe.height,
        resolutionLabel: resolutionLabel(probe.height),
        sizeMB,
        codec: probe.videoCodec === 'h264' ? 'h264' : probe.videoCodec,
        audioCodec: probe.audioCodec,
        container: ext,
        frameRate: probe.frameRate,
        srcUrl: `/media/${id}.${ext}`,
        thumbnailUrl,
      },
    })

    return NextResponse.json({ video: serialize(row), duplicate: false }, { status: 201 })
  } catch (err) {
    console.error('POST /api/videos/upload failed:', err)
    await rm(dest, { force: true })
    return NextResponse.json({ error: 'Could not import this video.' }, { status: 500 })
  }
}
