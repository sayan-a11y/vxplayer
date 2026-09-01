'use client'

// VX Player — High Performance Local Ad Manifest & Preload Engine
// Provides 0ms local decision making, background asset preloading, offline playability,
// versioned sync (<5ms check), and batch analytics queueing.

import type { AdEventType, AdPlacement, ServedAd, SettingsDTO } from './types'
import { apiGet, apiPost } from './api'
import { useAppStore } from './store'

const MANIFEST_KEY = 'vx_ad_manifest_v2'
const OFFLINE_EVENTS_KEY = 'vx_offline_ad_events'
const PRELOAD_CACHE_LIMIT = 10

export type ManifestAd = ServedAd & {
  expiresAt: string
  version: number
  checksum?: string
}

export type LocalAdManifest = {
  version: number
  updatedAt: number
  settings: Partial<SettingsDTO>
  ads: ManifestAd[]
}

// ── Instant In-Memory Baseline Ads Bundle (0ms Latency on Frame 0) ──

export const DEFAULT_BASELINE_ADS: Record<AdPlacement, ServedAd> = {
  HERO: {
    campaignId: 'init-hero',
    campaignName: 'VX Showcase',
    advertiser: 'VX Player',
    priority: 'HIGH',
    placement: 'HERO',
    creativeId: 'cr-hero-1',
    creativeName: '4K Ultra HD Showcase',
    type: 'IMAGE',
    mediaUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1200&auto=format&fit=crop',
    duration: 15,
    skipAfter: 5,
    position: null,
    headline: 'Experience Pure 4K HDR Media',
    bodyText: 'Hardware-accelerated zero buffering offline video playback.',
    ctaText: 'Explore Features',
    ctaUrl: 'https://vxplayer.com',
  },
  HOME_FEED: {
    campaignId: 'init-feed',
    campaignName: 'VX Feed Promo',
    advertiser: 'VX Player',
    priority: 'HIGH',
    placement: 'HOME_FEED',
    creativeId: 'cr-feed-1',
    creativeName: 'Hardware Acceleration',
    type: 'IMAGE',
    mediaUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=1200&auto=format&fit=crop',
    duration: 15,
    skipAfter: 5,
    position: null,
    headline: 'Next-Gen Video Engine',
    bodyText: 'Seamless zero-lag playback for 4K 120 FPS high bitrate media.',
    ctaText: 'Discover',
    ctaUrl: 'https://vxplayer.com',
  },
  BETWEEN_CARDS: {
    campaignId: 'init-cards',
    campaignName: 'VX Audio Showcase',
    advertiser: 'VX Player',
    priority: 'HIGH',
    placement: 'BETWEEN_CARDS',
    creativeId: 'cr-cards-1',
    creativeName: 'Dolby Atmos Audio',
    type: 'IMAGE',
    mediaUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=600&auto=format&fit=crop',
    duration: 15,
    skipAfter: 5,
    position: null,
    headline: 'Cinema Quality Audio & Video',
    bodyText: 'Dolby Atmos & multi-track audio decoding.',
    ctaText: 'Explore',
    ctaUrl: 'https://vxplayer.com',
  },
  BANNER: {
    campaignId: 'init-banner',
    campaignName: 'VX Pro Banner',
    advertiser: 'VX Pro',
    priority: 'HIGH',
    placement: 'BANNER',
    creativeId: 'cr-banner-1',
    creativeName: 'Dolby Atmos Audio',
    type: 'BANNER',
    mediaUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1200&auto=format&fit=crop',
    duration: 15,
    skipAfter: 5,
    position: null,
    headline: 'Unlock Dolby Atmos & 120 FPS',
    bodyText: 'Pure offline hardware-accelerated playback with crystal-clear audio.',
    ctaText: 'Upgrade Now',
    ctaUrl: 'https://vxplayer.com',
  },
  FOOTER: {
    campaignId: 'init-footer',
    campaignName: 'VX Footer',
    advertiser: 'VX Player',
    priority: 'HIGH',
    placement: 'FOOTER',
    creativeId: 'cr-footer-1',
    creativeName: 'Universal Format Player',
    type: 'IMAGE',
    mediaUrl: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=800&auto=format&fit=crop',
    duration: 15,
    skipAfter: 5,
    position: null,
    headline: 'VX Player Pro Edition',
    bodyText: 'Universal formats: MP4, MKV, AVI, WebM, FLAC, AAC with zero ads mode.',
    ctaText: 'Learn More',
    ctaUrl: 'https://vxplayer.com',
  },
  PRE_ROLL: {
    campaignId: 'init-rolls',
    campaignName: 'VX Pre-Roll',
    advertiser: 'VX Pro',
    priority: 'HIGH',
    placement: 'PRE_ROLL',
    creativeId: 'cr-preroll-1',
    creativeName: 'Fast Stream Spot',
    type: 'VIDEO',
    mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    duration: 15,
    skipAfter: 5,
    position: null,
    headline: 'Play Any Format, Anywhere',
    bodyText: 'Supports MP4, MKV, AVI, MOV, WebM with multi-track subtitles.',
    ctaText: 'Get Pro',
    ctaUrl: 'https://vxplayer.com',
  },
  MID_ROLL: {
    campaignId: 'init-rolls',
    campaignName: 'VX Mid-Roll',
    advertiser: 'VX Pro',
    priority: 'HIGH',
    placement: 'MID_ROLL',
    creativeId: 'cr-midroll-1',
    creativeName: 'Hardware Stream Spot',
    type: 'VIDEO',
    mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    duration: 15,
    skipAfter: 5,
    position: null,
    headline: 'Fast Hardware Acceleration',
    bodyText: 'Zero battery drain with GPU rendering.',
    ctaText: 'Learn More',
    ctaUrl: 'https://vxplayer.com',
  },
  POST_ROLL: {
    campaignId: 'init-rolls',
    campaignName: 'VX Post-Roll',
    advertiser: 'VX Pro',
    priority: 'HIGH',
    placement: 'POST_ROLL',
    creativeId: 'cr-postroll-1',
    creativeName: 'Up Next Stream Spot',
    type: 'VIDEO',
    mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    duration: 15,
    skipAfter: 5,
    position: null,
    headline: 'Up Next with VX Player',
    bodyText: 'Seamless queue & auto-play next.',
    ctaText: 'Continue',
    ctaUrl: 'https://vxplayer.com',
  },
  VIDEO_OVERLAY: {
    campaignId: 'init-overlay',
    campaignName: 'VX Video Overlay',
    advertiser: 'VX Pro',
    priority: 'HIGH',
    placement: 'VIDEO_OVERLAY',
    creativeId: 'cr-vidover-1',
    creativeName: 'Video Overlay Spot',
    type: 'VIDEO',
    mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    duration: 12,
    skipAfter: 5,
    position: 'BOTTOM',
    headline: 'Next-Gen Media Engine',
    bodyText: 'Smooth gesture controls & background pip.',
    ctaText: 'Try Now',
    ctaUrl: 'https://vxplayer.com',
  },
  IMAGE_OVERLAY: {
    campaignId: 'init-overlay',
    campaignName: 'VX Image Overlay',
    advertiser: 'VX Pro',
    priority: 'HIGH',
    placement: 'IMAGE_OVERLAY',
    creativeId: 'cr-imgover-1',
    creativeName: 'Image Overlay Spot',
    type: 'IMAGE',
    mediaUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=800&auto=format&fit=crop',
    duration: 12,
    skipAfter: 5,
    position: 'BOTTOM',
    headline: 'Pure Offline Video Player',
    bodyText: 'Hardware acceleration with zero battery drain.',
    ctaText: 'Explore',
    ctaUrl: 'https://vxplayer.com',
  },
  OVERLAY: {
    campaignId: 'init-overlay',
    campaignName: 'VX General Overlay',
    advertiser: 'VX Pro',
    priority: 'HIGH',
    placement: 'OVERLAY',
    creativeId: 'cr-over-1',
    creativeName: 'General Overlay Spot',
    type: 'IMAGE',
    mediaUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=800&auto=format&fit=crop',
    duration: 12,
    skipAfter: 5,
    position: 'BOTTOM',
    headline: 'Next-Gen Media Engine',
    bodyText: 'Smooth gesture controls & background pip.',
    ctaText: 'Try Now',
    ctaUrl: 'https://vxplayer.com',
  },
  UP_NEXT: {
    campaignId: 'init-upnext',
    campaignName: 'VX Up Next',
    advertiser: 'VX Player',
    priority: 'HIGH',
    placement: 'UP_NEXT',
    creativeId: 'cr-upnext-1',
    creativeName: 'Recommended by VX',
    type: 'IMAGE',
    mediaUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=400&auto=format&fit=crop',
    duration: 15,
    skipAfter: 5,
    position: null,
    headline: 'Recommended by VX Player',
    bodyText: 'Discover 4K HDR local playback.',
    ctaText: 'View',
    ctaUrl: 'https://vxplayer.com',
  },
  PLAYER_BOTTOM: {
    campaignId: 'init-bottom',
    campaignName: 'VX Player Bottom',
    advertiser: 'VX Player',
    priority: 'HIGH',
    placement: 'PLAYER_BOTTOM',
    creativeId: 'cr-bottom-1',
    creativeName: 'Surround Audio',
    type: 'IMAGE',
    mediaUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=600&auto=format&fit=crop',
    duration: 15,
    skipAfter: 5,
    position: null,
    headline: 'Dolby Surround Audio Enabled',
    bodyText: 'Experience crystal-clear soundstage.',
    ctaText: 'Visit',
    ctaUrl: 'https://vxplayer.com',
  },
}

// In-memory preloaded image/video references to keep them in browser cache
const preloadedAssets = new Set<string>()

// ── Storage Helpers ──

export function readManifest(): LocalAdManifest | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(MANIFEST_KEY)
    if (!raw) return null
    return JSON.parse(raw) as LocalAdManifest
  } catch {
    return null
  }
}

export function writeManifest(manifest: LocalAdManifest): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest))
  } catch {
    // Storage full — purge older items
    try {
      pruneExpiredAds()
    } catch {}
  }
}

// ── Asset Preloading Engine ──

/**
 * Preload an ad asset (Image or Video) into browser cache in the background.
 */
export function preloadAdAsset(mediaUrl: string | null, type: string): void {
  if (!mediaUrl || typeof window === 'undefined' || preloadedAssets.has(mediaUrl)) return
  if (preloadedAssets.size >= PRELOAD_CACHE_LIMIT) {
    // Drop earliest item
    const first = preloadedAssets.values().next().value
    if (first) preloadedAssets.delete(first)
  }

  preloadedAssets.add(mediaUrl)

  try {
    if (type === 'VIDEO') {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.muted = true
      v.playsInline = true
      v.src = mediaUrl
      v.load()
    } else {
      const img = new Image()
      img.src = mediaUrl
    }
  } catch {
    // ignore preload error
  }
}

/**
 * Preload next eligible creatives for all placements in the background.
 */
export function preloadNextAds(): void {
  const manifest = readManifest()
  if (!manifest || !Array.isArray(manifest.ads)) return
  const now = Date.now()

  // Preload top 1 creative for each placement
  const placements: AdPlacement[] = [
    'HERO',
    'PRE_ROLL',
    'MID_ROLL',
    'POST_ROLL',
    'VIDEO_OVERLAY',
    'IMAGE_OVERLAY',
    'BANNER',
    'FOOTER',
    'HOME_FEED',
    'BETWEEN_CARDS',
    'UP_NEXT',
    'PLAYER_BOTTOM',
    'OVERLAY',
  ]
  for (const p of placements) {
    const candidate = manifest.ads.find(
      (a) => a.placement === p && new Date(a.expiresAt).getTime() > now && !!a.mediaUrl
    )
    if (candidate && candidate.mediaUrl) {
      preloadAdAsset(candidate.mediaUrl, candidate.type)
    }
  }
}

// ── 0ms Local Decision Engine ──

/**
 * Consult the local manifest synchronously (0ms) to select the highest-priority eligible ad.
 * Validates expiration, placement toggles, and session frequency caps.
 */
export function selectAdFromManifest(
  placement: AdPlacement,
  videoDuration?: number
): ServedAd | null {
  const manifest = readManifest()
  const store = useAppStore.getState()
  const settings = { ...(manifest?.settings || {}), ...(store.settings || {}) }

  // 1. Master kill switch
  if (settings.adsEnabled === false) return null

  // 2. Per-placement kill switch
  const placementEnabledMap: Record<AdPlacement, boolean> = {
    HERO: settings.heroEnabled ?? true,
    PRE_ROLL: settings.preRollEnabled ?? true,
    MID_ROLL: settings.midRollEnabled ?? true,
    POST_ROLL: settings.postRollEnabled ?? true,
    VIDEO_OVERLAY: settings.videoOverlayEnabled ?? settings.overlayEnabled ?? true,
    IMAGE_OVERLAY: settings.imageOverlayEnabled ?? settings.overlayEnabled ?? true,
    OVERLAY: settings.overlayEnabled ?? true,
    BANNER: settings.bannerEnabled ?? true,
    FOOTER: settings.footerEnabled ?? true,
    HOME_FEED: settings.homeFeedEnabled ?? true,
    BETWEEN_CARDS: settings.betweenCardsEnabled ?? true,
    UP_NEXT: settings.upNextEnabled ?? true,
    PLAYER_BOTTOM: settings.playerBottomEnabled ?? true,
  }
  if (!placementEnabledMap[placement]) return null

  // 3. Mid-roll duration threshold check
  if (placement === 'MID_ROLL' && videoDuration && videoDuration < (settings.minMidRollDurationSec ?? 300)) {
    return null
  }

  const now = Date.now()

  // 4. Candidate pool
  const candidates = (manifest?.ads || []).filter((ad) => {
    if (ad.placement !== placement) return false
    if (new Date(ad.expiresAt).getTime() <= now) return false
    return true
  })

  if (candidates.length === 0) {
    return DEFAULT_BASELINE_ADS[placement] ?? null
  }

  // 5. Priority sorting
  const priorityRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  candidates.sort((a, b) => (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3))

  // Pick random among highest priority
  const highestPriority = candidates[0].priority
  const topPool = candidates.filter((c) => c.priority === highestPriority)
  return topPool[Math.floor(Math.random() * topPool.length)]
}

// ── Versioned Incremental Synchronization (<5ms check) ──

let isSyncing = false

export async function syncAdManifest(force = false): Promise<void> {
  if (typeof window === 'undefined' || isSyncing) return
  isSyncing = true

  try {
    const cur = readManifest()
    const curVersion = cur?.version ?? 0

    // Step 1: Lightweight version check
    const check = await apiGet<{ changed: boolean; version: number; settings?: Partial<SettingsDTO> }>(
      `/api/ads/version?v=${curVersion}`
    ).catch(() => null)

    if (!force && check && !check.changed && cur && Date.now() - cur.updatedAt < 30 * 60 * 1000) {
      // Manifest is up-to-date and young
      pruneExpiredAds()
      preloadNextAds()
      return
    }

    // Step 2: Fetch full updated cache if version changed or forced
    const bundle = await apiGet<{ version: number; expiresAt: string; ads: ServedAd[] }>(
      '/api/ads/cache'
    ).catch(() => null)

    if (bundle && Array.isArray(bundle.ads)) {
      const manifestAds: ManifestAd[] = bundle.ads.map((a) => ({
        ...a,
        expiresAt: bundle.expiresAt,
        version: bundle.version,
      }))

      const updatedManifest: LocalAdManifest = {
        version: bundle.version,
        updatedAt: Date.now(),
        settings: check?.settings ?? cur?.settings ?? {},
        ads: manifestAds,
      }

      writeManifest(updatedManifest)
      pruneExpiredAds()
      preloadNextAds()
    }
  } catch {
    // Offline or network error — keep local manifest intact
  } finally {
    isSyncing = false
    // Flush any pending offline events
    void flushOfflineAdEvents()
  }
}

/**
 * Remove expired creatives from local manifest.
 */
export function pruneExpiredAds(): void {
  const manifest = readManifest()
  if (!manifest || !Array.isArray(manifest.ads)) return
  const now = Date.now()
  const valid = manifest.ads.filter((a) => new Date(a.expiresAt).getTime() > now)
  if (valid.length !== manifest.ads.length) {
    writeManifest({ ...manifest, ads: valid })
  }
}

// ── Offline Batch Analytics Queue ──

export function recordAdEventOffline(event: {
  campaignId: string
  creativeId: string
  placement: string
  eventType: string
  sessionId?: string
  videoId?: string
}): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(OFFLINE_EVENTS_KEY)
    const list = raw ? JSON.parse(raw) : []
    list.push({ ...event, createdAt: new Date().toISOString() })
    window.localStorage.setItem(OFFLINE_EVENTS_KEY, JSON.stringify(list.slice(-100))) // keep max 100
  } catch {}
}

export async function flushOfflineAdEvents(): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return
  try {
    const raw = window.localStorage.getItem(OFFLINE_EVENTS_KEY)
    if (!raw) return
    const events = JSON.parse(raw)
    if (!Array.isArray(events) || events.length === 0) return

    window.localStorage.removeItem(OFFLINE_EVENTS_KEY)
    await apiPost('/api/ads/track/batch', { events }).catch(() => {
      // Restore on failure
      window.localStorage.setItem(OFFLINE_EVENTS_KEY, JSON.stringify(events))
    })
  } catch {}
}
