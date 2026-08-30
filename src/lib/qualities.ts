// VX Player — video quality tiers (140p → 2K/4K) and source-resolution helpers.
// Shared by the server transcoder and the player UI. Pure functions only.

export type QualityTier = {
  label: string
  height: number
  bitrateKbps: number
  /** Display suffix, e.g. "HD" / "2K" */
  suffix?: string
}

/**
 * Canonical rendition ladder, ordered low → high.
 * Every imported video is transcoded into every tier BELOW its source
 * height (never upscaled). The original file itself covers the top tier.
 */
export const QUALITY_TIERS: QualityTier[] = [
  { label: '140p', height: 140, bitrateKbps: 150 },
  { label: '240p', height: 240, bitrateKbps: 400 },
  { label: '360p', height: 360, bitrateKbps: 800 },
  { label: '480p', height: 480, bitrateKbps: 1400 },
  { label: '720p', height: 720, bitrateKbps: 2500, suffix: 'HD' },
  { label: '1080p', height: 1080, bitrateKbps: 5000, suffix: 'Full HD' },
  { label: '1440p', height: 1440, bitrateKbps: 9000, suffix: '2K' },
  { label: '2160p', height: 2160, bitrateKbps: 16000, suffix: '4K' },
]

const SUFFIX_BY_LABEL: Record<string, string | undefined> = Object.fromEntries(
  QUALITY_TIERS.map((t) => [t.label, t.suffix]),
)

/** "720p" → "720p HD", "1440p" → "1440p 2K", unknown labels pass through. */
export function qualityDisplayLabel(label: string): string {
  const suffix = SUFFIX_BY_LABEL[label]
  return suffix ? `${label} ${suffix}` : label
}

/** Tier label for an exact height, or a "<height>p" label for non-tier sources. */
export function tierLabelForHeight(height: number): string {
  const exact = QUALITY_TIERS.find((t) => t.height === height)
  return exact ? exact.label : `${height}p`
}

/**
 * Whether the browser can play the original file directly.
 * Non-friendly sources (hevc, avi, wmv…) get a full ladder transcode instead.
 */
export function isBrowserFriendlySource(container: string, codec: string): boolean {
  const c = container.toLowerCase()
  const v = codec.toLowerCase()
  if (c === 'webm') return ['vp8', 'vp9', 'av1'].includes(v)
  if (c === 'mp4' || c === 'm4v' || c === 'mov') return ['h264', 'avc1', 'avc', 'vp9', 'av1'].includes(v)
  if (c === 'mkv') return ['h264', 'avc1', 'avc', 'vp8', 'vp9', 'av1'].includes(v)
  return false
}

/**
 * Pick the auto-quality variant for a viewport: highest rendition whose
 * height fits the screen, falling back to the smallest one available.
 */
export function resolveAutoVariant<T extends { height: number }>(
  ready: T[],
  viewportHeight: number,
): T | null {
  if (ready.length === 0) return null
  const sorted = [...ready].sort((a, b) => b.height - a.height)
  const fit = sorted.find((v) => v.height <= Math.max(240, Math.round(viewportHeight)))
  return fit ?? sorted[sorted.length - 1]
}
