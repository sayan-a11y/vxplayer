'use client'

// Client-side ad engine: online serving + offline cache with expiration/eligibility

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

// ── Offline cache ──

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

/** Prefetch/refresh the offline ad cache (call on app mount while "online"). */
export async function refreshAdCache(force = false): Promise<void> {
  const existing = readCache()
  if (!force && existing && new Date(existing.expiresAt).getTime() > Date.now()) return
  try {
    const bundle = await apiGet<AdCacheBundle>('/api/ads/cache')
    writeCache(bundle)
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

// ── Serving ──

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
 * Request an ad. When offlineMode is on, serves from the local cache with
 * eligibility checks (expiration, placement, client-side frequency caps).
 * Otherwise asks the server.
 */
export async function requestAd(params: ServeParams): Promise<ServedAd | null> {
  const store = useAppStore.getState()
  const sessionId = store.sessionId || 'anonymous'
  const settings = store.settings

  if (settings && !settings.adsEnabled) return null

  if (store.offlineMode) {
    const cache = readCache()
    if (!cache) return null
    if (new Date(cache.expiresAt).getTime() <= Date.now()) return null
    if (settings && cache.version !== settings.adCacheVersion) return null
    if (settings && settings.offlineAdFallback === 'SKIP_ADS') return null

    const ad = pickFromBundle(cache.ads, params.placement)
    if (!ad) return null

    // client-side frequency cap per campaign per session
    const shown = store.sessionImpressions[ad.campaignId] ?? 0
    if (shown >= 2) return null // cached ads default session cap

    if (params.placement === 'MID_ROLL' && params.videoDuration) {
      if (params.videoDuration < (settings?.minMidRollDurationSec ?? 300)) return null
    }
    return ad
  }

  try {
    const q = new URLSearchParams({
      placement: params.placement,
      sessionId,
    })
    if (params.videoId) q.set('videoId', params.videoId)
    if (params.videoDuration) q.set('videoDuration', String(params.videoDuration))
    const res = await apiGet<ServeAdResponse>(`/api/ads/serve?${q.toString()}`)
    return res.ad
  } catch {
    return null
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
