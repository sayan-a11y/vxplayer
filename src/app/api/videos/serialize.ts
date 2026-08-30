// VX Player — shared video/quality serializers for the videos API routes.
import type { HistoryEntry, QualityVariant, Video } from '@prisma/client'

import type { QualityVariantDTO, VideoDTO } from '@/lib/types'

export type VideoWithRelations = Video & {
  history: HistoryEntry | null
  qualities: QualityVariant[]
}

/** Serialize a Prisma QualityVariant into the contract DTO. */
export function toQualityDTO(q: QualityVariant): QualityVariantDTO {
  return {
    label: q.label,
    width: q.width,
    height: q.height,
    bitrateKbps: q.bitrateKbps,
    filePath: q.filePath,
    fileSizeMB: q.fileSizeMB,
    status: q.status as QualityVariantDTO['status'],
    isSource: q.isSource,
  }
}

/** Serialize a Prisma Video (with history + qualities) into the contract VideoDTO. */
export function toVideoDTO(v: VideoWithRelations): VideoDTO {
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
    qualities: [...v.qualities].sort((a, b) => b.height - a.height).map(toQualityDTO),
  }
}
