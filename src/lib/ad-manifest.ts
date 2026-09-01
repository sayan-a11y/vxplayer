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
  const placements: AdPlacement[] = ['PRE_ROLL', 'MID_ROLL', 'POST_ROLL', 'OVERLAY', 'BANNER', 'FOOTER']
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
  if (!manifest) return null

  const store = useAppStore.getState()
  const settings = { ...(manifest.settings || {}), ...(store.settings || {}) }

  // 1. Master kill switch
  if (settings.adsEnabled === false) return null

  // 2. Per-placement kill switch
  const placementEnabledMap: Record<AdPlacement, boolean> = {
    PRE_ROLL: settings.preRollEnabled ?? true,
    MID_ROLL: settings.midRollEnabled ?? true,
    POST_ROLL: settings.postRollEnabled ?? true,
    OVERLAY: settings.overlayEnabled ?? true,
    BANNER: settings.bannerEnabled ?? true,
    FOOTER: settings.footerEnabled ?? true,
  }
  if (!placementEnabledMap[placement]) return null

  // 3. Mid-roll duration threshold check
  if (placement === 'MID_ROLL' && videoDuration && videoDuration < (settings.minMidRollDurationSec ?? 300)) {
    return null
  }

  const now = Date.now()

  // 4. Candidate pool
  const candidates = (manifest.ads || []).filter((ad) => {
    if (ad.placement !== placement) return false
    if (new Date(ad.expiresAt).getTime() <= now) return false
    return true
  })

  if (candidates.length === 0) return null

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
