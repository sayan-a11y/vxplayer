'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ExternalLink, Volume2, VolumeX, X } from 'lucide-react'
import { toast } from 'sonner'
import { getCachedAd, requestAd, trackAdEvent } from '@/lib/ads-client'
import type { ServedAd } from '@/lib/types'

/**
 * Dedicated Home Feed Ad placement — appears in the feed between Home sections
 * (e.g. between Continue Watching and Recently Added, or between sections).
 * Supports Admin video (muted autoplay with sound toggle) and image creatives.
 */
export function HomeFeedAd() {
  const [ad, setAd] = useState<ServedAd | null>(() => getCachedAd('HOME_FEED'))
  const [dismissed, setDismissed] = useState(false)
  const [muted, setMuted] = useState(true)
  const [imgError, setImgError] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const served = await requestAd({ placement: 'HOME_FEED' })
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

  function toggleSound(e: React.MouseEvent) {
    e.stopPropagation()
    const next = !muted
    setMuted(next)
    if (videoRef.current) videoRef.current.muted = next
  }

  return (
    <div className="w-full my-6" role="complementary" aria-label="Sponsored In-Feed Ad">
      <div
        onClick={handleCta}
        className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-xl transition hover:border-[var(--vx-accent)]/50"
      >
        {/* Ad Tag & Close */}
        <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
          <span className="rounded-md bg-black/75 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ring-1 ring-white/20 backdrop-blur-md">
            Sponsored Feed
          </span>
          <span className="text-[11px] font-medium text-white/80 drop-shadow">
            {ad.advertiser}
          </span>
        </div>

        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
          {isVideo && (
            <button
              type="button"
              onClick={toggleSound}
              aria-label={muted ? 'Unmute ad audio' : 'Mute ad audio'}
              className="grid size-7 place-items-center rounded-full bg-black/75 text-white/90 ring-1 ring-white/20 backdrop-blur-md transition hover:scale-105"
            >
              {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss in-feed ad"
            className="grid size-7 place-items-center rounded-full bg-black/75 text-white/90 ring-1 ring-white/20 backdrop-blur-md transition hover:scale-105 hover:bg-white/20"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Media Container */}
        <div className="relative h-44 w-full overflow-hidden bg-zinc-950 sm:h-52 md:h-60">
          {isVideo ? (
            <video
              ref={videoRef}
              src={ad.mediaUrl!}
              autoPlay
              muted={muted}
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
              sizes="(max-width: 768px) 100vw, 1200px"
              className="object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-gradient-to-r from-purple-950/40 to-slate-900/40 p-6 text-center">
              <h3 className="text-base font-bold text-white sm:text-lg">{ad.headline || ad.campaignName}</h3>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        </div>

        {/* Overlay Content & CTA */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3.5 sm:p-4">
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-semibold text-white sm:text-base">
              {ad.headline || ad.campaignName}
            </h4>
            {ad.bodyText && (
              <p className="line-clamp-1 text-xs text-white/70 sm:text-sm">
                {ad.bodyText}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleCta}
            className="vx-btn-accent flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white shadow-lg transition hover:scale-[1.02] active:scale-95"
          >
            <span>{ad.ctaText || 'Explore'}</span>
            <ExternalLink className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
