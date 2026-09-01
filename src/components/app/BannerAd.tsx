'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { requestAd, trackAdEvent } from '@/lib/ads-client'
import type { ServedAd } from '@/lib/types'

const SHOWN_KEY = 'vx_banner_ad_shown'

/**
 * Slim banner ad strip rendered on top of the Home view.
 * Fetches at most one BANNER ad per browser session; hides for the
 * session once dismissed. Renders nothing when no ad is eligible.
 * Ads are non-closable.
 */
export function BannerAd() {
  const [ad, setAd] = useState<ServedAd | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.sessionStorage.getItem(SHOWN_KEY)) return
    let cancelled = false
    void (async () => {
      const served = await requestAd({ placement: 'BANNER' })
      if (cancelled || !served) return
      window.sessionStorage.setItem(SHOWN_KEY, '1')
      setAd(served)
      void trackAdEvent(served, 'IMPRESSION')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!ad) return null

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
    <div className="relative z-10 mx-4 mt-4 md:mx-6" role="complementary" aria-label="Sponsored">
      <div className="vx-card flex h-14 items-center gap-3 overflow-hidden rounded-xl pl-3 pr-3">
        {ad.type === 'VIDEO' && ad.mediaUrl ? (
          <button
            type="button"
            onClick={handleCta}
            className="relative h-full w-full overflow-hidden"
            aria-label={ad.headline ?? 'Advertisement'}
          >
            <video
              src={ad.mediaUrl}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            />
          </button>
        ) : (ad.type === 'IMAGE' || ad.type === 'BANNER') && ad.mediaUrl ? (
          <button
            type="button"
            onClick={handleCta}
            className="relative h-full w-full"
            aria-label={ad.headline ?? 'Advertisement'}
          >
            <Image
              src={ad.mediaUrl}
              alt={ad.headline ?? 'Advertisement'}
              fill
              quality={90}
              sizes="(max-width: 768px) 100vw, 700px"
              className="object-cover"
            />
          </button>
        ) : (
          <>
            <span
              className="vx-glow grid size-8 shrink-0 place-items-center rounded-lg text-white"
              style={{ background: 'linear-gradient(135deg, var(--vx-accent), #ec4899)' }}
            >
              <Sparkles className="size-4" />
            </span>
            <button type="button" onClick={handleCta} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-xs font-semibold">{ad.headline ?? ad.campaignName}</span>
              {ad.bodyText && <span className="block truncate text-[11px] text-muted-foreground">{ad.bodyText}</span>}
            </button>
            <span className="vx-chip shrink-0 border-[var(--vx-accent)]/40 bg-[var(--vx-accent)]/15 text-[11px] font-semibold text-[var(--vx-accent-soft)]">
              {ad.ctaText ?? 'Learn more'}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
