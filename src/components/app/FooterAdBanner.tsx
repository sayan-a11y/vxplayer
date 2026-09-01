'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ExternalLink, X } from 'lucide-react'
import { toast } from 'sonner'

import { requestAd, trackAdEvent } from '@/lib/ads-client'
import type { ServedAd } from '@/lib/types'

/**
 * Dedicated Footer Ad placement — appears above the bottom navigation bar
 * on mobile/tablet/desktop. Fully responsive, respects safe-area-inset-bottom,
 * renders real Admin-configured creatives from FOOTER placement.
 * Includes clean close button (X) and CTA link.
 */
export function FooterAdBanner() {
  const [ad, setAd] = useState<ServedAd | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [imgError, setImgError] = useState(false)
  const startedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    void (async () => {
      const served = await requestAd({ placement: 'FOOTER' })
      if (cancelled || !served) return
      setAd(served)
      void trackAdEvent(served, 'IMPRESSION')
      void trackAdEvent(served, 'START')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ad || dismissed) return null

  const isMedia = (ad.type === 'IMAGE' || ad.type === 'BANNER' || ad.type === 'OVERLAY' || ad.type === 'VIDEO') && !!ad.mediaUrl && !imgError

  function handleCta() {
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
      className="sticky bottom-16 z-30 w-full px-3 py-1 md:bottom-0 md:px-6 md:py-2 pointer-events-auto"
      role="complementary"
      aria-label="Sponsored Footer Advertisement"
    >
      <div
        onClick={handleCta}
        className="group relative flex cursor-pointer items-center justify-between gap-3 overflow-hidden rounded-xl border border-white/10 bg-black/90 p-2 shadow-2xl backdrop-blur-md transition hover:border-[var(--vx-accent)]/50 sm:p-2.5"
      >
        {/* Ad Tag */}
        <span className="absolute left-2 top-2 z-10 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/90 ring-1 ring-white/20">
          Ad
        </span>

        {/* Media Thumbnail */}
        {isMedia && ad.mediaUrl && (
          <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-900 sm:h-14 sm:w-20">
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
                alt={ad.headline || 'Sponsored'}
                fill
                sizes="80px"
                className="object-cover"
                onError={() => setImgError(true)}
              />
            )}
          </div>
        )}

        {/* Text Content */}
        <div className="min-w-0 flex-1 pl-6 sm:pl-7">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-xs font-semibold text-white sm:text-sm">
              {ad.headline || ad.campaignName}
            </h4>
            <span className="shrink-0 text-[10px] text-zinc-400">
              · {ad.advertiser}
            </span>
          </div>
          {ad.bodyText && (
            <p className="line-clamp-1 text-[11px] text-zinc-300 sm:text-xs">
              {ad.bodyText}
            </p>
          )}
        </div>

        {/* CTA Button & Close */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleCta}
            className="flex items-center gap-1 rounded-lg bg-[var(--vx-accent)] px-2.5 py-1 text-xs font-medium text-white shadow transition hover:opacity-90 sm:px-3 sm:py-1.5"
          >
            <span>{ad.ctaText || 'Visit'}</span>
            <ExternalLink className="size-3" />
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close advertisement"
            className="grid size-7 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
