'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { cueAt, type SubCue } from '@/lib/vtt'

export type SubtitleSize = 'S' | 'M' | 'L' | 'XL'

type SubtitleRendererProps = {
  cues: SubCue[]
  currentTime: number
  delay: number
  size: SubtitleSize
  /** vertical position as % from top of the player */
  positionPct: number
  /** 0..100 background chip opacity */
  bgOpacity: number
}

const SIZE_CLS: Record<SubtitleSize, string> = {
  S: 'text-sm',
  M: 'text-lg',
  L: 'text-2xl',
  XL: 'text-4xl',
}

/** Renders the active subtitle cue centered at a configurable position. */
export default function SubtitleRenderer({
  cues,
  currentTime,
  delay,
  size,
  positionPct,
  bgOpacity,
}: SubtitleRendererProps) {
  const cue = cueAt(cues, currentTime, delay)

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <AnimatePresence mode="wait">
        {cue && (
          <motion.div
            key={cue.start}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute left-1/2 w-max max-w-[80%] -translate-x-1/2 text-center"
            style={{ top: `${positionPct}%` }}
          >
            <p
              className={`line-clamp-2 rounded-lg px-3 py-1 leading-snug text-white ${SIZE_CLS[size]}`}
              style={{ backgroundColor: `rgba(0, 0, 0, ${bgOpacity / 100})` }}
            >
              {cue.text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
