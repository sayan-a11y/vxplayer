'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

import { getCachedAd, requestAd, trackAdEvent } from '@/lib/ads-client'
import type { ServedAd } from '@/lib/types'

/**
 * Dedicated Banner Ad placement — appears in content streams (between sections).
 * Fully independent placement: never suppresses or replaces Hero or Footer ads.
 * Renders instantly from cache (0ms) and syncs with server.
 */
export function BannerAd() {
  const [ad, setAd] = useState<ServedAd | null>(() => getCachedAd('BANNER'))
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    void (async () => {
      const served = await requestAd({ placement: 'BANNER' })
      if (cancelled || !served) return
      setAd(served)
      void trackAdEvent(served, 'IMPRESSION')
      if (served.type !== 'VIDEO') void trackAdEvent(served, 'START')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ad) return null

  const isMedia =
    (ad.type === 'IMAGE' || ad.type === 'BANNER' || ad.type === 'OVERLAY' || ad.type === 'VIDEO') &&
    !!ad.mediaUrl &&
    !imgError

  function handleCta() {
    if (!ad) return
    void trackAdEvent(ad, 'CLICK')
    if (ad.ctaUrl) {
      window.open(ad.ctaUrl, '_blank', 'noopener,noreferrer')
    } else {
      toast(`${ad.ctaText ?? 'Learn more'} — sponsored by ${ad.advertiser}`)
    }
  }

  return (
    <div className="my-6 w-full" role="complementary" aria-label="Sponsored Banner">
      <div
        onClick={handleCta}
        className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/80 p-3.5 shadow-xl backdrop-blur-md transition hover:border-[var(--vx-accent)]/50 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4"
      >
        {/* Ad Tag */}
        <div className="flex items-center gap-2 mb-2 sm:mb-0">
          <span className="rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/90 ring-1 ring-white/20">
            Ad
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-white/50">
            {ad.advertiser}
          </span>
        </div>

        {/* Media */}
        {isMedia && ad.mediaUrl && (
          <div className="relative h-32 w-full overflow-hidden rounded-xl bg-zinc-900 sm:h-20 sm:w-36 shrink-0">
            {ad.type === 'VIDEO' ? (
              <video
                src={ad.mediaUrl}
                autoPlay
                muted
                loop
                playsInline
                className="h-full w-full object-cover"
              />
            ) : (
              <Image
                src={ad.mediaUrl}
                alt={ad.headline || 'Sponsored Banner'}
                fill
                sizes="(max-width: 640px) 100vw, 200px"
                className="object-cover"
                onError={() => setImgError(true)}
              />
            )}
          </div>
        )}

        {/* Text */}
        <div className="mt-2 min-w-0 flex-1 sm:mt-0">
          <h4 className="truncate text-sm font-semibold text-white sm:text-base">
            {ad.headline || ad.campaignName}
          </h4>
          {ad.bodyText && (
            <p className="mt-0.5 line-clamp-1 text-xs text-white/70">
              {ad.bodyText}
            </p>
          )}
        </div>

        {/* CTA Button */}
        <div className="mt-3 flex shrink-0 items-center sm:mt-0">
          <button
            type="button"
            onClick={handleCta}
            className="flex min-h-9 items-center gap-1.5 rounded-xl bg-[var(--vx-accent)] px-4 py-1.5 text-xs font-semibold text-white shadow transition hover:opacity-90"
          >
            <span>{ad.ctaText || 'Learn more'}</span>
            <ExternalLink className="size-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
