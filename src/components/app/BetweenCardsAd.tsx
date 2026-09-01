'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ExternalLink, X } from 'lucide-react'
import { toast } from 'sonner'
import { getCachedAd, requestAd, trackAdEvent } from '@/lib/ads-client'
import type { ServedAd } from '@/lib/types'

/**
 * Dedicated Between Video Cards Ad placement — appears inside the video card grid.
 * Fits seamlessly into grid-cols-2 / grid-cols-3 / grid-cols-4 without breaking layout.
 */
export function BetweenCardsAd() {
  const [ad, setAd] = useState<ServedAd | null>(() => getCachedAd('BETWEEN_CARDS'))
  const [dismissed, setDismissed] = useState(false)
  const [imgError, setImgError] = useState(false)
  const trackedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const served = await requestAd({ placement: 'BETWEEN_CARDS' })
      if (cancelled || !served) return
      setAd(served)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ad || trackedRef.current) return
    trackedRef.current = true
    void trackAdEvent(ad, 'IMPRESSION')
    void trackAdEvent(ad, 'START')
  }, [ad])

  if (!ad || dismissed) return null

  const isVideo = ad.type === 'VIDEO' && !!ad.mediaUrl
  const isImage = (ad.type === 'IMAGE' || ad.type === 'BANNER' || ad.type === 'OVERLAY') && !!ad.mediaUrl && !imgError

  function handleCta(e: React.MouseEvent) {
    e.stopPropagation()
    if (!ad) return
    void trackAdEvent(ad, 'CLICK')
    if (ad.ctaUrl) {
      window.open(ad.ctaUrl, '_blank', 'noopener,noreferrer')
    } else {
      toast(`${ad.ctaText ?? 'Learn more'} — sponsored by ${ad.advertiser}`)
    }
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation()
    if (ad) void trackAdEvent(ad, 'SKIP')
    setDismissed(true)
  }

  return (
    <div
      onClick={handleCta}
      className="vx-card group relative flex flex-col justify-between overflow-hidden p-2.5 sm:p-3 text-left transition hover:border-[var(--vx-accent)]/50 hover:bg-white/[0.06] cursor-pointer"
      role="complementary"
      aria-label="Sponsored card advertisement"
    >
      {/* Media Aspect */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-zinc-950">
        {isVideo ? (
          <video
            src={ad.mediaUrl!}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
        ) : isImage ? (
          <Image
            src={ad.mediaUrl!}
            alt={ad.headline || 'Sponsored'}
            fill
            priority
            loading="eager"
            sizes="(max-width: 768px) 50vw, 300px"
            className="object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-purple-950/40 to-slate-900/40 p-2 text-center text-xs font-bold text-white">
            {ad.headline || ad.campaignName}
          </div>
        )}

        <div className="absolute left-1.5 top-1.5 z-10 rounded bg-black/80 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-white ring-1 ring-white/20">
          Ad
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Close ad"
          className="absolute right-1.5 top-1.5 z-10 grid size-5 place-items-center rounded-full bg-black/80 text-white/80 transition hover:bg-white/20"
        >
          <X className="size-3" />
        </button>
      </div>

      {/* Info & CTA */}
      <div className="mt-2 flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <h4 className="truncate text-xs font-semibold text-white sm:text-sm">
            {ad.headline || ad.campaignName}
          </h4>
          <p className="truncate text-[10px] text-muted-foreground sm:text-[11px]">
            Sponsored · {ad.advertiser}
          </p>
        </div>
        <div className="mt-2 flex items-center justify-between gap-1 pt-1 border-t border-white/5">
          <span className="text-[10px] text-white/60 truncate">{ad.bodyText || 'Featured sponsor'}</span>
          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[var(--vx-accent-soft)]">
            {ad.ctaText || 'Visit'} <ExternalLink className="size-2.5" />
          </span>
        </div>
      </div>
    </div>
  )
}
