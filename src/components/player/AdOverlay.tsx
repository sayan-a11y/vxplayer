'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { trackAdEvent } from '@/lib/ads-client'
import type { AdEventType, ServedAd } from '@/lib/types'

export type AdPhase = 'pre' | 'mid' | 'post'

type AdOverlayProps = {
  ad: ServedAd
  phase: AdPhase
  videoId?: string
  /** fired once when the ad completes or is skipped */
  onComplete: (skipped: boolean) => void
}

const PHASE_HINT: Record<AdPhase, string> = {
  pre: 'Your video will start after this ad',
  mid: 'Your video will resume after this ad',
  post: 'Up next after this ad',
}

/**
 * Full-screen video ad player for PRE_ROLL / MID_ROLL / POST_ROLL.
 * Fires IMPRESSION on mount, START on play, Q25/Q50/Q75 on thresholds,
 * COMPLETE on ended, SKIP on skip click — then calls onComplete(skipped).
 */
export default function AdOverlay({ ad, phase, videoId, onComplete }: AdOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const firedRef = useRef<Set<AdEventType>>(new Set())
  const completedRef = useRef(false)
  const erroredRef = useRef(false)
  const [elapsed, setElapsed] = useState(0)
  const [errored, setErrored] = useState(false)

  const fire = useCallback(
    (type: AdEventType) => {
      if (firedRef.current.has(type)) return
      firedRef.current.add(type)
      void trackAdEvent(ad, type, videoId)
    },
    [ad, videoId]
  )

  const complete = useCallback(
    (skipped: boolean) => {
      if (completedRef.current) return
      completedRef.current = true
      if (!skipped) fire('COMPLETE')
      onComplete(skipped)
    },
    [fire, onComplete]
  )

  // IMPRESSION on mount
  useEffect(() => {
    fire('IMPRESSION')
    if (!ad.mediaUrl) fire('START')
  }, [fire, ad.mediaUrl])

  // Ticker: prefers real video time; falls back to a wall-clock simulation
  // when the media is missing or failed so the flow never gets stuck.
  useEffect(() => {
    const startedAt = Date.now()
    const iv = window.setInterval(() => {
      const v = videoRef.current
      if (!erroredRef.current && ad.mediaUrl && v && v.duration > 0 && v.readyState >= 1) {
        setElapsed(v.currentTime)
        if (v.paused && !completedRef.current) void v.play().catch(() => {})
      } else {
        setElapsed((Date.now() - startedAt) / 1000)
      }
    }, 250)
    return () => window.clearInterval(iv)
  }, [ad])

  // Quartile tracking
  useEffect(() => {
    if (ad.duration <= 0) return
    const pct = elapsed / ad.duration
    if (pct >= 0.25) fire('Q25')
    if (pct >= 0.5) fire('Q50')
    if (pct >= 0.75) fire('Q75')
  }, [elapsed, ad.duration, fire])

  // Simulated completion fallback (media missing / errored / stalled)
  useEffect(() => {
    if (completedRef.current || ad.duration <= 0) return
    const v = videoRef.current
    const usingWall =
      erroredRef.current || !ad.mediaUrl || !v || v.duration === 0 || v.readyState < 1
    const limit = usingWall ? ad.duration + 3 : ad.duration
    if (elapsed >= limit) complete(false)
  }, [elapsed, ad.duration, ad.mediaUrl, complete])

  const canSkip = ad.skipAfter >= 0
  const skipReady = canSkip && elapsed >= ad.skipAfter
  const remaining = Math.max(0, Math.ceil(ad.duration - elapsed))
  const pct = ad.duration > 0 ? Math.min(100, (elapsed / ad.duration) * 100) : 100

  const handleSkip = () => {
    if (!skipReady || completedRef.current) return
    fire('SKIP')
    complete(true)
  }

  const showVideo = Boolean(ad.mediaUrl) && !errored

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-50 bg-black"
    >
      {showVideo ? (
        <video
          ref={videoRef}
          src={ad.mediaUrl ?? undefined}
          autoPlay
          playsInline
          className="h-full w-full object-contain"
          onPlay={() => fire('START')}
          onEnded={() => complete(false)}
          onError={() => {
            erroredRef.current = true
            setErrored(true)
            fire('ERROR')
          }}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-8 text-center">
          <Badge className="border-0 bg-(--vx-accent) text-[10px] font-bold text-white">Ad</Badge>
          <div className="text-xl font-semibold text-white">
            {ad.headline ?? ad.creativeName}
          </div>
          {ad.bodyText && <div className="max-w-sm text-sm text-white/55">{ad.bodyText}</div>}
          {ad.ctaText && (
            <div className="mt-1 text-xs text-white/40">
              {ad.ctaText} · {ad.advertiser}
            </div>
          )}
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-white/35">
            <TriangleAlert className="h-3.5 w-3.5" /> Creative unavailable — finishing slot
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/85 via-black/40 to-transparent p-4">
        <div className="flex min-w-0 items-center gap-2">
          <Badge className="shrink-0 border-0 bg-(--vx-accent) text-[10px] font-bold text-white">
            Ad
          </Badge>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-white">
              Advertisement · {ad.campaignName}
            </div>
            <div className="text-[10px] text-white/50">{PHASE_HINT[phase]}</div>
          </div>
        </div>
        <div className="shrink-0 rounded-full bg-black/55 px-3 py-1 text-xs tabular-nums text-white/85 backdrop-blur">
          Ad · {remaining}s
        </div>
      </div>

      {/* Bottom bar */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pt-10">
        <div className="flex items-end justify-between gap-3">
          <button
            onClick={() => toast(`Served from an active campaign matching this placement · ${ad.campaignName}`)}
            className="text-[11px] text-white/45 underline-offset-2 transition-colors hover:text-white/80 hover:underline"
          >
            Why this ad?
          </button>
          {canSkip ? (
            <Button
              onClick={handleSkip}
              disabled={!skipReady}
              className={
                skipReady
                  ? 'vx-btn-accent h-10 rounded-full border-0 px-5 text-sm font-semibold text-white'
                  : 'h-10 cursor-not-allowed rounded-full border-0 bg-white/10 px-5 text-sm text-white/55'
              }
            >
              {skipReady ? 'Skip Ad ▸' : `Skip in ${Math.max(0, Math.ceil(ad.skipAfter - elapsed))}…`}
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-white/55">
              <Lock className="h-3 w-3" /> Non-skippable
            </div>
          )}
        </div>
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full bg-(--vx-accent) transition-[width] duration-200 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </motion.div>
  )
}
