// VX Player — background quality-variant transcoder (server only).
//
// After a video is imported, every quality tier BELOW the source height
// (140p → 1440p) is generated with ffmpeg into public/media/quality/<id>/.
// If the original container/codec is not browser-playable, a transcode at
// the source height is generated too and the ladder becomes fully playable.
// Jobs run strictly one at a time to keep the sandbox CPU sane.
import { execFile } from 'child_process'
import { mkdir, rm, stat } from 'fs/promises'
import path from 'path'
import { promisify } from 'util'

import { db } from '@/lib/db'
import { QUALITY_TIERS, isBrowserFriendlySource, tierLabelForHeight } from '@/lib/qualities'

const execFileAsync = promisify(execFile)

const PUBLIC_DIR = path.join(process.cwd(), 'public')
const VARIANTS_DIR = path.join(PUBLIC_DIR, 'media', 'quality')
const FFMPEG_TIMEOUT_MS = 30 * 60 * 1000

type Registry = {
  /** video ids already queued/running */
  jobs: Map<string, boolean>
  /** global one-at-a-time queue */
  chain: Promise<void>
}

// Turbopack duplicates module state across route bundles — anchor on globalThis.
function registry(): Registry {
  const g = globalThis as typeof globalThis & { __vxTranscode?: Registry }
  if (!g.__vxTranscode) g.__vxTranscode = { jobs: new Map(), chain: Promise.resolve() }
  return g.__vxTranscode
}

/** Fire-and-forget: queue quality-variant generation for an imported video. */
export function queueTranscode(videoId: string) {
  const reg = registry()
  if (reg.jobs.has(videoId)) return
  reg.jobs.set(videoId, true)
  reg.chain = reg.chain
    .then(() =>
      runJob(videoId).catch((err) =>
        console.error(`[transcode] job ${videoId} failed:`, err),
      ),
    )
    .finally(() => reg.jobs.delete(videoId))
}

function evenDim(value: number): number {
  return Math.max(2, 2 * Math.round(value / 2))
}

function variantRelPath(videoId: string, label: string): string {
  return `/media/quality/${videoId}/${label}.mp4`
}

async function transcodeOne(src: string, out: string, height: number, maxKbps: number) {
  await execFileAsync(
    'ffmpeg',
    [
      '-nostdin',
      '-v', 'error',
      '-y',
      '-i', src,
      '-vf', `scale=-2:${height}`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-maxrate', `${maxKbps}k`,
      '-bufsize', `${maxKbps * 2}k`,
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-ac', '2',
      '-movflags', '+faststart',
      out,
    ],
    { timeout: FFMPEG_TIMEOUT_MS },
  )
}

async function runJob(videoId: string) {
  const video = await db.video.findUnique({
    where: { id: videoId },
    include: { qualities: true },
  })
  if (!video) return

  const srcAbs = path.join(PUBLIC_DIR, video.srcUrl.replace(/^\//, ''))
  const friendly = isBrowserFriendlySource(video.container, video.codec)

  // The original file covers the top tier whenever the browser can play it.
  if (friendly) {
    const label = tierLabelForHeight(video.height)
    await db.qualityVariant.upsert({
      where: { videoId_label: { videoId, label } },
      create: {
        videoId,
        label,
        width: video.width,
        height: video.height,
        bitrateKbps: 0,
        filePath: video.srcUrl,
        fileSizeMB: video.sizeMB,
        status: 'READY',
        isSource: true,
      },
      update: { status: 'READY', filePath: video.srcUrl, isSource: true },
    })
  }

  // Never upscale: transcode only tiers strictly below the source height.
  const targets = QUALITY_TIERS.filter((t) => t.height < video.height)
  if (!friendly) {
    // Non-browser-friendly source: also transcode at (or just under) source
    // height so the top of the ladder is playable in the browser.
    const exact = QUALITY_TIERS.find((t) => t.height === video.height)
    const top = exact ?? [...targets].reverse()[0]
    if (top && !targets.includes(top)) targets.push(top)
  }

  await mkdir(path.join(VARIANTS_DIR, videoId), { recursive: true })

  for (const tier of targets) {
    const key = { videoId_label: { videoId, label: tier.label } }
    const existing = await db.qualityVariant.findUnique({ where: key })
    if (existing?.status === 'READY') continue

    const width = evenDim((video.width * tier.height) / video.height)
    const row = existing
      ? await db.qualityVariant.update({
          where: { id: existing.id },
          data: { status: 'PROCESSING', width, height: tier.height, bitrateKbps: tier.bitrateKbps },
        })
      : await db.qualityVariant.create({
          data: {
            videoId,
            label: tier.label,
            width,
            height: tier.height,
            bitrateKbps: tier.bitrateKbps,
            filePath: variantRelPath(videoId, tier.label),
            fileSizeMB: 0,
            status: 'PROCESSING',
            isSource: false,
          },
        })

    const outAbs = path.join(VARIANTS_DIR, videoId, `${tier.label}.mp4`)
    try {
      await transcodeOne(srcAbs, outAbs, tier.height, tier.bitrateKbps)
      const info = await stat(outAbs)
      await db.qualityVariant.update({
        where: { id: row.id },
        data: {
          status: 'READY',
          fileSizeMB: Math.max(1, Math.round(info.size / (1024 * 1024))),
        },
      })
      console.log(`[transcode] ${video.title} → ${tier.label} READY`)
    } catch (err) {
      console.error(`[transcode] ${video.title} → ${tier.label} FAILED:`, err)
      await rm(outAbs, { force: true })
      await db.qualityVariant.update({ where: { id: row.id }, data: { status: 'FAILED' } })
    }
  }
}
