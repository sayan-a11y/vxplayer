'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ExternalLink, X } from 'lucide-react'
import { toast } from 'sonner'
import { getCachedAd, requestAd, trackAdEvent } from '@/lib/ads-client'
import type { ServedAd } from '@/lib/types'

/**
 * Dedicated Up Next Ad placement — appears inside or around the player Up Next drawer and queue.
 */
export function UpNextAd({ videoId }: { videoId?: string }) {
  const [ad, setAd] = useState<ServedAd | null>(() => getCachedAd('UP_NEXT'))
  const [dismissed, setDismissed] = useState(false)
  const [imgError, setImgError] = useState(false)
  const trackedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const served = await requestAd({ placement: 'UP_NEXT', videoId })
      if (cancelled || !served) return
      setAd(served)
    })()
    return () => {
      cancelled = true
    }
  }, [videoId])

  useEffect(() => {
    if (!ad || trackedRef.current) return
    trackedRef.current = true
    void trackAdEvent(ad, 'IMPRESSION', videoId)
    void trackAdEvent(ad, 'START', videoId)
  }, [ad, videoId])

  if (!ad || dismissed) return null

  const isMedia = (ad.type === 'IMAGE' || ad.type === 'BANNER' || ad.type === 'OVERLAY' || ad.type === 'VIDEO') && !!ad.mediaUrl && !imgError

  function handleCta(e: React.MouseEvent) {
    e.stopPropagation()
    if (!ad) return
    void trackAdEvent(ad, 'CLICK', videoId)
    if (ad.ctaUrl) {
      window.open(ad.ctaUrl, '_blank', 'noopener,noreferrer')
    } else {
      toast(`${ad.ctaText ?? 'Learn more'} — sponsored by ${ad.advertiser}`)
    }
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation()
    if (ad) void trackAdEvent(ad, 'SKIP', videoId)
    setDismissed(true)
  }

  return (
    <div
      onClick={handleCta}
      className="my-2.5 group relative flex cursor-pointer items-center justify-between gap-3 overflow-hidden rounded-xl border border-violet-500/30 bg-violet-950/20 p-2.5 shadow transition hover:border-[var(--vx-accent)]/60"
      role="complementary"
      aria-label="Sponsored up next advertisement"
    >
      <span className="absolute left-2 top-2 z-10 rounded bg-black/80 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white ring-1 ring-white/20">
        Ad
      </span>

      {isMedia && ad.mediaUrl && (
        <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
          <Image
            src={ad.mediaUrl}
            alt={ad.headline || 'Sponsored'}
            fill
            sizes="80px"
            className="object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      )}

      <div className="min-w-0 flex-1 pl-6">
        <h4 className="truncate text-xs font-semibold text-white">
          {ad.headline || ad.campaignName}
        </h4>
        <p className="line-clamp-1 text-[11px] text-white/60">
          {ad.bodyText || `Sponsored by ${ad.advertiser}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={handleCta}
          className="vx-btn-accent flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-white"
        >
          <span>{ad.ctaText || 'View'}</span>
          <ExternalLink className="size-3" />
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss up next ad"
          className="grid size-6 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
