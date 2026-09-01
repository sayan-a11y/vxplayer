'use client'

// Client-side ad engine: High-performance instant rendering + offline cache + real-time server sync

import type {
  AdCacheBundle,
  AdEventType,
  AdPlacement,
  ServeAdResponse,
  SettingsDTO,
  ServedAd,
} from '@/lib/types'
import { apiGet, apiPost } from '@/lib/api'
import { useAppStore } from '@/lib/store'

const CACHE_KEY = 'vx_ad_cache'

// ── Offline / Instant Local Cache ──

export function readCache(): AdCacheBundle | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const bundle = JSON.parse(raw) as AdCacheBundle
    if (!bundle || !Array.isArray(bundle.ads)) return null
    return bundle
  } catch {
    return null
  }
}

export function writeCache(bundle: AdCacheBundle) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(bundle))
  } catch {
    /* storage full — ignore */
  }
}

export function clearCache() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(CACHE_KEY)
}

/** Prefetch/refresh the offline ad cache (called on app mount in background). */
export async function refreshAdCache(force = false): Promise<void> {
  if (typeof window === 'undefined') return
  const existing = readCache()
  if (!force && existing && new Date(existing.expiresAt).getTime() > Date.now()) return
  try {
    const bundle = await apiGet<AdCacheBundle>('/api/ads/cache')
    if (bundle && Array.isArray(bundle.ads)) {
      writeCache(bundle)
    }
  } catch {
    /* offline — keep existing cache */
  }
}

/** Drop cached ads whose bundle version no longer matches server settings (admin cleared cache). */
export function isCacheStale(settings: SettingsDTO | null): boolean {
  const cache = readCache()
  if (!cache) return true
  if (settings && cache.version !== settings.adCacheVersion) return true
  return new Date(cache.expiresAt).getTime() <= Date.now()
}

// ── Synchronous Instant Cache Picker (0ms) ──

export function getCachedAd(placement: AdPlacement): ServedAd | null {
  const cache = readCache()
  if (!cache || !Array.isArray(cache.ads)) return null
  if (new Date(cache.expiresAt).getTime() <= Date.now()) return null

  const store = useAppStore.getState()
  if (store.settings && !store.settings.adsEnabled) return null

  const pool = cache.ads.filter((a) => a.placement === placement)
  if (pool.length === 0) return null

  const priorityRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  pool.sort((a, b) => (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3))
  return pool[0]
}

function pickFromBundle(ads: ServedAd[], placement: AdPlacement): ServedAd | null {
  const pool = ads.filter((a) => a.placement === placement)
  if (pool.length === 0) return null
  const priorityRank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 }
  pool.sort((a, b) => (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3))
  return pool[0]
}

export type ServeParams = {
  placement: AdPlacement
  videoId?: string
  videoDuration?: number
}

/**
 * Fast ad request:
 * Returns instant cached ad (0ms) while checking server in background,
 * or fetches directly from /api/ads/serve.
 */
export async function requestAd(params: ServeParams): Promise<ServedAd | null> {
  const store = useAppStore.getState()
  const sessionId = store.sessionId || 'anonymous'
  const settings = store.settings

  if (settings && !settings.adsEnabled) return null

  // Check instant cache first
  const cached = getCachedAd(params.placement)

  if (store.offlineMode) {
    if (settings && settings.offlineAdFallback === 'SKIP_ADS') return null
    return cached
  }

  try {
    const q = new URLSearchParams({
      placement: params.placement,
      sessionId,
    })
    if (params.videoId) q.set('videoId', params.videoId)
    if (params.videoDuration) q.set('videoDuration', String(params.videoDuration))

    const res = await apiGet<ServeAdResponse>(`/api/ads/serve?${q.toString()}`)
    if (res && res.ad) {
      // Save served ad into local cache
      const curCache = readCache() || {
        version: 1,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        ads: [],
      }
      const filtered = curCache.ads.filter((a) => a.placement !== params.placement || a.creativeId !== res.ad?.creativeId)
      writeCache({
        ...curCache,
        ads: [res.ad, ...filtered],
      })
      return res.ad
    }

    return cached
  } catch {
    return cached
  }
}

// ── Tracking ──

export async function trackAdEvent(
  ad: ServedAd,
  eventType: AdEventType,
  videoId?: string
): Promise<void> {
  const store = useAppStore.getState()
  if (eventType === 'IMPRESSION') {
    store.countImpression(ad.campaignId)
  }
  try {
    await apiPost('/api/ads/track', {
      campaignId: ad.campaignId,
      creativeId: ad.creativeId,
      placement: ad.placement,
      eventType,
      sessionId: store.sessionId || 'anonymous',
      videoId,
    })
  } catch {
    /* offline: analytics are aggregate-only, silently drop */
  }
}
