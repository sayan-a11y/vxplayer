'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { trackAdEvent } from '@/lib/ads-client'
import type { ServedAd } from '@/lib/types'

type OverlayAdProps = {
  ad: ServedAd
  videoId?: string
  onClose: () => void
}

/**
 * Non-blocking overlay ad (banner-style). Position follows ad.position.
 * The wrapper never intercepts pointer events — only the card itself does,
 * so center player controls stay fully usable.
 * IMPRESSION is tracked by PlayerScreen when the overlay is shown; this
 * component tracks CLICK only.
 */
export default function OverlayAd({ ad, videoId, onClose }: OverlayAdProps) {
  const [closeCountdown, setCloseCountdown] = useState(ad.skipAfter > 0 ? ad.skipAfter : 0)
  const closedRef = useRef(false)

  const close = useCallback(() => {
    if (closedRef.current) return
    closedRef.current = true
    onClose()
  }, [onClose])

  // auto-close after the ad duration
  useEffect(() => {
    const t = window.setTimeout(close, Math.max(1, ad.duration) * 1000)
    return () => window.clearTimeout(t)
  }, [ad, close])

  // close X unlocks after ad.skipAfter seconds
  useEffect(() => {
    if (ad.skipAfter <= 0) return
    const iv = window.setInterval(() => {
      setCloseCountdown((c) => Math.max(0, c - 1))
    }, 1000)
    return () => window.clearInterval(iv)
  }, [ad.skipAfter])

  const canClose = ad.skipAfter !== -1 && closeCountdown <= 0
  const pos = ad.position ?? 'BOTTOM'
  const wrapperCls =
    pos === 'TOP'
      ? 'left-3 right-3 top-16 sm:left-4 sm:right-4'
      : pos === 'CENTER'
        ? 'inset-0 flex items-center justify-center'
        : 'bottom-28 left-3 right-3 sm:left-4 sm:right-4'
  const yInitial = pos === 'TOP' ? -16 : pos === 'BOTTOM' ? 16 : 0

  const handleCta = () => {
    void trackAdEvent(ad, 'CLICK', videoId)
    if (ad.ctaUrl) {
      window.open(ad.ctaUrl, '_blank', 'noopener,noreferrer')
    } else {
      toast(`${ad.ctaText ?? 'Learn more'} — sponsored by ${ad.advertiser}`)
    }
  }

  const ctaButton = ad.ctaText ? (
    <button
      onClick={handleCta}
      className="vx-btn-accent shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white transition-transform hover:scale-[1.03] active:scale-95"
    >
      {ad.ctaText}
    </button>
  ) : null

  const closeArea =
    canClose ? (
      <button
        onClick={close}
        aria-label="Close ad"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    ) : ad.skipAfter === -1 ? (
      <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[10px] text-white/55">Ad</span>
    ) : (
      <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[10px] tabular-nums text-white/55">
        Close in {closeCountdown}s
      </span>
    )

  return (
    <div className={`pointer-events-none absolute z-40 ${wrapperCls}`}>
      <motion.div
        initial={{ opacity: 0, y: yInitial, scale: pos === 'CENTER' ? 0.96 : 1 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="pointer-events-auto"
      >
        {ad.type === 'IMAGE' && ad.mediaUrl ? (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/75 shadow-2xl backdrop-blur-xl">
            <img
              src={ad.mediaUrl}
              alt={ad.headline ?? 'Sponsored'}
              className="max-h-28 w-full object-cover"
            />
            <div className="flex items-center gap-2 p-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-white">
                  {ad.headline ?? ad.creativeName}
                </div>
                {ad.bodyText && (
                  <div className="truncate text-[11px] text-white/55">{ad.bodyText}</div>
                )}
              </div>
              {ctaButton}
              {closeArea}
            </div>
          </div>
        ) : (
          <div className="max-w-sm rounded-2xl border border-white/10 bg-black/75 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">
                  {ad.headline ?? ad.creativeName}
                </div>
                {ad.bodyText && (
                  <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/60">
                    {ad.bodyText}
                  </div>
                )}
                <div className="mt-1.5 text-[10px] uppercase tracking-wide text-white/35">
                  Sponsored · {ad.advertiser}
                </div>
              </div>
              {closeArea}
            </div>
            {ad.ctaText && <div className="mt-3 flex justify-end">{ctaButton}</div>}
          </div>
        )}
      </motion.div>
    </div>
  )
}
