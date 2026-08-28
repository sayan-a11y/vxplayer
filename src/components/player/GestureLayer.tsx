'use client'

import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

type GestureMode = 'brightness' | 'volume' | 'seek'
type TapZone = 'left' | 'right' | 'middle'

type GestureLayerProps = {
  /** suppress all gestures (e.g. while an ad is playing or an error panel is shown) */
  disabled?: boolean
  /** suppress all gestures while the screen is locked */
  locked?: boolean
  brightness: number
  volume: number
  /** seconds skipped per double-tap (settings.doubleTapSeek) */
  seekAmount: number
  currentTime: number
  duration: number
  onBrightnessChange: (v: number) => void
  onVolumeChange: (v: number) => void
  /** target === null clears the seek preview OSD */
  onSeekPreview: (target: number | null, delta: number) => void
  onSeekCommit: (target: number, delta: number) => void
  onToggleControls: () => void
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * Transparent full-surface gesture handler.
 * - Left 30% vertical drag  → brightness (0.2..1)
 * - Right 30% vertical drag → volume (0..1)
 * - Middle horizontal drag  → seek with live preview, applied on release
 * - Double-tap left/right   → ∓ seekAmount seconds
 * - Single tap              → toggle controls visibility
 */
export default function GestureLayer(props: GestureLayerProps) {
  const {
    disabled,
    locked,
    brightness,
    volume,
    seekAmount,
    currentTime,
    duration,
    onBrightnessChange,
    onVolumeChange,
    onSeekPreview,
    onSeekCommit,
    onToggleControls,
  } = props

  const rootRef = useRef<HTMLDivElement>(null)
  const g = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startT: 0,
    mode: null as GestureMode | null,
    startBrightness: 1,
    startVolume: 1,
    startTime: 0,
    width: 1,
  })
  const lastTap = useRef({ time: 0, zone: 'middle' as TapZone })
  const tapTimer = useRef<number | null>(null)

  const clearTapTimer = () => {
    if (tapTimer.current !== null) {
      window.clearTimeout(tapTimer.current)
      tapTimer.current = null
    }
  }

  const spanFor = () => Math.min(120, Math.max(30, duration || 60))

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || locked) return
    if (g.current.active) return
    const rect = rootRef.current?.getBoundingClientRect()
    g.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startT: Date.now(),
      mode: null,
      startBrightness: brightness,
      startVolume: volume,
      startTime: currentTime,
      width: rect && rect.width > 0 ? rect.width : 1,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* pointer already released — ignore */
    }
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = g.current
    if (!s.active || e.pointerId !== s.pointerId || disabled || locked) return
    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY
    if (!s.mode) {
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return
      const relX = s.startX / s.width
      if (Math.abs(dy) > Math.abs(dx) && relX < 0.3) s.mode = 'brightness'
      else if (Math.abs(dy) > Math.abs(dx) && relX > 0.7) s.mode = 'volume'
      else s.mode = 'seek'
    }
    if (s.mode === 'brightness') {
      onBrightnessChange(Math.round(clamp(s.startBrightness - dy / 280, 0.2, 1) * 100) / 100)
    } else if (s.mode === 'volume') {
      onVolumeChange(Math.round(clamp(s.startVolume - dy / 280, 0, 1) * 100) / 100)
    } else {
      const delta = (dx / s.width) * spanFor()
      onSeekPreview(clamp(s.startTime + delta, 0, duration || s.startTime), delta)
    }
  }

  const finish = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const s = g.current
    if (!s.active || e.pointerId !== s.pointerId) return
    s.active = false
    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY
    const dist = Math.hypot(dx, dy)
    const dt = Date.now() - s.startT

    if (cancelled) {
      onSeekPreview(null, 0)
      return
    }

    // committed horizontal seek
    if (s.mode === 'seek' && dist >= 12) {
      const delta = (dx / s.width) * spanFor()
      onSeekCommit(clamp(s.startTime + delta, 0, duration || s.startTime), delta)
      return
    }
    if (s.mode) {
      // brightness/volume drags have nothing to commit
      onSeekPreview(null, 0)
      return
    }

    // tap detection
    if (dist < 12 && dt < 600) {
      const relX = s.startX / s.width
      const zone: TapZone = relX < 0.3 ? 'left' : relX > 0.7 ? 'right' : 'middle'
      const now = Date.now()
      const isDouble = now - lastTap.current.time < 300 && lastTap.current.zone === zone
      lastTap.current = { time: now, zone }

      if (isDouble) {
        clearTapTimer()
        lastTap.current = { time: 0, zone: 'middle' }
        if (zone !== 'middle') {
          const d = zone === 'left' ? -seekAmount : seekAmount
          onSeekCommit(clamp(currentTime + d, 0, duration || currentTime), d)
        }
        // double-tap in the middle zone just swallows the second tap
        return
      }

      clearTapTimer()
      tapTimer.current = window.setTimeout(() => {
        tapTimer.current = null
        onToggleControls()
      }, 300)
    }
  }

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="absolute inset-0 z-10 touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      onContextMenu={(e) => e.preventDefault()}
    />
  )
}
