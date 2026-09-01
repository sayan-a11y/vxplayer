'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'

import { getCachedAd, requestAd, trackAdEvent } from '@/lib/ads-client'
import type { ServedAd } from '@/lib/types'

/**
 * Hero ad banner — the dedicated showcase ad container at the top of Home
 * (above Continue Watching). Plays admin-uploaded VIDEO creatives (autoplaying
 * muted, looped, with sound toggle) and IMAGE creatives (crisp cover)
 * full-width, responsive on every device. Served live from the HERO
 * placement: kill switches, session caps and frequency caps all apply.
 * Renders instantly from cache (0ms) and syncs with server.
 * Never replaced by or mixed with Footer or Banner placements.
 */
export function HeroAdBanner() {
  const [ad, setAd] = useState<ServedAd | null>(() => getCachedAd('HERO'))
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    void (async () => {
      const served = await requestAd({ placement: 'HERO' })
      if (cancelled) return
      if (served) {
        setAd(served)
        void trackAdEvent(served, 'IMPRESSION')
        if (served.type !== 'VIDEO') void trackAdEvent(served, 'START')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ad) return null

  const isVideo = ad.type === 'VIDEO' && !!ad.mediaUrl
  const isImage = (ad.type === 'IMAGE' || ad.type === 'BANNER') && !!ad.mediaUrl

  function handleCta() {
    void trackAdEvent(ad!, 'CLICK')
    if (ad!.ctaUrl) {
      window.open(ad!.ctaUrl, '_blank', 'noopener,noreferrer')
    } else {
      toast(`${ad!.ctaText ?? 'Learn more'} — sponsored by ${ad!.advertiser}`)
    }
  }

  function handleFirstPlay() {
    if (startedRef.current) return
    startedRef.current = true
    void trackAdEvent(ad!, 'START')
  }

  function toggleMute() {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      const p = v.play()
      if (p !== undefined) {
        p.catch(() => {})
      }
      setPaused(false)
    } else {
      try {
        v.pause()
      } catch {}
      setPaused(true)
    }
  }

  return (
    <div className="w-full mb-6" role="complementary" aria-label="Sponsored">
      <div className="relative h-44 w-full overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 sm:h-52 md:h-60 lg:h-72">
        {/* Media layer */}
        {isVideo ? (
          <video
            ref={videoRef}
            src={ad.mediaUrl ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            onPlay={handleFirstPlay}
            aria-label={ad.headline ?? 'Advertisement video'}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : isImage ? (
          <Image
            src={ad.mediaUrl ?? ''}
            alt={ad.headline ?? 'Advertisement'}
            fill
            priority
            quality={95}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 92vw, 1200px"
            className="object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(135deg, #0a0a14 0%, #17172e 60%, #201a3a 100%)' }}
            aria-hidden
          >
            <p className="absolute inset-0 grid place-items-center px-6 text-center text-lg font-bold tracking-tight text-white/85 sm:text-2xl">
              {ad.headline ?? ad.campaignName}
            </p>
          </div>
        )}

        {/* Legibility gradient */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/10" aria-hidden />

        {/* Top row — transparency badges + controls */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5 sm:p-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/85 backdrop-blur">
              Ad
            </span>
            <span className="max-w-[40vw] truncate text-[10px] font-medium uppercase tracking-widest text-white/55 sm:text-[11px]">
              {ad.advertiser}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {isVideo && (
              <>
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? 'Unmute ad video' : 'Mute ad video'}
                  className="grid size-8 place-items-center rounded-full bg-black/45 text-white/80 backdrop-blur transition hover:bg-black/65 hover:text-white"
                >
                  {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={paused ? 'Play ad video' : 'Pause ad video'}
                  className="grid size-8 place-items-center rounded-full bg-black/45 text-white/80 backdrop-blur transition hover:bg-black/65 hover:text-white"
                >
                  {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Bottom row — message + CTA */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 sm:p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white sm:text-base md:text-lg">
              {ad.headline ?? ad.campaignName}
            </p>
            {ad.bodyText && (
              <p className="mt-0.5 truncate text-[11px] text-white/70 sm:text-xs">{ad.bodyText}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleCta}
            className="vx-btn-accent min-h-9 shrink-0 rounded-full px-4 text-xs font-semibold tracking-wide sm:px-5 sm:text-sm"
          >
            {ad.ctaText ?? 'Learn more'}
          </button>
        </div>
      </div>
    </div>
  )
}
