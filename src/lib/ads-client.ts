'use client'

// Client-side ad engine: High-performance instant rendering + offline manifest + real-time server sync

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
import {
  flushOfflineAdEvents,
  preloadAdAsset,
  recordAdEventOffline,
  selectAdFromManifest,
  syncAdManifest,
} from './ad-manifest'

export { syncAdManifest, flushOfflineAdEvents, preloadAdAsset }

export function clearCache() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem('vx_ad_manifest_v2')
  window.localStorage.removeItem('vx_ad_cache')
}

export function readCache(): AdCacheBundle | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem('vx_ad_manifest_v2')
    if (!raw) return null
    const manifest = JSON.parse(raw)
    return {
      version: manifest.version || 1,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      ads: manifest.ads || [],
    }
  } catch {
    return null
  }
}

export async function refreshAdCache(force = false): Promise<void> {
  await syncAdManifest(force)
}

export function isCacheStale(settings: SettingsDTO | null): boolean {
  if (!settings) return false
  const cache = readCache()
  if (!cache) return true
  return cache.version !== settings.adCacheVersion
}

export function getCachedAd(placement: AdPlacement): ServedAd | null {
  return selectAdFromManifest(placement)
}

export type ServeParams = {
  placement: AdPlacement
  videoId?: string
  videoDuration?: number
}

/**
 * High-performance ad request:
 * 1. Checks Local Ad Manifest FIRST for 0ms immediate resolution.
 * 2. If no local ad found and online, fetches from server with 3s timeout.
 * 3. Never keeps the video player waiting indefinitely.
 */
export async function requestAd(params: ServeParams): Promise<ServedAd | null> {
  const store = useAppStore.getState()
  const sessionId = store.sessionId || 'anonymous'
  const settings = store.settings

  // Only skip if ads are EXPLICITLY disabled (never skip when settings is null)
  if (settings !== null && settings !== undefined && settings.adsEnabled === false) return null

  // ── Step 1: Consult Local Ad Manifest (0ms) ──
  const manifestAd = selectAdFromManifest(params.placement, params.videoDuration)
  if (manifestAd) {
    if (manifestAd.mediaUrl) {
      preloadAdAsset(manifestAd.mediaUrl, manifestAd.type)
    }
    return manifestAd
  }

  // If offline mode is on and not found in manifest, return null immediately
  if (store.offlineMode || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return null
  }

  // ── Step 2: Online fetch with 3s timeout ──
  try {
    const q = new URLSearchParams({
      placement: params.placement,
      sessionId,
    })
    if (params.videoId) q.set('videoId', params.videoId)
    if (params.videoDuration) q.set('videoDuration', String(params.videoDuration))

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)

    const res = await apiGet<ServeAdResponse>(`/api/ads/serve?${q.toString()}`).finally(() => {
      clearTimeout(timer)
    })

    if (res && res.ad) {
      if (res.ad.mediaUrl) {
        preloadAdAsset(res.ad.mediaUrl, res.ad.type)
      }
      return res.ad
    }

    return null
  } catch {
    return null
  }
}

// ── Tracking with Offline Fallback ──

export async function trackAdEvent(
  ad: ServedAd,
  eventType: AdEventType,
  videoId?: string
): Promise<void> {
  const store = useAppStore.getState()
  if (eventType === 'IMPRESSION') {
    store.countImpression(ad.campaignId)
  }

  const payload = {
    campaignId: ad.campaignId,
    creativeId: ad.creativeId,
    placement: ad.placement,
    eventType,
    sessionId: store.sessionId || 'anonymous',
    videoId,
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    recordAdEventOffline(payload)
    return
  }

  try {
    await apiPost('/api/ads/track', payload).catch(() => {
      recordAdEventOffline(payload)
    })
  } catch {
    recordAdEventOffline(payload)
  }
}

// ── Setup Network Reconnect Listeners ──
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void syncAdManifest()
    void flushOfflineAdEvents()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void syncAdManifest()
    }
  })
}
