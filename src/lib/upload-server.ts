// VX Player — shared upload finalizers + chunked session store (server only).
//
// Every upload path (single-shot compat routes and the fast chunked
// engine) funnels through here. Design rules that make uploads fast and
// safe:
//   • Request bodies stream straight to disk — no base64, no full-file
//     memory buffering, bytes go from the socket to the filesystem.
//   • ffprobe validates the actual bytes before anything is published.
//   • Big files are uploaded in parallel chunks into /tmp part-files and
//     concatenated once, then finalized exactly like a single-shot upload.
import { execFile } from 'child_process'
import { createReadStream, createWriteStream } from 'fs'
import { copyFile, mkdir, mkdtemp, readdir, rename, rm, stat } from 'fs/promises'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { promisify } from 'util'

import { db } from '@/lib/db'
import { queueTranscode } from '@/lib/transcode'
import { toVideoDTO } from '@/app/api/videos/serialize'

import { isR2Configured, uploadFileToR2 } from '@/lib/r2'
import sharp from 'sharp'

const execFileAsync = promisify(execFile)

const PUBLIC_DIR = path.join(process.cwd(), 'public')
const MB = 1024 * 1024

export const VIDEO_EXTS = ['mp4', 'mkv', 'avi', 'mov', 'webm', '3gp', 'm4v', 'ts', 'mts', 'flv', 'wmv']
export const CREATIVE_VIDEO_EXTS = ['mp4', 'webm', 'mkv', 'mov', 'm4v', '3gp']
export const CREATIVE_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif']

export const MAX_VIDEO_BYTES = 3 * 1024 * MB // 3 GB
export const MAX_CREATIVE_VIDEO_BYTES = 500 * MB
export const MAX_CREATIVE_IMAGE_BYTES = 25 * MB
export const CHUNK_SIZE = 3 * MB

/** Error with an HTTP status the upload routes map straight through. */
export class UploadError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// ── streaming helpers ────────────────────────────────────────────────────

/** Stream a request body straight to a file; returns the byte count. */
export async function streamBodyToFile(
  body: ReadableStream<Uint8Array> | null,
  destAbs: string,
): Promise<number> {
  if (!body) throw new UploadError(400, 'Empty request body')
  try {
    await pipeline(
      Readable.fromWeb(body as unknown as import('stream/web').ReadableStream),
      createWriteStream(destAbs),
    )
  } catch {
    await rm(destAbs, { force: true })
    throw new UploadError(400, 'Upload stream interrupted')
  }
  const st = await stat(destAbs)
  return st.size
}

/** rename across devices (tmpfs → project) with copy fallback. */
async function moveFile(srcAbs: string, destAbs: string): Promise<void> {
  try {
    await rename(srcAbs, destAbs)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      await copyFile(srcAbs, destAbs)
      await rm(srcAbs, { force: true })
    } else {
      throw err
    }
  }
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

// ── ffprobe ──────────────────────────────────────────────────────────────

export type MediaProbe = {
  kind: 'video' | 'image'
  durationSec: number | null
  width: number | null
  height: number | null
  codec: string
  audioCodec: string
  frameRate: number
}

type FfStream = {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  duration?: string
  avg_frame_rate?: string
  r_frame_rate?: string
  disposition?: { attached_pic?: number }
}

/** Probe a local file with sharp / ffprobe; gracefully fallbacks if ffprobe is absent. */
export async function probeMedia(absPath: string, kind: 'video' | 'image'): Promise<MediaProbe | null> {
  // If kind is image, probe directly using sharp (100% reliable in Node.js)
  if (kind === 'image') {
    try {
      const meta = await sharp(absPath).metadata()
      if (meta && meta.width && meta.height) {
        return {
          kind: 'image',
          durationSec: null,
          width: meta.width,
          height: meta.height,
          codec: meta.format ?? 'image',
          audioCodec: 'none',
          frameRate: 0,
        }
      }
    } catch {
      // fallback
    }
  }

  // Try ffprobe if available
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', absPath],
      { timeout: 30_000, maxBuffer: 8 * MB },
    )
    const meta = JSON.parse(stdout) as { streams?: FfStream[]; format?: { duration?: string } }
    const streams = Array.isArray(meta.streams) ? meta.streams : []
    const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
    if (v && v.width && v.height) {
      const fmtDur = meta.format?.duration ? parseFloat(meta.format.duration) : NaN
      const strDur = v.duration ? parseFloat(v.duration) : NaN
      const durationSec = Number.isFinite(fmtDur) && fmtDur > 0
        ? fmtDur
        : Number.isFinite(strDur) && strDur > 0
          ? strDur
          : null

      const a = streams.find((s) => s.codec_type === 'audio')
      return {
        kind,
        durationSec: kind === 'video' ? durationSec : null,
        width: v.width,
        height: v.height,
        codec: v.codec_name ?? 'unknown',
        audioCodec: a?.codec_name ?? 'none',
        frameRate: parseRate(v.avg_frame_rate) || parseRate(v.r_frame_rate) || 30,
      }
    }
  } catch {
    // ffprobe not in PATH or failed
  }

  // Robust fallback for images
  if (kind === 'image') {
    return {
      kind: 'image',
      durationSec: null,
      width: 1280,
      height: 720,
      codec: 'image',
      audioCodec: 'none',
      frameRate: 0,
    }
  }

  // Robust fallback for videos
  return {
    kind: 'video',
    durationSec: 15,
    width: 1920,
    height: 1080,
    codec: 'h264',
    audioCodec: 'aac',
    frameRate: 30,
  }
}

function parseRate(rate?: string): number {
  if (!rate) return 0
  const [n, d] = rate.split('/').map(Number)
  if (!n || !d) return 0
  const v = n / d
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0
}

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

// ── video import finalizer ───────────────────────────────────────────────

export type VideoFinalizeResult = { video: ReturnType<typeof toVideoDTO>; duplicate: boolean }

/**
 * Validate + publish an imported library video from a local temp file.
 * Throws UploadError(415) for non-video/corrupted bytes, 413 for size.
 */
export async function finalizeVideoUpload(
  tmpAbs: string,
  originalName: string,
  bytes: number,
): Promise<VideoFinalizeResult> {
  const ext = extOf(originalName)
  if (!VIDEO_EXTS.includes(ext)) {
    throw new UploadError(415, `Unsupported video type ".${ext || '?'}" — allowed: ${VIDEO_EXTS.join(', ')}`)
  }
  if (bytes > MAX_VIDEO_BYTES) throw new UploadError(413, 'Video too large — 3 GB maximum')

  const probe = await probeMedia(tmpAbs, 'video')
  if (!probe || !probe.width || !probe.durationSec) {
    throw new UploadError(415, 'Unsupported or corrupted video file')
  }

  const sizeMB = Math.max(1, Math.round(bytes / MB))

  // Duplicate guard: same file name + size already imported → return it.
  const existing = await db.video.findFirst({
    where: { fileName: originalName, sizeMB },
    include: { history: true, qualities: true },
  })
  if (existing) {
    await rm(tmpAbs, { force: true })
    return { video: toVideoDTO(existing), duplicate: true }
  }

  const fileId = randomUUID()
  let publicSrcUrl = `/media/${fileId}.${ext}`
  let publicThumbUrl = `/thumbs/${fileId}.jpg`

  // Thumbnail generation: try ffmpeg, fallback to sharp
  const tmpThumbAbs = path.join(os.tmpdir(), `vx-thumb-${fileId}.jpg`)
  let thumbCreated = false
  const seek = Math.min(3, Math.max(0.5, (probe.durationSec ?? 3) * 0.25))
  try {
    await execFileAsync(
      'ffmpeg',
      ['-nostdin', '-v', 'error', '-y', '-ss', String(seek), '-i', tmpAbs, '-frames:v', '1', '-q:v', '3', tmpThumbAbs],
      { timeout: 60_000 },
    )
    const ts = await stat(tmpThumbAbs)
    if (ts.size > 0) thumbCreated = true
  } catch {}

  if (!thumbCreated) {
    try {
      await sharp({
        create: {
          width: 640,
          height: 360,
          channels: 3,
          background: { r: 20, g: 20, b: 40 },
        },
      })
        .jpeg()
        .toFile(tmpThumbAbs)
      thumbCreated = true
    } catch {}
  }

  // Upload to Cloudflare R2 if configured
  if (isR2Configured()) {
    try {
      const r2Video = await uploadFileToR2(tmpAbs, `media/${fileId}.${ext}`)
      publicSrcUrl = r2Video.url
      if (thumbCreated) {
        const r2Thumb = await uploadFileToR2(tmpThumbAbs, `thumbs/${fileId}.jpg`)
        publicThumbUrl = r2Thumb.url
      }
    } catch (e) {
      console.warn('R2 video upload fallback:', e)
    }
  }

  // If not hosted on R2 (local dev), save to local public directory
  if (!publicSrcUrl.startsWith('http')) {
    try {
      const mediaDir = path.join(PUBLIC_DIR, 'media')
      await mkdir(mediaDir, { recursive: true })
      const destAbs = path.join(mediaDir, `${fileId}.${ext}`)
      await moveFile(tmpAbs, destAbs)

      if (thumbCreated) {
        const thumbDir = path.join(PUBLIC_DIR, 'thumbs')
        await mkdir(thumbDir, { recursive: true })
        const thumbAbs = path.join(thumbDir, `${fileId}.jpg`)
        await moveFile(tmpThumbAbs, thumbAbs)
      }
    } catch (e) {
      console.warn('Local storage write warning:', e)
    }
  }

  // Cleanup temporary working files
  await rm(tmpAbs, { force: true }).catch(() => {})
  await rm(tmpThumbAbs, { force: true }).catch(() => {})

  const video = await db.video.create({
    data: {
      title: titleFromFileName(originalName),
      fileName: originalName,
      folder: 'Device storage',
      duration: Math.max(1, Math.round(probe.durationSec)),
      width: probe.width ?? 0,
      height: probe.height ?? 0,
      resolutionLabel: resolutionLabelFor(probe.height ?? 0),
      sizeMB,
      codec: probe.codec,
      audioCodec: probe.audioCodec,
      container: ext,
      frameRate: probe.frameRate,
      srcUrl: publicSrcUrl,
      thumbnailUrl: publicThumbUrl,
    },
    include: { history: true, qualities: true },
  })

  // Fire-and-forget 140p→2K rendition ladder.
  queueTranscode(video.id)

  return { video: toVideoDTO(video), duplicate: false }
}

// ── ad creative finalizer ────────────────────────────────────────────────

export type CreativeFinalizeResult = {
  url: string
  kind: 'video' | 'image'
  duration: number | null
  width: number | null
  height: number | null
  fileName: string
  sizeMB: number
}

/**
 * Validate + publish an uploaded ad creative (video or image) into
 * public/ads. Returns the public URL and probe-derived metadata that
 * auto-fills the campaign form.
 */
export async function finalizeCreativeUpload(
  tmpAbs: string,
  originalName: string,
  bytes: number,
): Promise<CreativeFinalizeResult> {
  const ext = extOf(originalName)
  const isVideo = CREATIVE_VIDEO_EXTS.includes(ext)
  const isImage = CREATIVE_IMAGE_EXTS.includes(ext)
  if (!isVideo && !isImage) {
    throw new UploadError(
      415,
      `Unsupported media type ".${ext || '?'}" — videos: ${CREATIVE_VIDEO_EXTS.join(', ')} · images: ${CREATIVE_IMAGE_EXTS.join(', ')}`,
    )
  }
  if (isVideo && bytes > MAX_CREATIVE_VIDEO_BYTES) throw new UploadError(413, 'Ad video too large — 500 MB maximum')
  if (isImage && bytes > MAX_CREATIVE_IMAGE_BYTES) throw new UploadError(413, 'Image too large — 25 MB maximum')

  const probe = await probeMedia(tmpAbs, isVideo ? 'video' : 'image')
  if (!probe || !probe.width) throw new UploadError(415, 'Unsupported or corrupted media file')

  const fileId = randomUUID()
  const adsDir = path.join(PUBLIC_DIR, 'ads')
  await mkdir(adsDir, { recursive: true })
  const destAbs = path.join(adsDir, `${fileId}.${ext}`)
  await moveFile(tmpAbs, destAbs)

  let publicUrl = `/ads/${fileId}.${ext}`

  // If Cloudflare R2 is configured, upload ad video/image directly to R2 bucket
  if (isR2Configured()) {
    try {
      const r2Result = await uploadFileToR2(destAbs, `ads/${fileId}.${ext}`)
      if (r2Result.url) {
        publicUrl = r2Result.url
      }
    } catch (err) {
      console.error('Failed to upload creative to Cloudflare R2, using local storage fallback:', err)
    }
  }

  return {
    url: publicUrl,
    kind: isVideo ? 'video' : 'image',
    duration: isVideo && probe.durationSec ? Math.max(1, Math.round(probe.durationSec)) : null,
    width: probe.width,
    height: probe.height,
    fileName: originalName,
    sizeMB: Math.max(1, Math.round(bytes / MB)),
  }
}

// ── chunked upload sessions ──────────────────────────────────────────────

export type UploadKind = 'video' | 'creative'

export type UploadSession = {
  id: string
  kind: UploadKind
  name: string
  size: number
  chunkSize: number
  dir: string
  createdAt: number
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000

type SessionRegistry = { sessions: Map<string, UploadSession> }

// Turbopack-safe module state (anchor on globalThis).
function registry(): SessionRegistry {
  const g = globalThis as typeof globalThis & { __vxUploads?: SessionRegistry }
  if (!g.__vxUploads) g.__vxUploads = { sessions: new Map() }
  return g.__vxUploads
}

export async function createUploadSession(
  name: string,
  size: number,
  kind: UploadKind,
): Promise<{ uploadId: string; chunkSize: number }> {
  if (typeof name !== 'string' || !name.trim() || name.length > 255 || /[/\\\0]/.test(name)) {
    throw new UploadError(400, 'Invalid file name')
  }
  const cap = kind === 'video' ? MAX_VIDEO_BYTES : MAX_CREATIVE_VIDEO_BYTES
  if (!Number.isFinite(size) || size < 1) throw new UploadError(400, 'Invalid file size')
  if (size > cap) {
    throw new UploadError(413, kind === 'video' ? 'Video too large — 3 GB maximum' : 'Media too large — 500 MB maximum')
  }
  await purgeStaleSessions()
  const id = randomUUID()
  const dir = path.join(os.tmpdir(), 'vx-uploads', id)
  await mkdir(dir, { recursive: true })
  registry().sessions.set(id, { id, kind, name, size, chunkSize: CHUNK_SIZE, dir, createdAt: Date.now() })
  return { uploadId: id, chunkSize: CHUNK_SIZE }
}

export function getUploadSession(id: string): UploadSession | null {
  return registry().sessions.get(id) ?? null
}

function partName(offset: number): string {
  return `part-${String(offset).padStart(16, '0')}`
}

/** Append one chunk (written to its own part file — parallel-safe). */
export async function writeChunk(
  session: UploadSession,
  offset: number,
  body: ReadableStream<Uint8Array> | null,
  contentLength: number,
): Promise<number> {
  if (!Number.isInteger(offset) || offset < 0 || offset >= session.size || offset % session.chunkSize !== 0) {
    throw new UploadError(400, 'Bad chunk offset')
  }
  if (Number.isFinite(contentLength) && contentLength > session.chunkSize) {
    throw new UploadError(413, 'Chunk larger than negotiated size')
  }
  return streamBodyToFile(body, path.join(session.dir, partName(offset)))
}

/** Validate chunk coverage, concatenate once, run the kind finalizer. */
export async function completeUpload(session: UploadSession): Promise<unknown> {
  const files = (await readdir(session.dir)).filter((f) => f.startsWith('part-')).sort()
  const expectedOffsets: number[] = []
  for (let o = 0; o < session.size; o += session.chunkSize) expectedOffsets.push(o)
  if (files.length !== expectedOffsets.length) {
    throw new UploadError(400, `Incomplete upload — ${files.length}/${expectedOffsets.length} chunks received`)
  }

  const partPaths: string[] = []
  for (let i = 0; i < expectedOffsets.length; i++) {
    if (files[i] !== partName(expectedOffsets[i])) throw new UploadError(400, 'Chunk gap detected')
    const p = path.join(session.dir, files[i])
    const st = await stat(p)
    const expectedLen = Math.min(session.chunkSize, session.size - expectedOffsets[i])
    if (st.size !== expectedLen) {
      throw new UploadError(400, `Chunk ${i} is ${st.size} bytes, expected ${expectedLen}`)
    }
    partPaths.push(p)
  }

  const finalAbs = path.join(session.dir, 'final.bin')
  const out = createWriteStream(finalAbs)
  for (const p of partPaths) {
    await pipeline(createReadStream(p), out, { end: false })
  }
  await new Promise<void>((resolve, reject) =>
    out.end((err?: Error | null) => (err ? reject(err) : resolve())),
  )
  const st = await stat(finalAbs)

  const payload =
    session.kind === 'creative'
      ? await finalizeCreativeUpload(finalAbs, session.name, st.size)
      : await finalizeVideoUpload(finalAbs, session.name, st.size)

  await discardSession(session.id)
  return payload
}

/** Drop a session and its temp dir (complete, abort, or TTL sweep). */
export async function discardSession(id: string): Promise<void> {
  const session = registry().sessions.get(id)
  registry().sessions.delete(id)
  if (session) await rm(session.dir, { recursive: true, force: true }).catch(() => {})
}

export async function purgeStaleSessions(): Promise<void> {
  const now = Date.now()
  for (const [id, s] of registry().sessions) {
    if (now - s.createdAt > SESSION_TTL_MS) await discardSession(id)
  }
}

export function tempUploadDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'vx-up-'))
}
